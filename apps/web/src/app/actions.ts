"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

import { createProject } from "@/lib/projects";

export async function createProjectAction(formData: FormData) {
  const { userId } = await auth();
  if (!userId) throw new Error("Authentication required.");

  const name = String(formData.get("name") ?? "").trim();
  const projectNumber = String(formData.get("projectNumber") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  if (name.length < 2 || name.length > 100) {
    throw new Error("Project name must contain 2–100 characters.");
  }
  await createProject(userId, { name, projectNumber, location });
  revalidatePath("/launcher");
}
