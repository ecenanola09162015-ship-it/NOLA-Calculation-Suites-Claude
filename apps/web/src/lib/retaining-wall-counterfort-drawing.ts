/**
 * Counterfort view (Phase 3) as an SVG string, shared by the workspace and
 * the PDF: side profile of one counterfort with its bars and ties, beside
 * the factored moment and shear along its height against φMn and φVn.
 */
import type { RetainingWallInput, RetainingWallResult } from "@nola/calc-core";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const C = { conc: "#d9d6cf", edge: "#3d4a55", bar: "#c0392b", tie: "#1f6fb2", dim: "#5b6670", demand: "#c0392b", cap: "#1f6fb2", text: "#24313b" };

export function retainingWallCounterfortSvg(i: RetainingWallInput, r: RetainingWallResult, index = 0, width = 900, height = 440): string {
  const c = r.counterforts.find((k) => k.index === index) ?? r.counterforts[0];
  if (!c) return "";
  const cf = i.plate.counterfort,
    H = c.height,
    tf = i.footing,
    heel = i.heel,
    tBase = i.stemBase,
    tTop = i.stemBase + ((i.stemTop - i.stemBase) * H) / i.height,
    reachTop = Math.min(cf.topReach, heel);
  // Profile panel.
  const pw = 330,
    top = 44,
    bottom = 56;
  const spanX = tBase + heel + 0.6,
    spanY = H + tf + 0.2;
  const s = Math.min((pw - 70) / spanX, (height - top - bottom) / spanY);
  const ox = 40,
    oy = height - bottom;
  const X = (x: number) => ox + x * s,
    Y = (y: number) => oy - (y + tf) * s; // y above footing top
  let out = "";
  // Footing (heel part) and stem.
  out += `<rect x="${X(0)}" y="${Y(0)}" width="${(tBase + heel) * s}" height="${tf * s}" fill="${C.conc}" stroke="${C.edge}" stroke-width="1.4"/>`;
  out += `<path d="M${X(0)} ${Y(0)} L${X(0)} ${Y(H)} L${X(tTop)} ${Y(H)} L${X(tBase)} ${Y(0)} Z" fill="${C.conc}" stroke="${C.edge}" stroke-width="1.4"/>`;
  // Counterfort.
  out += `<path d="M${X(tBase)} ${Y(0)} L${X(tBase + heel)} ${Y(0)} L${X(tTop + reachTop)} ${Y(H)} L${X(tTop)} ${Y(H)} Z" fill="#ece8df" stroke="${C.edge}" stroke-width="1.4"/>`;
  // Tension bars along the back edge (cover + tie + db/2).
  const cv = (cf.cover + cf.ties.diameter + cf.tension.diameter / 2) / 1000;
  const p0 = [tBase + heel, 0],
    p1 = [tTop + reachTop, H];
  const L = Math.hypot(p1[0]! - p0[0]!, p1[1]! - p0[1]!),
    dx = (p1[0]! - p0[0]!) / L,
    dy = (p1[1]! - p0[1]!) / L,
    nx = -dy,
    ny = dx;
  const n = nx > 0 ? [-nx, -ny] : [nx, ny];
  const a = [p0[0]! + n[0]! * cv, p0[1]! + n[1]! * cv],
    e = [p1[0]! + n[0]! * cv - dx * cv, p1[1]! + n[1]! * cv - dy * cv];
  const yHook = -tf + (i.cover.footingBottom + 25) / 1000;
  out += `<path d="M${X(a[0]! - 0.3)} ${Y(yHook)} L${X(a[0]!)} ${Y(yHook)} L${X(a[0]!)} ${Y(a[1]!)} L${X(e[0]!)} ${Y(e[1]!)}" fill="none" stroke="${C.bar}" stroke-width="2.2"/>`;
  // Horizontal ties (schematic at spacing, capped for legibility).
  const step = Math.max(cf.ties.spacing / 1000, H / 24);
  for (let y = step / 2; y < H; y += step) {
    const xe = tBase + heel + ((tTop + reachTop - tBase - heel) * y) / H - cv;
    out += `<line x1="${X(0.05)}" y1="${Y(y)}" x2="${X(xe)}" y2="${Y(y)}" stroke="${C.tie}" stroke-width="0.9"/>`;
  }
  // Vertical heel ties.
  const hs = Math.max(cf.heelTies.spacing / 1000, heel / 14);
  for (let x = tBase + hs / 2; x < tBase + heel - 0.05; x += hs) {
    const yTopEdge = (H * (tBase + heel - x)) / Math.max(tBase + heel - tTop - reachTop, 1e-6);
    out += `<line x1="${X(x)}" y1="${Y(-tf + 0.06)}" x2="${X(x)}" y2="${Y(Math.min(H, yTopEdge) * 0.35)}" stroke="${C.tie}" stroke-width="0.9" stroke-dasharray="3 2"/>`;
  }
  out += `<text x="${X(tBase + heel / 2)}" y="${Y(-tf) + 18}" font-size="11" text-anchor="middle" fill="${C.dim}">heel ${heel.toFixed(2)} m</text>`;
  out += `<text x="${X(tTop + reachTop) + 6}" y="${Y(H) + 4}" font-size="11" fill="${C.dim}">top reach ${reachTop.toFixed(2)} m</text>`;
  out += `<text x="${X(0) - 8}" y="${Y(H / 2)}" font-size="11" text-anchor="middle" fill="${C.dim}" transform="rotate(-90 ${X(0) - 8} ${Y(H / 2)})">h = ${H.toFixed(2)} m</text>`;
  out += `<text x="${ox}" y="22" font-size="13" font-weight="600" fill="${C.text}">${esc(`Counterfort B${c.index + 1} · x = ${c.x.toFixed(2)} m · bw ${c.bw.toFixed(0)} mm`)}</text>`;
  out += `<text x="${ox}" y="${height - 14}" font-size="11" fill="${C.text}">${esc(`${cf.tension.count} Ø${cf.tension.diameter} back edge · ties Ø${cf.ties.diameter} @ ${cf.ties.spacing} · heel ties Ø${cf.heelTies.diameter} @ ${cf.heelTies.spacing}`)}</text>`;

  // Diagrams.
  const panel = (x0: number, w: number, title: string, rows: { y: number; d: number; c: number }[], unit: string) => {
    const dmax = Math.max(1e-9, ...rows.map((q) => Math.max(q.d, q.c)));
    const sx = (w - 20) / dmax;
    const PX = (v: number) => x0 + v * sx,
      PY = (y: number) => Y(y);
    let o = `<line x1="${x0}" y1="${PY(0)}" x2="${x0}" y2="${PY(H)}" stroke="${C.edge}"/><line x1="${x0}" y1="${PY(0)}" x2="${x0 + w - 10}" y2="${PY(0)}" stroke="${C.edge}"/>`;
    const path = (f: (q: { y: number; d: number; c: number }) => number) => rows.map((q, k) => `${k ? "L" : "M"}${PX(f(q)).toFixed(1)} ${PY(q.y).toFixed(1)}`).join(" ");
    o += `<path d="${path((q) => q.d)} L${x0} ${PY(H)}" fill="none" stroke="${C.demand}" stroke-width="2"/>`;
    o += `<path d="${path((q) => q.c)}" fill="none" stroke="${C.cap}" stroke-width="1.6" stroke-dasharray="6 3"/>`;
    o += `<text x="${x0}" y="${top - 8}" font-size="12" font-weight="600" fill="${C.text}">${esc(title)}</text>`;
    o += `<text x="${x0 + w - 10}" y="${PY(0) + 16}" font-size="10.5" text-anchor="end" fill="${C.dim}">${dmax.toFixed(0)} ${esc(unit)}</text>`;
    return o;
  };
  const rows = c.stations;
  const gx = pw + 30,
    gw = (width - gx - 20) / 2;
  out += panel(gx, gw - 20, "Mu (solid) vs φMn (dashed)", rows.map((q) => ({ y: q.y, d: q.mu, c: q.phiMn })), "kN·m");
  out += panel(gx + gw + 10, gw - 20, "Vu,eff (solid) vs φVn (dashed)", rows.map((q) => ({ y: q.y, d: q.vuEff, c: q.phiVn })), "kN");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="Century Gothic, Manrope, Arial, sans-serif" role="img" aria-label="Counterfort profile and actions"><rect width="${width}" height="${height}" fill="#fff"/>${out}</svg>`;
}
