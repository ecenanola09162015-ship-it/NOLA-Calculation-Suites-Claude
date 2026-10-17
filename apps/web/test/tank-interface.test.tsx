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
    for (const t of ["01 · Code &amp; Exposure", "02 · Geometry", "03 · Liquid, Soil &amp; Groundwater", "04 · Materials &amp; Factors", "05 · Reinforcement", "Panel moments", "Calculation basis: ACI 350-20", "Flotation FS"])
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
