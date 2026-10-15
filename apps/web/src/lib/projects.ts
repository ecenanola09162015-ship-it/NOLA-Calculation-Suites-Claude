import {
  defaultDesignCheckPolicy,
  designCheckPolicySchema,
  type DesignCheckPolicy,
  projectReportSettingsSchema,
  defaultProjectReportSettings,
  type ProjectReportSettings,
} from "@nola/calc-core";
import { sql } from "drizzle-orm";

import { getDb } from "./db";

export interface ProjectRecord {
  id: string;
  name: string;
  projectNumber: string;
  buildingName: string;
  preparedBy: string;
  checkedBy: string;
  approvedBy: string;
  location: string;
  updatedAt: string;
  designCheckPolicy?: DesignCheckPolicy;
  reportSettings?: ProjectReportSettings;
}

export interface CalculationDraftRecord {
  id: string;
  projectId: string;
  moduleSlug: string;
  title: string;
  payload: unknown;
  verificationStatus: "interface-only" | "verification-required";
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
      await db.execute(
        sql`alter table nola_projects add column if not exists building_name text not null default ''`,
      );
      await db.execute(
        sql`alter table nola_projects add column if not exists prepared_by text not null default ''`,
      );
      await db.execute(
        sql`alter table nola_projects add column if not exists checked_by text not null default ''`,
      );
      await db.execute(
        sql`alter table nola_projects add column if not exists approved_by text not null default ''`,
      );
      await db.execute(
        sql`alter table nola_projects add column if not exists design_check_policy jsonb`,
      );
      await db.execute(
        sql`alter table nola_projects add column if not exists report_settings jsonb`,
      );
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
      await ensureUniqueNames();
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}


/**
 * Name comparison used everywhere: case-insensitive, trimmed, inner runs of
 * whitespace collapsed. "Tower  A " and "tower a" are the same project.
 */
export const normalizeName = (v: string) =>
  v.trim().replace(/\s+/g, " ").toLowerCase();
const nameKey = (column: ReturnType<typeof sql.raw>) =>
  sql`lower(regexp_replace(btrim(${column}), '\\s+', ' ', 'g'))`;

/** Duplicate project name or calculation title (HTTP 409 / prompt). */
export class DuplicateNameError extends Error {
  constructor(
    public readonly kind: "project" | "calculation",
    public readonly existing: { id: string; name: string; updatedAt: string },
    public readonly suggestion: string,
  ) {
    super(
      kind === "project"
        ? `A project named "${existing.name}" already exists.`
        : `"${existing.name}" already exists in this project.`,
    );
    this.name = "DuplicateNameError";
  }
}

/**
 * One-time migration on cold start: existing duplicates keep the name on the
 * most recently updated record; older ones are renamed " (2)", " (3)", …
 * Nothing is deleted. Then unique indexes enforce the rule for every save.
 */
async function ensureUniqueNames() {
  const db = getDb();
  const projectKey = nameKey(sql.raw("name"));
  const draftKey = nameKey(sql.raw("title"));
  const renameProjects = (suffix: ReturnType<typeof sql>) => sql`
    update nola_projects p set name = p.name || ${suffix}, updated_at = p.updated_at
    from (
      select id, row_number() over (partition by owner_id, ${projectKey}
        order by updated_at desc, created_at desc, id) as rn
      from nola_projects
    ) d where p.id = d.id and d.rn > 1`;
  const renameDrafts = (suffix: ReturnType<typeof sql>) => sql`
    update nola_calculation_drafts c set title = c.title || ${suffix}, updated_at = c.updated_at
    from (
      select id, row_number() over (partition by owner_id, project_id, module_slug, ${draftKey}
        order by updated_at desc, created_at desc, id) as rn
      from nola_calculation_drafts
    ) d where c.id = d.id and d.rn > 1`;
  const projectIndex = sql`create unique index if not exists nola_projects_owner_name_uq
    on nola_projects (owner_id, ${projectKey})`;
  const draftIndex = sql`create unique index if not exists nola_calculations_title_uq
    on nola_calculation_drafts (owner_id, project_id, module_slug, ${draftKey})`;
  const rn = sql.raw("' (' || d.rn || ')'");
  // If " (2)" itself collides with an existing name, the second pass appends
  // the record's short id, which is unique.
  const shortId = (t: string) => sql.raw(`' [' || left(${t}.id::text, 8) || ']'`);
  try {
    await db.execute(projectIndex);
  } catch {
    await db.execute(renameProjects(rn));
    try {
      await db.execute(projectIndex);
    } catch {
      await db.execute(renameProjects(shortId("p")));
      await db.execute(projectIndex);
    }
  }
  try {
    await db.execute(draftIndex);
  } catch {
    await db.execute(renameDrafts(rn));
    try {
      await db.execute(draftIndex);
    } catch {
      await db.execute(renameDrafts(shortId("c")));
      await db.execute(draftIndex);
    }
  }
}

const isUniqueViolation = (e: unknown) => {
  for (let x: unknown = e, k = 0; x && k < 4; k++) {
    if ((x as { code?: string }).code === "23505") return true;
    x = (x as { cause?: unknown }).cause;
  }
  return /duplicate key|unique constraint/i.test(String(e));
};

/** Next free "Name (n)" among the given names. */
export function nextFreeName(name: string, taken: string[]) {
  const used = new Set(taken.map(normalizeName));
  const base = name.trim().replace(/\s*\((\d+)\)$/, "");
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base} (${n})`.slice(0, 100);
    if (!used.has(normalizeName(candidate))) return candidate;
  }
  return `${base} (${Date.now()})`.slice(0, 100);
}

async function projectNameConflict(
  ownerId: string,
  name: string,
  excludeId?: string,
) {
  const result = await getDb().execute(sql`
    select id, name, updated_at from nola_projects
    where owner_id = ${ownerId}
    ${excludeId ? sql`and id <> ${excludeId}::uuid` : sql``}
  `);
  const rows = result.rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    updatedAt: new Date(String(r.updated_at)).toISOString(),
  }));
  const hit = rows.find((r) => normalizeName(r.name) === normalizeName(name));
  return hit
    ? new DuplicateNameError(
        "project",
        hit,
        nextFreeName(
          name,
          rows.map((r) => r.name),
        ),
      )
    : null;
}

async function draftTitleConflict(
  ownerId: string,
  projectId: string,
  moduleSlug: string,
  title: string,
  excludeId?: string,
) {
  const result = await getDb().execute(sql`
    select id, title, updated_at from nola_calculation_drafts
    where owner_id = ${ownerId} and project_id = ${projectId}::uuid
      and module_slug = ${moduleSlug}
  `);
  const rows = result.rows.map((r) => ({
    id: String(r.id),
    name: String(r.title),
    updatedAt: new Date(String(r.updated_at)).toISOString(),
  }));
  const hit = rows.find(
    (r) => r.id !== excludeId && normalizeName(r.name) === normalizeName(title),
  );
  return hit
    ? new DuplicateNameError(
        "calculation",
        hit,
        nextFreeName(
          title,
          rows.map((r) => r.name),
        ),
      )
    : null;
}

export async function listProjects(ownerId: string): Promise<ProjectRecord[]> {
  await ensureSchema();
  const result = await getDb().execute(sql`
    select id, name, project_number, building_name, prepared_by, checked_by, approved_by, location, design_check_policy, report_settings, updated_at
    from nola_projects
    where owner_id = ${ownerId}
    order by updated_at desc
  `);
  return result.rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    projectNumber: String(row.project_number),
    buildingName: String(row.building_name),
    preparedBy: String(row.prepared_by),
    checkedBy: String(row.checked_by),
    approvedBy: String(row.approved_by),
    designCheckPolicy: designCheckPolicySchema.safeParse(
      row.design_check_policy,
    ).success
      ? designCheckPolicySchema.parse(row.design_check_policy)
      : defaultDesignCheckPolicy,
    reportSettings: projectReportSettingsSchema.safeParse(row.report_settings)
      .success
      ? projectReportSettingsSchema.parse(row.report_settings)
      : defaultProjectReportSettings,
    location: String(row.location),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  }));
}

export async function createProject(
  ownerId: string,
  input: {
    name: string;
    projectNumber: string;
    location: string;
    buildingName: string;
    preparedBy: string;
    checkedBy: string;
    approvedBy: string;
  },
): Promise<ProjectRecord> {
  await ensureSchema();
  const conflict = await projectNameConflict(ownerId, input.name);
  if (conflict) throw conflict;
  const id = crypto.randomUUID();
  const result = await getDb()
    .execute(
      sql`
    insert into nola_projects (id, owner_id, name, project_number, location, building_name, prepared_by, checked_by, approved_by)
    values (${id}, ${ownerId}, ${input.name}, ${input.projectNumber}, ${input.location}, ${input.buildingName}, ${input.preparedBy}, ${input.checkedBy}, ${input.approvedBy})
    returning id, name, project_number, building_name, prepared_by, checked_by, approved_by, location, design_check_policy, report_settings, updated_at
  `,
    )
    .catch(async (e) => {
      // Two tabs creating the same name at once: the unique index decides.
      if (isUniqueViolation(e))
        throw (await projectNameConflict(ownerId, input.name)) ?? e;
      throw e;
    });
  const row = result.rows[0];
  if (!row) throw new Error("Project creation did not return a record.");
  return {
    id: String(row.id),
    name: String(row.name),
    projectNumber: String(row.project_number),
    buildingName: String(row.building_name),
    preparedBy: String(row.prepared_by),
    checkedBy: String(row.checked_by),
    approvedBy: String(row.approved_by),
    designCheckPolicy: designCheckPolicySchema.safeParse(
      row.design_check_policy,
    ).success
      ? designCheckPolicySchema.parse(row.design_check_policy)
      : defaultDesignCheckPolicy,
    reportSettings: projectReportSettingsSchema.safeParse(row.report_settings)
      .success
      ? projectReportSettingsSchema.parse(row.report_settings)
      : defaultProjectReportSettings,
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
    /** Replace an existing calculation with the same title (user confirmed). */
    overwrite?: boolean;
  },
): Promise<CalculationDraftRecord> {
  await ensureSchema();
  const db = getDb();
  const project = await db.execute(sql`
    select id from nola_projects
    where id = ${input.projectId}::uuid and owner_id = ${ownerId}
    limit 1
  `);
  if (!project.rows[0]) throw new Error("Project not found for this account.");

  // A reopened calculation keeps its id only within its own project and
  // module; saved into another project it becomes a new record there.
  let id: string | undefined;
  if (input.id) {
    const own = await db.execute(sql`
      select id from nola_calculation_drafts
      where id = ${input.id}::uuid and owner_id = ${ownerId}
        and project_id = ${input.projectId}::uuid and module_slug = ${input.moduleSlug}
      limit 1
    `);
    if (own.rows[0]) id = input.id;
  }
  const conflict = await draftTitleConflict(
    ownerId,
    input.projectId,
    input.moduleSlug,
    input.title,
    id,
  );
  if (conflict) {
    if (!input.overwrite) throw conflict;
    // Overwrite: the same-titled record is replaced in place. A different
    // record that was being edited keeps its own (old) title.
    id = conflict.existing.id;
  }
  id ??= crypto.randomUUID();
  const payload = JSON.stringify(input.payload);
  const candidate = input.payload as {
    kind?: string;
    input?: { code?: string };
  } | null;
  const status =
    ((input.moduleSlug === "rc-column" && candidate?.kind === "rc-column") ||
      (input.moduleSlug === "slab" && candidate?.kind === "slab")) &&
    (candidate.input?.code === "ACI 318-19" ||
      candidate.input?.code === "NSCP 2015")
      ? "verification-required"
      : "interface-only";
  const result = await db
    .execute(
      sql`
    insert into nola_calculation_drafts
      (id, owner_id, project_id, module_slug, title, payload, verification_status)
    values
      (${id}, ${ownerId}, ${input.projectId}::uuid, ${input.moduleSlug}, ${input.title}, ${payload}::jsonb, ${status})
    on conflict (id) do update set
      title = excluded.title,
      payload = excluded.payload,
      verification_status = excluded.verification_status,
      updated_at = now()
    where nola_calculation_drafts.owner_id = ${ownerId}
      and nola_calculation_drafts.project_id = excluded.project_id
      and nola_calculation_drafts.module_slug = excluded.module_slug
    returning id, project_id, module_slug, title, payload, verification_status, updated_at
  `,
    )
    .catch(async (e) => {
      if (isUniqueViolation(e))
        throw (
          (await draftTitleConflict(
            ownerId,
            input.projectId,
            input.moduleSlug,
            input.title,
            id,
          )) ?? e
        );
      throw e;
    });
  const row = result.rows[0];
  if (!row) throw new Error("Draft could not be saved for this account.");
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    moduleSlug: String(row.module_slug),
    title: String(row.title),
    payload: row.payload,
    verificationStatus:
      row.verification_status === "verification-required"
        ? "verification-required"
        : "interface-only",
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

/**
 * Rename a calculation the owner holds. Same uniqueness rule as save: titles
 * are unique per project and module (case and extra spaces ignored).
 */
export async function renameCalculationDraft(
  ownerId: string,
  id: string,
  title: string,
): Promise<CalculationDraftRecord> {
  await ensureSchema();
  const db = getDb();
  const found = await db.execute(sql`
    select project_id, module_slug from nola_calculation_drafts
    where id = ${id}::uuid and owner_id = ${ownerId}
    limit 1
  `);
  const own = found.rows[0];
  if (!own) throw new Error("Calculation not found for this account.");
  const projectId = String(own.project_id);
  const moduleSlug = String(own.module_slug);
  const conflict = await draftTitleConflict(ownerId, projectId, moduleSlug, title, id);
  if (conflict) throw conflict;
  const result = await db
    .execute(
      sql`
    update nola_calculation_drafts set title = ${title}, updated_at = now()
    where id = ${id}::uuid and owner_id = ${ownerId}
    returning id, project_id, module_slug, title, payload, verification_status, updated_at
  `,
    )
    .catch(async (e) => {
      if (isUniqueViolation(e))
        throw (await draftTitleConflict(ownerId, projectId, moduleSlug, title, id)) ?? e;
      throw e;
    });
  const row = result.rows[0];
  if (!row) throw new Error("Calculation not found for this account.");
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    moduleSlug: String(row.module_slug),
    title: String(row.title),
    payload: row.payload,
    verificationStatus:
      row.verification_status === "verification-required"
        ? "verification-required"
        : "interface-only",
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

export async function listCalculationDrafts(
  ownerId: string,
): Promise<CalculationDraftRecord[]> {
  await ensureSchema();
  const result = await getDb().execute(
    sql`select id, project_id, module_slug, title, payload, verification_status, updated_at from nola_calculation_drafts where owner_id = ${ownerId} order by updated_at desc`,
  );
  return result.rows.map((row) => ({
    id: String(row.id),
    projectId: String(row.project_id),
    moduleSlug: String(row.module_slug),
    title: String(row.title),
    payload: row.payload,
    verificationStatus:
      row.verification_status === "verification-required"
        ? "verification-required"
        : "interface-only",
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  }));
}

export async function updateProject(
  ownerId: string,
  id: string,
  input: {
    name: string;
    buildingName: string;
    location: string;
    preparedBy: string;
    checkedBy: string;
    approvedBy: string;
    designCheckPolicy: DesignCheckPolicy;
    reportSettings?: ProjectReportSettings;
  },
): Promise<ProjectRecord> {
  await ensureSchema();
  const conflict = await projectNameConflict(ownerId, input.name, id);
  if (conflict) throw conflict;
  const policy = JSON.stringify(
    designCheckPolicySchema.parse(input.designCheckPolicy),
  );
  const reportSettings = JSON.stringify(
    projectReportSettingsSchema.parse(
      input.reportSettings ?? defaultProjectReportSettings,
    ),
  );
  const result = await getDb()
    .execute(
    sql`update nola_projects set name=${input.name},building_name=${input.buildingName},location=${input.location},prepared_by=${input.preparedBy},checked_by=${input.checkedBy},approved_by=${input.approvedBy},design_check_policy=${policy}::jsonb,report_settings=${reportSettings}::jsonb,updated_at=now() where id=${id}::uuid and owner_id=${ownerId} returning id,name,project_number,building_name,location,prepared_by,checked_by,approved_by,design_check_policy,report_settings,updated_at`,
  )
    .catch(async (e) => {
      if (isUniqueViolation(e))
        throw (await projectNameConflict(ownerId, input.name, id)) ?? e;
      throw e;
    });
  const row = result.rows[0];
  if (!row) throw Error("Project unavailable for this account.");
  return {
    id: String(row.id),
    name: String(row.name),
    projectNumber: String(row.project_number),
    buildingName: String(row.building_name),
    reportSettings: projectReportSettingsSchema.safeParse(row.report_settings)
      .success
      ? projectReportSettingsSchema.parse(row.report_settings)
      : defaultProjectReportSettings,
    location: String(row.location),
    preparedBy: String(row.prepared_by),
    checkedBy: String(row.checked_by),
    approvedBy: String(row.approved_by),
    designCheckPolicy: designCheckPolicySchema.parse(row.design_check_policy),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}
