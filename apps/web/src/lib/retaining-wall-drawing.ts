/**
 * Retaining wall drawings as SVG strings: one source for the workspace
 * (section view) and the PDF report, so both always show the same thing.
 * True-scale section with soil, water, pressure diagrams on the virtual back
 * plane, bearing pressure, reinforcement and dimensions; plus the stem
 * action diagrams (Mu envelope against φMn, Vu).
 */
import {
  basementStoreys,
  barAreaPerMetre,
  keyOffset,
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
    strip: "#6b3fa0",
    wind: "#0e7c86",
  } as Record<string, string>,
  bearing: "#2e8b57",
} as const;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const n2 = (v: number, p = 2) => (Number.isFinite(v) ? v.toFixed(p) : "—");

/** Bar marks and colours shared by the drawing, the input table and the schedule. */
export const RW_BAR_MARKS = {
  stemBack: { mark: 1, color: RW_COLORS.back },
  stemFront: { mark: 2, color: RW_COLORS.front },
  stemHorizontal: { mark: 3, color: RW_COLORS.front },
  toeBottom: { mark: 4, color: RW_COLORS.back },
  heelTop: { mark: 5, color: RW_COLORS.back },
  footingDistribution: { mark: 6, color: RW_COLORS.front },
  key: { mark: 7, color: RW_COLORS.back },
} as const;

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
    : r.lateral.filter((l) => !l.id.startsWith("inertia") && l.id !== "wind");
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
  const stripEnd = i.strip.enabled ? g.backTop + i.strip.distance + i.strip.width + 0.3 : 0;
  // Each pressure diagram gets a slot as wide as its shape or its labels, whichever is wider.
  const slotLabelPx = comps.map(
    (c) => Math.max(c.label.length, `${n2(c.force, 1)} kN/m @ ${n2(c.arm)} m`.length) * 12 * 0.8 * 0.56 + 8,
  );
  const slotShapeM = ids.map((id) => {
    let m = 0;
    for (let k = 0; k <= 24; k++) m = Math.max(m, planeP(id, (planeHeight * k) / 24));
    return m * pressPer * 0.6;
  });
  const slotWidth = (k: number, scale: number) => Math.max(slotShapeM.at(k)!, slotLabelPx.at(k)! / scale, 0.15) + gap;
  const x0 = basement ? -1.4 : -0.7;
  const extentX1 = (scale: number) =>
    Math.max(plane + 0.25 + (nComp ? ids.reduce((sum, _, k) => sum + slotWidth(k, scale), 0) : 0) + 0.3, stripEnd + 1.2);
  const bearH = show.bearing && qMax > 0 ? Math.min(0.22 * planeHeight, 1.2) : 0;
  const y0 = -(g.key ? i.key.depth : 0) - bearH - (show.dimensions ? 1.0 : 0.3),
    y1 =
      Math.max(top, g.heelGround) +
      0.7 +
      (show.pressures && (i.surcharge.dead > 0 || i.surcharge.live > 0 || i.strip.enabled || i.axial.enabled) ? 0.6 : 0);
  // Pixel rows reserved above the drawing for the bar legend.
  const loadNotes: [string, string][] = [];
  if (show.pressures) {
    if (i.surcharge.dead > 0) loadNotes.push([`qD = ${n2(i.surcharge.dead, 1)} kPa uniform surcharge (dead)`, RW_COLORS.pressure.surchargeDead!]);
    if (i.surcharge.live > 0) loadNotes.push([`qL = ${n2(i.surcharge.live, 1)} kPa uniform surcharge (live)`, RW_COLORS.pressure.surchargeLive!]);
    if (i.strip.enabled && i.strip.q > 0)
      loadNotes.push([`strip ${n2(i.strip.q, 1)} kPa (${i.strip.kind}), ${n2(i.strip.distance)} m from stem, width ${n2(i.strip.width)} m`, RW_COLORS.pressure.strip!]);
    if (i.axial.enabled && (i.axial.dead > 0 || i.axial.live > 0))
      loadNotes.push([`P = ${n2(i.axial.dead, 1)} D + ${n2(i.axial.live, 1)} L kN/m on stem top, e = ${n2(i.axial.eccentricity)} m`, "#c0392b"]);
    if (i.wind.enabled && i.wind.pressure > 0)
      loadNotes.push([`W = wind ${n2(i.wind.pressure, 2)} kPa over top ${n2(Math.min(i.wind.height, i.height))} m of stem`, RW_COLORS.pressure.wind!]);
  }
  const barRowsN = show.bars ? (basement ? 3 : 6) + (i.key.enabled && !basement ? 1 : 0) : 0;
  const legendPx = Math.max(barRowsN, loadNotes.length) > 0 ? Math.max(barRowsN, loadNotes.length + 1) * 17 + 10 : 0;
  let s = 60;
  for (let it = 0; it < 4; it++) s = Math.min((W - 20) / (extentX1(s) - x0), (Hpx - 20 - legendPx) / (y1 - y0));
  const x1 = extentX1(s);
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
    const storeys = basementStoreys(i).storeys;
    const ts = i.basement.levels.length >= 2 ? storeys[0]!.slab : Math.max(0.15, tf);
    conc([
      { x: x0 + 0.45, y: top },
      { x: g.backTop, y: top },
      { x: g.backTop, y: top + ts },
      { x: x0 + 0.45, y: top + ts },
    ]);
    text(X(x0 + 0.5), Y(top + ts) - 4, `Top slab (${i.basement.top})`, { size: fs * 0.85, color: RW_COLORS.dim });
    // Intermediate floor slabs (pinned supports), centred on their level.
    storeys.slice(1).forEach((st, k) => {
      const yl = tf + st.top,
        h = st.slab,
        xb = g.frontBase + ((g.frontTop - g.frontBase) * st.top) / i.height;
      conc([
        { x: x0 + 0.45, y: yl - h / 2 },
        { x: xb, y: yl - h / 2 },
        { x: xb, y: yl + h / 2 },
        { x: x0 + 0.45, y: yl + h / 2 },
      ]);
      const R = r.stem.serviceReactions.levels[k];
      text(X(xb) - 4, Y(yl + h / 2) - 4 - (R !== undefined ? fs * 0.85 : 0), `${storeys[k]!.name}/${st.name} slab`, { size: fs * 0.8, anchor: "end", color: RW_COLORS.dim });
      if (R !== undefined) text(X(xb) - 4, Y(yl + h / 2) - 4, `R ${n2(R, 1)} kN/m`, { size: fs * 0.8, anchor: "end", color: RW_COLORS.dim });
    });
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
      if (g.key) {
        const kb = i.key.bar,
          kx = keyOffset(i) + (i.cover.footingBottom + kb.diameter / 2) / 1000,
          ky0 = -i.key.depth + i.cover.footingBottom / 1000,
          ky1 = tf - (i.cover.footingTop + b.heelTop.diameter) / 1000,
          kh = Math.max(0.12, (12 * kb.diameter) / 1000);
        out += `<polyline points="${pts([
          { x: kx, y: ky0 },
          { x: kx, y: ky1 },
          { x: kx + kh, y: ky1 },
        ])}" fill="none" stroke="${RW_COLORS.back}" stroke-width="${w * 0.9}"/>`;
        tag(kx, -i.key.depth * 0.5, 7, RW_COLORS.back, -24);
        legend.push([7, `${bd(kb)} shear key ${n2(i.key.width)} × ${n2(i.key.depth)} m${i.key.position === "stem" ? " under stem" : i.key.position === "heel" ? " at heel" : ""}, front face (hooked into footing)`, RW_COLORS.back]);
      }
    }
    legend.forEach(([n, t, color], k) => {
      const ly = 18 + k * 17;
      out += `<circle cx="20" cy="${(ly - 4).toFixed(1)}" r="7.5" fill="#fff" stroke="${color}" stroke-width="1.1"/><text x="20" y="${(ly - 0.5).toFixed(1)}" font-size="10" text-anchor="middle" fill="${color}" font-weight="600">${n}</text>`;
      text(33, ly, t, { size: fs * 0.82, color });
    });
  }

  // Height (px) of the applied-load band above the ground line: diagram titles sit above it.
  const uniformRows = (i.surcharge.dead > 0 ? 1 : 0) + (i.surcharge.live > 0 ? 1 : 0);
  const loadBandPx = !show.pressures
    ? 0
    : Math.max(uniformRows ? 8 + uniformRows * 20 : 0, i.strip.enabled && i.strip.q > 0 ? 52 : 0, i.axial.enabled ? 44 : 0) +
      (uniformRows || i.strip.enabled || i.axial.enabled ? 8 : 0);
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
      text(X(cx), Y(planeBottom + planeHeight) - 6 - loadBandPx - (ids.indexOf(c.id) % 2) * fs, c.label, { size: fs * 0.8, color, weight: 600 });
      const { force, arm } = c;
      if (force > 0) {
        const ya = planeBottom + arm,
          xa = cx + wmax * pressPer * 0.6 + 0.12;
        const hx = X(xa),
          hy = Y(ya);
        out += `<line x1="${X(xa + 0.35).toFixed(1)}" y1="${hy.toFixed(1)}" x2="${(hx + 6).toFixed(1)}" y2="${hy.toFixed(1)}" stroke="${color}" stroke-width="1.6"/>`;
        out += `<polygon points="${hx.toFixed(1)},${hy.toFixed(1)} ${(hx + 8).toFixed(1)},${(hy - 4).toFixed(1)} ${(hx + 8).toFixed(1)},${(hy + 4).toFixed(1)}" fill="${color}"/>`;
        text(X(cx), Y(planeBottom) + 2 * fs + 4, `${n2(force, 1)} kN/m @ ${n2(arm)} m`, { size: fs * 0.75, color });
      }
      cx += slotWidth(ids.indexOf(c.id), s);
    }
  }

  // ---- Applied loads: surcharge, strip, stem-top line load, wind; slope angles ----------
  if (show.pressures) {
    const slope = basement ? 0 : Math.tan((i.soil.beta * Math.PI) / 180);
    const groundY = (x: number) => top + Math.max(0, x - g.backTop) * slope;
    const xEnd = basement ? plane + 0.22 : B;
    const downArrow = (x: number, y: number, len: number, color: string, dash = "") => {
      const tx = X(x),
        ty = Y(y);
      out += `<line x1="${tx.toFixed(1)}" y1="${(ty - len).toFixed(1)}" x2="${tx.toFixed(1)}" y2="${(ty - 6).toFixed(1)}" stroke="${color}" stroke-width="1.3"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
      out += `<polygon points="${tx.toFixed(1)},${ty.toFixed(1)} ${(tx - 3.5).toFixed(1)},${(ty - 7).toFixed(1)} ${(tx + 3.5).toFixed(1)},${(ty - 7).toFixed(1)}" fill="${color}"/>`;
    };
    const rows: [number, string, string, string][] = [];
    if (i.surcharge.dead > 0) rows.push([i.surcharge.dead, "dead", RW_COLORS.pressure.surchargeDead!, ""]);
    if (i.surcharge.live > 0) rows.push([i.surcharge.live, "live", RW_COLORS.pressure.surchargeLive!, "4 2"]);
    rows.forEach(([q, kind, color, dash], k) => {
      // Dead row tips on the ground; the live row sits on top of it.
      const tipPx = k * 20,
        n = Math.max(2, Math.round((xEnd - g.backTop) / 0.4));
      for (let j = 0; j <= n; j++) {
        const x = g.backTop + 0.06 + ((xEnd - g.backTop - 0.12) * j) / n;
        const tx = X(x),
          ty = Y(groundY(x)) - tipPx;
        out += `<line x1="${tx.toFixed(1)}" y1="${(ty - 16).toFixed(1)}" x2="${tx.toFixed(1)}" y2="${(ty - 6).toFixed(1)}" stroke="${color}" stroke-width="1.3"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
        out += `<polygon points="${tx.toFixed(1)},${ty.toFixed(1)} ${(tx - 3.5).toFixed(1)},${(ty - 7).toFixed(1)} ${(tx + 3.5).toFixed(1)},${(ty - 7).toFixed(1)}" fill="${color}"/>`;
      }
      const lx = Math.max(xEnd, i.strip.enabled ? g.backTop + i.strip.distance + i.strip.width + 0.15 : 0);
      text(X(lx) + 5, Y(groundY(xEnd)) - tipPx - 4, `${kind === "dead" ? "qD" : "qL"} ${n2(q, 1)} kPa`, { size: fs * 0.78, color, weight: 600 });
    });
    if (i.strip.enabled && i.strip.q > 0) {
      const color = RW_COLORS.pressure.strip!;
      const xa = g.backTop + i.strip.distance,
        xb = xa + i.strip.width,
        n = Math.max(2, Math.round(i.strip.width / 0.25));
      for (let j = 0; j <= n; j++) {
        const x = xa + ((xb - xa) * j) / n;
        downArrow(x + 0.11, groundY(x + 0.11), 50, color);
      }
      line(xa + 0.11, groundY(xa + 0.11) + 50 / s, xb + 0.11, groundY(xb + 0.11) + 50 / s, color, 1.4);
      text(X((xa + xb) / 2 + 0.11), Y(groundY((xa + xb) / 2)) - 55, `strip ${n2(i.strip.q, 1)} kPa`, { size: fs * 0.78, color, anchor: "middle", weight: 600 });
    }
    if (i.axial.enabled && (i.axial.dead > 0 || i.axial.live > 0)) {
      const xp = (g.frontTop + g.backTop) / 2 - i.axial.eccentricity;
      downArrow(xp, top, 40, "#c0392b");
      out += `<line x1="${X(xp).toFixed(1)}" y1="${(Y(top) - 40).toFixed(1)}" x2="${X(xp).toFixed(1)}" y2="${(Y(top) - 6).toFixed(1)}" stroke="#c0392b" stroke-width="2.2"/>`;
      text(X(xp) - 6, Y(top) - 30, "P", { size: fs * 0.9, color: "#c0392b", anchor: "end", weight: 600 });
    }
    if (i.wind.enabled && i.wind.pressure > 0) {
      const h = Math.min(i.wind.height, i.height),
        n = Math.max(2, Math.round(h / 0.3));
      for (let j = 0; j <= n; j++) {
        const y = top - (h * j) / n,
          bx = g.backBase + ((y - tf) / i.height) * (g.backTop - g.backBase),
          tx = X(bx) + 2,
          ty = Y(y);
        out += `<line x1="${(tx + 26).toFixed(1)}" y1="${ty.toFixed(1)}" x2="${(tx + 6).toFixed(1)}" y2="${ty.toFixed(1)}" stroke="#0e7c86" stroke-width="1.3"/><polygon points="${tx.toFixed(1)},${ty.toFixed(1)} ${(tx + 7).toFixed(1)},${(ty - 3.5).toFixed(1)} ${(tx + 7).toFixed(1)},${(ty + 3.5).toFixed(1)}" fill="#0e7c86"/>`;
      }
      text(X(g.backTop) + 30, Y(top - h / 2) + 4, "W", { size: fs * 0.9, color: "#0e7c86", weight: 600 });
    }
    // Slope angles.
    const arc = (cx: number, cy: number, r: number, a0: number, a1: number, label: string, color: string, anchor: string) => {
      const p0 = { x: X(cx) + r * Math.cos(a0), y: Y(cy) - r * Math.sin(a0) },
        p1 = { x: X(cx) + r * Math.cos(a1), y: Y(cy) - r * Math.sin(a1) };
      const sweep = a1 > a0 ? 0 : 1;
      out += `<path d="M${p0.x.toFixed(1)} ${p0.y.toFixed(1)} A${r} ${r} 0 0 ${sweep} ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}" fill="none" stroke="${color}" stroke-width="1"/>`;
      text(X(cx) + (anchor === "end" ? -r - 4 : r + 4), Y(cy) - r * Math.sin((a0 + a1) / 2) + 4, label, { size: fs * 0.8, color, anchor });
    };
    if (!basement && i.soil.beta > 0) {
      const b0 = (i.soil.beta * Math.PI) / 180;
      line(g.backTop, top, g.backTop + 0.8, top, RW_COLORS.soilEdge, 0.8, "3 3");
      arc(g.backTop, top, 0.6 * s, 0, b0, `β = ${n2(i.soil.beta, 0)}°`, RW_COLORS.soilEdge, "start");
    }
    if (!basement && (i.toeSoil.slope ?? 0) > 0 && g.toeSoil) {
      const a0 = ((i.toeSoil.slope ?? 0) * Math.PI) / 180,
        pt = g.toeSoil.at(2)!;
      line(pt.x - 0.7, pt.y, pt.x, pt.y, RW_COLORS.soilEdge, 0.8, "3 3");
      arc(pt.x, pt.y, 0.5 * s, Math.PI, Math.PI + a0, `toe slope ${n2(i.toeSoil.slope ?? 0, 0)}°`, RW_COLORS.soilEdge, "end");
    }
  }

  if (loadNotes.length) {
    text(W - 12, 18, "Loads", { size: fs * 0.85, anchor: "end", weight: 600 });
    loadNotes.forEach(([t, color], k) => text(W - 12, 18 + (k + 1) * 17, t, { size: fs * 0.8, color, anchor: "end" }));
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
    const deepHeel = qGov.bearing.qHeel * k > 0.35 * bearH;
    text(deepHeel ? X(B) + 4 : X(B) - 2, Y(yb - qGov.bearing.qHeel * k) + (deepHeel ? 4 : fs + 2), `${n2(qGov.bearing.qHeel, 1)} kPa`, { size: fs * 0.8, color: RW_COLORS.bearing, anchor: deepHeel ? "start" : "end" });
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
    dimH(g.frontTop, g.backTop, top + 0.32 + loadBandPx / s, `${n2(i.stemTop)}`);
    if (g.key) {
      const ko = keyOffset(i);
      if (!show.bars)
        text(X(ko) - 4, Y(-i.key.depth / 2) + 4, `key ${n2(i.key.width)} × ${n2(i.key.depth)} m (${i.key.position === "stem" ? "under stem" : i.key.position === "heel" ? "at heel" : `at ${n2(ko)} m`})`, { size: fs * 0.8, color: RW_COLORS.dim, anchor: "end" });
    }
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
  let levels = "";
  if (i.wallType === "basement")
    for (const y of basementStoreys(i).intermediate) {
      const yy = 40 + (1 - y / H) * (height - 90);
      levels += `<line x1="40" y1="${yy.toFixed(1)}" x2="${(width - 10).toFixed(1)}" y2="${yy.toFixed(1)}" stroke="#8a96a3" stroke-width="1" stroke-dasharray="6 4"/><text x="${(width - 12).toFixed(1)}" y="${(yy - 4).toFixed(1)}" font-size="10.5" text-anchor="end" fill="#5b6670">slab ${n2(y)} m</text>`;
    }
  const v = panel(width * 0.64, width * 0.36, "Stem shear Vu", [
    { color: "#6b5b95", pts: step((s) => s.v), label: "Vu envelope", annotate: true },
  ], "kN/m");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="Century Gothic, Manrope, Arial, sans-serif" role="img" aria-label="Stem moment and shear"><rect width="${width}" height="${height}" fill="#ffffff"/>${levels}${m}${v}</svg>`;
}

export const rwStemThickness = stemThickness;
