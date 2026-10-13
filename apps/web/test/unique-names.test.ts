/**
 * Unique project names and calculation titles, run against a real
 * PostgreSQL engine (PGlite) so the migration SQL and unique indexes are
 * exercised, not mocked.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";

const pg = new PGlite();
const db = drizzle(pg);
vi.mock("../src/lib/db", () => ({ getDb: () => db }));

import {
  DuplicateNameError,
  createProject,
  listCalculationDrafts,
  listProjects,
  nextFreeName,
  normalizeName,
  saveCalculationDraft,
  updateProject,
} from "../src/lib/projects";
import { defaultDesignCheckPolicy } from "@nola/calc-core";

const fields = {
  projectNumber: "",
  location: "Makati",
  buildingName: "Tower",
  preparedBy: "EN",
  checkedBy: "EN",
  approvedBy: "EN",
};
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

beforeAll(async () => {
  // Legacy data saved before the rule: duplicates already present.
  await db.execute(sql`create table nola_projects (
    id uuid primary key, owner_id text not null, name text not null,
    project_number text not null default '', location text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now())`);
  await db.execute(sql`create table nola_calculation_drafts (
    id uuid primary key, owner_id text not null,
    project_id uuid not null references nola_projects(id) on delete cascade,
    module_slug text not null, title text not null, payload jsonb not null,
    verification_status text not null default 'interface-only',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now())`);
  await db.execute(sql`insert into nola_projects (id, owner_id, name, updated_at) values
    (${id(1)}, 'legacy', 'Tower A', now() - interval '3 days'),
    (${id(2)}, 'legacy', 'tower  a ', now() - interval '1 day'),
    (${id(3)}, 'legacy', 'TOWER A', now() - interval '2 days'),
    (${id(4)}, 'other', 'Tower A', now())`);
  await db.execute(sql`insert into nola_calculation_drafts
    (id, owner_id, project_id, module_slug, title, payload, updated_at) values
    (${id(11)}, 'legacy', ${id(1)}, 'rc-column', 'C1', '{}', now() - interval '2 days'),
    (${id(12)}, 'legacy', ${id(1)}, 'rc-column', 'c1', '{}', now()),
    (${id(13)}, 'legacy', ${id(1)}, 'slab', 'C1', '{}', now())`);
});

describe("name rules", () => {
  it("normalises case and whitespace and suggests the next free name", () => {
    expect(normalizeName("  Tower   A ")).toBe("tower a");
    expect(nextFreeName("C1", ["C1", "c1 (2)"])).toBe("C1 (3)");
    expect(nextFreeName("C1 (2)", ["C1", "C1 (2)"])).toBe("C1 (3)");
  });
});

describe("migration of existing duplicates", () => {
  it("keeps the newest name, renames older ones (2), (3); deletes nothing", async () => {
    const legacy = await listProjects("legacy");
    const names = Object.fromEntries(legacy.map((p) => [p.id, p.name]));
    expect(legacy).toHaveLength(3);
    expect(names[id(2)]).toBe("tower  a "); // most recently updated keeps it
    expect(names[id(3)]).toBe("TOWER A (2)");
    expect(names[id(1)]).toBe("Tower A (3)");
    // Another account's project is untouched.
    expect((await listProjects("other"))[0].name).toBe("Tower A");
    const drafts = await listCalculationDrafts("legacy");
    const titles = Object.fromEntries(drafts.map((d) => [d.id, d.title]));
    expect(titles[id(12)]).toBe("c1");
    expect(titles[id(11)]).toBe("C1 (2)");
    expect(titles[id(13)]).toBe("C1"); // different module, not a duplicate
  });
});

describe("projects", () => {
  it("blocks a duplicate project name for the same account only", async () => {
    const a = await createProject("u1", { ...fields, name: "Ayala Tower" });
    const error = await createProject("u1", {
      ...fields,
      name: "  ayala   TOWER",
    }).catch((e) => e);
    expect(error).toBeInstanceOf(DuplicateNameError);
    expect(error.kind).toBe("project");
    expect(error.existing.id).toBe(a.id);
    expect(error.suggestion).toBe("ayala   TOWER (2)");
    await expect(
      createProject("u2", { ...fields, name: "Ayala Tower" }),
    ).resolves.toBeTruthy();
  });
  it("blocks renaming a project onto another project's name", async () => {
    const b = await createProject("u3", { ...fields, name: "Block B" });
    await createProject("u3", { ...fields, name: "Block C" });
    const edit = {
      ...fields,
      designCheckPolicy: defaultDesignCheckPolicy,
    };
    await expect(
      updateProject("u3", b.id, { ...edit, name: "block c" }),
    ).rejects.toBeInstanceOf(DuplicateNameError);
    // Keeping its own name (or changing its case) is not a duplicate.
    await expect(
      updateProject("u3", b.id, { ...edit, name: "BLOCK B" }),
    ).resolves.toMatchObject({ name: "BLOCK B" });
  });
  it("the unique index rejects a duplicate even without the pre-check", async () => {
    await expect(
      db.execute(
        sql`insert into nola_projects (id, owner_id, name) values (${id(99)}, 'u1', 'AYALA TOWER')`,
      ),
    ).rejects.toThrow();
  });
});

describe("calculations", () => {
  const draft = (projectId: string, title: string, extra = {}) => ({
    projectId,
    moduleSlug: "rc-column",
    title,
    payload: { kind: "rc-column", n: Math.random() },
    ...extra,
  });
  it("prompts on a duplicate title; overwrite replaces the same record", async () => {
    const p = await createProject("u4", { ...fields, name: "P4" });
    const first = await saveCalculationDraft("u4", draft(p.id, "C1 – Ground"));
    const dup = await saveCalculationDraft(
      "u4",
      draft(p.id, "c1 – ground"),
    ).catch((e) => e);
    expect(dup).toBeInstanceOf(DuplicateNameError);
    expect(dup.kind).toBe("calculation");
    expect(dup.existing.id).toBe(first.id);
    expect(dup.suggestion).toBe("c1 – ground (2)");
    const over = await saveCalculationDraft(
      "u4",
      draft(p.id, "C1 – Ground", { overwrite: true }),
    );
    expect(over.id).toBe(first.id);
    const all = (await listCalculationDrafts("u4")).filter(
      (d) => d.projectId === p.id,
    );
    expect(all).toHaveLength(1);
    // Save as new name creates a second record.
    const renamed = await saveCalculationDraft("u4", draft(p.id, dup.suggestion));
    expect(renamed.id).not.toBe(first.id);
  });
  it("re-saving the open calculation under its own title is not a duplicate", async () => {
    const p = await createProject("u5", { ...fields, name: "P5" });
    const a = await saveCalculationDraft("u5", draft(p.id, "C2"));
    const again = await saveCalculationDraft(
      "u5",
      draft(p.id, "C2", { id: a.id }),
    );
    expect(again.id).toBe(a.id);
  });
  it("same title is allowed in another module or project", async () => {
    const p = await createProject("u6", { ...fields, name: "P6" });
    const q = await createProject("u6", { ...fields, name: "P7" });
    await saveCalculationDraft("u6", draft(p.id, "S1"));
    await expect(
      saveCalculationDraft("u6", { ...draft(p.id, "S1"), moduleSlug: "slab" }),
    ).resolves.toBeTruthy();
    await expect(saveCalculationDraft("u6", draft(q.id, "S1"))).resolves.toBeTruthy();
  });
  it("a reopened calculation saved into another project becomes a new record there", async () => {
    const p = await createProject("u7", { ...fields, name: "P8" });
    const q = await createProject("u7", { ...fields, name: "P9" });
    const a = await saveCalculationDraft("u7", draft(p.id, "C9"));
    const moved = await saveCalculationDraft(
      "u7",
      draft(q.id, "C9", { id: a.id }),
    );
    expect(moved.id).not.toBe(a.id);
    expect(moved.projectId).toBe(q.id);
    const list = await listCalculationDrafts("u7");
    expect(list.find((d) => d.id === a.id)?.projectId).toBe(p.id);
  });
});
