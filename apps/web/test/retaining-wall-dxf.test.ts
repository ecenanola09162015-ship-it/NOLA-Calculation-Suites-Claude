/**
 * Retaining wall section → DXF (AC1021) and the counterfort figure: the file
 * parses, uses the office layers, carries true-scale geometry (mm) and the
 * counterfort outline when buttresses are designed.
 */
import { describe, expect, it } from "vitest";
import DxfParser from "dxf-parser";
import { defaultRetainingWallInput, designRetainingWall, retainingWallInputSchema } from "@nola/calc-core";
import { retainingWallSectionDrawing } from "../src/lib/cad/retaining-wall-section-drawing";
import { sectionDrawingToDxf } from "../src/lib/cad/section-dxf";
import { sectionDrawingToSvg } from "../src/lib/cad/section-svg";
import { retainingWallCounterfortSvg } from "../src/lib/retaining-wall-counterfort-drawing";

const base = defaultRetainingWallInput();

describe("Retaining wall section DXF", () => {
  const r = designRetainingWall(base);
  const drawing = retainingWallSectionDrawing(base, r, "RW-01");
  const dxf = sectionDrawingToDxf(drawing);
  const parsed = new DxfParser().parseSync(dxf)!;
  it("parses with concrete, bars, dimensions and text on the office layers", () => {
    const layers = new Set(parsed.entities.map((e) => e.layer));
    for (const l of ["S-CONC", "S-REBR-MAIN", "S-DIMS", "S-ANNO"]) expect(layers.has(l)).toBe(true);
    expect(drawing.fileName).toBe("RW-01.dxf");
  });
  it("draws the footing at true size in mm", () => {
    const B = (base.toe + base.stemBase + base.heel) * 1000;
    const polys = parsed.entities.filter((e) => e.type === "LWPOLYLINE" && e.layer === "S-CONC") as unknown as { vertices: { x: number; y: number }[] }[];
    const widest = Math.max(...polys.map((p) => Math.max(...p.vertices.map((v) => v.x)) - Math.min(...p.vertices.map((v) => v.x))));
    expect(widest).toBeCloseTo(B, 3);
  });
  it("previews as SVG", () => {
    expect(sectionDrawingToSvg(drawing, { colour: true })).toContain("<svg");
  });
});

describe("Counterfort drawing and DXF", () => {
  const i = retainingWallInputSchema.parse({
    ...base,
    height: 6,
    stemTop: 0.25,
    stemBase: 0.3,
    toe: 0.8,
    heel: 3,
    footing: 0.5,
    analysis: "plate",
    plate: { ...base.plate, length: 9, buttresses: [1.5, 4.5, 7.5].map((x) => ({ x, height: 6, width: 0.3 })) },
  });
  const r = designRetainingWall(i);
  it("adds the dashed counterfort outline and its notes", () => {
    const d = retainingWallSectionDrawing(i, r);
    expect(d.prims.some((p) => p.t === "poly" && p.layer === "S-CONC-COVR")).toBe(true);
    expect(sectionDrawingToDxf(d)).toContain("COUNTERFORT");
  });
  it("draws the counterfort profile with Mu and Vu panels", () => {
    const svg = retainingWallCounterfortSvg(i, r, 1);
    expect(svg).toContain("Counterfort B2");
    expect(svg).toContain("φMn");
  });
});

describe("Multi-level basement drawings", () => {
  const i = retainingWallInputSchema.parse({
    ...base,
    wallType: "basement",
    height: 9,
    stemTop: 0.3,
    stemBase: 0.3,
    footing: 0.5,
    soil: { ...base.soil, theory: "at-rest" },
    basement: { top: "pinned", base: "fixed", levels: [{ height: 3, slab: 0.2 }, { height: 3, slab: 0.2 }, { height: 3, slab: 0.25 }], stage: true },
  });
  const r = designRetainingWall(i);
  it("draws every floor slab in the DXF", () => {
    const dxf = sectionDrawingToDxf(retainingWallSectionDrawing(i, r));
    for (const s of ["TOP SLAB", "B2 SLAB", "B3 SLAB"]) expect(dxf).toContain(s);
  });
});
