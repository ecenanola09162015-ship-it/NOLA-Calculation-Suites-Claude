"use server";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createProject, saveCalculationDraft } from "@/lib/projects";
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
