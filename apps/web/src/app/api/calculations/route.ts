import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  columnDraftSchema,
  slabDraftSchema,
  stairsDraftSchema,
  analyzeStairs,
  stairsDesignChecks,
  getModule,
  analyzeRectangularColumn,
  analyzeSlab,
  columnDesignChecks,
  slabDesignChecks,
  missingJudgmentRemarks,
  defaultDesignCheckPolicy,
} from "@nola/calc-core";
import { isDatabaseConfigured } from "@/lib/env";
import { DuplicateNameError, saveCalculationDraft } from "@/lib/projects";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isDatabaseConfigured())
    return NextResponse.json(
      { error: "Database is not configured" },
      { status: 503 },
    );
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json") ||
    (request.headers.get("origin") &&
      request.headers.get("origin") !== new URL(request.url).origin)
  )
    return NextResponse.json(
      { error: "Send a JSON request from this application." },
      { status: 403 },
    );
  let body;
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 150000)
      throw new Error();
    const text = await request.text();
    if (text.length > 150000) throw new Error();
    body = JSON.parse(text);
  } catch {
    return NextResponse.json(
      { error: "Invalid or oversized draft request." },
      { status: 400 },
    );
  }
  if (
    !body ||
    typeof body !== "object" ||
    typeof body.projectId !== "string" ||
    !uuid.test(body.projectId) ||
    (body.id !== undefined &&
      (typeof body.id !== "string" || !uuid.test(body.id))) ||
    typeof body.moduleSlug !== "string" ||
    !getModule(body.moduleSlug) ||
    typeof body.title !== "string" ||
    !body.title.trim() ||
    body.title.length > 100 ||
    (body.overwrite !== undefined && typeof body.overwrite !== "boolean") ||
    !body.payload
  )
    return NextResponse.json(
      { error: "Provide a valid project, module, title, and payload." },
      { status: 400 },
    );
  if (body.moduleSlug === "rc-column") {
    const parsed = columnDraftSchema.safeParse(body.payload);
    if (!parsed.success)
      return NextResponse.json(
        {
          error:
            "Invalid RC column inputs. Check dimensions, materials, bars, and unique load labels.",
        },
        { status: 400 },
      );
    body.payload = parsed.data;
  }
  if (body.moduleSlug === "slab") {
    const parsed = slabDraftSchema.safeParse(body.payload);
    if (!parsed.success)
      return NextResponse.json(
        {
          error:
            "Invalid slab inputs. Check geometry, reinforcement, cover, cutoffs and unique load combination labels.",
        },
        { status: 400 },
      );
    body.payload = parsed.data;
  }
  if (body.moduleSlug === "stairs") {
    const parsed = stairsDraftSchema.safeParse(body.payload);
    if (!parsed.success)
      return NextResponse.json(
        {
          error:
            "Invalid stair inputs. Check geometry, landings, supports, reinforcement and unique load labels.",
        },
        { status: 400 },
      );
    body.payload = parsed.data;
  }
  try {
    if (body.payload.reviewCompleted) {
      const policy = body.payload.designPolicy ?? defaultDesignCheckPolicy;
      const remarks = body.payload.remarks ?? {};
      const checks =
        body.moduleSlug === "rc-column"
          ? columnDesignChecks(analyzeRectangularColumn(body.payload.input))
          : body.moduleSlug === "slab"
            ? slabDesignChecks(
                body.payload.input,
                analyzeSlab(body.payload.input, false),
              )
            : body.moduleSlug === "stairs"
              ? stairsDesignChecks(analyzeStairs(body.payload.input))
              : [];
      if (missingJudgmentRemarks(checks, policy, remarks).length)
        return NextResponse.json(
          { error: "Add Remarks For Each Amber Design Check Before Saving." },
          { status: 400 },
        );
    }
  } catch {
    return NextResponse.json(
      {
        error:
          "Complete valid design inputs before saving a reviewed calculation.",
      },
      { status: 400 },
    );
  }
  try {
    const draft = await saveCalculationDraft(userId, {
      id: body.id,
      projectId: body.projectId,
      moduleSlug: body.moduleSlug,
      title: body.title.trim(),
      payload: body.payload,
      overwrite: body.overwrite === true,
    });
    return NextResponse.json({ draft }, { status: body.id ? 200 : 201 });
  } catch (error) {
    // Same title in this project and module: the client asks the user to
    // overwrite, save under the suggested name, or cancel.
    if (error instanceof DuplicateNameError)
      return NextResponse.json(
        {
          error: error.message,
          duplicate: {
            id: error.existing.id,
            title: error.existing.name,
            updatedAt: error.existing.updatedAt,
            suggestion: error.suggestion,
          },
        },
        { status: 409 },
      );
    if (error instanceof Error && /not found|this account/.test(error.message))
      return NextResponse.json(
        { error: "Project or calculation is unavailable for this account." },
        { status: 404 },
      );
    console.error("Calculation draft could not be saved.");
    return NextResponse.json(
      {
        error: "Cloud save failed. Your inputs remain on screen; retry saving.",
      },
      { status: 503 },
    );
  }
}
