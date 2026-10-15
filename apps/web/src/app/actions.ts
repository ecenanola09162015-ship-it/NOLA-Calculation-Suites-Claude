"use server";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import {
  DuplicateNameError,
  createProject,
  renameCalculationDraft,
  saveCalculationDraft,
  updateProject,
} from "@/lib/projects";
import {
  designCheckPolicySchema,
  projectReportSettingsSchema,
} from "@nola/calc-core";
import { uiCatalogue } from "@/lib/ui-catalogue";
import { titleProblem } from "@/lib/explorer-tree";

/**
 * Server actions return their outcome instead of throwing: Next.js hides the
 * message of an error thrown in production, so the user would only see a
 * generic failure.
 */
export type DuplicateInfo = {
  id: string;
  name: string;
  updatedAt: string;
  suggestion: string;
};
export type ActionResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; duplicate?: DuplicateInfo };
async function outcome<T>(
  run: () => Promise<T>,
  fallback: string,
): Promise<ActionResult<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (e) {
    if (e instanceof DuplicateNameError)
      return {
        ok: false,
        error: e.message,
        duplicate: { ...e.existing, suggestion: e.suggestion },
      };
    return {
      ok: false,
      error: e instanceof ActionInputError ? e.message : fallback,
    };
  }
}
/** Validation messages that are safe to show the user. */
class ActionInputError extends Error {}

export async function createProjectAction(formData: FormData) {
  return outcome(
    () => createProjectChecked(formData),
    "Project could not be saved. Please retry.",
  );
}
async function createProjectChecked(formData: FormData) {
  const { userId } = await auth();
  if (!userId) throw new ActionInputError("Please sign in again.");
  const field = (name: string) => {
    const value = String(formData.get(name) ?? "").trim();
    if (!value || value.length > 100)
      throw new ActionInputError(
        "Complete all six fields using 1–100 characters each.",
      );
    return value;
  };
  const project = await createProject(userId, {
    name: field("name"),
    buildingName: field("buildingName"),
    location: field("location"),
    preparedBy: field("preparedBy"),
    checkedBy: field("checkedBy"),
    approvedBy: field("approvedBy"),
    projectNumber: "",
  });
  revalidatePath("/launcher");
  return project;
}
export async function createInterfaceDraftAction(
  projectId: string,
  slug: string,
  title: string,
) {
  return outcome(
    () => createInterfaceDraftChecked(projectId, slug, title),
    "Draft could not be saved. Please retry.",
  );
}
async function createInterfaceDraftChecked(
  projectId: string,
  slug: string,
  title: string,
) {
  const { userId } = await auth();
  if (!userId) throw new ActionInputError("Please sign in again.");
  const module = uiCatalogue.find((item) => item.slug === slug);
  if (!module?.pilot)
    throw new ActionInputError(
      "This module is scheduled for future development.",
    );
  if (!title.trim() || title.length > 100)
    throw new ActionInputError(
      "Enter a calculation title using 1–100 characters.",
    );
  const draft = await saveCalculationDraft(userId, {
    projectId,
    moduleSlug: slug,
    title: title.trim(),
    payload: {
      kind: "interface-draft",
      notes: "Calculation engine not started.",
    },
  });
  revalidatePath("/launcher");
  return draft;
}

export async function updateProjectAction(id: string, formData: FormData) {
  return outcome(
    () => updateProjectChecked(id, formData),
    "Project changes could not be saved for this account. Your form remains open.",
  );
}
async function updateProjectChecked(id: string, formData: FormData) {
  const { userId } = await auth();
  if (!userId) throw new ActionInputError("Please sign in again.");
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    throw new ActionInputError("Invalid project.");
  const field = (key: string) => {
    const value = String(formData.get(key) ?? "").trim();
    if (!value || value.length > 100)
      throw new ActionInputError(
        "Complete all six fields using 1–100 characters each.",
      );
    return value;
  };
  let policy;
  try {
    policy = designCheckPolicySchema.parse(
      JSON.parse(String(formData.get("designCheckPolicy"))),
    );
  } catch {
    throw new ActionInputError(
      "Check status thresholds, labels and colors. Thresholds must be strictly increasing.",
    );
  }
  let reportSettings;
  try {
    reportSettings = projectReportSettingsSchema.parse(
      JSON.parse(String(formData.get("reportSettings") ?? "{}")),
    );
  } catch {
    throw new ActionInputError(
      "Check report settings, project fields and logo file sizes.",
    );
  }
  const input = {
    reportSettings,
    name: field("name"),
    buildingName: field("buildingName"),
    location: field("location"),
    preparedBy: field("preparedBy"),
    checkedBy: field("checkedBy"),
    approvedBy: field("approvedBy"),
    designCheckPolicy: policy,
  };
  const project = await updateProject(userId, id, input);
  revalidatePath("/launcher");
  return project;
}

/** Rename a calculation from the project explorer. */
export async function renameCalculationAction(id: string, title: string) {
  return outcome(
    () => renameCalculationChecked(id, title),
    "Calculation could not be renamed. Please retry.",
  );
}
async function renameCalculationChecked(id: string, title: string) {
  const { userId } = await auth();
  if (!userId) throw new ActionInputError("Please sign in again.");
  if (
    typeof id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    throw new ActionInputError("Invalid calculation.");
  const value = typeof title === "string" ? title.trim() : "";
  const problem = titleProblem(value);
  if (problem) throw new ActionInputError(problem);
  const draft = await renameCalculationDraft(userId, id, value);
  revalidatePath("/launcher");
  return draft;
}
