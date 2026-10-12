import {
  defaultDesignCheckPolicy,
  designCheckPolicySchema,
  type DesignCheckPolicy,
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
    select id, name, project_number, building_name, prepared_by, checked_by, approved_by, location, design_check_policy, updated_at
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
  const id = crypto.randomUUID();
  const result = await getDb().execute(sql`
    insert into nola_projects (id, owner_id, name, project_number, location, building_name, prepared_by, checked_by, approved_by)
    values (${id}, ${ownerId}, ${input.name}, ${input.projectNumber}, ${input.location}, ${input.buildingName}, ${input.preparedBy}, ${input.checkedBy}, ${input.approvedBy})
    returning id, name, project_number, building_name, prepared_by, checked_by, approved_by, location, design_check_policy, updated_at
  `);
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
  const result = await getDb().execute(sql`
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
  `);
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
  },
): Promise<ProjectRecord> {
  await ensureSchema();
  const policy = JSON.stringify(
    designCheckPolicySchema.parse(input.designCheckPolicy),
  );
  const result = await getDb().execute(
    sql`update nola_projects set name=${input.name},building_name=${input.buildingName},location=${input.location},prepared_by=${input.preparedBy},checked_by=${input.checkedBy},approved_by=${input.approvedBy},design_check_policy=${policy}::jsonb,updated_at=now() where id=${id}::uuid and owner_id=${ownerId} returning id,name,project_number,building_name,location,prepared_by,checked_by,approved_by,design_check_policy,updated_at`,
  );
  const row = result.rows[0];
  if (!row) throw Error("Project unavailable for this account.");
  return {
    id: String(row.id),
    name: String(row.name),
    projectNumber: String(row.project_number),
    buildingName: String(row.building_name),
    location: String(row.location),
    preparedBy: String(row.prepared_by),
    checkedBy: String(row.checked_by),
    approvedBy: String(row.approved_by),
    designCheckPolicy: designCheckPolicySchema.parse(row.design_check_policy),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}
