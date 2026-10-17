/**
 * Underground tank drawing model for DXF (model space mm, y up): section
 * along the long side (base, walls, roof, cover, ground, groundwater, liquid
 * level, schematic bars) with the plan below it. Office layers and 1:20 text
 * sizes from the column section drawing.
 */
import type { TankBar, TankInput, TankResult } from "@nola/calc-core";

import { TTL, TXT, type Layer, type Prim, type Pt, type SectionDrawing } from "./column-section-drawing";

const bd = (b: TankBar) => `%%c${b.diameter} @ ${b.spacing}`;

export function tankSectionDrawing(i: TankInput, r: TankResult, title = "UNDERGROUND TANK"): SectionDrawing {
  const M = (v: number) => v * 1000;
  const g = r.geometry,
    p = M(i.projection),
    tw = M(i.wall),
    tb = M(i.base),
    H = M(i.height),
    tr = i.roof.enabled ? M(i.roof.thickness) : 0,
    Bx = M(g.baseX),
    lx = M(i.lx),
    c = i.cover;
  const prims: Prim[] = [];
  const poly = (layer: Layer, pts: Pt[], closed = false) => prims.push({ t: "poly", layer, v: pts.map((q) => ({ p: q })), closed });
  const rect = (layer: Layer, x0: number, y0: number, x1: number, y1: number) =>
    poly(layer, [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ], true);
  const text = (pt: Pt, s: string, align: "left" | "center" | "right" = "left", h = TXT) => prims.push({ t: "text", layer: "S-ANNO", p: pt, h, s, align });
  // ---- Section (origin at base underside, left edge of the base) ----
  const wl0 = p,
    wl1 = p + tw,
    wr0 = p + tw + lx,
    wr1 = wr0 + tw,
    top = tb + H;
  rect("S-CONC", 0, 0, Bx, tb);
  rect("S-CONC", wl0, tb, wl1, top);
  rect("S-CONC", wr0, tb, wr1, top);
  if (i.roof.enabled) rect("S-CONC", wl0, top, wr1, top + tr);
  const ground = tb + M(i.soil.ground);
  poly("S-NOTE", [
    [-M(1), ground],
    [wl0, ground],
  ]);
  poly("S-NOTE", [
    [wr1, ground],
    [Bx + M(1), ground],
  ]);
  text([-M(1), ground + TXT * 0.6], "GROUND");
  if (i.roof.enabled && i.roof.cover > 0) {
    poly("S-NOTE", [
      [wl0, top + tr + M(i.roof.cover)],
      [wr1, top + tr + M(i.roof.cover)],
    ]);
    text([wl0, top + tr + M(i.roof.cover) + TXT * 0.6], `SOIL COVER ${M(i.roof.cover).toFixed(0)}`);
  }
  if (i.soil.water > 0) {
    prims.push({ t: "line", layer: "S-CONC-COVR", a: [-M(1), M(i.soil.water)], b: [Bx + M(1), M(i.soil.water)] });
    text([Bx + M(1), M(i.soil.water) + TXT * 0.6], "GWT", "right");
  }
  if (i.liquid.depth > 0) {
    prims.push({ t: "line", layer: "S-CONC-COVR", a: [wl1, tb + M(i.liquid.depth)], b: [wr0, tb + M(i.liquid.depth)] });
    text([(wl1 + wr0) / 2, tb + M(i.liquid.depth) + TXT * 0.6], `LIQUID LEVEL (HL ${M(i.liquid.depth).toFixed(0)})`, "center");
  }
  // Schematic bars: wall verticals each face, base and roof top / bottom.
  const b = i.bars;
  const hook = (x: number, dir: 1 | -1, d: number) => x + dir * 12 * d;
  for (const [x0, x1] of [
    [wl0, wl1],
    [wr0, wr1],
  ] as const) {
    const xo = x0 === wl0 ? x0 + c + b.verticalOutside.diameter / 2 : x1 - c - b.verticalOutside.diameter / 2,
      xi = x0 === wl0 ? x1 - c - b.verticalInside.diameter / 2 : x0 + c + b.verticalInside.diameter / 2;
    poly("S-REBR-MAIN", [
      [hook(xo, x0 === wl0 ? 1 : -1, b.verticalOutside.diameter), c + 40],
      [xo, c + 40],
      [xo, top + tr - c],
    ]);
    poly("S-REBR-MAIN", [
      [hook(xi, x0 === wl0 ? 1 : -1, b.verticalInside.diameter), c + 60],
      [xi, c + 60],
      [xi, top - c],
    ]);
  }
  poly("S-REBR-MAIN", [
    [c, c + 12 * b.baseBottom.diameter],
    [c, c],
    [Bx - c, c],
    [Bx - c, c + 12 * b.baseBottom.diameter],
  ]);
  poly("S-REBR-MAIN", [
    [c, tb - c - 12 * b.baseTop.diameter],
    [c, tb - c],
    [Bx - c, tb - c],
    [Bx - c, tb - c - 12 * b.baseTop.diameter],
  ]);
  if (i.roof.enabled) {
    poly("S-REBR-MAIN", [
      [wl0 + c, top + c],
      [wr1 - c, top + c],
    ]);
    poly("S-REBR-MAIN", [
      [wl0 + c, top + tr - c],
      [wr1 - c, top + tr - c],
    ]);
  }
  text([wl1 + 200, tb + H * 0.62], `INSIDE: ${bd(b.verticalInside)} V, ${bd(b.horizontalInside)} H`);
  text([wl1 + 200, tb + H * 0.62 - 1.6 * TXT], `OUTSIDE: ${bd(b.verticalOutside)} V, ${bd(b.horizontalOutside)} H`);
  text([Bx / 2, -2.2 * TXT], `BASE: TOP ${bd(b.baseTop)}, BOTT. ${bd(b.baseBottom)} E.W.`, "center");
  if (i.roof.enabled) text([Bx / 2, top + tr + (i.roof.cover > 0 ? M(i.roof.cover) : 0) + 2 * TXT], `ROOF: BOTT. ${bd(b.roofBottom)}, TOP ${bd(b.roofTop)} E.W.`, "center");
  // Dimensions.
  prims.push({ t: "dim", layer: "S-DIMS", a: [0, 0], b: [Bx, 0], at: -5 * TXT, vertical: false, text: Bx.toFixed(0) });
  prims.push({ t: "dim", layer: "S-DIMS", a: [wl1, tb], b: [wr0, tb], at: tb + 2 * TXT, vertical: false, text: lx.toFixed(0) });
  prims.push({ t: "dim", layer: "S-DIMS", a: [0, tb], b: [0, top], at: -3 * TXT, vertical: true, text: H.toFixed(0) });
  prims.push({ t: "dim", layer: "S-DIMS", a: [0, 0], b: [0, tb], at: -3 * TXT, vertical: true, text: tb.toFixed(0) });
  prims.push({ t: "dim", layer: "S-DIMS", a: [wl0, top], b: [wl1, top], at: top + tr + 2.5 * TXT + (i.roof.cover > 0 ? M(i.roof.cover) : 0), vertical: false, text: tw.toFixed(0) });
  text([0, -9 * TXT], "SECTION ALONG THE LONG SIDE", "left", TTL);
  // ---- Plan below ----
  const By = M(g.baseY),
    oy = -14 * TXT - By;
  rect("S-CONC-COVR", 0, oy, Bx, oy + By);
  rect("S-CONC", p, oy + p, p + M(g.outerX), oy + p + M(g.outerY));
  rect("S-CONC", p + tw, oy + p + tw, p + tw + lx, oy + p + tw + M(i.ly));
  prims.push({ t: "dim", layer: "S-DIMS", a: [p + tw, oy + By], b: [p + tw + lx, oy + By], at: oy + By + 2.5 * TXT, vertical: false, text: lx.toFixed(0) });
  prims.push({ t: "dim", layer: "S-DIMS", a: [Bx, oy + p + tw], b: [Bx, oy + p + tw + M(i.ly)], at: Bx + 3 * TXT, vertical: true, text: M(i.ly).toFixed(0) });
  text([Bx / 2, oy + By / 2], `INSIDE ${lx.toFixed(0)} x ${M(i.ly).toFixed(0)}`, "center");
  text([0, oy - 3 * TXT], "PLAN", "left", TTL);
  prims.push({
    t: "text",
    layer: "S-NOTE",
    p: [0, oy - 5.5 * TXT],
    h: TXT,
    s: `f'c ${i.fc} MPa, fy ${i.fy} MPa; cover ${c} mm; exposure ${i.exposure}; ${r.engine}; ACI 350-20; SCALE 1:20`,
  });
  prims.push({ t: "text", layer: "S-ANNO-TTLB", p: [0, oy - 8 * TXT], h: TTL, s: title });
  const yTop = top + tr + (i.roof.enabled ? M(i.roof.cover) : 0) + 4 * TXT;
  return {
    prims,
    bounds: [-M(1) - 6 * TXT, oy - 10 * TXT, Bx + M(1) + 6 * TXT, Math.max(yTop, ground + 2 * TXT)],
    title,
    fileName: `${title.replace(/[^A-Za-z0-9-]+/g, "_")}.dxf`,
  };
}
