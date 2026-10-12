"use server";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import {
  createProject,
  saveCalculationDraft,
  updateProject,
} from "@/lib/projects";
import {
  designCheckPolicySchema,
  projectReportSettingsSchema,
} from "@nola/calc-core";
import { uiCatalogue } from "@/lib/ui-catalogue";
export async function createProjectAction(formData: FormData) {
  const { userId } = await auth();
  if (!userId) throw new Error("Please sign in again.");
  const field = (name: string) => {
    const value = String(formData.get(name) ?? "").trim();
    if (!value || value.length > 100)
      throw new Error("Complete all six fields using 1–100 characters each.");
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
  const { userId } = await auth();
  if (!userId) throw new Error("Please sign in again.");
  const module = uiCatalogue.find((item) => item.slug === slug);
  if (!module?.pilot)
    throw new Error("This module is scheduled for future development.");
  if (!title.trim() || title.length > 100)
    throw new Error("Enter a calculation title using 1–100 characters.");
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
  const { userId } = await auth();
  if (!userId) throw Error("Please sign in again.");
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    throw Error("Invalid project.");
  const field = (key: string) => {
    const value = String(formData.get(key) ?? "").trim();
    if (!value || value.length > 100)
      throw Error("Complete all six fields using 1–100 characters each.");
    return value;
  };
  let policy;
  try {
    policy = designCheckPolicySchema.parse(
      JSON.parse(String(formData.get("designCheckPolicy"))),
    );
  } catch {
    throw Error(
      "Check status thresholds, labels and colors. Thresholds must be strictly increasing.",
    );
  }
  let reportSettings;
  try {
    reportSettings = projectReportSettingsSchema.parse(
      JSON.parse(String(formData.get("reportSettings") ?? "{}")),
    );
  } catch {
    throw Error("Check report settings, project fields and logo file sizes.");
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
  try {
    const project = await updateProject(userId, id, input);
    revalidatePath("/launcher");
    return project;
  } catch {
    throw Error(
      "Project changes could not be saved for this account. Your form remains open.",
    );
  }
}
