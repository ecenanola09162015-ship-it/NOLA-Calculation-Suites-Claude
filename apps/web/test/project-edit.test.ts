import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  defaultDesignCheckPolicy,
  defaultProjectReportSettings,
} from "@nola/calc-core";
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/projects", async (original) => ({
  ...(await original<typeof import("../src/lib/projects")>()),
  createProject: vi.fn(),
  saveCalculationDraft: vi.fn(),
  updateProject: vi.fn(),
}));
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { DuplicateNameError, createProject, updateProject } from "@/lib/projects";
import { createProjectAction, updateProjectAction } from "../src/app/actions";
const id = "12345678-1234-1234-1234-123456789012";
function form() {
  const f = new FormData();
  for (const key of [
    "name",
    "buildingName",
    "location",
    "preparedBy",
    "checkedBy",
    "approvedBy",
  ])
    f.set(key, " Updated " + key + " ");
  f.set("designCheckPolicy", JSON.stringify(defaultDesignCheckPolicy));
  f.set(
    "reportSettings",
    JSON.stringify({
      ...defaultProjectReportSettings,
      ownerClient: "Brittany",
      buildingDescription: "Two-Storey Duplex",
      revision: "02",
      companyName: "Test Company",
    }),
  );
  return f;
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(auth).mockResolvedValue({ userId: "owner" } as Awaited<
    ReturnType<typeof auth>
  >);
});
describe("project edit action", () => {
  it("saves trimmed project fields and shared configuration for the authenticated owner", async () => {
    const record = { id, name: "Updated name" };
    vi.mocked(updateProject).mockResolvedValue(
      record as Awaited<ReturnType<typeof updateProject>>,
    );
    expect(await updateProjectAction(id, form())).toEqual({
      ok: true,
      value: record,
    });
    expect(updateProject).toHaveBeenCalledWith(
      "owner",
      id,
      expect.objectContaining({
        name: "Updated name",
        designCheckPolicy: defaultDesignCheckPolicy,
        reportSettings: expect.objectContaining({
          ownerClient: "Brittany",
          revision: "02",
          companyName: "Test Company",
        }),
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/launcher");
  });
  it("rejects unauthenticated, incomplete and invalid policy edits before writing", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as Awaited<
      ReturnType<typeof auth>
    >);
    expect(await updateProjectAction(id, form())).toMatchObject({
      ok: false,
      error: expect.stringContaining("sign in"),
    });
    vi.mocked(auth).mockResolvedValue({ userId: "owner" } as Awaited<
      ReturnType<typeof auth>
    >);
    const incomplete = form();
    incomplete.set("location", " ");
    expect(await updateProjectAction(id, incomplete)).toMatchObject({
      ok: false,
      error: expect.stringContaining("six fields"),
    });
    const invalid = form();
    invalid.set(
      "designCheckPolicy",
      JSON.stringify({ ...defaultDesignCheckPolicy, passThrough: 0.5 }),
    );
    expect(await updateProjectAction(id, invalid)).toMatchObject({
      ok: false,
      error: expect.stringContaining("thresholds"),
    });
    expect(updateProject).not.toHaveBeenCalled();
  });
});

describe("duplicate project names", () => {
  const dup = new DuplicateNameError(
    "project",
    { id, name: "Updated name", updatedAt: "2026-10-13T07:00:00.000Z" },
    "Updated name (2)",
  );
  it("create returns the existing project and a suggestion instead of throwing", async () => {
    vi.mocked(createProject).mockRejectedValue(dup);
    expect(await createProjectAction(form())).toEqual({
      ok: false,
      error: 'A project named "Updated name" already exists.',
      duplicate: {
        id,
        name: "Updated name",
        updatedAt: "2026-10-13T07:00:00.000Z",
        suggestion: "Updated name (2)",
      },
    });
  });
  it("edit reports a rename onto another project's name", async () => {
    vi.mocked(updateProject).mockRejectedValue(dup);
    const res = await updateProjectAction(id, form());
    expect(res.ok).toBe(false);
    expect(!res.ok && res.duplicate?.suggestion).toBe("Updated name (2)");
  });
  it("hides unexpected database errors behind a safe message", async () => {
    vi.mocked(updateProject).mockRejectedValue(Error("connection string xyz"));
    const res = await updateProjectAction(id, form());
    expect(res).toEqual({
      ok: false,
      error:
        "Project changes could not be saved for this account. Your form remains open.",
    });
  });
});
