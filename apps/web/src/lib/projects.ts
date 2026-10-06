import { sql } from "drizzle-orm";

import { getDb } from "./db";

export interface ProjectRecord {
  id: string;
  name: string;
  projectNumber: string;
  location: string;
  updatedAt: string;
}

export interface CalculationDraftRecord {
  id: string;
  projectId: string;
  moduleSlug: string;
  title: string;
  payload: unknown;
  verificationStatus: "interface-only";
  updatedAt: string;
}

let schemaReady: Promise<void> | null = null;

async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      const db = getDb();
      await db.execute(sql`
        create table if not exists nola_projects (
          id uuid primary key,
          owner_id text not null,
          name text not null,
          project_number text not null default '',
          location text not null default '',
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `);
      await db.execute(sql`
        create index if not exists nola_projects_owner_idx
        on nola_projects (owner_id, updated_at desc)
      `);
      await db.execute(sql`
        create table if not exists nola_calculation_drafts (
          id uuid primary key,
          owner_id text not null,
          project_id uuid not null references nola_projects(id) on delete cascade,
          module_slug text not null,
          title text not null,
          payload jsonb not null,
          verification_status text not null default 'interface-only',
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `);
      await db.execute(sql`
        create index if not exists nola_calculations_owner_project_idx
        on nola_calculation_drafts (owner_id, project_id, updated_at desc)
      `);
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

export async function listProjects(ownerId: string): Promise<ProjectRecord[]> {
  await ensureSchema();
  const result = await getDb().execute(sql`
    select id, name, project_number, location, updated_at
    from nola_projects
    where owner_id = ${ownerId}
    order by updated_at desc
  `);
  return result.rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    projectNumber: String(row.project_number),
    location: String(row.location),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  }));
}

export async function createProject(
  ownerId: string,
  input: { name: string; projectNumber: string; location: string },
): Promise<ProjectRecord> {
  await ensureSchema();
  const id = crypto.randomUUID();
  const result = await getDb().execute(sql`
    insert into nola_projects (id, owner_id, name, project_number, location)
    values (${id}, ${ownerId}, ${input.name}, ${input.projectNumber}, ${input.location})
    returning id, name, project_number, location, updated_at
  `);
  const row = result.rows[0];
  if (!row) throw new Error("Project creation did not return a record.");
  return {
    id: String(row.id),
    name: String(row.name),
    projectNumber: String(row.project_number),
    location: String(row.location),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

export async function saveCalculationDraft(
  ownerId: string,
  input: {
    id?: string;
    projectId: string;
    moduleSlug: string;
    title: string;
    payload: unknown;
  },
): Promise<CalculationDraftRecord> {
  await ensureSchema();
  const project = await getDb().execute(sql`
    select id from nola_projects
    where id = ${input.projectId}::uuid and owner_id = ${ownerId}
    limit 1
  `);
  if (!project.rows[0]) throw new Error("Project not found for this account.");

  const id = input.id ?? crypto.randomUUID();
  const payload = JSON.stringify(input.payload);
  const result = await getDb().execute(sql`
    insert into nola_calculation_drafts
      (id, owner_id, project_id, module_slug, title, payload)
    values
      (${id}, ${ownerId}, ${input.projectId}::uuid, ${input.moduleSlug}, ${input.title}, ${payload}::jsonb)
    on conflict (id) do update set
      title = excluded.title,
      payload = excluded.payload,
      updated_at = now()
    where nola_calculation_drafts.owner_id = ${ownerId}
    returning id, project_id, module_slug, title, payload, verification_status, updated_at
  `);
  const row = result.rows[0];
  if (!row) throw new Error("Draft could not be saved for this account.");
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    moduleSlug: String(row.module_slug),
    title: String(row.title),
    payload: row.payload,
    verificationStatus: "interface-only",
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}
