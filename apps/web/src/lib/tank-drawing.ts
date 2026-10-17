/**
 * Underground tank drawings as SVG strings, shared by the workspace and the
 * PDF: plan (inside / outside dimensions, base projection), cross-section
 * (base, walls, roof, soil cover, ground, groundwater, liquid level, bars) and
 * panel contour maps of the factored Wood–Armer moments with the governing
 * point.
 */
import { type TankFace, type TankInput, type TankPanelId, type TankResult } from "@nola/calc-core";
import { rampColor } from "./retaining-wall-elevation";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const n2 = (v: number, p = 2) => (Number.isFinite(v) ? v.toFixed(p) : "—");
const C = {
  conc: "#d9d6cf",
  edge: "#3d4a55",
  soil: "#efe3c8",
  soilEdge: "#a9895a",
  water: "#2d7fd3",
  liquid: "#9cc7ef",
  dim: "#5b6670",
  bar: "#c0392b",
  bar2: "#1f6fb2",
  text: "#24313b",
};
const svg = (w: number, h: number, label: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="Century Gothic, Manrope, Arial, sans-serif" role="img" aria-label="${esc(label)}"><rect width="${w}" height="${h}" fill="#fff"/>${body}</svg>`;

function dimH(x1: number, x2: number, y: number, label: string, above = true) {
  const ty = above ? y - 5 : y + 13;
  return `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${C.dim}"/><line x1="${x1}" y1="${y - 4}" x2="${x1}" y2="${y + 4}" stroke="${C.dim}"/><line x1="${x2}" y1="${y - 4}" x2="${x2}" y2="${y + 4}" stroke="${C.dim}"/><text x="${(x1 + x2) / 2}" y="${ty}" font-size="11" text-anchor="middle" fill="${C.dim}">${esc(label)}</text>`;
}
function dimV(x: number, y1: number, y2: number, label: string) {
  return `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${C.dim}"/><line x1="${x - 4}" y1="${y1}" x2="${x + 4}" y2="${y1}" stroke="${C.dim}"/><line x1="${x - 4}" y1="${y2}" x2="${x + 4}" y2="${y2}" stroke="${C.dim}"/><text x="${x - 6}" y="${(y1 + y2) / 2}" font-size="11" text-anchor="middle" fill="${C.dim}" transform="rotate(-90 ${x - 6} ${(y1 + y2) / 2})">${esc(label)}</text>`;
}

export function tankPlanSvg(i: TankInput, r: TankResult, width = 900, height = 520): string {
  const g = r.geometry;
  const pad = 70;
  const s = Math.min((width - 2 * pad) / g.baseX, (height - 2 * pad) / g.baseY);
  const ox = (width - g.baseX * s) / 2,
    oy = (height - g.baseY * s) / 2;
  const X = (x: number) => ox + x * s,
    Y = (y: number) => oy + y * s;
  const p = i.projection,
    t = i.wall;
  let o = "";
  o += `<rect x="${X(0)}" y="${Y(0)}" width="${g.baseX * s}" height="${g.baseY * s}" fill="#ece8df" stroke="${C.edge}" stroke-dasharray="6 3"/>`;
  o += `<rect x="${X(p)}" y="${Y(p)}" width="${g.outerX * s}" height="${g.outerY * s}" fill="${C.conc}" stroke="${C.edge}" stroke-width="1.6"/>`;
  o += `<rect x="${X(p + t)}" y="${Y(p + t)}" width="${i.lx * s}" height="${i.ly * s}" fill="${i.liquid.depth > 0 ? "#e3effa" : "#fff"}" stroke="${C.edge}" stroke-width="1.6"/>`;
  // Wall centrelines.
  o += `<rect x="${X(p + t / 2)}" y="${Y(p + t / 2)}" width="${g.lc * s}" height="${g.wc * s}" fill="none" stroke="#8a96a3" stroke-dasharray="10 3 2 3"/>`;
  o += `<text x="${X(g.baseX / 2)}" y="${Y(g.baseY / 2)}" font-size="13" text-anchor="middle" fill="${C.text}" font-weight="600">${esc(`Inside ${n2(i.lx)} × ${n2(i.ly)} m`)}</text>`;
  o += `<text x="${X(g.baseX / 2)}" y="${Y(g.baseY / 2) + 17}" font-size="11" text-anchor="middle" fill="${C.dim}">${esc(`Liquid ${n2(i.liquid.depth)} m deep · ${i.roof.enabled ? `roof ${n2(i.roof.thickness * 1000, 0)} mm` : "open top"}`)}</text>`;
  o += `<text x="${X(p + t + i.lx / 2)}" y="${Y(p + t / 2) + 4}" font-size="10.5" text-anchor="middle" fill="${C.text}">Long wall (L)</text>`;
  o += `<text x="${X(p + t / 2) + 4}" y="${Y(p + t + i.ly / 2)}" font-size="10.5" fill="${C.text}" transform="rotate(-90 ${X(p + t / 2) + 4} ${Y(p + t + i.ly / 2)})" text-anchor="middle">Short wall (S)</text>`;
  o += dimH(X(p + t), X(p + t + i.lx), Y(0) - 18, `${n2(i.lx)} inside`);
  o += dimH(X(0), X(g.baseX), Y(0) - 42, `${n2(g.baseX)} base`);
  o += dimH(X(p), X(p + g.outerX), Y(g.baseY) + 22, `${n2(g.outerX)} outside`, false);
  o += dimV(X(0) - 18, Y(p + t), Y(p + t + i.ly), `${n2(i.ly)} inside`);
  o += dimV(X(0) - 42, Y(0), Y(g.baseY), `${n2(g.baseY)} base`);
  o += `<text x="${pad / 2}" y="22" font-size="13" font-weight="600" fill="${C.text}">Plan</text>`;
  o += `<text x="${width - pad / 2}" y="22" font-size="11" text-anchor="end" fill="${C.dim}">${esc(`Walls ${n2(t * 1000, 0)} mm · projection ${n2(p)} m · centrelines dash-dot`)}</text>`;
  return svg(width, height, "Tank plan", o);
}

export function tankSectionSvg(i: TankInput, r: TankResult, width = 900, height = 520): string {
  const g = r.geometry;
  const tb = i.base,
    tr = i.roof.enabled ? i.roof.thickness : 0,
    H = i.height;
  const top = tb + H + tr + (i.roof.enabled ? i.roof.cover : 0);
  const groundY = tb + i.soil.ground;
  const yMax = Math.max(top, groundY) + 0.4;
  const extra = 1.2;
  const spanX = g.baseX + 2 * extra;
  const s = Math.min((width - 140) / spanX, (height - 110) / yMax);
  const ox = (width - spanX * s) / 2 + extra * s,
    oy = height - 60;
  const X = (x: number) => ox + x * s,
    Y = (y: number) => oy - y * s;
  const p = i.projection,
    t = i.wall;
  let o = "";
  const rect = (x0: number, y0: number, w: number, h: number, fill: string, stroke = C.edge, extraAttr = "") =>
    `<rect x="${X(x0).toFixed(1)}" y="${Y(y0 + h).toFixed(1)}" width="${(w * s).toFixed(1)}" height="${(h * s).toFixed(1)}" fill="${fill}" stroke="${stroke}" stroke-width="1.3" ${extraAttr}/>`;
  // Soil around (to ground), excavation shown as backfill.
  o += rect(-extra, 0, extra + p, Math.max(0, groundY), C.soil, C.soilEdge);
  o += rect(p + g.outerX, 0, extra + p, Math.max(0, groundY), C.soil, C.soilEdge);
  if (i.roof.enabled && i.roof.cover > 0) o += rect(p, tb + H + tr, g.outerX, i.roof.cover, C.soil, C.soilEdge);
  // Concrete.
  o += rect(0, 0, g.baseX, tb, C.conc);
  o += rect(p, tb, t, H, C.conc);
  o += rect(p + t + i.lx, tb, t, H, C.conc);
  if (i.roof.enabled) o += rect(p, tb + H, g.outerX, tr, C.conc);
  // Liquid.
  if (i.liquid.depth > 0) {
    o += rect(p + t, tb, i.lx, i.liquid.depth, C.liquid, C.water, 'fill-opacity="0.55"');
    o += `<text x="${X(p + t + i.lx / 2)}" y="${Y(tb + i.liquid.depth) - 6}" font-size="11" text-anchor="middle" fill="${C.water}">${esc(`▽ liquid ${n2(i.liquid.depth)} m, γ ${n2(i.liquid.gamma)} kN/m³`)}</text>`;
  }
  // Ground and groundwater lines.
  o += `<line x1="${X(-extra)}" y1="${Y(groundY)}" x2="${X(g.baseX + extra)}" y2="${Y(groundY)}" stroke="${C.soilEdge}" stroke-width="1.4"/>`;
  o += `<text x="${X(-extra) + 4}" y="${Y(groundY) - 5}" font-size="11" fill="${C.soilEdge}">Ground</text>`;
  if (i.soil.water > 0) {
    o += `<line x1="${X(-extra)}" y1="${Y(i.soil.water)}" x2="${X(g.baseX + extra)}" y2="${Y(i.soil.water)}" stroke="${C.water}" stroke-width="1.4" stroke-dasharray="7 4"/>`;
    o += `<text x="${X(g.baseX + extra) - 4}" y="${Y(i.soil.water) - 5}" font-size="11" text-anchor="end" fill="${C.water}">${esc(`GWT ${n2(i.soil.water)} m above base underside`)}</text>`;
  }
  // Bars (schematic): wall verticals both faces, base and roof top / bottom.
  const cv = i.cover / 1000;
  for (const x0 of [p, p + t + i.lx]) {
    o += `<line x1="${X(x0 + cv)}" y1="${Y(cv)}" x2="${X(x0 + cv)}" y2="${Y(tb + H + tr - cv)}" stroke="${C.bar}" stroke-width="1.5"/>`;
    o += `<line x1="${X(x0 + t - cv)}" y1="${Y(cv)}" x2="${X(x0 + t - cv)}" y2="${Y(tb + H + tr - cv)}" stroke="${C.bar2}" stroke-width="1.5"/>`;
  }
  o += `<line x1="${X(cv)}" y1="${Y(cv)}" x2="${X(g.baseX - cv)}" y2="${Y(cv)}" stroke="${C.bar}" stroke-width="1.5"/>`;
  o += `<line x1="${X(cv)}" y1="${Y(tb - cv)}" x2="${X(g.baseX - cv)}" y2="${Y(tb - cv)}" stroke="${C.bar2}" stroke-width="1.5"/>`;
  if (i.roof.enabled) {
    o += `<line x1="${X(p + cv)}" y1="${Y(tb + H + cv)}" x2="${X(p + g.outerX - cv)}" y2="${Y(tb + H + cv)}" stroke="${C.bar}" stroke-width="1.5"/>`;
    o += `<line x1="${X(p + cv)}" y1="${Y(tb + H + tr - cv)}" x2="${X(p + g.outerX - cv)}" y2="${Y(tb + H + tr - cv)}" stroke="${C.bar2}" stroke-width="1.5"/>`;
  }
  // Dimensions.
  o += dimH(X(0), X(g.baseX), oy + 22, `${n2(g.baseX)} m`, false);
  o += dimH(X(p + t), X(p + t + i.lx), Y(tb) - 14, `${n2(i.lx)} m inside`);
  o += dimV(X(-extra) - 14, Y(tb), Y(tb + H), `H ${n2(H)} m`);
  o += `<text x="${X(g.baseX) + 6}" y="${Y(tb / 2) + 4}" font-size="11" fill="${C.dim}">${esc(`base ${n2(tb * 1000, 0)} mm`)}</text>`;
  if (i.roof.enabled)
    o += `<text x="${X(p + g.outerX) + 6}" y="${Y(tb + H + tr / 2) + 4}" font-size="11" fill="${C.dim}">${esc(`roof ${n2(tr * 1000, 0)} mm${i.roof.cover > 0 ? `, cover ${n2(i.roof.cover)} m` : ""}`)}</text>`;
  const b = i.bars;
  o += `<text x="20" y="22" font-size="13" font-weight="600" fill="${C.text}">Section along the long side</text>`;
  o += `<text x="20" y="40" font-size="11" fill="${C.bar}">${esc(`Outside / bottom: walls Ø${b.verticalOutside.diameter} @ ${b.verticalOutside.spacing} V, Ø${b.horizontalOutside.diameter} @ ${b.horizontalOutside.spacing} H; base Ø${b.baseBottom.diameter} @ ${b.baseBottom.spacing}${i.roof.enabled ? `; roof Ø${b.roofBottom.diameter} @ ${b.roofBottom.spacing}` : ""}`)}</text>`;
  o += `<text x="20" y="56" font-size="11" fill="${C.bar2}">${esc(`Inside / top: walls Ø${b.verticalInside.diameter} @ ${b.verticalInside.spacing} V, Ø${b.horizontalInside.diameter} @ ${b.horizontalInside.spacing} H; base Ø${b.baseTop.diameter} @ ${b.baseTop.spacing}${i.roof.enabled ? `; roof Ø${b.roofTop.diameter} @ ${b.roofTop.spacing}` : ""}`)}</text>`;
  return svg(width, height, "Tank section", o);
}

export const tankFaceLabels: Record<TankPanelId, Record<TankFace, string>> = {
  long: { frontY: "Vertical, inside face", backY: "Vertical, outside face", frontX: "Horizontal, inside face", backX: "Horizontal, outside face" },
  short: { frontY: "Vertical, inside face", backY: "Vertical, outside face", frontX: "Horizontal, inside face", backX: "Horizontal, outside face" },
  base: { frontY: "y bars, top", backY: "y bars, bottom", frontX: "x bars, top", backX: "x bars, bottom" },
  roof: { frontY: "y bars, bottom", backY: "y bars, top", frontX: "x bars, bottom", backX: "x bars, top" },
};

/** Contour map of one panel's factored design moment for a face. */
export function tankPanelSvg(r: TankResult, panel: TankPanelId, face: TankFace, width = 900, height = 420): string {
  const p = r.panels.find((x) => x.id === panel);
  if (!p) return "";
  const left = 60,
    right = 110,
    topPad = 46,
    bottom = 56;
  const s = Math.min((width - left - right) / p.length, (height - topPad - bottom) / p.height);
  const ox = left + (width - left - right - p.length * s) / 2,
    oy = topPad + p.height * s;
  const X = (x: number) => ox + x * s,
    Y = (y: number) => oy - y * s;
  const nx = Math.min(64, Math.max(20, Math.round(p.length * 5))),
    ny = Math.min(36, Math.max(12, Math.round(p.height * 5)));
  const vals: number[][] = [];
  let vmax = 0;
  for (let a = 0; a < nx; a++) {
    const col: number[] = [];
    for (let b = 0; b < ny; b++) {
      const v = p.field(face, ((a + 0.5) * p.length) / nx, ((b + 0.5) * p.height) / ny);
      col.push(v);
      vmax = Math.max(vmax, v);
    }
    vals.push(col);
  }
  const pk = p.peaks.find((x) => x.face === face);
  if (pk && pk.mu > vmax) vmax = pk.mu;
  let o = "";
  const cw = (p.length * s) / nx,
    ch = (p.height * s) / ny;
  vals.forEach((col, a) =>
    col.forEach((v, b) => {
      o += `<rect x="${(ox + a * cw).toFixed(2)}" y="${(oy - (b + 1) * ch).toFixed(2)}" width="${(cw + 0.4).toFixed(2)}" height="${(ch + 0.4).toFixed(2)}" fill="${rampColor(vmax > 0 ? v / vmax : 0)}"/>`;
    }),
  );
  o += `<rect x="${X(0)}" y="${Y(p.height)}" width="${p.length * s}" height="${p.height * s}" fill="none" stroke="${C.edge}" stroke-width="1.6"/>`;
  const e = p.edges;
  const edgeText = (txt: string, x: number, y: number, anchor = "middle", rot = 0) =>
    `<text x="${x}" y="${y}" font-size="10.5" fill="${C.dim}" text-anchor="${anchor}"${rot ? ` transform="rotate(${rot} ${x} ${y})"` : ""}>${esc(txt)}</text>`;
  const wall = panel === "long" || panel === "short";
  o += edgeText(wall ? `base ${e.base}` : `edge ${e.base}`, X(p.length / 2), Y(0) + 14);
  o += edgeText(wall ? `top ${e.top}` : `edge ${e.top}`, X(p.length / 2), Y(p.height) - 6);
  o += edgeText(`${wall ? "corner" : "edge"} ${e.left}`, X(0) - 8, Y(p.height / 2), "middle", -90);
  o += edgeText(`${wall ? "corner" : "edge"} ${e.right}`, X(p.length) + 12, Y(p.height / 2), "middle", -90);
  if (pk) {
    o += `<circle cx="${X(pk.x)}" cy="${Y(pk.y)}" r="6" fill="none" stroke="#111" stroke-width="1.6"/><line x1="${X(pk.x) - 9}" y1="${Y(pk.y)}" x2="${X(pk.x) + 9}" y2="${Y(pk.y)}" stroke="#111"/><line x1="${X(pk.x)}" y1="${Y(pk.y) - 9}" x2="${X(pk.x)}" y2="${Y(pk.y) + 9}" stroke="#111"/>`;
    const tx = Math.min(Math.max(X(pk.x), left + 150), width - right - 60);
    const ly = Y(pk.y) - 12 < topPad - 2 ? Y(pk.y) + 24 : Y(pk.y) - 12;
    o += `<text x="${tx}" y="${ly}" font-size="11.5" text-anchor="middle" fill="#111" font-weight="600">${esc(`Sd·Mu ${(pk.sd * pk.mu).toFixed(1)} / φMn ${pk.phiMn.toFixed(1)} · DCR ${pk.dcr.toFixed(3)}`)}</text>`;
  }
  const lx = width - right + 28,
    lh = p.height * s;
  for (let k = 0; k < 40; k++)
    o += `<rect x="${lx}" y="${(topPad + (lh * k) / 40).toFixed(1)}" width="14" height="${(lh / 40 + 0.5).toFixed(1)}" fill="${rampColor(1 - k / 40)}"/>`;
  o += `<rect x="${lx}" y="${topPad}" width="14" height="${lh}" fill="none" stroke="${C.dim}"/>`;
  o += `<text x="${lx + 18}" y="${topPad + 10}" font-size="11" fill="${C.text}">${vmax.toFixed(1)}</text><text x="${lx + 18}" y="${topPad + lh}" font-size="11" fill="${C.text}">0</text>`;
  o += `<text x="${left}" y="22" font-size="13" font-weight="600" fill="${C.text}">${esc(`${p.label} · ${tankFaceLabels[panel][face]} · factored Mu (Wood–Armer), kN·m/m`)}</text>`;
  o += `<text x="${left}" y="${height - 12}" font-size="11" fill="${C.dim}">${esc(`${n2(p.length)} × ${n2(p.height)} m (centreline spans)${pk ? ` · governing: ${pk.case}` : ""}`)}</text>`;
  return svg(width, height, "Tank panel moment contours", o);
}
