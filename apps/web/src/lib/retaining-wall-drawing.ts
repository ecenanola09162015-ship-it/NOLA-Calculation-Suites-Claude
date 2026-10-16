/**
 * Retaining wall drawings as SVG strings: one source for the workspace
 * (section view) and the PDF report, so both always show the same thing.
 * True-scale section with soil, water, pressure diagrams on the virtual back
 * plane, bearing pressure, reinforcement and dimensions; plus the stem
 * action diagrams (Mu envelope against φMn, Vu).
 */
import {
  barAreaPerMetre,
  rebarDesignation,
  stemThickness,
  type RetainingWallInput,
  type RetainingWallResult,
  type StabilityCase,
} from "@nola/calc-core";

export const RW_COLORS = {
  concrete: "#d9d6cf",
  concreteEdge: "#3d4a55",
  soil: "#efe3c8",
  soilEdge: "#a9895a",
  water: "#2d7fd3",
  back: "#c0392b",
  front: "#1f6fb2",
  dim: "#5b6670",
  pressure: {
    soil: "#b07a3b",
    surchargeDead: "#6b5b95",
    surchargeLive: "#8e6fc1",
    water: "#2d7fd3",
    seismic: "#d35400",
    inertia: "#d35400",
  } as Record<string, string>,
  bearing: "#2e8b57",
} as const;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const n2 = (v: number, p = 2) => (Number.isFinite(v) ? v.toFixed(p) : "—");

/** Governing service case for the drawing: the largest bearing pressure. */
export function governingService(r: RetainingWallResult): StabilityCase | null {
  if (!r.stability?.length) return null;
  return r.stability.reduce((b, s) =>
    s.bearing.qMax > b.bearing.qMax && Number.isFinite(s.bearing.qMax) ? s : b,
  );
}

export interface SectionOptions {
  width?: number;
  height?: number;
  pressures?: boolean;
  bars?: boolean;
  bearing?: boolean;
  dimensions?: boolean;
}

export function retainingWallSectionSvg(
  i: RetainingWallInput,
  r: RetainingWallResult,
  opts: SectionOptions = {},
): string {
  const W = opts.width ?? 900,
    Hpx = opts.height ?? 640;
  const show = { pressures: true, bars: true, bearing: true, dimensions: true, ...opts };
  const g = r.geometry,
    B = g.width,
    tf = i.footing,
    top = g.stemTopLevel,
    std = i.rebarStandard ?? "PNS49",
    basement = i.wallType === "basement";
  // Pressure diagrams on the virtual plane (walls with a footing) or the stem back.
  const plane = basement ? g.backBase : B;
  const planeBottom = basement ? tf : 0;
  const planeHeight = basement ? i.height : g.virtualHeight;
  const comps: { id: string; label: string; force: number; arm: number }[] = basement
    ? r.stem.components.filter((c) => c.id !== "inertia")
    : r.lateral.filter((l) => !l.id.startsWith("inertia"));
  // Pressure on the plane at height y above the plane bottom (kPa).
  const planeP = (id: string, y: number) =>
    basement ? r.stem.pressure(id, y) : r.plane.pressure(id, y);
  const ids = comps.map((c) => c.id);
  const maxP = Math.max(1, ...ids.map((id) => Math.max(planeP(id, 0), planeP(id, planeHeight))));
  const qGov = governingService(r);
  const qMax = qGov && Number.isFinite(qGov.bearing.qMax) ? qGov.bearing.qMax : 0;
  // World extents (m).
  const pressWidthM = show.pressures ? Math.min(0.55 * planeHeight, 3.2) : 0;
  const pressPer = pressWidthM / maxP; // m per kPa for each diagram
  const nComp = show.pressures ? ids.length : 0;
  const gap = 0.25;
  const x0 = basement ? -1.4 : -0.7,
    x1 = plane + 0.25 + nComp * (pressWidthM * 0.6 + gap) + 1.1;
  const bearH = show.bearing && qMax > 0 ? Math.min(0.22 * planeHeight, 1.2) : 0;
  const y0 = -(g.key ? i.key.depth : 0) - bearH - (show.dimensions ? 1.0 : 0.3),
    y1 = Math.max(top, g.heelGround) + 0.7;
  // Pixel rows reserved above the drawing for the bar legend.
  const legendPx = show.bars ? (basement ? 3 : 6) * 17 + 10 : 0;
  const s = Math.min((W - 20) / (x1 - x0), (Hpx - 20 - legendPx) / (y1 - y0));
  const ox = 10 - x0 * s + ((W - 20) - (x1 - x0) * s) / 2,
    oy = 10 + legendPx + y1 * s;
  const X = (x: number) => ox + x * s,
    Y = (y: number) => oy - y * s;
  const pts = (p: { x: number; y: number }[]) =>
    p.map((q) => `${X(q.x).toFixed(1)},${Y(q.y).toFixed(1)}`).join(" ");
  const fs = Math.max(10, Math.min(14, s * 0.16));
  let out = "";
  const text = (x: number, y: number, t: string, o: { anchor?: string; color?: string; size?: number; weight?: number } = {}) =>
    (out += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${(o.size ?? fs).toFixed(1)}" text-anchor="${o.anchor ?? "start"}" fill="${o.color ?? "#24313b"}"${o.weight ? ` font-weight="${o.weight}"` : ""}>${esc(t)}</text>`);
  const line = (xa: number, ya: number, xb: number, yb: number, color: string, w = 1, dash = "") =>
    (out += `<line x1="${X(xa).toFixed(1)}" y1="${Y(ya).toFixed(1)}" x2="${X(xb).toFixed(1)}" y2="${Y(yb).toFixed(1)}" stroke="${color}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`);

  // ---- Soil and water --------------------------------------------------------
  const slope = Math.tan((i.soil.beta * Math.PI) / 180);
  if (!basement)
    out += `<polygon points="${pts(g.backfill)}" fill="${RW_COLORS.soil}" stroke="none"/>`;
  else
    out += `<polygon points="${pts([
      { x: g.backBase, y: tf },
      { x: plane + 0.22, y: tf },
      { x: plane + 0.22, y: top },
      { x: g.backTop, y: top },
    ])}" fill="${RW_COLORS.soil}" stroke="none"/>`;
  // Ground line behind the wall.
  const gx1 = basement ? plane + 0.22 : B;
  line(g.backTop, top, gx1, top + (gx1 - g.backTop) * (basement ? 0 : slope), RW_COLORS.soilEdge, 1.4);
  if (g.toeSoil) {
    out += `<polygon points="${pts(g.toeSoil)}" fill="${RW_COLORS.soil}" stroke="none"/>`;
    const cy = tf + Math.min(i.toeSoil.cover, i.height);
    line(x0 + 0.1, cy, g.toeSoil.at(2)!.x, cy, RW_COLORS.soilEdge, 1.4);
    line(x0 + 0.1, 0, 0, 0, RW_COLORS.soilEdge, 1);
  }
  if (i.water.enabled && i.water.back > (basement ? tf : 0)) {
    const wl = Math.min(i.water.back, basement ? top : g.virtualHeight);
    line(g.backBase, wl, gx1, wl, RW_COLORS.water, 1.4, "6 4");
    const tx = X((g.backBase + gx1) / 2);
    out += `<path d="M${(tx - 6).toFixed(1)} ${(Y(wl) - 9).toFixed(1)} h12 l-6 8 z" fill="${RW_COLORS.water}"/>`;
    text(tx + 9, Y(wl) - 3, `GWL ${n2(i.water.back)} m`, { color: RW_COLORS.water, size: fs * 0.85 });
  }
  if (i.water.enabled && i.water.front > 0 && !basement)
    line(x0 + 0.1, i.water.front, g.frontBase, i.water.front, RW_COLORS.water, 1.2, "6 4");

  // ---- Concrete ----------------------------------------------------------------
  const conc = (p: { x: number; y: number }[]) =>
    (out += `<polygon points="${pts(p)}" fill="${RW_COLORS.concrete}" stroke="${RW_COLORS.concreteEdge}" stroke-width="1.4"/>`);
  if (basement) {
    // Base slab and top slab drawn as context, extending to the front.
    conc([
      { x: x0 + 0.45, y: 0 },
      { x: g.backBase, y: 0 },
      { x: g.backBase, y: tf },
      { x: x0 + 0.45, y: tf },
    ]);
    const ts = Math.max(0.15, tf);
    conc([
      { x: x0 + 0.45, y: top },
      { x: g.backTop, y: top },
      { x: g.backTop, y: top + ts },
      { x: x0 + 0.45, y: top + ts },
    ]);
    text(X(x0 + 0.5), Y(top + ts) - 4, `Top slab (${i.basement.top})`, { size: fs * 0.85, color: RW_COLORS.dim });
    text(X(x0 + 0.5), Y(0) + fs + 2, `Base slab (${i.basement.base})`, { size: fs * 0.85, color: RW_COLORS.dim });
  } else {
    conc(g.footing);
    if (g.key) conc(g.key);
  }
  conc(g.stem);
  if (i.wallType === "propped") {
    const py = tf + i.prop.height,
      xf = g.frontBase + ((g.frontTop - g.frontBase) * i.prop.height) / i.height;
    out += `<rect x="${X(xf - 0.7).toFixed(1)}" y="${(Y(py) - 4).toFixed(1)}" width="${(0.7 * s).toFixed(1)}" height="8" fill="#8a96a3" stroke="${RW_COLORS.concreteEdge}"/>`;
    const R = r.stem.serviceReactions.prop;
    text(X(xf) - 6, Y(py) + 18, `Prop${i.prop.rigid ? "" : " (spring)"}`, { size: fs * 0.85, anchor: "end", color: RW_COLORS.dim });
    if (R !== null)
      text(X(xf) - 6, Y(py) + 18 + fs, `R = ${n2(R, 1)} kN/m (service)`, { size: fs * 0.85, anchor: "end", color: RW_COLORS.dim });
  }

  // ---- Reinforcement --------------------------------------------------------------
  if (show.bars) {
    const b = i.bars;
    const backX = (y: number) => g.backBase + ((y - tf) / i.height) * (g.backTop - g.backBase);
    const frontX = (y: number) => g.frontBase + ((y - tf) / i.height) * (g.frontTop - g.frontBase);
    const cb = (i.cover.stemBack + b.stemBack.diameter / 2) / 1000,
      cf = (i.cover.stemFront + b.stemFront.diameter / 2) / 1000;
    const yBot = (i.cover.footingBottom + b.toeBottom.diameter + b.footingDistribution.diameter) / 1000 + b.stemBack.diameter / 2000;
    const yTop = top - 0.05;
    const w = 2.2;
    // Back-face bars with the hooked dowel into the footing.
    const hook = Math.max(0.12, (12 * b.stemBack.diameter) / 1000);
    out += `<polyline points="${pts([
      { x: backX(yBot) - cb - hook, y: yBot },
      { x: backX(yBot) - cb, y: yBot },
      { x: backX(yTop) - cb, y: yTop },
    ])}" fill="none" stroke="${RW_COLORS.back}" stroke-width="${w}"/>`;
    if (b.stemCut.enabled && b.stemCut.height < i.height) {
      const yc = tf + b.stemCut.height,
        off = 0.035;
      out += `<polyline points="${pts([
        { x: backX(yBot) - cb - off - hook, y: yBot + off },
        { x: backX(yBot) - cb - off, y: yBot + off },
        { x: backX(yc) - cb - off, y: yc },
      ])}" fill="none" stroke="${RW_COLORS.back}" stroke-width="${w * 0.8}" stroke-dasharray="5 3"/>`;
      line(backX(yc) - cb - 0.12, yc, backX(yc) + 0.05, yc, RW_COLORS.back, 1, "2 2");
      text(X(backX(yc) + 0.08), Y(yc) + 4, `alternate bars stop at ${n2(b.stemCut.height)} m`, { size: fs * 0.8, color: RW_COLORS.back });
    }
    // Front-face bars.
    out += `<polyline points="${pts([
      { x: frontX(yBot) + cf + hook, y: yBot },
      { x: frontX(yBot) + cf, y: yBot },
      { x: frontX(yTop) + cf, y: yTop },
    ])}" fill="none" stroke="${RW_COLORS.front}" stroke-width="${w * 0.8}"/>`;
    // Horizontal bars (dots) inside the verticals, each face.
    const nH = Math.floor((i.height * 1000 - 100) / b.stemHorizontal.spacing) + 1;
    const rr = Math.max(1.6, (b.stemHorizontal.diameter / 2000) * s);
    for (let k = 0; k < Math.min(nH, 60); k++) {
      const y = tf + 0.05 + (k * b.stemHorizontal.spacing) / 1000;
      if (y > top - 0.04) break;
      const dh = (b.stemHorizontal.diameter / 2 + b.stemBack.diameter) / 1000;
      out += `<circle cx="${X(backX(y) - cb + dh - b.stemBack.diameter / 1000 - b.stemHorizontal.diameter / 1000).toFixed(1)}" cy="${Y(y).toFixed(1)}" r="${rr.toFixed(1)}" fill="${RW_COLORS.front}"/>`;
      out += `<circle cx="${X(frontX(y) + cf + b.stemFront.diameter / 2000 + b.stemHorizontal.diameter / 2000).toFixed(1)}" cy="${Y(y).toFixed(1)}" r="${rr.toFixed(1)}" fill="${RW_COLORS.front}"/>`;
    }
    if (!basement) {
      const cS = 0.075 > i.cover.footingBottom / 1000 ? 0.075 : i.cover.footingBottom / 1000;
      const yb = (i.cover.footingBottom + b.toeBottom.diameter / 2) / 1000,
        yt = tf - (i.cover.footingTop + b.heelTop.diameter / 2) / 1000;
      out += `<polyline points="${pts([
        { x: cS, y: yt - 0.02 },
        { x: cS, y: yb },
        { x: B - cS, y: yb },
        { x: B - cS, y: yt - 0.02 },
      ])}" fill="none" stroke="${RW_COLORS.back}" stroke-width="${w * 0.9}"/>`;
      out += `<polyline points="${pts([
        { x: cS, y: yb + 0.05 },
        { x: cS, y: yt },
        { x: B - cS, y: yt },
        { x: B - cS, y: yb + 0.05 },
      ])}" fill="none" stroke="${RW_COLORS.back}" stroke-width="${w * 0.9}"/>`;
      const rd = Math.max(1.6, (b.footingDistribution.diameter / 2000) * s);
      const nD = Math.floor(((B - 2 * cS) * 1000) / b.footingDistribution.spacing) + 1;
      for (let k = 0; k < Math.min(nD, 60); k++) {
        const x = cS + 0.03 + (k * b.footingDistribution.spacing) / 1000;
        if (x > B - cS - 0.02) break;
        const dd = (b.toeBottom.diameter / 2 + b.footingDistribution.diameter / 2) / 1000;
        out += `<circle cx="${X(x).toFixed(1)}" cy="${Y(yb + dd).toFixed(1)}" r="${rd.toFixed(1)}" fill="${RW_COLORS.front}"/>`;
        out += `<circle cx="${X(x).toFixed(1)}" cy="${Y(yt - dd).toFixed(1)}" r="${rd.toFixed(1)}" fill="${RW_COLORS.front}"/>`;
      }
    }
    // Bar marks (numbered tags beside the bars) and a bar legend.
    const bd = (bar: { diameter: number; spacing: number }) =>
      `${rebarDesignation(std, bar.diameter)} @ ${bar.spacing}`;
    const tag = (x: number, y: number, n: number, color: string, dx: number) => {
      const tx = X(x) + dx,
        ty = Y(y);
      out += `<line x1="${X(x).toFixed(1)}" y1="${ty.toFixed(1)}" x2="${tx.toFixed(1)}" y2="${ty.toFixed(1)}" stroke="${color}" stroke-width="0.8"/>`;
      out += `<circle cx="${tx.toFixed(1)}" cy="${ty.toFixed(1)}" r="8.5" fill="#fff" stroke="${color}" stroke-width="1.2"/>`;
      out += `<text x="${tx.toFixed(1)}" y="${(ty + 4).toFixed(1)}" font-size="11" text-anchor="middle" fill="${color}" font-weight="600">${n}</text>`;
    };
    const ym = tf + 0.7 * i.height;
    tag(backX(ym) - cb, ym, 1, RW_COLORS.back, 26);
    tag(frontX(tf + 0.55 * i.height) + cf, tf + 0.55 * i.height, 2, RW_COLORS.front, -26);
    const yh = tf + 0.05 + Math.floor((0.4 * i.height * 1000) / b.stemHorizontal.spacing) * (b.stemHorizontal.spacing / 1000);
    tag(frontX(yh) + cf, yh, 3, RW_COLORS.front, -26);
    const legend: [number, string, string][] = [
      [1, `${bd(b.stemBack)} back face, vertical (${n2(barAreaPerMetre(b.stemBack), 0)} mm²/m)${b.stemCut.enabled && b.stemCut.height < i.height ? `; alternate bars stop at ${n2(b.stemCut.height)} m` : ""}; hooked into ${basement ? "base slab" : "footing"}`, RW_COLORS.back],
      [2, `${bd(b.stemFront)} front face, vertical`, RW_COLORS.front],
      [3, `${bd(b.stemHorizontal)} horizontal, each face`, RW_COLORS.front],
    ];
    if (!basement) {
      const yb = (i.cover.footingBottom + b.toeBottom.diameter / 2) / 1000,
        yt = tf - (i.cover.footingTop + b.heelTop.diameter / 2) / 1000;
      if (g.frontBase > 0.25) tag(g.frontBase * 0.45, yb, 4, RW_COLORS.back, 0);
      else tag(g.backBase + 0.2, yb, 4, RW_COLORS.back, 0);
      tag(g.backBase + (B - g.backBase) * 0.55, yt, 5, RW_COLORS.back, 0);
      legend.push(
        [4, `${bd(b.toeBottom)} footing bottom (toe main)`, RW_COLORS.back],
        [5, `${bd(b.heelTop)} footing top (heel main)`, RW_COLORS.back],
        [6, `${bd(b.footingDistribution)} footing distribution, each face (dots)`, RW_COLORS.front],
      );
    }
    legend.forEach(([n, t, color], k) => {
      const ly = 18 + k * 17;
      out += `<circle cx="20" cy="${(ly - 4).toFixed(1)}" r="7.5" fill="#fff" stroke="${color}" stroke-width="1.1"/><text x="20" y="${(ly - 0.5).toFixed(1)}" font-size="10" text-anchor="middle" fill="${color}" font-weight="600">${n}</text>`;
      text(33, ly, t, { size: fs * 0.82, color });
    });
  }

  // ---- Pressure diagrams on the virtual plane ----------------------------------------
  if (show.pressures && nComp) {
    line(plane, planeBottom, plane, planeBottom + planeHeight, RW_COLORS.dim, 1, "4 3");
    let cx = plane + 0.25;
    for (const c of comps) {
      const color = RW_COLORS.pressure[c.id] ?? "#555";
      const N = 24,
        poly: { x: number; y: number }[] = [{ x: cx, y: planeBottom + planeHeight }];
      let wmax = 0;
      for (let k = 0; k <= N; k++) {
        const y = planeHeight - (planeHeight * k) / N;
        const p = planeP(c.id, y);
        wmax = Math.max(wmax, p);
        poly.push({ x: cx + p * pressPer * 0.6, y: planeBottom + y });
      }
      poly.push({ x: cx, y: planeBottom });
      out += `<polygon points="${pts(poly)}" fill="${color}" fill-opacity="0.28" stroke="${color}" stroke-width="1.2"/>`;
      line(cx, planeBottom, cx, planeBottom + planeHeight, color, 1);
      const pb = planeP(c.id, 0);
      text(X(cx), Y(planeBottom) + fs + 2, `${n2(pb, 1)} kPa`, { size: fs * 0.8, color });
      text(X(cx), Y(planeBottom + planeHeight) - 6 - (ids.indexOf(c.id) % 2) * fs, c.label, { size: fs * 0.8, color, weight: 600 });
      const { force, arm } = c;
      if (force > 0) {
        const ya = planeBottom + arm,
          xa = cx + wmax * pressPer * 0.6 + 0.12;
        const hx = X(xa),
          hy = Y(ya);
        out += `<line x1="${X(xa + 0.35).toFixed(1)}" y1="${hy.toFixed(1)}" x2="${(hx + 6).toFixed(1)}" y2="${hy.toFixed(1)}" stroke="${color}" stroke-width="1.6"/>`;
        out += `<polygon points="${hx.toFixed(1)},${hy.toFixed(1)} ${(hx + 8).toFixed(1)},${(hy - 4).toFixed(1)} ${(hx + 8).toFixed(1)},${(hy + 4).toFixed(1)}" fill="${color}"/>`;
        text(X(xa + 0.02), Y(ya) - 4, `${n2(force, 1)} kN/m @ ${n2(arm)} m`, { size: fs * 0.75, color });
      }
      cx += Math.max(wmax * pressPer * 0.6, 0.15) + gap + 0.55;
    }
  }

  // ---- Bearing pressure ---------------------------------------------------------------
  if (show.bearing && qGov && qMax > 0 && !basement) {
    const yb = -(g.key ? i.key.depth : 0) - 0.08;
    const k = bearH / qMax,
      poly = [{ x: 0, y: yb }];
    for (let j = 0; j <= 40; j++) {
      const x = (B * j) / 40;
      poly.push({ x, y: yb - qGov.bearing.at(x) * k });
    }
    poly.push({ x: B, y: yb });
    out += `<polygon points="${pts(poly)}" fill="${RW_COLORS.bearing}" fill-opacity="0.22" stroke="${RW_COLORS.bearing}" stroke-width="1.2"/>`;
    text(X(0) - 4, Y(yb - qGov.bearing.qToe * k) + 4, `${n2(qGov.bearing.qToe, 1)} kPa`, { size: fs * 0.8, color: RW_COLORS.bearing, anchor: "end" });
    text(X(B) - 2, Y(yb - qGov.bearing.qHeel * k) + fs + 2, `${n2(qGov.bearing.qHeel, 1)} kPa`, { size: fs * 0.8, color: RW_COLORS.bearing, anchor: "end" });
    text(X(B) + 4, Y(yb - bearH * 0.8) + 4, `Bearing (${qGov.id}) · ${qGov.bearing.shape === "triangle" ? `contact ${n2(qGov.bearing.contact)} m` : "full contact"}, qa ${n2(qGov.allowable, 0)} kPa`, { size: fs * 0.8, color: RW_COLORS.bearing });
  }

  // ---- Dimensions -----------------------------------------------------------------------
  if (show.dimensions) {
    const dimY = y0 + 0.45;
    const dimH = (xa: number, xb: number, y: number, t: string) => {
      if (xb - xa < 1e-6) return;
      line(xa, y, xb, y, RW_COLORS.dim, 0.9);
      line(xa, y - 0.06, xa, y + 0.06, RW_COLORS.dim, 0.9);
      line(xb, y - 0.06, xb, y + 0.06, RW_COLORS.dim, 0.9);
      text((X(xa) + X(xb)) / 2, Y(y) - 4, t, { anchor: "middle", size: fs * 0.82, color: RW_COLORS.dim });
    };
    const dimV = (x: number, ya: number, yb: number, t: string) => {
      line(x, ya, x, yb, RW_COLORS.dim, 0.9);
      line(x - 0.06, ya, x + 0.06, ya, RW_COLORS.dim, 0.9);
      line(x - 0.06, yb, x + 0.06, yb, RW_COLORS.dim, 0.9);
      out += `<text x="${(X(x) - 5).toFixed(1)}" y="${Y((ya + yb) / 2).toFixed(1)}" font-size="${(fs * 0.82).toFixed(1)}" text-anchor="middle" fill="${RW_COLORS.dim}" transform="rotate(-90 ${(X(x) - 5).toFixed(1)} ${Y((ya + yb) / 2).toFixed(1)})">${esc(t)}</text>`;
    };
    if (!basement) {
      dimH(0, g.frontBase, dimY + 0.3, `${n2(i.toe)}`);
      dimH(g.frontBase, g.backBase, dimY + 0.3, `${n2(i.stemBase)}`);
      dimH(g.backBase, B, dimY + 0.3, `${n2(i.heel)}`);
      dimH(0, B, dimY, `B = ${n2(B)} m`);
    }
    const dx = x0 + 0.2;
    dimV(dx, tf, top, `H = ${n2(i.height)} m`);
    dimV(dx, 0, tf, `${n2(tf)}`);
    dimH(g.frontTop, g.backTop, top + 0.32, `${n2(i.stemTop)}`);
    if (g.key) text(X(i.key.offset + i.key.width) + 4, Y(-i.key.depth / 2), `key ${n2(i.key.width)} × ${n2(i.key.depth)}`, { size: fs * 0.8, color: RW_COLORS.dim });
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${Hpx}" width="${W}" height="${Hpx}" font-family="Century Gothic, Manrope, Arial, sans-serif" role="img" aria-label="Retaining wall section"><rect width="${W}" height="${Hpx}" fill="#ffffff"/>${out}</svg>`;
}

/** Stem action diagrams: Mu envelope against φMn (both faces) and Vu. */
export function retainingWallStemSvg(
  i: RetainingWallInput,
  r: RetainingWallResult,
  width = 900,
  height = 420,
): string {
  const st = r.stem.stations;
  const H = i.height;
  const panel = (x0: number, w: number, title: string, series: { color: string; pts: [number, number][]; dash?: string; label: string; annotate?: boolean }[], unit: string) => {
    const vals = series.flatMap((s) => s.pts.map((p) => p[0]));
    const lo = Math.min(0, ...vals),
      hi = Math.max(0, ...vals),
      span = hi - lo || 1;
    const px = (v: number) => x0 + 50 + ((v - lo) / span) * (w - 70),
      py = (y: number) => 40 + (1 - y / H) * (height - 90);
    let o = `<text x="${x0 + 10}" y="22" font-size="13" font-weight="600" fill="#24313b">${esc(title)}</text>`;
    o += `<line x1="${px(0)}" y1="${py(H)}" x2="${px(0)}" y2="${py(0)}" stroke="#3d4a55" stroke-width="1"/>`;
    o += `<line x1="${x0 + 50}" y1="${py(0)}" x2="${x0 + w - 20}" y2="${py(0)}" stroke="#c9ced3" stroke-width="1"/>`;
    for (const s of series) {
      o += `<polyline points="${s.pts.map(([v, y]) => `${px(v).toFixed(1)},${py(y).toFixed(1)}`).join(" ")}" fill="none" stroke="${s.color}" stroke-width="1.8"${s.dash ? ` stroke-dasharray="${s.dash}"` : ""}/>`;
    }
    for (const s of series.filter((x) => x.annotate)) {
      const peak = s.pts.reduce((b, p) => (Math.abs(p[0]) > Math.abs(b[0]) ? p : b), [0, 0] as [number, number]);
      if (Math.abs(peak[0]) < 1e-9) continue;
      const right = px(peak[0]) > x0 + w * 0.55;
      o += `<circle cx="${px(peak[0]).toFixed(1)}" cy="${py(peak[1]).toFixed(1)}" r="3" fill="${s.color}"/><text x="${(px(peak[0]) + (right ? -6 : 6)).toFixed(1)}" y="${(py(peak[1]) - 6).toFixed(1)}" font-size="11.5" fill="${s.color}" text-anchor="${right ? "end" : "start"}">${esc(`${n2(Math.abs(peak[0]), 1)} @ ${n2(peak[1])} m`)}</text>`;
    }
    series.forEach((s, k) => {
      o += `<line x1="${x0 + 50 + k * 150}" y1="${height - 22}" x2="${x0 + 72 + k * 150}" y2="${height - 22}" stroke="${s.color}" stroke-width="2"${s.dash ? ` stroke-dasharray="${s.dash}"` : ""}/><text x="${x0 + 76 + k * 150}" y="${height - 18}" font-size="11" fill="#24313b">${esc(s.label)}</text>`;
    });
    o += `<text x="${px(lo)}" y="${py(0) + 16}" font-size="11" fill="#5b6670" text-anchor="middle">${n2(lo, 1)}</text><text x="${px(hi)}" y="${py(0) + 16}" font-size="11" fill="#5b6670" text-anchor="middle">${n2(hi, 1)} ${esc(unit)}</text>`;
    o += `<text x="${x0 + 44}" y="${py(H) + 4}" font-size="11" fill="#5b6670" text-anchor="end">${n2(H)} m</text><text x="${x0 + 44}" y="${py(0) + 4}" font-size="11" fill="#5b6670" text-anchor="end">0</text>`;
    return o;
  };
  const step = (f: (s: (typeof st)[number]) => number): [number, number][] => st.map((s) => [f(s), s.y]);
  const m = panel(0, width * 0.62, "Stem moment (+ back face, − front face)", [
    { color: RW_COLORS.back, pts: step((s) => s.mBack), label: "Mu back", annotate: true },
    { color: RW_COLORS.back, pts: step((s) => s.phiMnBack), dash: "5 3", label: "φMn back" },
    { color: RW_COLORS.front, pts: step((s) => s.mFront), label: "Mu front", annotate: true },
    { color: RW_COLORS.front, pts: step((s) => -s.phiMnFront), dash: "5 3", label: "φMn front" },
  ], "kN·m/m");
  const v = panel(width * 0.64, width * 0.36, "Stem shear Vu", [
    { color: "#6b5b95", pts: step((s) => s.v), label: "Vu envelope", annotate: true },
  ], "kN/m");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="Century Gothic, Manrope, Arial, sans-serif" role="img" aria-label="Stem moment and shear"><rect width="${width}" height="${height}" fill="#ffffff"/>${m}${v}</svg>`;
}

export const rwStemThickness = stemThickness;
