import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PDFDocument } from "pdf-lib";
import {
  analyzeBasePlate,
  defaultBasePlateInput,
  defaultDesignCheckPolicy,
  loadShapeIndex,
  searchShapes,
} from "@nola/calc-core";
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@/lib/env", () => ({ isDatabaseConfigured: vi.fn() }));
vi.mock("@/lib/projects", async (original) => ({
  ...(await original<typeof import("../src/lib/projects")>()),
  saveCalculationDraft: vi.fn(),
}));
import { auth } from "@clerk/nextjs/server";
import { isDatabaseConfigured } from "@/lib/env";
import { saveCalculationDraft } from "@/lib/projects";
import { POST } from "../src/app/api/calculations/route";
import { BasePlateWorkspace } from "../src/components/base-plate-workspace";
import {
  basePlatePlanSvg,
  basePlateSectionSvg,
} from "../src/lib/base-plate-drawing";
import { buildBasePlate3DModel } from "../src/lib/base-plate-3d-model";
import { basePlateSteps } from "../src/lib/base-plate-steps";
import { basePlateReportData } from "../src/lib/reports/base-plate-data";
import { generateCalculationPdf } from "../src/lib/reports/pdf";
import { uiCatalogue } from "../src/lib/ui-catalogue";

const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";

describe("base plate workspace", () => {
  it("is a Pilot card in the Steel group", () => {
    expect(uiCatalogue.find((m) => m.slug === "base-plate")).toMatchObject({
      group: "Steel",
      pilot: true,
    });
  });
  it("renders inputs, anchor type / specification / size dropdowns, drawings and review without NaN", () => {
    const html = renderToStaticMarkup(
      <BasePlateWorkspace cloudReady={false} onSaved={() => {}} />,
    );
    for (const s of [
      "Anchor type",
      "Chemical (adhesive)",
      "Mechanical – undercut",
      "Specification",
      "ASTM F1554 Gr 36",
      "ISO 898-1 class 8.8",
      "Rod size",
      "AISC Table 14-2 maximum",
      "Plan &amp; sections",
      "3D view with loads",
      "PLAN",
      "SECTION A-A",
      "SECTION B-B",
      "DCR-Based Design Checks",
      "Concrete Breakout – Tension",
      "Calculation basis: AISC 360-22",
    ])
      expect(html).toContain(s);
    expect(html).not.toContain("NaN");
  });
  it("restores a saved draft", () => {
    const input = {
      ...defaultBasePlateInput(),
      plate: { bx: 500, by: 560, tp: 40, fy: 345 },
    };
    const html = renderToStaticMarkup(
      <BasePlateWorkspace
        cloudReady={false}
        onSaved={() => {}}
        draft={{
          id: "d",
          projectId: "p",
          moduleSlug: "base-plate",
          title: "BP-07",
          payload: { kind: "base-plate", version: 1, input },
          verificationStatus: "verification-required",
          updatedAt: "2026-10-16T00:00:00Z",
        }}
      />,
    );
    expect(html).toContain('value="BP-07"');
    expect(html).toContain('value="560"');
  });
});

describe("drawings, 3D model and steps", () => {
  const i = defaultBasePlateInput();
  const r = analyzeBasePlate(i);
  const large = r.combos.find((c) => c.case === "large")!;
  it("plan marks tensioned rods and the bearing zone; sections show loads", () => {
    const plan = basePlatePlanSvg(i, large);
    expect(plan).toContain("<svg");
    expect(plan).toContain("url(#bpHatch)");
    expect(plan).toContain("kN</text>");
    const a = basePlateSectionSvg(i, "A", large);
    expect(a).toContain("Pu 150.0 kN");
    expect(a).toContain("Mx 70.0 kN·m");
    expect(a).toContain("hef 450");
  });
  it("escapes designations in SVG text", () => {
    const svg = basePlatePlanSvg(
      { ...i, column: { ...i.column, designation: "<b>X&Y" } },
      null,
    );
    expect(svg).toContain("&lt;b&gt;X&amp;Y");
    expect(svg).not.toContain("<b>X");
  });
  it("3D model places rods through the plate and marks tension", () => {
    const m = buildBasePlate3DModel(i, large);
    expect(m.rods).toHaveLength(4);
    expect(m.rods.filter((x) => x.tension > 0)).toHaveLength(2);
    expect(m.rods[0]!.z0).toBeLessThan(-0.29);
    expect(m.column.outer).toHaveLength(12);
    expect(m.cones).toHaveLength(1);
    expect(m.arrows.some((a) => a.label.startsWith("Pu"))).toBe(true);
  });
  it("step-by-step lists bearing, plate, rods and concrete with clauses", () => {
    const steps = basePlateSteps(i, r, large);
    const items = steps.map((s) => s[0]).join("|");
    for (const k of [
      "Bearing strength",
      "Plate thickness",
      "Rod steel tension",
      "Concrete breakout, tension",
      "Pullout",
      "Interaction",
      "Column weld",
    ])
      expect(items).toContain(k);
    expect(steps.every((s) => s[2].length > 3)).toBe(true);
  });
});

describe("base plate report", () => {
  it("builds Simple and Complete PDFs with AISC/ACI clauses on every check", async () => {
    const i = defaultBasePlateInput();
    const r = analyzeBasePlate(i);
    const data = basePlateReportData(
      undefined,
      "BP-01",
      i,
      r,
      defaultDesignCheckPolicy,
      {},
      png,
    );
    expect(data.module).toBe("Base Plate");
    for (const row of data.checks.rows)
      expect(String(row[1])).toMatch(/AISC|ACI|Geometry/);
    for (const fig of data.figures) fig.png ??= png;
    for (const type of ["simple", "complete"] as const) {
      const out = await generateCalculationPdf(data, {
        type,
        paper: "A4",
        nolaLogo: png,
      });
      const doc = await PDFDocument.load(out.bytes);
      expect(doc.getPageCount()).toBeGreaterThan(0);
      if (type === "simple") expect(doc.getPageCount()).toBeLessThanOrEqual(3);
    }
  });
});

describe("shape picker data", () => {
  it("finds W12 and HSS8X8 shapes for the picker", async () => {
    const rows = await loadShapeIndex();
    expect(searchShapes(rows, "W12", ["I"]).length).toBeGreaterThan(20);
    expect(searchShapes(rows, "hss8x8", ["HSS-RECT"])[0]!.name).toMatch(
      /^HSS8X8X/,
    );
  });
});

describe("base plate draft API", () => {
  const projectId = "12345678-1234-1234-1234-123456789012";
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
  it("saves a valid base plate draft and rejects invalid inputs", async () => {
    const payload = {
      kind: "base-plate",
      version: 1,
      input: defaultBasePlateInput(),
    };
    vi.mocked(saveCalculationDraft).mockResolvedValue({
      id: projectId,
      projectId,
      moduleSlug: "base-plate",
      title: "BP-01",
      payload,
      verificationStatus: "verification-required",
      updatedAt: "2026-10-16T00:00:00Z",
    });
    expect(
      (
        await POST(
          request({
            projectId,
            moduleSlug: "base-plate",
            title: "BP-01",
            payload,
          }),
        )
      ).status,
    ).toBe(201);
    expect(saveCalculationDraft).toHaveBeenCalledWith(
      "owner",
      expect.objectContaining({ moduleSlug: "base-plate" }),
    );
    vi.mocked(saveCalculationDraft).mockClear();
    const bad = {
      ...payload,
      input: { ...payload.input, plate: { ...payload.input.plate, bx: -1 } },
    };
    expect(
      (
        await POST(
          request({
            projectId,
            moduleSlug: "base-plate",
            title: "BP-01",
            payload: bad,
          }),
        )
      ).status,
    ).toBe(400);
    expect(saveCalculationDraft).not.toHaveBeenCalled();
  });
});
