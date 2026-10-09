import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ColumnQuantityPanel } from "../src/components/column-quantity-panel";
import {
  defaultColumnQuantity,
  type RectangularColumnInput,
} from "@nola/calc-core";
const section: RectangularColumnInput = {
  code: "ACI 318-19",
  width: 400,
  depth: 500,
  fc: 28,
  fy: 420,
  es: 200000,
  cover: 40,
  tieDiameter: 10,
  bars: [{ x: 0, y: 0, diameter: 20 }],
  loads: [],
};
describe("optional column estimate UI", () => {
  it("omits quantities when disabled", () => {
    const h = renderToStaticMarkup(
      <ColumnQuantityPanel
        section={section}
        value={defaultColumnQuantity()}
        onChange={() => {}}
      />,
    );
    expect(h).toContain("Enable Quantity Estimate");
    expect(h).not.toContain("Total Steel");
  });
  it("renders zones, filters, physical arrangement, quantities and exclusions", () => {
    const q = defaultColumnQuantity();
    q.enabled = true;
    const h = renderToStaticMarkup(
      <ColumnQuantityPanel section={section} value={q} onChange={() => {}} />,
    );
    for (const label of [
      "Floor-To-Floor Height",
      "Upper Beam Depth",
      "ACI 318-19",
      "Beam-column joint",
      "Interior X Cross-Ties",
      "Interior Y Cross-Ties",
      "Gross Concrete",
      "Function",
      "Filtered subtotal",
      "% of total steel weight",
      "Total X",
      "Total Y",
      "Splices",
      "76.2",
      "minimum inside bend",
    ])
      expect(h).toContain(label);
    expect(h).toContain("Adopt Section Tie Diameter");
    const figures = h.slice(h.indexOf('aria-label="Column elevation'));
    expect(figures.indexOf("Beam-column joint dimension-scaled")).toBeLessThan(
      figures.indexOf("Upper zone dimension-scaled"),
    );
    expect(figures.indexOf("Upper zone dimension-scaled")).toBeLessThan(
      figures.indexOf("Lower zone dimension-scaled"),
    );
    expect(h).toContain('stroke-width="10"');
    expect(h).not.toContain("NaN");
  });
});
