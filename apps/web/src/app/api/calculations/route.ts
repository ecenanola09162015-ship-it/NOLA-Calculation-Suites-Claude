import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { isDatabaseConfigured } from "@/lib/env";
import { saveCalculationDraft } from "@/lib/projects";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "Database is not configured" },
      { status: 503 },
    );
  }

  const body = (await request.json()) as {
    id?: string;
    projectId?: string;
    moduleSlug?: string;
    title?: string;
    payload?: unknown;
  };
  if (!body.projectId || !body.moduleSlug || !body.title || !body.payload) {
    return NextResponse.json(
      { error: "Missing draft fields" },
      { status: 400 },
    );
  }

  const draft = await saveCalculationDraft(userId, {
    id: body.id,
    projectId: body.projectId,
    moduleSlug: body.moduleSlug,
    title: body.title,
    payload: body.payload,
  });
  return NextResponse.json({ draft }, { status: body.id ? 200 : 201 });
}
