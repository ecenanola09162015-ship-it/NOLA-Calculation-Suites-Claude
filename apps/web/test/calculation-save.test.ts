import { describe, expect, it, vi, beforeEach } from "vitest";
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
// Source route uses @/ alias; resolve those imports through the explicit mocked paths.
vi.mock("@/lib/env", () => ({ isDatabaseConfigured: vi.fn() }));
vi.mock("@/lib/projects", () => ({ saveCalculationDraft: vi.fn() }));
import { auth } from "@clerk/nextjs/server";
import { isDatabaseConfigured } from "@/lib/env";
import { saveCalculationDraft } from "@/lib/projects";
import { defaultSlabInput } from "@nola/calc-core";
import { POST } from "../src/app/api/calculations/route";
const projectId = "12345678-1234-1234-1234-123456789012";
const body = {
  projectId,
  moduleSlug: "rc-column",
  title: "C1",
  payload: {
    kind: "rc-column",
    version: 1,
    scopeConfirmed: true,
    input: {
      code: "ACI 318-19",
      width: 400,
      depth: 400,
      fc: 28,
      fy: 420,
      es: 200000,
      cover: 40,
      tieDiameter: 10,
      bars: [
        [-140, -140],
        [-140, 140],
        [140, -140],
        [140, 140],
      ].map(([x, y]) => ({ x, y, diameter: 25 })),
      loads: [
        {
          id: "LC1",
          description: "",
          pu: 1000,
          mx: 50,
          my: 20,
          included: true,
        },
      ],
    },
  },
};
const request = (data: unknown) =>
  new Request("https://nola.example/api/calculations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(auth).mockResolvedValue({ userId: "owner" } as Awaited<
    ReturnType<typeof auth>
  >);
  vi.mocked(isDatabaseConfigured).mockReturnValue(true);
});
describe("column draft API", () => {
  it("requires authentication before saving", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as Awaited<
      ReturnType<typeof auth>
    >);
    expect((await POST(request(body))).status).toBe(401);
    expect(saveCalculationDraft).not.toHaveBeenCalled();
  });
  it("rejects malformed JSON and invalid RC inputs", async () => {
    expect(
      (
        await POST(
          new Request("https://nola.example/api/calculations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{",
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (await POST(request({ ...body, payload: { kind: "rc-column" } }))).status,
    ).toBe(400);
    expect(saveCalculationDraft).not.toHaveBeenCalled();
  });
  it("saves normalized inputs with authenticated ownership", async () => {
    vi.mocked(saveCalculationDraft).mockResolvedValue({
      id: projectId,
      projectId,
      moduleSlug: "rc-column",
      title: "C1",
      payload: body.payload,
      verificationStatus: "verification-required",
      updatedAt: "2026-10-07T00:00:00Z",
    });
    const response = await POST(request({ ...body, title: " C1 " }));
    expect(response.status).toBe(201);
    expect(saveCalculationDraft).toHaveBeenCalledWith(
      "owner",
      expect.objectContaining({
        projectId,
        title: "C1",
        payload: body.payload,
      }),
    );
    expect((await response.json()).draft.payload).toEqual(body.payload);
  });
  it("does not expose database or cross-account errors", async () => {
    vi.mocked(saveCalculationDraft).mockRejectedValue(
      new Error("Project not found for this account."),
    );
    expect((await POST(request(body))).status).toBe(404);
    vi.mocked(saveCalculationDraft).mockRejectedValue(
      new Error("private database failure"),
    );
    const response = await POST(request(body));
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("private");
  });
});

describe("slab draft API", () => {
  const slab = {
    projectId,
    moduleSlug: "slab",
    title: "SL-01",
    payload: { kind: "slab", version: 1, input: defaultSlabInput() },
  };
  it("saves the authenticated slab payload and rejects invalid slab input", async () => {
    vi.mocked(saveCalculationDraft).mockResolvedValue({
      id: projectId,
      projectId,
      moduleSlug: "slab",
      title: "SL-01",
      payload: slab.payload,
      verificationStatus: "verification-required",
      updatedAt: "2026-10-08T00:00:00Z",
    });
    expect((await POST(request(slab))).status).toBe(201);
    expect(saveCalculationDraft).toHaveBeenCalledWith(
      "owner",
      expect.objectContaining({ moduleSlug: "slab", payload: slab.payload }),
    );
    vi.mocked(saveCalculationDraft).mockClear();
    expect(
      (
        await POST(
          request({
            ...slab,
            payload: {
              kind: "slab",
              version: 1,
              input: { ...slab.payload.input, h: -1 },
            },
          }),
        )
      ).status,
    ).toBe(400);
    expect(saveCalculationDraft).not.toHaveBeenCalled();
  });
});
