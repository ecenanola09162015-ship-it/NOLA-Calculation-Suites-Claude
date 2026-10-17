import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RectangularColumnWorkspace } from "../src/components/rectangular-column-workspace";
import {
  analyzeRectangularColumn,
  type RectangularColumnInput,
} from "@nola/calc-core";
import { ColumnSection, ColumnPMPlot } from "../src/components/column-diagrams";
describe("column interface server render", () => {
  it("renders code choices, accessible inputs and explicit Excel clipboard format", () => {
    const html = renderToStaticMarkup(
      <RectangularColumnWorkspace cloudReady={false} onSaved={() => {}} />,
    );
    expect(html).toContain('<option value="ACI 318-19" selected="">ACI 318-19');
    expect(html).toMatch(
      /<option value="future:NSCP 2015" disabled="">NSCP 2015 \(Vol. 1\) — Future Development/,
    );
    expect(html).toMatch(/disabled="">BS EN 1992-1-1 \(Eurocode 2\) — Future Development/);
    expect(html).toMatch(/disabled="">AS 3600 — Future Development/);
    expect(html).toContain("Clear cover to ties");
    expect(html).toContain("Paste From Excel");
    expect(html).toContain("Run calculation");
    expect(html).toContain("Save changes");
    expect(html).toContain("I have assessed slenderness");
    expect(html).not.toContain("Combination screening");
    expect(html).not.toContain("Enable Quantity Estimate");
  });
  it("restores an NSCP draft with the explicit ACI calculation basis", () => {
    const html = renderToStaticMarkup(
      <RectangularColumnWorkspace
        cloudReady={false}
        onSaved={() => {}}
        draft={{
          id: "saved",
          projectId: "project",
          moduleSlug: "rc-column",
          title: "NSCP column",
          verificationStatus: "verification-required",
          updatedAt: "2026-10-07",
          payload: {
            kind: "rc-column",
            version: 1,
            scopeConfirmed: true,
            input: {
              code: "NSCP 2015",
              width: 400,
              depth: 500,
              fc: 28,
              fy: 420,
              es: 200000,
              cover: 40,
              tieDiameter: 10,
              bars: [
                [-130, -180],
                [-130, 180],
                [130, -180],
                [130, 180],
              ].map(([x, y]) => ({ x, y, diameter: 25 })),
              loads: [
                {
                  id: "LC1",
                  description: "",
                  pu: 1000,
                  mx: 50,
                  my: 30,
                  included: true,
                },
              ],
            },
          },
        }}
      />,
    );
    // Legacy NSCP 2015 draft opens as ACI 318-19 (17 Oct 2026).
    expect(html).toContain('<option value="ACI 318-19" selected="">');
    expect(html).toContain('value="NSCP 2015 (project standard)"');
    expect(html).not.toContain("Project standard: NSCP 2015.");
    expect(html).not.toContain("Numerical results await verification");
  });
  it("renders valid signed diagrams and handles incomplete section dimensions", () => {
    const input: RectangularColumnInput = {
      code: "ACI 318-19",
      width: 400,
      depth: 500,
      fc: 28,
      fy: 420,
      es: 200000,
      cover: 40,
      tieDiameter: 10,
      bars: [
        [-130, -180],
        [-130, 180],
        [130, -180],
        [130, 180],
      ].map(([x, y]) => ({ x, y, diameter: 25 })),
      loads: [
        {
          id: "Wind",
          description: "",
          pu: 1000,
          mx: -50,
          my: 30,
          included: true,
        },
      ],
    };
    const result = analyzeRectangularColumn(input);
    const html = renderToStaticMarkup(
      <ColumnPMPlot result={result} axis="x" selected="Wind" />,
    );
    expect(html).toContain("Wind");
    expect(html).toContain("stroke-dasharray");
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("Infinity");
    expect(
      renderToStaticMarkup(<ColumnSection input={{ ...input, width: NaN }} />),
    ).toContain("Complete valid dimensions");
  });
});
