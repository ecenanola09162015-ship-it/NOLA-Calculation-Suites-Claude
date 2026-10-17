/**
 * Client helpers for the two save actions shared by every module (decision
 * 17 Oct 2026):
 * - Save changes: update this calculation file in its own project.
 * - Save to project: save changes, then create a copy in another project.
 * Both go through POST /api/calculations (schema + review validation).
 */
import type { CalculationDraftRecord } from "@/lib/projects";
import type { DraftDuplicate } from "@/components/duplicate-save-prompt";

export type PostCalculationResult =
  | { ok: true; draft: CalculationDraftRecord }
  | { ok: false; error: string; duplicate?: DraftDuplicate };

export async function postCalculation(body: {
  id?: string;
  projectId: string;
  moduleSlug: string;
  title: string;
  payload: unknown;
  overwrite?: boolean;
}): Promise<PostCalculationResult> {
  let response: Response;
  try {
    response = await fetch("/api/calculations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, overwrite: body.overwrite === true }),
    });
  } catch {
    return {
      ok: false,
      error: "Cloud save failed. Your inputs remain on screen; retry saving.",
    };
  }
  const data = (await response.json().catch(() => ({}))) as {
    draft?: CalculationDraftRecord;
    error?: string;
    duplicate?: DraftDuplicate;
  };
  if (response.ok && data.draft) return { ok: true, draft: data.draft };
  return {
    ok: false,
    error: data.error ?? "Save failed.",
    duplicate: response.status === 409 ? data.duplicate : undefined,
  };
}

/**
 * Copy into another project as a new calculation (never overwrites). If the
 * title is taken there, the copy is saved once under the server's suggested
 * free name ("BP-01 (2)") and `renamed` is true.
 */
export async function copyCalculationToProject(input: {
  projectId: string;
  moduleSlug: string;
  title: string;
  payload: unknown;
}): Promise<
  | { ok: true; draft: CalculationDraftRecord; renamed: boolean }
  | { ok: false; error: string }
> {
  const first = await postCalculation(input);
  if (first.ok) return { ok: true, draft: first.draft, renamed: false };
  if (!first.duplicate) return { ok: false, error: first.error };
  const second = await postCalculation({
    ...input,
    title: first.duplicate.suggestion,
  });
  return second.ok
    ? { ok: true, draft: second.draft, renamed: true }
    : { ok: false, error: second.error };
}
