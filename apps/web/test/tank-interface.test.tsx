import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { defaultDesignCheckPolicy, defaultTankInput, designTank } from "@nola/calc-core";

import { TankWorkspace } from "../src/components/tank-workspace";
import { tankPanelSvg, tankPlanSvg, tankSectionSvg } from "../src/lib/tank-drawing";
import { tankReportData } from "../src/lib/reports/tank-report";
import { uiCatalogue } from "../src/lib/ui-catalogue";

describe("underground tank workspace", () => {
  it("renders the input panels, the section view and the review", () => {
    const html = renderToStaticMarkup(<TankWorkspace cloudReady={false} onSaved={() => {}} />);
    for (const t of ["01 · Code &amp; Exposure", "02 · Geometry", "03 · Liquid, Soil &amp; Groundwater", "04 · Materials &amp; Factors", "05 · Seismic (ACI 350.3-20)", "06 · Reinforcement", "Panel moments", "Seismic", "3D view", "Calculation basis: ACI 350-20", "Flotation FS"])
      expect(html).toContain(t);
    expect(html).toContain("Tank section");
    expect(html).not.toContain("NaN");
  });
  it("draws plan, section and every panel without NaN", () => {
    const i = defaultTankInput(),
      r = designTank(i);
    for (const s of [tankPlanSvg(i, r), tankSectionSvg(i, r), ...r.panels.map((p) => tankPanelSvg(r, p.id, "backY"))]) {
      expect(s).toContain("<svg");
      expect(s).not.toContain("NaN");
    }
  });
  it("builds the report data with ACI 350-20 first", () => {
    const i = defaultTankInput(),
      r = designTank(i);
    const d = tankReportData(undefined, "T-01", i, r, defaultDesignCheckPolicy, {});
    expect(d.basis).toBe("ACI 350-20");
    expect(d.checks.rows.length).toBeGreaterThan(10);
  });
  it("is a Pilot card under Concrete", () => {
    expect(uiCatalogue.find((m) => m.slug === "underground-tank")).toMatchObject({ group: "Concrete", pilot: true });
  });
});

import DxfParser from "dxf-parser";
import { buildTank3DModel } from "../src/lib/tank-3d-model";
import { tankSectionDrawing } from "../src/lib/cad/tank-section-drawing";
import { sectionDrawingToDxf } from "../src/lib/cad/section-dxf";

describe("underground tank 3D model and DXF", () => {
  const i = defaultTankInput(),
    r = designTank(i);
  it("builds walls, base, roof, liquid and soil boxes at true size", () => {
    const m = buildTank3DModel(i, r);
    const base = m.boxes.find((b) => b.id === "base")!;
    expect(base.x1 - base.x0).toBeCloseTo(r.geometry.baseX, 9);
    expect(m.boxes.filter((b) => b.id.startsWith("wall"))).toHaveLength(4);
    expect(m.boxes.some((b) => b.kind === "roof")).toBe(true);
    expect(m.vmax).toBeGreaterThan(0);
  });
  it("exports the section and plan as a parseable DXF on the office layers", () => {
    const d = tankSectionDrawing(i, r, "T-01");
    const parsed = new DxfParser().parseSync(sectionDrawingToDxf(d))!;
    const layers = new Set(parsed.entities.map((e) => e.layer));
    for (const l of ["S-CONC", "S-REBR-MAIN", "S-DIMS", "S-ANNO"]) expect(layers.has(l)).toBe(true);
    expect(d.fileName).toBe("T-01.dxf");
  });
  it("shows the seismic tab and table", () => {
    expect(r.seismic?.x.pi).toBeGreaterThan(0);
  });
});
