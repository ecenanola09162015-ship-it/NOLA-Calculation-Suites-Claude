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
      "Calculation basis: concrete ACI 318-19",
      "Concrete Primary Design Code",
      "Steel Primary Design Code",
      "AISC 360-22 + AISC Design Guide 1, 3rd Ed.",
      "EN 1993-1-8 — Future Development",
      "Steel Design Method",
      "ASD — service loads",
      "AISC database",
      "Custom section",
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

describe("custom section and ASD in the workspace", () => {
  it("restores a custom section draft with its type, dimension inputs and properties", async () => {
    const { basePlateCustomColumn } = await import("@nola/calc-core");
    const input = {
      ...defaultBasePlateInput(),
      designMethod: "ASD" as const,
      column: basePlateCustomColumn(
        "box",
        { d: 250, bf: 200, tf: 10, tw: 0 },
        345,
      ),
    };
    const html = renderToStaticMarkup(
      <BasePlateWorkspace
        cloudReady={false}
        onSaved={() => {}}
        draft={{
          id: "d",
          projectId: "p",
          moduleSlug: "base-plate",
          title: "BP-C",
          payload: { kind: "base-plate", version: 1, input },
          verificationStatus: "verification-required",
          updatedAt: "2026-10-17T00:00:00Z",
        }}
      />,
    );
    for (const s of [
      "Section type",
      "Rectangular / square box",
      "Depth H",
      "Width B",
      "Wall thickness t",
      'value="BOX 250×200×10"',
      "Custom (user input)",
      "Load Combinations (service, ASD)",
      "Anchor check factor α",
      "ASD: enter service-level",
    ])
      expect(html).toContain(s);
    expect(html).not.toContain("NaN");
  });
  it("opens an old single-code draft with both codes", () => {
    const { concreteCode: _a, steelCode: _b, ...old } = defaultBasePlateInput();
    void _a;
    void _b;
    const html = renderToStaticMarkup(
      <BasePlateWorkspace
        cloudReady={false}
        onSaved={() => {}}
        draft={{
          id: "d",
          projectId: "p",
          moduleSlug: "base-plate",
          title: "BP-OLD",
          payload: {
            kind: "base-plate",
            version: 1,
            input: { ...old, code: "NSCP 2015" },
          },
          verificationStatus: "verification-required",
          updatedAt: "2026-10-16T00:00:00Z",
        }}
      />,
    );
    expect(html).toContain(
      '<option value="NSCP 2015" selected="">NSCP 2015 project — ACI 318-19',
    );
    expect(html).toContain(
      '<option value="NSCP 2015" selected="">NSCP 2015 project — AISC 360-22',
    );
    expect(html).toContain("Project standard: NSCP 2015.");
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
    expect(plan).toContain("url(#bpConcrete)");
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

describe("stiffened base plate (engine 0.3.0)", () => {
  const i = defaultBasePlateInput();
  i.stiffeners = { ...i.stiffeners, layout: "web-line+web-side" };
  const r = analyzeBasePlate(i);
  const c = r.combos[0]!;
  it("shows the layout chooser and stiffener inputs", () => {
    const html = renderToStaticMarkup(
      <BasePlateWorkspace
        cloudReady={false}
        onSaved={() => {}}
        draft={
          {
            id: "d1",
            projectId: "p1",
            moduleSlug: "base-plate",
            title: "BP stiff",
            payload: { kind: "base-plate", version: 1, input: i },
            createdAt: "",
            updatedAt: "",
          } as never
        }
      />,
    );
    expect(html).toContain("Stiffener layout");
    expect(html).toContain("Web-line — 2 plates outside the flanges");
    expect(html).toContain("Height at column hc");
    expect(html).toContain("Yield-line (default)");
    expect(html).not.toContain("NaN");
  });
  it("draws stiffeners in plan, sections and 3D", () => {
    const plan = basePlatePlanSvg(i, c);
    expect(plan.match(/>S\d<\/text>/g)).toHaveLength(4);
    const a = basePlateSectionSvg(i, "A", c);
    expect(a).toContain("S1 16 × 250/100");
    const m = buildBasePlate3DModel(i, c);
    expect(m.stiffeners).toHaveLength(4);
    expect(m.stiffeners[0]!.profile).toHaveLength(5);
    expect(m.column.z1 - m.column.z0).toBeGreaterThan(0.25);
  });
  it("prints panels and stiffener members in the steps and report", async () => {
    const steps = basePlateSteps(i, r, c)
      .map((s) => s[0])
      .join("|");
    expect(steps).toContain("Stiffened plate");
    expect(steps).toMatch(/Stiffener S\d \(web-line\)/);
    expect(steps).toContain("Column web at S1");
    const data = basePlateReportData(
      undefined,
      "BP-02",
      i,
      r,
      defaultDesignCheckPolicy,
      {},
      null,
    );
    const text = JSON.stringify(data);
    expect(text).toContain("Stiffener-to-Column Weld");
    expect(text).toContain("Cross — web-line + web-side (4 plates)");
    for (const row of data.checks.rows)
      expect(String(row[1])).toMatch(/AISC|ACI|Geometry/);
    for (const fig of data.figures) fig.png ??= png;
    const out = await generateCalculationPdf(data, {
      type: "complete",
      paper: "A4",
      nolaLogo: png,
    });
    expect((await PDFDocument.load(out.bytes)).getPageCount()).toBeGreaterThan(
      1,
    );
  });
});

describe("seismic design (engine 0.5.0)", () => {
  const render = (input: ReturnType<typeof defaultBasePlateInput>) =>
    renderToStaticMarkup(
      <BasePlateWorkspace
        cloudReady={false}
        onSaved={() => {}}
        draft={
          {
            id: "d1",
            projectId: "p1",
            moduleSlug: "base-plate",
            title: "BP seismic",
            payload: { kind: "base-plate", version: 1, input },
            createdAt: "",
            updatedAt: "",
          } as never
        }
      />,
    );
  it("is off with an activation button and no E column", () => {
    const html = render(defaultBasePlateInput());
    expect(html).toContain("Activate seismic design");
    expect(html).not.toContain("includes earthquake");
  });
  it("active weak base shows inputs, steps and the report section", async () => {
    const i = defaultBasePlateInput();
    i.seismic = { ...i.seismic, active: true, sdc: "D", baseType: "weak" };
    i.shear = { ...i.shear, method: "lug" };
    const html = render(i);
    expect(html).toContain("Turn off seismic design");
    expect(html).toContain("UT reduced diameter");
    expect(html).toContain("includes earthquake");
    const r = analyzeBasePlate(i);
    const lc3 = r.combos.find((c) => c.load.id === "LC3")!;
    const steps = basePlateSteps(i, r, lc3).map((x) => x[0]);
    expect(steps).toContain("Weak base (DG1 6.4.2)");
    expect(basePlateSectionSvg(i, "A", lc3)).toContain("UT d 19.1");
    const data = basePlateReportData(
      undefined,
      "BP-S",
      i,
      r,
      defaultDesignCheckPolicy,
      {},
      null,
    );
    const text = JSON.stringify(data);
    expect(text).toContain("moment-frame weak base");
    expect(text).toContain("Weak Base – Rod Reduced Section Yields");
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
    expect(data.code).toBe("Concrete: ACI 318-19 · Steel: AISC 360-22 (LRFD)");
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

describe("drawing style and seismic note", () => {
  it("recolours drawings to Blueprint for screen only and keeps Engineering for the PDF", async () => {
    const { applyDrawingStyle } = await import("../src/lib/base-plate-drawing");
    const i = defaultBasePlateInput();
    const svg = basePlatePlanSvg(i, analyzeBasePlate(i).combos[0]);
    const blue = applyDrawingStyle(svg, "blueprint");
    expect(blue).toContain("#0d2238");
    expect(blue).not.toContain("#eef0f2");
    expect(applyDrawingStyle(svg, "engineering")).toBe(svg);
    const data = basePlateReportData(
      undefined,
      "BP",
      i,
      analyzeBasePlate(i),
      defaultDesignCheckPolicy,
      {},
    );
    expect(data.figures[0]!.svg).toContain("#eef0f2");
    expect(data.references.rows.map((r) => String(r[0]))).toEqual(
      expect.arrayContaining([
        "Concrete — ACI 318-19",
        "Steel — AISC 360-22 (LRFD)",
      ]),
    );
  });
  it("shows the AISC 341 note for SDC C–F", () => {
    const input = {
      ...defaultBasePlateInput(),
      seismic: {
        ...defaultBasePlateInput().seismic,
        active: true,
        sdc: "D" as const,
        option: "d" as const,
      },
    };
    const html = renderToStaticMarkup(
      <BasePlateWorkspace
        cloudReady={false}
        onSaved={() => {}}
        draft={{
          id: "d",
          projectId: "p",
          moduleSlug: "base-plate",
          title: "BP-S",
          payload: { kind: "base-plate", version: 1, input },
          verificationStatus: "verification-required",
          updatedAt: "2026-10-17T00:00:00Z",
        }}
      />,
    );
    expect(html).toContain("AISC 341-22 D2.6 required strengths are not calculated");
    expect(html).toContain("Blueprint (screen only)");
  });
});
