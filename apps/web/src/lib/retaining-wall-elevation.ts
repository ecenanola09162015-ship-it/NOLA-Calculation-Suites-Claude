/**
 * Full-width wall elevation (Phase 2) as an SVG string, shared by the
 * workspace and the PDF: L × H stem seen from the front, restraint symbols
 * (end walls, top slab / prop line, base), buttress outlines, and a contour
 * map of the selected design quantity with the governing point marked.
 */
import type { PlateDemandId, RetainingWallInput, RetainingWallResult } from "@nola/calc-core";

export type ElevationField = PlateDemandId | "w";
export const elevationFieldLabels: Record<ElevationField, string> = {
  backY: "Vertical moment, back face (Wood–Armer), kN·m/m",
  frontY: "Vertical moment, front face (Wood–Armer), kN·m/m",
  backX: "Horizontal moment, back face (Wood–Armer), kN·m/m",
  frontX: "Horizontal moment, front face (Wood–Armer), kN·m/m",
  w: "Deflection (factored, gross section), mm",
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** Sequential ramp: pale sand → amber → deep red (≥ 0 demands). */
export function rampColor(t: number) {
  const stops = [
    [250, 246, 236],
    [246, 214, 140],
    [234, 150, 60],
    [204, 76, 40],
    [140, 28, 28],
  ];
  const u = Math.min(1, Math.max(0, t)) * (stops.length - 1),
    k = Math.min(stops.length - 2, Math.floor(u)),
    f = u - k;
  const c = stops[k]!.map((v, j) => Math.round(v + (stops[k + 1]![j]! - v) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export function retainingWallElevationSvg(
  i: RetainingWallInput,
  r: RetainingWallResult,
  kind: ElevationField = "backY",
  width = 900,
  height = 460,
): string {
  const p = r.plate;
  if (!p) return "";
  const L = p.length,
    H = p.height,
    sup = p.supports;
  const left = 60,
    right = 110,
    topPad = 46,
    bottom = 70;
  const s = Math.min((width - left - right) / L, (height - topPad - bottom) / H);
  const ox = left + ((width - left - right) - L * s) / 2,
    oy = topPad + H * s;
  const X = (x: number) => ox + x * s,
    Y = (y: number) => oy - y * s;
  // Contour grid.
  const nx = Math.min(72, Math.max(24, Math.round(L * 6))),
    ny = Math.min(36, Math.max(12, Math.round(H * 6)));
  const vals: number[][] = [];
  let vmax = 0;
  for (let a = 0; a < nx; a++) {
    const col: number[] = [];
    for (let b = 0; b < ny; b++) {
      const v = p.field(kind, ((a + 0.5) * L) / nx, ((b + 0.5) * H) / ny);
      col.push(v);
      vmax = Math.max(vmax, v);
    }
    vals.push(col);
  }
  // Scale the ramp to the governing value so the marked peak and the legend agree.
  const gov = kind === "w" ? null : p.peaks.find((q) => q.id === kind);
  if (gov && gov.demand > vmax) vmax = gov.demand;
  let out = "";
  const cw = (L * s) / nx,
    ch = (H * s) / ny;
  vals.forEach((col, a) =>
    col.forEach((v, b) => {
      out += `<rect x="${(ox + a * cw).toFixed(2)}" y="${(oy - (b + 1) * ch).toFixed(2)}" width="${(cw + 0.4).toFixed(2)}" height="${(ch + 0.4).toFixed(2)}" fill="${rampColor(vmax > 0 ? v / vmax : 0)}"/>`;
    }),
  );
  out += `<rect x="${X(0)}" y="${Y(H)}" width="${L * s}" height="${H * s}" fill="none" stroke="#3d4a55" stroke-width="1.6"/>`;
  // Restraints.
  const hatch = (x0: number, y0: number, w: number, h: number) => {
    let o = `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="#e6e2da" stroke="#3d4a55" stroke-width="1"/>`;
    for (let t = -h; t < w; t += 7)
      o += `<line x1="${x0 + Math.max(0, t)}" y1="${y0 + h - Math.max(0, -t)}" x2="${x0 + Math.min(w, t + h)}" y2="${y0 + h - Math.min(h, t + h)}" stroke="#8a96a3" stroke-width="0.7"/>`;
    return o;
  };
  const edge = (kindE: string, side: "left" | "right" | "top" | "base") => {
    if (kindE === "free") return "";
    const fixed = kindE === "fixed";
    if (side === "base" || side === "top") {
      const y = side === "base" ? Y(0) : Y(H) - 10;
      return fixed
        ? hatch(X(0), y, L * s, 10)
        : Array.from({ length: Math.max(2, Math.round(L)) + 1 }, (_, k) => {
            const x = X((L * k) / Math.max(2, Math.round(L)));
            const yy = side === "base" ? Y(0) : Y(H);
            const d = side === "base" ? 1 : -1;
            return `<path d="M${x} ${yy} l-5 ${8 * d} h10 z" fill="none" stroke="#3d4a55" stroke-width="1"/>`;
          }).join("");
    }
    const x = side === "left" ? X(0) - 12 : X(L);
    return fixed
      ? hatch(x, Y(H), 12, H * s)
      : Array.from({ length: Math.max(2, Math.round(H)) + 1 }, (_, k) => {
          const y = Y((H * k) / Math.max(2, Math.round(H)));
          const xx = side === "left" ? X(0) : X(L);
          const d = side === "left" ? -1 : 1;
          return `<path d="M${xx} ${y} l${8 * d} -5 v10 z" fill="none" stroke="#3d4a55" stroke-width="1"/>`;
        }).join("");
  };
  out += edge(sup.base, "base") + edge(sup.top, "top") + edge(sup.left, "left") + edge(sup.right, "right");
  for (const yp of sup.horizontal)
    out += `<line x1="${X(0)}" y1="${Y(yp)}" x2="${X(L)}" y2="${Y(yp)}" stroke="#3d4a55" stroke-width="1.4" stroke-dasharray="8 4"/><text x="${X(L) + 6}" y="${Y(yp) + 4}" font-size="11" fill="#3d4a55">prop line</text>`;
  i.plate.buttresses.forEach((b, k) => {
    const w = Math.max(3, b.width * s);
    out += `<rect x="${(X(b.x) - w / 2).toFixed(1)}" y="${Y(Math.min(b.height, H)).toFixed(1)}" width="${w.toFixed(1)}" height="${(Math.min(b.height, H) * s).toFixed(1)}" fill="none" stroke="#1f6fb2" stroke-width="1.4" stroke-dasharray="4 2"/>`;
    out += `<text x="${X(b.x)}" y="${Y(Math.min(b.height, H)) - 5}" font-size="10.5" text-anchor="middle" fill="#1f6fb2">B${k + 1}</text>`;
  });
  // Governing point of this field.
  const id = kind === "w" ? null : kind;
  const pk = id ? p.peaks.find((q) => q.id === id) : null;
  if (pk && pk.demand > 0) {
    out += `<circle cx="${X(pk.x)}" cy="${Y(pk.y)}" r="6" fill="none" stroke="#111" stroke-width="1.6"/><line x1="${X(pk.x) - 9}" y1="${Y(pk.y)}" x2="${X(pk.x) + 9}" y2="${Y(pk.y)}" stroke="#111"/><line x1="${X(pk.x)}" y1="${Y(pk.y) - 9}" x2="${X(pk.x)}" y2="${Y(pk.y) + 9}" stroke="#111"/>`;
    const tx = Math.min(Math.max(X(pk.x), left + 120), width - right - 40);
    out += `<text x="${tx}" y="${Math.max(16, Y(pk.y) - 12)}" font-size="11.5" text-anchor="middle" fill="#111" font-weight="600">${esc(`Mu ${pk.demand.toFixed(1)} / φMn ${pk.capacity.toFixed(1)} · DCR ${pk.dcr.toFixed(3)}`)}</text>`;
  }
  // Dimensions.
  out += `<line x1="${X(0)}" y1="${oy + 28}" x2="${X(L)}" y2="${oy + 28}" stroke="#5b6670"/><text x="${X(L / 2)}" y="${oy + 24}" font-size="11.5" text-anchor="middle" fill="#5b6670">L = ${L.toFixed(2)} m</text>`;
  out += `<text x="${X(0) - 22}" y="${Y(H / 2)}" font-size="11.5" text-anchor="middle" fill="#5b6670" transform="rotate(-90 ${X(0) - 22} ${Y(H / 2)})">H = ${H.toFixed(2)} m</text>`;
  // Legend.
  const lx = width - right + 28,
    ly0 = topPad,
    lh = H * s;
  for (let k = 0; k < 40; k++)
    out += `<rect x="${lx}" y="${(ly0 + (lh * k) / 40).toFixed(1)}" width="14" height="${(lh / 40 + 0.5).toFixed(1)}" fill="${rampColor(1 - k / 40)}"/>`;
  out += `<rect x="${lx}" y="${ly0}" width="14" height="${lh}" fill="none" stroke="#5b6670"/>`;
  out += `<text x="${lx + 18}" y="${ly0 + 10}" font-size="11" fill="#24313b">${vmax.toFixed(1)}</text><text x="${lx + 18}" y="${ly0 + lh}" font-size="11" fill="#24313b">0</text>`;
  out += `<text x="${left}" y="22" font-size="13" font-weight="600" fill="#24313b">${esc(`Elevation (front view) · ${elevationFieldLabels[kind]}`)}</text>`;
  out += `<text x="${left}" y="${height - 12}" font-size="11" fill="#5b6670">${esc(`Base ${sup.base}, top ${sup.top}, left ${sup.left}, right ${sup.right}${i.plate.buttresses.length ? `, ${i.plate.buttresses.length} buttress${i.plate.buttresses.length > 1 ? "es" : ""}` : ""} · strength envelope · ${i.plate.averaging === "1m" ? "1 m averaged at peak" : "peak values"}`)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="Century Gothic, Manrope, Arial, sans-serif" role="img" aria-label="Wall elevation with moment contours"><rect width="${width}" height="${height}" fill="#fff"/>${out}</svg>`;
}
