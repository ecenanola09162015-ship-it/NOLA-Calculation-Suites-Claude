import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { defaultRetainingWallInput, designRetainingWall } from "@nola/calc-core";

import { RetainingWallWorkspace } from "../src/components/retaining-wall-workspace";
import { retainingWallSectionSvg, retainingWallStemSvg } from "../src/lib/retaining-wall-drawing";
import { buildRetainingWall3DModel } from "../src/lib/retaining-wall-3d-model";
import { retainingWallReportData } from "../src/lib/reports/retaining-wall-report";
import { uiCatalogue } from "../src/lib/ui-catalogue";
import { defaultDesignCheckPolicy } from "@nola/calc-core";

describe("retaining wall workspace", () => {
  it("renders the eight input panels, the section view and the review", () => {
    const html = renderToStaticMarkup(<RetainingWallWorkspace cloudReady={false} onSaved={() => {}} />);
    for (const t of [
      "01 · Wall Type &amp; Code",
      "02 · Geometry",
      "03 · Backfill, Surcharge &amp; Water",
      "04 · Toe Soil, Base &amp; Stability",
      "05 · Seismic",
      "06 · Materials &amp; Cover",
      "07 · Reinforcement",
      "08 · Load Combinations",
      "Section view",
      "3D view",
      "Full width (plate) — Phase 2",
      "203-2: 1.2D + 1.6L + 1.6H",
      "Calculation basis: ACI 318-19",
    ])
      expect(html).toContain(t);
    expect(html).toContain("Retaining wall section");
    expect(html).not.toContain("NaN");
  });
  it("restores a saved basement wall draft", () => {
    const input = defaultRetainingWallInput();
    input.wallType = "basement";
    input.soil.theory = "at-rest";
    input.footing = 0.15;
    const html = renderToStaticMarkup(
      <RetainingWallWorkspace
        cloudReady={false}
        onSaved={() => {}}
        draft={{
          id: "00000000-0000-4000-8000-000000000001",
          projectId: "00000000-0000-4000-8000-000000000002",
          moduleSlug: "retaining-wall",
          title: "BW-01",
          payload: { kind: "retaining-wall", version: 1, input },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as never}
      />,
    );
    expect(html).toContain("Top slab restraint");
    expect(html).toContain("Top slab reaction (service)");
    expect(html).not.toContain("04 · Toe Soil");
  });
  it("is a Pilot card in the launcher", () => {
    expect(uiCatalogue.find((m) => m.slug === "retaining-wall")?.pilot).toBe(true);
  });
});

describe("retaining wall drawings, 3D model and report", () => {
  const i = defaultRetainingWallInput();
  const r = designRetainingWall(i);
  it("section SVG shows the plane pressure, bearing and bar call-outs", () => {
    const svg = retainingWallSectionSvg(i, r);
    // Ka γ (H + tf) = 0.333 × 18 × 4.1 = 24.6 kPa at the plane base.
    expect(svg).toContain("24.6 kPa");
    expect(svg).toContain("50.4 kN/m @ 1.37 m");
    expect(svg).toContain("72.4 kPa");
    expect(svg).toContain("D16 @ 100 back face");
    expect(svg).toContain("B = 2.70 m");
    expect(svg).not.toContain("NaN");
    const bare = retainingWallSectionSvg(i, r, { pressures: false, bars: false });
    expect(bare).not.toContain("kN/m @");
    expect(bare).not.toContain("back face");
  });
  it("stem SVG plots Mu against φMn", () => {
    const svg = retainingWallStemSvg(i, r);
    expect(svg).toContain("φMn back");
    expect(svg).toContain("87.8");
  });
  it("3D model extrudes the shared section and places pressure arrows", () => {
    const m = buildRetainingWall3DModel(i, r, 6);
    expect(m.prisms.map((p) => p.id)).toEqual(expect.arrayContaining(["stem", "footing", "backfill", "toe-soil"]));
    expect(m.prisms.every((p) => p.y1 - p.y0 > 0)).toBe(true);
    const soil = m.arrows.filter((a) => a.component === "soil");
    expect(soil).toHaveLength(8);
    // Arrows grow with depth (triangular pressure).
    expect(soil.at(0)!.length).toBeGreaterThan(soil.at(-1)!.length);
    const propped = defaultRetainingWallInput();
    propped.wallType = "propped";
    const pm = buildRetainingWall3DModel(propped, designRetainingWall(propped), 6);
    expect(pm.prisms.some((p) => p.kind === "prop")).toBe(true);
  });
  it("report lists stability, member design, clauses and limitations", () => {
    const d = retainingWallReportData(undefined, "RW-01", i, r, defaultDesignCheckPolicy, {});
    expect(d.module).toBe("Concrete Retaining Wall");
    expect(d.basis).toBe("ACI 318-19");
    expect(d.summary.map((s) => s.title)).toContain("External Stability (Service)");
    expect(d.checks.rows.length).toBe(r.checks.length);
    expect(d.criticalNotes.some((n) => n.includes("Bearing"))).toBe(true);
    expect(d.figures.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(d)).not.toContain("NaN");
  });
});

describe("retaining wall quantity estimate", () => {
  it("restores the estimate from a draft and adds it to the report", () => {
    const input = defaultRetainingWallInput();
    const html = renderToStaticMarkup(
      <RetainingWallWorkspace
        cloudReady={false}
        onSaved={() => {}}
        draft={{
          id: "00000000-0000-4000-8000-000000000003",
          projectId: "00000000-0000-4000-8000-000000000002",
          moduleSlug: "retaining-wall",
          title: "RW-Q",
          payload: { kind: "retaining-wall", version: 1, input, quantity: { enabled: true, length: 10, endForms: true } },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as never}
      />,
    );
    expect(html).toContain("Quantity Estimate");
    expect(html).toContain("19.50 m³");
    const d = retainingWallReportData(undefined, "RW-Q", input, designRetainingWall(input), defaultDesignCheckPolicy, {}, null, {
      enabled: true,
      length: 10,
      endForms: true,
    });
    expect(d.estimate?.title).toContain("10.0 m");
  });
});

describe("retaining wall PDF", () => {
  const png =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
  it.each(["simple", "complete"] as const)("generates the %s report", async (type) => {
    const { generateCalculationPdf } = await import("../src/lib/reports/pdf");
    const input = defaultRetainingWallInput();
    const d = retainingWallReportData(undefined, "RW-01", input, designRetainingWall(input), defaultDesignCheckPolicy, {}, png, {
      enabled: true,
      length: 10,
      endForms: true,
    });
    for (const fig of d.figures) fig.png = png;
    const out = await generateCalculationPdf(d, { type, paper: "A4", nolaLogo: png });
    expect(out.pageCount).toBeGreaterThan(0);
    if (type === "simple") expect(out.pageCount).toBeLessThanOrEqual(2);
  });
});
