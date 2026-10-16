/**
 * Retaining wall section as a format-neutral drawing model (model space mm,
 * y up, origin at the toe edge of the footing underside) for the DXF export.
 * Same geometry as the engine (retainingWallGeometry), office layers and
 * 1:20 text sizes from the column section drawing. Bars are single-line
 * centrelines (main) and solid discs (distribution / horizontal), at true
 * cover; marks ①–⑦ match the on-screen section and the bar schedule.
 * Counterforts behind the section plane are shown dashed.
 */
import {
  barAreaPerMetre,
  retainingWallGeometry,
  type RetainingWallBar,
  type RetainingWallInput,
  type RetainingWallResult,
} from "@nola/calc-core";

import { TTL, TXT, type Layer, type Prim, type Pt, type SectionDrawing } from "./column-section-drawing";

const bd = (b: RetainingWallBar) => `%%c${+b.diameter.toFixed(1)} @ ${b.spacing.toFixed(0)}`;

export function retainingWallSectionDrawing(i: RetainingWallInput, r: RetainingWallResult, title = "RETAINING WALL SECTION"): SectionDrawing {
  const g = retainingWallGeometry(i);
  const M = (v: number) => v * 1000;
  const prims: Prim[] = [];
  const poly = (layer: Layer, pts: Pt[], closed = false) =>
    prims.push({ t: "poly", layer, v: pts.map((p) => ({ p })), closed });
  const toPts = (pg: { x: number; y: number }[]) => pg.map((q): Pt => [M(q.x), M(q.y)]);
  const text = (p: Pt, s: string, align: "left" | "center" | "right" = "left", h = TXT, rot = 0) =>
    prims.push({ t: "text", layer: "S-ANNO", p, h, s, align, rot });
  const basement = i.wallType === "basement";
  const tf = M(i.footing),
    B = M(g.width),
    top = M(g.stemTopLevel);

  // Concrete.
  poly("S-CONC", toPts(g.stem), true);
  if (!basement) poly("S-CONC", toPts(g.footing), true);
  if (g.key) poly("S-CONC", toPts(g.key), true);
  // Ground lines (retained side and toe side).
  const slope = Math.tan((i.soil.beta * Math.PI) / 180);
  const reachBack = Math.max(1.5, i.heel + 1.5);
  poly("S-NOTE", [
    [M(g.backTop), top],
    [M(g.backTop + reachBack), top + M(reachBack * slope)],
  ]);
  if (!basement && i.toe > 0) {
    const cover = M(g.toeEdgeCover) + tf;
    poly("S-NOTE", [
      [-M(1), cover],
      [M(g.frontBase), tf + M(Math.min(i.toeSoil.cover, i.height))],
    ]);
  }

  // Counterforts behind the section plane (dashed).
  if (r.counterforts.length && !basement) {
    const cf = i.plate.counterfort,
      hc = Math.min(Math.max(...i.plate.buttresses.map((b) => b.height)), i.height);
    const reachTop = Math.min(cf.topReach, i.heel);
    const xb = M(g.backBase),
      yTop = tf + M(hc),
      backAtTop = M(g.backBase + (g.backTop - g.backBase) * (hc / i.height));
    poly("S-CONC-COVR", [
      [xb, tf],
      [B, tf],
      [backAtTop + M(reachTop), yTop],
      [backAtTop, yTop],
    ]);
    // Tension bars along the inclined edge, offset inwards by the cover, hooked in the footing.
    const c = cf.cover + cf.ties.diameter + cf.tension.diameter / 2;
    const p0: Pt = [B, tf],
      p1: Pt = [backAtTop + M(reachTop), yTop];
    const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1,
      dx = (p1[0] - p0[0]) / len,
      dy = (p1[1] - p0[1]) / len;
    let n: Pt = [-dy, dx];
    if (n[0] > 0) n = [dy, -dx];
    const yHk = i.cover.footingBottom + i.bars.toeBottom.diameter + cf.tension.diameter / 2;
    const a: Pt = [p0[0] + n[0] * c, p0[1] + n[1] * c],
      e: Pt = [p1[0] + n[0] * c - dx * c, p1[1] + n[1] * c - dy * c];
    poly("S-REBR-TIES", [
      [a[0] - 12 * cf.tension.diameter, yHk],
      [a[0], yHk],
      a,
      e,
    ]);
    text([B + 200, tf + M(hc) / 2], `COUNTERFORT (BEYOND): ${cf.tension.count}-%%c${cf.tension.diameter} BACK EDGE`, "left");
    text([B + 200, tf + M(hc) / 2 - 1.6 * TXT], `TIES %%c${cf.ties.diameter} @ ${cf.ties.spacing} (STEM), %%c${cf.heelTies.diameter} @ ${cf.heelTies.spacing} (HEEL)`, "left");
  }

  // Bars.
  const b = i.bars;
  const backX = (y: number) => M(g.backBase) + ((M(g.backTop) - M(g.backBase)) * (y - tf)) / Math.max(top - tf, 1e-9);
  const frontX = (y: number) => M(g.frontBase) + ((M(g.frontTop) - M(g.frontBase)) * (y - tf)) / Math.max(top - tf, 1e-9);
  const cb = i.cover.stemBack + b.stemBack.diameter / 2,
    cfr = i.cover.stemFront + b.stemFront.diameter / 2,
    yHook = basement ? M(0.05) : i.cover.footingBottom + b.toeBottom.diameter + b.footingDistribution.diameter + b.stemBack.diameter / 2;
  const hookLen = 12 * b.stemBack.diameter;
  poly("S-REBR-MAIN", [
    [backX(tf) - cb - hookLen, yHook],
    [backX(tf) - cb, yHook],
    [backX(top) - cb, top - i.cover.stemBack],
  ]);
  poly("S-REBR-MAIN", [
    [frontX(tf) + cfr + 12 * b.stemFront.diameter, yHook + b.stemBack.diameter],
    [frontX(tf) + cfr, yHook + b.stemBack.diameter],
    [frontX(top) + cfr, top - i.cover.stemFront],
  ]);
  if (!basement) {
    const yb = i.cover.footingBottom + b.toeBottom.diameter / 2,
      yt = tf - i.cover.footingTop - b.heelTop.diameter / 2,
      side = i.cover.footingBottom;
    poly("S-REBR-MAIN", [
      [side, yb + 12 * b.toeBottom.diameter],
      [side, yb],
      [B - side, yb],
      [B - side, yb + 12 * b.toeBottom.diameter],
    ]);
    poly("S-REBR-MAIN", [
      [side, yt - 12 * b.heelTop.diameter],
      [side, yt],
      [B - side, yt],
      [B - side, yt - 12 * b.heelTop.diameter],
    ]);
    // Distribution bars (discs) inside the main bars.
    const dd = b.footingDistribution.diameter,
      rB = yb + b.toeBottom.diameter / 2 + dd / 2,
      rT = yt - b.heelTop.diameter / 2 - dd / 2;
    for (let x = side + dd; x <= B - side - dd + 1e-6; x += b.footingDistribution.spacing) {
      prims.push({ t: "disc", layer: "S-REBR-MAIN", c: [x, rB], r: dd / 2 });
      prims.push({ t: "disc", layer: "S-REBR-MAIN", c: [x, rT], r: dd / 2 });
    }
    if (g.key && i.key.enabled) {
      const k = toPts(g.key),
        xk = Math.min(...k.map((p) => p[0])) + i.cover.footingBottom + i.key.bar.diameter / 2,
        yk = Math.min(...k.map((p) => p[1])) + i.cover.footingBottom;
      poly("S-REBR-MAIN", [
        [xk, yk],
        [xk, tf - i.cover.footingTop - b.heelTop.diameter],
        [xk + 12 * i.key.bar.diameter, tf - i.cover.footingTop - b.heelTop.diameter],
      ]);
      text([xk - 100, yk + 100], `(7) ${bd(i.key.bar)}`, "right");
    }
  }
  // Stem horizontal bars (discs) on both faces.
  const dh = b.stemHorizontal.diameter;
  for (let y = tf + 75; y <= top - 50; y += b.stemHorizontal.spacing) {
    prims.push({ t: "disc", layer: "S-REBR-MAIN", c: [backX(y) - cb - b.stemBack.diameter / 2 - dh / 2, y], r: dh / 2 });
    prims.push({ t: "disc", layer: "S-REBR-MAIN", c: [frontX(y) + cfr + b.stemFront.diameter / 2 + dh / 2, y], r: dh / 2 });
  }

  // Bar callouts.
  const mid = tf + (top - tf) * 0.55;
  text([backX(mid) + 250, mid], `(1) ${bd(b.stemBack)} (${barAreaPerMetre(b.stemBack).toFixed(0)} mm2/m)`);
  text([frontX(mid) - 250, mid - 2 * TXT], `(2) ${bd(b.stemFront)}`, "right");
  text([frontX(mid) - 250, mid - 4 * TXT], `(3) ${bd(b.stemHorizontal)} EF`, "right");
  if (!basement) {
    text([M(g.frontBase) / 2, -2.2 * TXT], `(4) ${bd(b.toeBottom)} BOTT.`, "center");
    text([(M(g.backBase) + B) / 2, tf + 1.2 * TXT], `(5) ${bd(b.heelTop)} TOP`, "center");
    text([(M(g.backBase) + B) / 2, -2.2 * TXT], `(6) ${bd(b.footingDistribution)} EF`, "center");
  }

  // Dimensions.
  const dimY = -5 * TXT;
  if (!basement) {
    prims.push({ t: "dim", layer: "S-DIMS", a: [0, 0], b: [B, 0], at: dimY - 2.4 * TXT, vertical: false, text: `${B.toFixed(0)}` });
    if (i.toe > 0) prims.push({ t: "dim", layer: "S-DIMS", a: [0, 0], b: [M(g.frontBase), 0], at: dimY, vertical: false, text: `${M(i.toe).toFixed(0)}` });
    prims.push({ t: "dim", layer: "S-DIMS", a: [M(g.frontBase), 0], b: [M(g.backBase), 0], at: dimY, vertical: false, text: `${M(i.stemBase).toFixed(0)}` });
    if (i.heel > 0) prims.push({ t: "dim", layer: "S-DIMS", a: [M(g.backBase), 0], b: [B, 0], at: dimY, vertical: false, text: `${M(i.heel).toFixed(0)}` });
    prims.push({ t: "dim", layer: "S-DIMS", a: [0, 0], b: [0, tf], at: -3 * TXT, vertical: true, text: `${tf.toFixed(0)}` });
  }
  prims.push({ t: "dim", layer: "S-DIMS", a: [M(g.frontTop), tf], b: [M(g.frontTop), top], at: Math.min(0, M(g.frontTop)) - 6 * TXT, vertical: true, text: `${M(i.height).toFixed(0)}` });
  prims.push({ t: "dim", layer: "S-DIMS", a: [M(g.frontTop), top], b: [M(g.backTop), top], at: top + 2.5 * TXT, vertical: false, text: `${M(i.stemTop).toFixed(0)}` });

  // Title and notes.
  const x0 = Math.min(-M(1), M(g.frontTop) - 8 * TXT),
    x1 = Math.max(B, M(g.backTop + reachBack)) + (r.counterforts.length ? 30 * TXT : 4 * TXT),
    y0 = dimY - 9 * TXT,
    y1 = top + 6 * TXT + Math.max(0, M(reachBack * slope));
  prims.push({ t: "text", layer: "S-ANNO-TTLB", p: [x0, y0 + 2 * TXT], h: TTL, s: title });
  prims.push({
    t: "text",
    layer: "S-NOTE",
    p: [x0, y0],
    h: TXT,
    s: `f'c ${i.fc} MPa, fy ${i.fy} MPa; covers ${i.cover.stemBack}/${i.cover.stemFront} (stem) ${i.cover.footingTop}/${i.cover.footingBottom} (footing) mm; ${r.engine}; SCALE 1:20`,
  });
  return {
    prims,
    bounds: [x0, y0 - TXT, x1, y1],
    title,
    fileName: `${title.replace(/[^A-Za-z0-9-]+/g, "_")}.dxf`,
  };
}
