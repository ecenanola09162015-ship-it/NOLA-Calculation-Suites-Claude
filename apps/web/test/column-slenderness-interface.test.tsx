import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  analyzeRectangularColumn,
  defaultColumnSlenderness,
  type RectangularColumnInput,
} from "@nola/calc-core";
import {
  ColumnSlendernessInputs,
  ColumnSlendernessResults,
} from "../src/components/column-slenderness-panel";
import { ColumnBiaxialContourPlot } from "../src/components/column-diagrams";
import { RectangularColumnWorkspace } from "../src/components/rectangular-column-workspace";

const input: RectangularColumnInput = {
  code: "ACI 318-19",
  width: 400,
  depth: 400,
  fc: 28,
  fy: 420,
  es: 200000,
  cover: 40,
  tieDiameter: 10,
  bars: [-140, 0, 140]
    .flatMap((x) => [-140, 0, 140].map((y) => ({ x, y, diameter: 20 })))
    .filter((b) => b.x !== 0 || b.y !== 0),
  loads: [
    {
      id: "U1",
      description: "",
      pu: 1200,
      mx: 60,
      my: 25,
      m1x: 30,
      included: true,
    },
  ],
  slenderness: { ...defaultColumnSlenderness(6000), enabled: true },
};

describe("slenderness and 3D biaxial interface", () => {
  it("shows the slenderness panel off by default", () => {
    const html = renderToStaticMarkup(
      <RectangularColumnWorkspace cloudReady={false} onSaved={() => {}} />,
    );
    expect(html).toContain("04 · Slenderness (Moment Magnification)");
    expect(html).toContain("Consider slenderness");
    expect(html).not.toContain("M1x (kN·m)");
  });
  it("renders inputs and per-direction magnification results", () => {
    const inputs = renderToStaticMarkup(
      <ColumnSlendernessInputs input={input} onChange={() => {}} />,
    );
    expect(inputs).toContain("Unsupported length ℓu");
    expect(inputs).toContain("From ETABS P-Δ (second-order) analysis");
    const r = analyzeRectangularColumn(input);
    const html = renderToStaticMarkup(
      <ColumnSlendernessResults check={r.checks[0]} />,
    );
    expect(html).toContain("Slenderness · U1");
    expect(html).toContain("1.429");
    expect(html).toContain("85.71");
  });
  it("draws the 3D load contour with the linear screen and demand", () => {
    const r = analyzeRectangularColumn(input);
    const html = renderToStaticMarkup(
      <ColumnBiaxialContourPlot input={input} result={r} check={r.checks[0]} />,
    );
    expect(html).toContain("3D biaxial load contour");
    expect(html).toContain("Dashed: linear screen");
    expect(html.match(/<path/g)!.length).toBeGreaterThanOrEqual(3);
  });
});
