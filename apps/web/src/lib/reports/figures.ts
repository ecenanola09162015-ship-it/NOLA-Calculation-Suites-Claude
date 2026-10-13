import {
  biaxialContour,
  biaxialSection,
  defaultReportStyle,
  type ReportStyle,
  type TransverseResult,
} from "@nola/calc-core";
import type {
  RectangularColumnInput,
  RectangularColumnResult,
  SlabInput,
  SlabResult,
  SlabResolvedBar,
} from "@nola/calc-core";
import type { ReportFigure } from "./data";
const teal = defaultReportStyle.colors.teal;
const svg = (
  body: string,
  style: ReportStyle = defaultReportStyle,
  w = 250,
  h = 175,
) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${style.colors.white}"/><g font-family="${style.fontFamily.replaceAll('"', "").replaceAll("<", "").replaceAll(">", "")},Arial,sans-serif" font-size="${style.diagramFontSize}" fill="${style.colors.text}">${body}</g></svg>`;
const text = (x: number, y: number, s: string) =>
  `<text x="${x}" y="${y}">${s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</text>`;
const line = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color = teal,
  width = 1,
  dash = "",
) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}" ${dash ? `stroke-dasharray="${dash}"` : ""}/>`;
export function columnFigures(
  i: RectangularColumnInput,
  r: RectangularColumnResult,
  style: ReportStyle = defaultReportStyle,
): ReportFigure[] {
  const { primary: blue, teal, text: ink } = style.colors;
  const scale = 112 / Math.max(i.width, i.depth),
    w = i.width * scale,
    h = i.depth * scale,
    x = 125 - w / 2,
    y = 75 - h / 2,
    c = (i.cover + i.tieDiameter / 2) * scale;
  const section = svg(
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${style.colors.tint}" stroke="${blue}"/><rect x="${x + c}" y="${y + c}" width="${w - 2 * c}" height="${h - 2 * c}" fill="none" stroke="${teal}" stroke-width="${i.tieDiameter * scale}"/>` +
      i.bars
        .map(
          (b) =>
            `<circle cx="${125 + b.x * scale}" cy="${75 - b.y * scale}" r="${(b.diameter * scale) / 2}" fill="${blue}"/>`,
        )
        .join("") +
      text(10, 151, `b=${i.width} mm; h=${i.depth} mm; cover=${i.cover} mm`) +
      text(
        10,
        163,
        `${i.bars.length} Longitudinal Bars; D${i.tieDiameter} Ties`,
      ),
    style,
  );
  const plots = (["x", "y"] as const).map((axis) => {
    const curves = r.curves.filter((c) => c.axis === axis),
      g = r.governing?.load;
    const maxM =
      Math.max(
        1,
        ...curves.flatMap((c) => c.points.map((p) => Math.abs(p.mn))),
        g ? Math.abs(axis === "x" ? g.mx : g.my) : 0,
      ) * 1.05;
    const maxP = Math.max(1, r.p0, g?.pu ?? 0) * 1.05,
      minP = Math.min(0, r.tensionCap / 0.9, g?.pu ?? 0) * 1.05;
    const px = (m: number) => 125 + (m / maxM) * 99,
      py = (p: number) => 142 - ((p - minP) / (maxP - minP)) * 121;
    let body =
      line(26, py(0), 228, py(0), ink) + line(px(0), 18, px(0), 143, ink);
    for (let k = 0; k <= 4; k++) {
      const p = minP + ((maxP - minP) * k) / 4;
      body += text(0, py(p) + 2, p.toFixed(0));
    }
    for (const c of curves)
      for (const nominal of [true, false])
        body += `<polyline points="${c.points.map((p) => `${px((nominal ? p.mn : p.designM) * c.direction).toFixed(2)},${py(nominal ? p.pn : p.designP).toFixed(2)}`).join(" ")}" fill="none" stroke="${nominal ? teal : blue}" stroke-width="${nominal ? 0.7 : 1.4}" ${nominal ? 'stroke-dasharray="3 2"' : ""}/>`;
    if (g)
      body += `<circle cx="${px(axis === "x" ? g.mx : g.my)}" cy="${py(g.pu)}" r="3" fill="${style.colors.gold}" stroke="${ink}"/>`;
    body +=
      text(16, 10, `P (kN) / M${axis} (kN.m)`) +
      text(16, 155, `-${maxM.toFixed(0)}`) +
      text(121, 155, "0") +
      text(205, 155, maxM.toFixed(0)) +
      text(8, 168, "Blue: Design; Dashed: Nominal; Gold: Load");
    return {
      title: `P–M Interaction — ${axis.toUpperCase()} Axis`,
      svg: svg(body, style),
    };
  });
  return [
    { title: "Column Plan / Horizontal Cross-Section", svg: section },
    ...plots,
  ];
}
function extents(i: SlabInput, b: SlabResolvedBar): [number, number][] {
  if (b.group === "main") return [[0, 1]];
  if (b.face === "bottom")
    return [[i.cutoffs.bottomStart, i.cutoffs.bottomEnd]];
  const alongX = (b.direction === "short") === i.lx <= i.ly,
    near = alongX ? "west" : "south",
    far = alongX ? "east" : "north";
  return [
    ...(i.supports[near] === "Fixed"
      ? [[0, i.cutoffs[near]] as [number, number]]
      : []),
    ...(i.supports[far] === "Fixed"
      ? [[1 - i.cutoffs[far], 1] as [number, number]]
      : []),
  ];
}
export function slabFigures(
  i: SlabInput,
  r: SlabResult,
  style: ReportStyle = defaultReportStyle,
): ReportFigure[] {
  const { primary: blue, teal, extra } = style.colors;
  const plans = (["bottom", "top"] as const).map((face) => {
    const scale = Math.min(196 / i.lx, 105 / i.ly),
      w = i.lx * scale,
      h = i.ly * scale,
      x = (250 - w) / 2,
      y = 17;
    let body = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${style.colors.tint}" stroke="${teal}"/>`;
    for (const b of r.bars.filter((b) => b.face === face)) {
      const alongX = (b.direction === "short") === i.lx <= i.ly;
      for (const p of b.positions)
        for (const [a, z] of extents(i, b))
          body += alongX
            ? line(
                x + a * w,
                y + (p / 1000) * scale,
                x + z * w,
                y + (p / 1000) * scale,
                b.group === "main" ? blue : extra,
                0.65,
              )
            : line(
                x + (p / 1000) * scale,
                y + a * h,
                x + (p / 1000) * scale,
                y + z * h,
                b.group === "main" ? blue : extra,
                0.65,
              );
    }
    body +=
      text(
        6,
        138,
        `X=${i.lx} m; Y=${i.ly} m; ${face.toUpperCase()} Reinforcement`,
      ) + text(6, 151, "Blue: Continuous MAIN; Orange: Cut-Off EXTRA");
    body += text(
      6,
      164,
      face === "bottom"
        ? `Extra: ${(i.cutoffs.bottomStart * 100).toFixed(0)}–${(i.cutoffs.bottomEnd * 100).toFixed(0)}% Span`
        : "Top EXTRA At Fixed Supports Only",
    );
    return {
      title:
        face === "bottom" ? "Slab Plan — Bottom Bars" : "Slab Plan — Top Bars",
      svg: svg(body, style),
    };
  });
  const sections = (["short", "long"] as const).map((dir) => {
    const span = (dir === "short" ? r.shortSpan : r.longSpan) * 1000,
      w = 226,
      top = 18,
      h = 28,
      x = 12;
    let body = `<rect x="${x}" y="${top}" width="${w}" height="${h}" fill="${style.colors.tint}" stroke="${teal}"/>`;
    for (const b of r.bars) {
      const color = b.group === "main" ? blue : extra,
        yy = top + h - (b.z / i.h) * h;
      if (b.direction === dir)
        for (const [a, z] of extents(i, b))
          body += line(
            x + a * w,
            yy,
            x + z * w,
            yy,
            color,
            Math.max(0.8, (b.diameter / i.h) * h),
          );
      else
        for (const p of b.positions)
          body += `<circle cx="${x + (p / span) * w}" cy="${yy}" r="${Math.max(0.8, ((b.diameter / i.h) * h) / 2)}" fill="${color}"/>`;
    }
    body +=
      text(
        7,
        11,
        dir === "short" ? "A-A Along Short Span" : "B-B Along Long Span",
      ) +
      text(7, 60, `L=${(span / 1000).toFixed(2)} m; h=${i.h} mm`) +
      text(7, 74, `Cover: Top ${i.topCover}; Bottom ${i.bottomCover} mm`) +
      text(7, 88, "Blue MAIN / Orange EXTRA; z From Soffit");
    return {
      title:
        dir === "short"
          ? "Section A–A — Along Short Span"
          : "Section B–B — Along Long Span",
      svg: svg(body, style, 250, 105),
    };
  });
  const combined = svg(
    `<svg x="0" y="0" width="250" height="105">${sections[0].svg.replace(/^[\s\S]*?<g/, "<g").replace(/<\/svg>$/, "")}</svg><svg x="0" y="105" width="250" height="105">${sections[1].svg.replace(/^[\s\S]*?<g/, "<g").replace(/<\/svg>$/, "")}</svg>`,
    style,
    250,
    210,
  );
  return [...plans, { title: "Sections A–A / B–B", svg: combined }];
}

/** φMnx–φMny contour at the governing Pu (3D strain compatibility). */
export function columnBiaxialFigure(
  i: RectangularColumnInput,
  r: RectangularColumnResult,
  style: ReportStyle = defaultReportStyle,
): ReportFigure | null {
  const g = r.governing;
  if (!g) return null;
  const pts = biaxialContour(biaxialSection(i), g.load.pu, 72);
  if (pts.length < 8) return null;
  const { primary: blue, text: ink } = style.colors;
  const rmax = Math.max(
    1e-9,
    ...pts.map((p) => Math.hypot(p.mx, p.my)),
    Math.hypot(g.mux, g.muy) * 1.1,
  );
  const s = 68 / rmax;
  const X = (v: number) => 125 + v * s,
    Y = (v: number) => 80 - v * s;
  const body =
    line(45, 80, 205, 80, ink, 0.5) +
    line(125, 8, 125, 152, ink, 0.5) +
    `<polygon points="${pts.map((p) => `${X(p.mx).toFixed(2)},${Y(p.my).toFixed(2)}`).join(" ")}" fill="${style.colors.tint}" stroke="${blue}" stroke-width="1.4"/>` +
    (g.biaxial
      ? line(125, 80, X(g.biaxial.mx), Y(g.biaxial.my), ink, 0.6, "2 2")
      : "") +
    `<circle cx="${X(g.mux)}" cy="${Y(g.muy)}" r="3" fill="${style.colors.gold}" stroke="${ink}"/>` +
    text(8, 12, `Pu = ${g.load.pu.toFixed(0)} kN (${g.load.id})`) +
    text(207, 83, "Mx") +
    text(129, 14, "My") +
    text(
      8,
      165,
      `3D DCR ${g.biaxialRatio?.toFixed(3) ?? "-"}; Bresler ${g.bresler.applicable ? (g.bresler.ratio ?? 0).toFixed(3) : "n/a"}`,
    );
  return {
    title: "Biaxial Load Contour At Governing Pu",
    svg: svg(body, style),
  };
}

/** Confinement elevation: lo zones and spacing over the clear height. */
export function columnTieElevationFigure(
  clearHeight: number,
  d: TransverseResult,
  style: ReportStyle = defaultReportStyle,
): ReportFigure {
  const { lo, sEnd, sMid } = d.adopted;
  const ink = style.colors.text,
    end = style.colors.gold,
    H = 130,
    top = 20,
    S = H / clearHeight;
  const Y = (z: number) => top + H - z * S;
  const confined = d.seismic && lo > 0;
  const full = confined && (d.fullHeight || 2 * lo >= clearHeight);
  let body = `<rect x="70" y="${top}" width="40" height="${H}" fill="${style.colors.tint}" stroke="${ink}" stroke-width="0.6"/>`;
  const ties = (a: number, b: number, sp: number, color: string) => {
    const n = Math.max(1, Math.ceil((b - a) / sp));
    for (let k = 0; k <= n; k++) {
      const yy = Y(a + ((b - a) * k) / n);
      body += line(72, yy, 108, yy, color, 0.7);
    }
  };
  if (!confined || full)
    ties(0, clearHeight, confined ? sEnd : sMid, confined ? end : teal);
  else {
    ties(0, lo, sEnd, end);
    ties(lo, clearHeight - lo, sMid, teal);
    ties(clearHeight - lo, clearHeight, sEnd, end);
  }
  body += text(
    120,
    top + 10,
    confined
      ? full
        ? `Full height @ ${sEnd}`
        : `lo ${lo} @ ${sEnd}`
      : `@ ${sMid}`,
  );
  if (confined && !full) {
    body += text(120, top + H / 2, `@ ${sMid}`);
    body += text(120, top + H - 4, `lo ${lo} @ ${sEnd}`);
  }
  body += text(8, top + H / 2, `lu ${clearHeight}`);
  body += text(
    8,
    168,
    `Legs ${d.layout.legsX} x ${d.layout.legsY}; hx ${d.layout.hx.toFixed(0)} mm`,
  );
  return {
    title: confined
      ? "Confinement Zones (Clear Height)"
      : "Tie Spacing (Clear Height)",
    svg: svg(body, style),
  };
}
