import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultDesignCheckPolicy } from "@nola/calc-core";
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/projects", () => ({
  createProject: vi.fn(),
  saveCalculationDraft: vi.fn(),
  updateProject: vi.fn(),
}));
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { updateProject } from "@/lib/projects";
import { updateProjectAction } from "../src/app/actions";
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
    expect(await updateProjectAction(id, form())).toEqual(record);
    expect(updateProject).toHaveBeenCalledWith(
      "owner",
      id,
      expect.objectContaining({
        name: "Updated name",
        designCheckPolicy: defaultDesignCheckPolicy,
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/launcher");
  });
  it("rejects unauthenticated, incomplete and invalid policy edits before writing", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as Awaited<
      ReturnType<typeof auth>
    >);
    await expect(updateProjectAction(id, form())).rejects.toThrow("sign in");
    vi.mocked(auth).mockResolvedValue({ userId: "owner" } as Awaited<
      ReturnType<typeof auth>
    >);
    const incomplete = form();
    incomplete.set("location", " ");
    await expect(updateProjectAction(id, incomplete)).rejects.toThrow(
      "six fields",
    );
    const invalid = form();
    invalid.set(
      "designCheckPolicy",
      JSON.stringify({ ...defaultDesignCheckPolicy, passThrough: 0.5 }),
    );
    await expect(updateProjectAction(id, invalid)).rejects.toThrow(
      "thresholds",
    );
    expect(updateProject).not.toHaveBeenCalled();
  });
});
