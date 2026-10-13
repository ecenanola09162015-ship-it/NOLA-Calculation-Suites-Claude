import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { rebarSizes } from "@nola/calc-core";
import {
  RebarGradeSelect,
  RebarSizeSelect,
} from "../src/components/rebar-select";
import { RectangularColumnWorkspace } from "../src/components/rectangular-column-workspace";
import { SlabWorkspace } from "../src/components/slab-workspace";

const noop = () => {};
describe("rebar dropdowns", () => {
  it("lists PNS 49 sizes including 6 and 8 mm, with a custom option", () => {
    const html = renderToStaticMarkup(
      <RebarSizeSelect
        standard="PNS49"
        value={25}
        onChange={noop}
        label="Bar"
      />,
    );
    for (const d of [6, 8, 10, 12, 16, 20, 25, 28, 32, 36, 40, 50])
      expect(html).toContain(`>D${d} (${d} mm)`);
    expect(html).toContain('value="D25" selected=""');
    expect(html).toContain("Custom…");
    expect(html).not.toContain("customBadge");
  });
  it("lists ASTM bars with nominal area and selects by exact area", () => {
    const n8 = rebarSizes.ASTM.find((s) => s.label === "#8")!.calcDiameter;
    const html = renderToStaticMarkup(
      <RebarSizeSelect
        standard="ASTM"
        value={n8}
        onChange={noop}
        label="Bar"
      />,
    );
    expect(html).toContain("#8 (25.4 mm, 510 mm²)");
    expect(html).toContain('value="#8" selected=""');
  });
  it("shows a flagged number field for a custom size", () => {
    const html = renderToStaticMarkup(
      <RebarSizeSelect
        standard="PNS49"
        value={22}
        onChange={noop}
        label="Bar"
      />,
    );
    expect(html).toContain('value="custom" selected=""');
    expect(html).toContain('value="22"');
    expect(html).toContain("customBadge");
  });
  it("disables sizes and grades a module does not support", () => {
    const sizes = renderToStaticMarkup(
      <RebarSizeSelect standard="PNS49" value={12} onChange={noop} max={40} />,
    );
    expect(sizes).toMatch(
      /value="D50" disabled="">D50 \(50 mm\) — not supported here/,
    );
    const grades = renderToStaticMarkup(
      <RebarGradeSelect
        standard="PNS49"
        fy={420}
        onChange={noop}
        maxFy={420}
      />,
    );
    expect(grades).toMatch(/value="PNS-550" disabled=""/);
    expect(grades).toContain("Grade 420W · fy 420 (max 540) · weldable");
  });
  it("selects the saved grade id, defaulting old drafts to the plain grade", () => {
    expect(
      renderToStaticMarkup(
        <RebarGradeSelect
          standard="PNS49"
          fy={420}
          gradeId="PNS-420W"
          onChange={noop}
        />,
      ),
    ).toContain('value="PNS-420W" selected=""');
    expect(
      renderToStaticMarkup(
        <RebarGradeSelect standard="PNS49" fy={420} onChange={noop} />,
      ),
    ).toContain('value="PNS-420" selected=""');
  });
  it("is used by the column and slab workspaces", () => {
    const column = renderToStaticMarkup(
      <RectangularColumnWorkspace cloudReady={false} onSaved={noop} />,
    );
    expect(column).toContain("Rebar standard");
    expect(column).toContain("Longitudinal steel grade (fy)");
    expect(column).toContain('aria-label="Bar 1 diameter"');
    const slab = renderToStaticMarkup(
      <SlabWorkspace cloudReady={false} onSaved={noop} />,
    );
    expect(slab).toContain("Steel grade (fy)");
    expect(slab).toContain("Rebar standard");
  });
});
