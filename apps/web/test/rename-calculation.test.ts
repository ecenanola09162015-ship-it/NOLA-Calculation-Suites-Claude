import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/projects", async (original) => ({
  ...(await original<typeof import("../src/lib/projects")>()),
  renameCalculationDraft: vi.fn(),
}));
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { DuplicateNameError, renameCalculationDraft } from "@/lib/projects";
import { renameCalculationAction } from "../src/app/actions";

const id = "12345678-1234-1234-1234-123456789012";
const record = {
  id,
  projectId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  moduleSlug: "rc-column",
  title: "C1 · First floor",
  payload: {},
  verificationStatus: "interface-only" as const,
  updatedAt: "2026-10-15T00:00:00.000Z",
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(auth).mockResolvedValue({ userId: "owner" } as Awaited<
    ReturnType<typeof auth>
  >);
});

describe("rename calculation action", () => {
  it("requires sign-in", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as Awaited<
      ReturnType<typeof auth>
    >);
    expect(await renameCalculationAction(id, "C1")).toEqual({
      ok: false,
      error: "Please sign in again.",
    });
    expect(renameCalculationDraft).not.toHaveBeenCalled();
  });
  it("rejects a malformed id and empty or long names", async () => {
    expect((await renameCalculationAction("nope", "C1")).ok).toBe(false);
    expect(await renameCalculationAction(id, "   ")).toEqual({
      ok: false,
      error: "Enter a calculation name.",
    });
    expect(await renameCalculationAction(id, "x".repeat(101))).toEqual({
      ok: false,
      error: "Use 100 characters or fewer.",
    });
    expect(renameCalculationDraft).not.toHaveBeenCalled();
  });
  it("renames for the signed-in owner with a trimmed name", async () => {
    vi.mocked(renameCalculationDraft).mockResolvedValue(record);
    expect(await renameCalculationAction(id, "  C1 · First floor  ")).toEqual({
      ok: true,
      value: record,
    });
    expect(renameCalculationDraft).toHaveBeenCalledWith(
      "owner",
      id,
      "C1 · First floor",
    );
    expect(revalidatePath).toHaveBeenCalledWith("/launcher");
  });
  it("reports a duplicate with a free suggested name", async () => {
    vi.mocked(renameCalculationDraft).mockRejectedValue(
      new DuplicateNameError(
        "calculation",
        { id: "other", name: "C2", updatedAt: "2026-10-14T00:00:00.000Z" },
        "C2 (2)",
      ),
    );
    const res = await renameCalculationAction(id, "c2");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe('"C2" already exists in this project.');
      expect(res.duplicate?.suggestion).toBe("C2 (2)");
    }
  });
  it("hides internal errors (e.g. another account's calculation)", async () => {
    vi.mocked(renameCalculationDraft).mockRejectedValue(
      new Error("Calculation not found for this account."),
    );
    expect(await renameCalculationAction(id, "C9")).toEqual({
      ok: false,
      error: "Calculation could not be renamed. Please retry.",
    });
  });
});
