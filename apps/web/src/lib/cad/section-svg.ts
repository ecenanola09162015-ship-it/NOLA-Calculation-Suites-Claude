/**
 * SVG rendering of the section drawing (preview and PDF figure). Monochrome
 * by default (the office plots with monochrome.ctb); optional layer colours.
 */
import {
  LAYERS,
  dimGeometry,
  displayText,
  type Prim,
  type SectionDrawing,
} from "./column-section-drawing";

/** Screen colours for ACI 1–9 and 30 (7 shown black on white). */
const ACI: Record<number, string> = {
  1: "#e00000",
  2: "#b8a300",
  3: "#00a000",
  4: "#00a0b0",
  5: "#0030e0",
  6: "#c000c0",
  7: "#000000",
  8: "#707070",
  9: "#a0a0a0",
  30: "#e07000",
};
const esc = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

export function sectionDrawingToSvg(
  drawing: SectionDrawing,
  opts: { colour?: boolean; maxWidth?: number } = {},
) {
  const [x0, y0, x1, y1] = drawing.bounds;
  const W = x1 - x0,
    H = y1 - y0;
  // Model → SVG: flip y.
  const X = (x: number) => x - x0,
    Y = (y: number) => y1 - y;
  const ink = (p: Prim) =>
    opts.colour ? (ACI[LAYERS[p.layer].color] ?? "#000") : "#000";
  const stroke = (p: Prim) =>
    p.layer === "S-CONC" ? 3 : p.layer.startsWith("S-REBR") ? 1.6 : 1.1;
  const dash = (p: Prim) =>
    LAYERS[p.layer].lineType === "DASHED"
      ? ' stroke-dasharray="25 12"'
      : LAYERS[p.layer].lineType === "CENTER"
        ? ' stroke-dasharray="60 12 12 12"'
        : "";
  const draw = (p: Prim): string => {
    const c = ink(p);
    switch (p.t) {
      case "poly": {
        let d = "";
        p.v.forEach((v, i) => {
          if (i === 0) d += `M${X(v.p[0])} ${Y(v.p[1])}`;
          const prev = i === 0 ? null : p.v[i - 1]!;
          if (prev) d += seg(prev, v);
        });
        if (p.closed && p.v.length > 2) d += seg(p.v[p.v.length - 1]!, p.v[0]!) + "Z";
        const filled = p.v.length === 3 && p.closed;
        return `<path d="${d}" fill="${filled ? c : "none"}" stroke="${c}" stroke-width="${stroke(p)}"${dash(p)}/>`;
      }
      case "line":
        return `<line x1="${X(p.a[0])}" y1="${Y(p.a[1])}" x2="${X(p.b[0])}" y2="${Y(p.b[1])}" stroke="${c}" stroke-width="${stroke(p)}"${dash(p)}/>`;
      case "disc":
        return `<circle cx="${X(p.c[0])}" cy="${Y(p.c[1])}" r="${p.r}" fill="${c}"/>`;
      case "text": {
        const anchor =
          p.align === "center" ? "middle" : p.align === "right" ? "end" : "start";
        const rot = p.rot ? ` transform="rotate(${-p.rot} ${X(p.p[0])} ${Y(p.p[1])})"` : "";
        return `<text x="${X(p.p[0])}" y="${Y(p.p[1])}" font-size="${p.h * 1.3}" font-family="Arial, Helvetica, sans-serif" text-anchor="${anchor}" fill="${c}"${rot}>${esc(displayText(p.s))}</text>`;
      }
      case "dim":
        return dimGeometry(p).map(draw).join("");
    }
  };
  const seg = (a: { p: [number, number]; bulge?: number }, b: { p: [number, number] }) => {
    if (!a.bulge) return `L${X(b.p[0])} ${Y(b.p[1])}`;
    const chord = Math.hypot(b.p[0] - a.p[0], b.p[1] - a.p[1]);
    const theta = 4 * Math.atan(Math.abs(a.bulge));
    const r = chord / (2 * Math.sin(theta / 2));
    // Positive bulge = counter-clockwise in model = clockwise after y flip.
    const sweep = a.bulge > 0 ? 0 : 1;
    const large = theta > Math.PI ? 1 : 0;
    return `A${r} ${r} 0 ${large} ${sweep} ${X(b.p[0])} ${Y(b.p[1])}`;
  };
  const body = drawing.prims.map(draw).join("");
  const width = opts.maxWidth
    ? ` width="${opts.maxWidth}" height="${Math.round((opts.maxWidth * H) / W)}"`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"${width} preserveAspectRatio="xMidYMid meet"><rect width="${W}" height="${H}" fill="#fff"/>${body}</svg>`;
}
