/**
 * Base plate drawings (plan, Section A-A along Y, Section B-B along X) as SVG
 * strings — one source for the workspace Layout tab and the PDF report.
 * True scale per drawing; schematic, not fabrication details.
 */
import {
  basePlateColumnDims,
  basePlateColumnRects,
  basePlateRods,
  basePlateStiffening,
  heavyHexAcrossFlats,
  isCastIn,
  type BasePlateInput,
  type ComboResult,
} from "@nola/calc-core";

/** Palette A "Engineering" (user decision 17 Oct 2026): one meaning per colour. */
const C = {
  concrete: "#eef0f2",
  concreteEdge: "#8a949e",
  aggregate: "#b9c0c7",
  grout: "#d9dde1",
  plate: "#a9c1d9",
  plateEdge: "#173a5e",
  steel: "#24476b",
  web: "#6f8fb0",
  hssFace: "#c9d7e6",
  nut: "#2b3440",
  washer: "#7c8a99",
  weld: "#e67e00",
  rod: "#111111",
  tension: "#d32f2f",
  bearing: "#f2b400",
  dim: "#5b6670",
  cut: "#00897b",
  load: "#1565c0",
  text: "#1b2733",
  white: "#ffffff",
};
/** Screen-only alternative (palette B "Blueprint"); the PDF always uses A. */
const BLUEPRINT: Record<keyof typeof C, string> = {
  concrete: "#16324f",
  concreteEdge: "#7fa7cf",
  aggregate: "#2c5379",
  grout: "#22476d",
  plate: "#2f6aa3",
  plateEdge: "#e6f1ff",
  steel: "#cfe3f7",
  web: "#9cc3ea",
  hssFace: "#3d79b3",
  nut: "#e6f1ff",
  washer: "#9cc3ea",
  weld: "#ffb347",
  rod: "#ffffff",
  tension: "#ff6b6b",
  bearing: "#ffd166",
  dim: "#a9c7e6",
  cut: "#7ee0c9",
  load: "#ffd166",
  text: "#eaf3ff",
  white: "#0d2238",
};
export const basePlateDrawingStyles = ["engineering", "blueprint"] as const;
export type BasePlateDrawingStyle = (typeof basePlateDrawingStyles)[number];
/** Recolour a generated drawing (every colour comes from C, so a map is exact). */
export function applyDrawingStyle(svg: string, style: BasePlateDrawingStyle) {
  if (style === "engineering") return svg;
  const keys = Object.keys(C) as (keyof typeof C)[];
  let out = svg;
  keys.forEach((k, n) => (out = out.split(C[k]).join(`@@${n}@@`)));
  keys.forEach((k, n) => (out = out.split(`@@${n}@@`).join(BLUEPRINT[k])));
  return out.replaceAll("#9a5b00", BLUEPRINT.bearing);
}
/** Line weights: heavy (steel outlines), medium (concrete), light (dimensions). */
const W = { heavy: 1.6, medium: 1.0, light: 0.6 };
const esc = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const nn = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
const n1 = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1));
const T = (
  x: number,
  y: number,
  s: string,
  o: {
    size?: number;
    anchor?: string;
    fill?: string;
    bold?: boolean;
    rotate?: number;
  } = {},
) =>
  `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${o.size ?? 9}" text-anchor="${o.anchor ?? "middle"}" fill="${o.fill ?? C.text}"${o.bold ? ' font-weight="700"' : ""}${o.rotate ? ` transform="rotate(${o.rotate} ${x.toFixed(1)} ${y.toFixed(1)})"` : ""}>${esc(s)}</text>`;
const L = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  stroke = C.dim,
  w = 0.8,
  dash = "",
) =>
  `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${stroke}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
const R = (
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  stroke = "none",
  sw = 0.8,
  extra = "",
) =>
  `<rect x="${Math.min(x, x + w).toFixed(1)}" y="${Math.min(y, y + h).toFixed(1)}" width="${Math.abs(w).toFixed(1)}" height="${Math.abs(h).toFixed(1)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${extra}/>`;
const Ci = (
  x: number,
  y: number,
  r: number,
  fill: string,
  stroke = "none",
  sw = 0.8,
  extra = "",
) =>
  `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${Math.max(r, 0.5).toFixed(1)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${extra}/>`;
const defs = `<defs><marker id="bpArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${C.load}"/></marker><marker id="bpTick" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M2,8 L8,2" stroke="${C.dim}" stroke-width="1.6"/></marker><pattern id="bpHatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="${C.bearing}" stroke-width="2"/></pattern><pattern id="bpConcrete" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="${C.concrete}"/><circle cx="3" cy="4" r="0.7" fill="${C.aggregate}"/><circle cx="11" cy="2.5" r="0.5" fill="${C.aggregate}"/><circle cx="8" cy="10" r="0.8" fill="${C.aggregate}"/><circle cx="14" cy="13" r="0.5" fill="${C.aggregate}"/><path d="M2,13 l1.6,-1 l0.6,1.6 z" fill="${C.aggregate}"/><path d="M12,7 l1.4,0.4 l-0.8,1.2 z" fill="${C.aggregate}"/></pattern><pattern id="bpSteelCut" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="${C.plate}"/><line x1="0" y1="0" x2="0" y2="5" stroke="${C.plateEdge}" stroke-width="0.7"/></pattern></defs>`;
const wrap = (w: number, h: number, title: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="Arial,Helvetica,sans-serif">${defs}<rect width="${w}" height="${h}" fill="${C.white}"/>${T(w / 2, 16, title, { size: 11, bold: true })}${body}</svg>`;
/** Dimension line with ticks and centred text (horizontal or vertical). */
function dim(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  label: string,
  side = -1,
) {
  const v = Math.abs(x1 - x2) < 0.01;
  const mk = ' marker-start="url(#bpTick)" marker-end="url(#bpTick)"';
  const ln = `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${C.dim}" stroke-width="${W.light}"${mk}/>`;
  return v
    ? ln +
        T(x1 + side * 4, (y1 + y2) / 2, label, {
          size: 8,
          rotate: -90,
          fill: C.dim,
        })
    : ln +
        T((x1 + x2) / 2, y1 + (side < 0 ? -3 : 9), label, {
          size: 8,
          fill: C.dim,
        });
}
const arrow = (x1: number, y1: number, x2: number, y2: number, w = 1.8) =>
  `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${C.load}" stroke-width="${w}" marker-end="url(#bpArrow)"/>`;

/** Plan view: pedestal, plate, column, weld, rods/holes/washers, DG1 lines, bearing zone. */
export function basePlatePlanSvg(
  i: BasePlateInput,
  combo?: ComboResult | null,
  w = 420,
  h = 400,
) {
  const rods = basePlateRods(i);
  const p = i.pedestal,
    a = i.anchors;
  const m = 58;
  const s = Math.min((w - 2 * m) / p.px, (h - 2 * m - 10) / p.py);
  const cx = w / 2,
    cy = h / 2 + 6;
  const X = (x: number) => cx + x * s,
    Y = (y: number) => cy - y * s;
  let b = "";
  b += R(
    X(-p.px / 2),
    Y(p.py / 2),
    p.px * s,
    p.py * s,
    "url(#bpConcrete)",
    C.concreteEdge,
    W.medium,
  );
  b += R(
    X(-i.plate.bx / 2),
    Y(i.plate.by / 2),
    i.plate.bx * s,
    i.plate.by * s,
    C.plate,
    C.plateEdge,
    W.heavy,
  );
  // Bearing zone of the selected combination (DG1 uniform block).
  if (combo && combo.case !== "uplift" && combo.case !== "no-solution") {
    const bx = i.plate.bx,
      by = i.plate.by;
    let zx0 = -bx / 2,
      zx1 = bx / 2,
      zy0 = -by / 2,
      zy1 = by / 2;
    for (const ax of combo.axes) {
      if (ax.case === "axial") continue;
      const yz = Math.min(ax.y, ax.axis === "y" ? by : bx);
      if (combo.case === "biaxial-small") {
        const ex = combo.ex,
          ey = combo.ey;
        if (ax.axis === "x") {
          zx0 = ex - yz / 2;
          zx1 = ex + yz / 2;
        } else {
          zy0 = ey - yz / 2;
          zy1 = ey + yz / 2;
        }
      } else if (ax.axis === "y") {
        if (ax.sign > 0) zy0 = by / 2 - yz;
        else zy1 = -by / 2 + yz;
      } else if (ax.sign > 0) zx0 = bx / 2 - yz;
      else zx1 = -bx / 2 + yz;
    }
    b += R(
      X(zx0),
      Y(zy1),
      (zx1 - zx0) * s,
      (zy1 - zy0) * s,
      "url(#bpHatch)",
      C.bearing,
      0.8,
      ' fill-opacity="0.55"',
    );
  }
  // DG1 critical sections (0.95d / 0.80bf / 0.80D).
  const dims = basePlateColumnDims(i);
  const ex = (dims.kx * dims.x) / 2,
    ey = (dims.ky * dims.y) / 2;
  for (const sx of [-1, 1])
    b += L(
      X(sx * ex),
      Y(i.plate.by / 2),
      X(sx * ex),
      Y(-i.plate.by / 2),
      C.cut,
      0.6,
      "4 3",
    );
  for (const sy of [-1, 1])
    b += L(
      X(-i.plate.bx / 2),
      Y(sy * ey),
      X(i.plate.bx / 2),
      Y(sy * ey),
      C.cut,
      0.6,
      "4 3",
    );
  // Column and weld.
  if (i.column.family === "HSS-ROUND") {
    b += Ci(X(0), Y(0), (i.column.d / 2) * s, "none", C.weld, 2.2);
    b += Ci(
      X(0),
      Y(0),
      (i.column.d / 2 - i.column.tf / 2) * s,
      "none",
      C.steel,
      Math.max(i.column.tf * s, 1),
    );
  } else if (i.column.family === "HSS-RECT") {
    const r = basePlateColumnRects(i)[0]!;
    const t = i.column.tf;
    b += R(
      X(r.x0),
      Y(r.y1),
      (r.x1 - r.x0) * s,
      (r.y1 - r.y0) * s,
      C.steel,
      C.weld,
      1.6,
    );
    b += R(
      X(r.x0 + t),
      Y(r.y1 - t),
      (r.x1 - r.x0 - 2 * t) * s,
      (r.y1 - r.y0 - 2 * t) * s,
      C.plate,
    );
  } else
    for (const r of basePlateColumnRects(i))
      b += R(
        X(r.x0),
        Y(r.y1),
        (r.x1 - r.x0) * s,
        (r.y1 - r.y0) * s,
        C.steel,
        C.weld,
        1.2,
      );
  // Stiffeners (top view: ts × length, fillets both sides).
  const st = basePlateStiffening(i);
  for (const pl of st?.plates ?? []) {
    const t = i.stiffeners.t;
    const [x0, x1, y0, y1] =
      pl.axis === "x"
        ? [pl.side * pl.root, pl.side * pl.tip, pl.pos - t / 2, pl.pos + t / 2]
        : [pl.pos - t / 2, pl.pos + t / 2, pl.side * pl.root, pl.side * pl.tip];
    b += R(
      X(Math.min(x0, x1)),
      Y(Math.max(y0, y1)),
      Math.abs(x1 - x0) * s,
      Math.abs(y1 - y0) * s,
      C.steel,
      C.weld,
      1.2,
    );
    const lx = pl.axis === "x" ? (x0 + x1) / 2 : x1,
      ly = pl.axis === "x" ? y1 : (y0 + y1) / 2;
    b += T(X(lx) + (pl.axis === "y" ? 3 : 0), Y(ly) - 3, pl.id, {
      size: 7,
      anchor: pl.axis === "y" ? "start" : "middle",
      fill: C.steel,
      bold: true,
    });
  }
  // Rods, holes, washers.
  rods.forEach((r, k) => {
    const t = combo?.rodTension[k] ?? 0;
    const ws = a.washer.size * s;
    b += R(
      X(r.x) - ws / 2,
      Y(r.y) - ws / 2,
      ws,
      ws,
      "none",
      C.dim,
      0.6,
      ' stroke-dasharray="2 1.5"',
    );
    b += Ci(X(r.x), Y(r.y), (a.hole / 2) * s, C.white, C.plateEdge, 0.7);
    b += Ci(X(r.x), Y(r.y), (a.da / 2) * s, t > 0 ? C.tension : C.rod);
    b += T(X(r.x) + ws / 2 + 2, Y(r.y) - ws / 2, r.id, {
      size: 7,
      anchor: "start",
      fill: C.dim,
    });
    if (t > 0)
      b += T(X(r.x), Y(r.y) + ws / 2 + 9, `${(t / 1e3).toFixed(1)} kN`, {
        size: 7.5,
        fill: C.tension,
        bold: true,
      });
  });
  // Dimensions.
  const top = Y(p.py / 2) - 10,
    bottom = Y(-p.py / 2) + 12;
  b += dim(
    X(-i.plate.bx / 2),
    Y(i.plate.by / 2) - 8,
    X(i.plate.bx / 2),
    Y(i.plate.by / 2) - 8,
    `Bx ${n1(i.plate.bx)}`,
  );
  b += dim(
    X(-p.px / 2),
    top - 10,
    X(p.px / 2),
    top - 10,
    `Pedestal ${n1(p.px)}`,
  );
  b += dim(
    (X(i.plate.bx / 2) + X(p.px / 2)) / 2,
    Y(i.plate.by / 2),
    (X(i.plate.bx / 2) + X(p.px / 2)) / 2,
    Y(-i.plate.by / 2),
    `By ${n1(i.plate.by)}`,
    1,
  );
  b += dim(
    X(p.px / 2) + 14,
    Y(p.py / 2),
    X(p.px / 2) + 14,
    Y(-p.py / 2),
    `Pedestal ${n1(p.py)}`,
    1,
  );
  // Distinct rod lines (custom points within 0.5 mm share a line).
  const lines = (v: number[]) =>
    [...v]
      .sort((u, w) => u - w)
      .filter((u, k, arr) => k === 0 || u - arr[k - 1]! > 0.5);
  const xs = lines(rods.map((r) => r.x)),
    ys = lines(rods.map((r) => r.y));
  const custom = a.layout === "custom";
  if (custom) {
    // Chain of actual distances between rod lines.
    for (let k = 1; k < xs.length; k++)
      b += dim(
        X(xs[k - 1]!),
        bottom,
        X(xs[k]!),
        bottom,
        n1(xs[k]! - xs[k - 1]!),
        1,
      );
    for (let k = 1; k < ys.length; k++)
      b += dim(
        X(-p.px / 2) - 12,
        Y(ys[k - 1]!),
        X(-p.px / 2) - 12,
        Y(ys[k]!),
        n1(ys[k]! - ys[k - 1]!),
      );
  } else if (xs.length > 1)
    b += dim(X(xs[0]!), bottom, X(xs[1]!), bottom, `sx ${n1(a.sx)}`, 1);
  b += dim(
    X(-p.px / 2),
    bottom,
    X(xs[0]!),
    bottom,
    `c ${n1(p.px / 2 + xs[0]!)}`,
    1,
  );
  if (!custom && ys.length > 1)
    b += dim(
      X(-p.px / 2) - 12,
      Y(ys[0]!),
      X(-p.px / 2) - 12,
      Y(ys[1]!),
      `sy ${n1(a.sy)}`,
    );
  // Section cuts and axes.
  b += L(X(0), top + 2, X(0), bottom - 2, C.cut, 0.7, "10 3 2 3");
  b +=
    T(X(0) + 7, top + 10, "A", { size: 10, bold: true, fill: C.cut }) +
    T(X(0) + 7, bottom - 4, "A", { size: 10, bold: true, fill: C.cut });
  b += L(X(-p.px / 2) + 2, Y(0), X(p.px / 2) - 2, Y(0), C.cut, 0.7, "10 3 2 3");
  b +=
    T(X(-p.px / 2) + 8, Y(0) - 4, "B", { size: 10, bold: true, fill: C.cut }) +
    T(X(p.px / 2) - 8, Y(0) - 4, "B", { size: 10, bold: true, fill: C.cut });
  const ox = 18,
    oy = h - 18;
  b += arrow(ox, oy, ox + 26, oy, 1.2) + arrow(ox, oy, ox, oy - 26, 1.2);
  b +=
    T(ox + 32, oy + 3, "X", { size: 9, bold: true }) +
    T(ox, oy - 30, "Y", { size: 9, bold: true });
  b += T(
    w - 8,
    h - 8,
    `${i.column.designation}${i.rotation === 90 ? " (90°)" : ""} · ${rods.length} × ${a.sizeId} ${a.specId}`,
    { size: 8, anchor: "end", fill: C.dim },
  );
  return wrap(w, h, `PLAN${combo ? ` — ${combo.load.id}` : ""}`, b);
}

/** Elevation section along one axis: "A" along Y (Mx, Vy), "B" along X (My, Vx). */
export function basePlateSectionSvg(
  i: BasePlateInput,
  cut: "A" | "B",
  combo?: ComboResult | null,
  w = 420,
  h = 330,
) {
  const along = cut === "A" ? "y" : "x";
  const rods = basePlateRods(i);
  const a = i.anchors,
    p = i.pedestal;
  const N = along === "y" ? i.plate.by : i.plate.bx;
  const P = along === "y" ? p.py : p.px;
  const dims = basePlateColumnDims(i);
  const colW = along === "y" ? dims.y : dims.x;
  const st = basePlateStiffening(i);
  const stub = Math.max(
    Math.min(Math.max(colW * 0.9, 220), 450),
    st ? i.stiffeners.hc + 60 : 0,
  );
  const below = Math.min(a.hef + 120, p.height);
  const totalH =
    stub + a.washer.thickness + i.plate.tp + i.grout.thickness + below;
  const m = 52;
  const s = Math.min((w - 2 * m) / P, (h - 2 * m) / totalH);
  const cx = w / 2;
  const top = (h - totalH * s) / 2 + 8;
  const X = (u: number) => cx + u * s;
  const zPlateTop = top + stub * s;
  const zPlateBot = zPlateTop + i.plate.tp * s;
  const zConc = zPlateBot + i.grout.thickness * s;
  const zBottom = zConc + below * s;
  let b = "";
  // Concrete with break line, grout, plate.
  b += R(
    X(-P / 2),
    zConc,
    P * s,
    below * s,
    "url(#bpConcrete)",
    C.concreteEdge,
    W.medium,
  );
  b += `<path d="M${X(-P / 2) - 3},${zBottom} l${(P * s) / 4},-6 l8,12 l${(P * s) / 2 - 8},-10 l${(P * s) / 4 + 6},4" fill="none" stroke="${C.concreteEdge}" stroke-width="0.8"/>`;
  b += R(
    X(-N / 2 - 15),
    zPlateBot,
    (N + 30) * s,
    i.grout.thickness * s,
    C.grout,
    C.concreteEdge,
    0.6,
  );
  b += R(
    X(-N / 2),
    zPlateTop,
    N * s,
    i.plate.tp * s,
    "url(#bpSteelCut)",
    C.plateEdge,
    W.heavy,
  );
  // Bearing block (combination).
  const ax = combo?.axes.find((q) => q.axis === along);
  if (combo && ax && combo.case !== "uplift" && combo.case !== "no-solution") {
    const yz = ax.case === "axial" ? N : Math.min(ax.y, N);
    let u0 = -N / 2,
      u1 = N / 2;
    if (combo.case === "biaxial-small") {
      const e = along === "y" ? combo.ey : combo.ex;
      u0 = e - yz / 2;
      u1 = e + yz / 2;
    } else if (ax.case !== "axial") {
      if (ax.sign > 0) u0 = N / 2 - yz;
      else u1 = -N / 2 + yz;
    }
    const bh = 18;
    b += R(
      X(u0),
      zConc,
      (u1 - u0) * s,
      bh,
      "url(#bpHatch)",
      C.bearing,
      0.8,
      ' fill-opacity="0.6"',
    );
    b +=
      T(X((u0 + u1) / 2), zConc + bh + 10, `fp ${combo.fp.toFixed(2)} MPa`, {
        size: 7.5,
        fill: "#9a5b00",
      }) +
      T(X((u0 + u1) / 2), zConc + bh + 19, `Y ${n1(yz)}`, {
        size: 7.5,
        fill: "#9a5b00",
      });
  }
  // Column stub: walls / flanges as dark strips, web lighter.
  const t = i.column.tf;
  const showsFlanges =
    i.column.family === "I" ? (along === "y") === dims.flangesFaceY : true;
  if (i.column.family === "I" && showsFlanges) {
    b += R(
      X(-colW / 2 + t),
      top,
      (colW - 2 * t) * s,
      stub * s,
      C.web,
      C.steel,
      0.6,
    );
    b +=
      R(X(-colW / 2), top, t * s, stub * s, C.steel) +
      R(X(colW / 2 - t), top, t * s, stub * s, C.steel);
  } else if (i.column.family === "I") {
    b += R(X(-colW / 2), top, colW * s, stub * s, C.web, C.steel, 0.6);
    b += R(X(-i.column.tw / 2), top, i.column.tw * s, stub * s, C.steel);
  } else {
    b += R(X(-colW / 2), top, colW * s, stub * s, C.hssFace, C.steel, 0.6);
    b +=
      R(X(-colW / 2), top, t * s, stub * s, C.steel) +
      R(X(colW / 2 - t), top, t * s, stub * s, C.steel);
  }
  // Stiffeners in the plane of the section (cut: hatched) or beyond it.
  for (const pl of st?.plates ?? []) {
    if (pl.axis !== along) continue;
    const sf = i.stiffeners;
    const u = (v: number) => X(pl.side * v);
    const z = (hgt: number) => zPlateTop - hgt * s;
    const cutHere = Math.abs(pl.pos) <= sf.t / 2 + 1e-6;
    b += `<path d="M${u(pl.root + sf.clip).toFixed(1)},${z(0).toFixed(1)} L${u(pl.tip).toFixed(1)},${z(0).toFixed(1)} L${u(pl.tip).toFixed(1)},${z(sf.he).toFixed(1)} L${u(pl.root).toFixed(1)},${z(sf.hc).toFixed(1)} L${u(pl.root).toFixed(1)},${z(sf.clip).toFixed(1)} Z" fill="${cutHere ? "url(#bpSteelCut)" : C.hssFace}" stroke="${C.steel}" stroke-width="${cutHere ? W.heavy : W.light}"${cutHere ? "" : ' stroke-dasharray="3 2"'}/>`;
    if (cutHere && pl.side > 0)
      b += T(
        u(pl.tip) + 3,
        z(sf.he) - 5,
        `${pl.id} ${nn(sf.t)} × ${nn(sf.hc)}/${nn(sf.he)}`,
        {
          size: 7.5,
          anchor: "start",
          fill: C.steel,
          bold: true,
        },
      );
  }
  const wl = Math.max(i.weld.size * s, 2);
  b += `<path d="M${X(-colW / 2)},${zPlateTop} l${-wl},0 l${wl},${-wl} z M${X(colW / 2)},${zPlateTop} l${wl},0 l${-wl},${-wl} z" fill="${C.weld}"/>`;
  // Rods at distinct positions along the cut.
  const coords = [
    ...new Set(rods.map((r) => (along === "y" ? r.y : r.x))),
  ].sort((u, v) => u - v);
  const F = heavyHexAcrossFlats(a.da);
  for (const u of coords) {
    const idx = rods
      .map((r, k) => ((along === "y" ? r.y : r.x) === u ? k : -1))
      .filter((k) => k >= 0);
    const tt = combo
      ? Math.max(...idx.map((k) => combo.rodTension[k] ?? 0))
      : 0;
    const col = tt > 0 ? C.tension : C.rod;
    const xr = X(u);
    const zTip = zConc + a.hef * s;
    b += R(
      xr - (a.da / 2) * s,
      zPlateTop - (a.washer.thickness + 0.9 * a.da) * s,
      a.da * s,
      (a.washer.thickness +
        0.9 * a.da +
        i.plate.tp +
        i.grout.thickness +
        a.hef) *
        s +
        2,
      col,
    );
    b += R(
      xr - (a.washer.size / 2) * s,
      zPlateTop - a.washer.thickness * s,
      a.washer.size * s,
      a.washer.thickness * s,
      C.washer,
      C.steel,
      0.5,
    );
    b += R(
      xr - (F / 2) * s,
      zPlateTop - (a.washer.thickness + 0.9 * a.da) * s,
      F * s,
      0.9 * a.da * s,
      C.nut,
      C.steel,
      0.5,
    );
    // Weak base (DG1 Fig. 6-1): UT reduced shank over Lstretch below the
    // concrete surface, and a leveling nut under the plate.
    if (i.seismic.active && i.seismic.baseType === "weak") {
      const dr = Math.min(i.seismic.ut.dReduced, a.da);
      const z1 = zConc + 1.5 * a.da * s;
      const ls = Math.min(i.seismic.ut.lStretch, a.hef - 3 * a.da) * s;
      const side = ((a.da - dr) / 2) * s;
      b += R(xr - (a.da / 2) * s, z1, side, ls, C.concrete);
      b += R(xr + (a.da / 2) * s - side, z1, side, ls, C.concrete);
      b += R(
        xr - (F / 2) * s,
        zPlateBot,
        F * s,
        Math.min(0.9 * a.da, i.grout.thickness) * s,
        C.nut,
        C.steel,
        0.5,
      );
      if (u === coords[coords.length - 1])
        b += T(
          xr + 6,
          z1 + ls / 2,
          `UT d ${n1(dr)}, L ${n1(i.seismic.ut.lStretch)}`,
          {
            size: 7.5,
            anchor: "start",
            fill: C.dim,
          },
        );
    }
    if (a.kind === "cast-in-hooked-bolt") {
      const dir = u <= 0 ? 1 : -1;
      b += `<path d="M${xr},${zTip} q0,${(2 * a.da * s).toFixed(1)} ${(dir * 2 * a.da * s).toFixed(1)},${(2 * a.da * s).toFixed(1)} l${(dir * a.eh * s).toFixed(1)},0" fill="none" stroke="${col}" stroke-width="${Math.max(a.da * s, 1.4).toFixed(1)}"/>`;
    } else if (isCastIn(a.kind))
      b += R(
        xr - (F / 2) * s,
        zTip,
        F * s,
        0.9 * a.da * s,
        C.nut,
        C.steel,
        0.5,
      );
    else if (a.kind === "adhesive")
      b += R(
        xr - a.da * 0.65 * s,
        zConc,
        a.da * 1.3 * s,
        a.hef * s,
        "#f2c94c",
        "none",
        0,
        ' fill-opacity="0.55"',
      );
    else
      b += `<path d="M${xr - (a.da / 2) * s},${zTip} l${-0.3 * a.da * s},${-3 * a.da * s} M${xr + (a.da / 2) * s},${zTip} l${0.3 * a.da * s},${-3 * a.da * s}" stroke="${col}" stroke-width="1.2"/>`;
    if (tt > 0)
      b += T(
        xr,
        zPlateTop - (a.washer.thickness + a.da) * s - 4,
        `T ${(tt / 1e3).toFixed(1)} kN`,
        { size: 7.5, fill: C.tension, bold: true },
      );
  }
  // Shear lug.
  if (
    i.shear.method === "lug" &&
    (i.shear.lug.orientation === "cross" ||
      (i.shear.lug.orientation === "x") === (along === "x"))
  ) {
    const lt = i.shear.lug.thickness;
    b += R(
      X(-lt / 2),
      zPlateBot,
      lt * s,
      (i.grout.thickness + i.shear.lug.depth) * s,
      C.steel,
      C.plateEdge,
      0.6,
    );
  }
  // Loads.
  if (combo) {
    const l = combo.load;
    const pu = l.pu,
      v = along === "y" ? l.vy : l.vx,
      mm = along === "y" ? l.mx : l.my;
    const tx = X(0);
    if (pu !== 0)
      b +=
        pu > 0
          ? arrow(tx, top - 34, tx, top - 4)
          : arrow(tx, top - 4, tx, top - 34);
    b += T(tx + 6, top - 22, `Pu ${pu.toFixed(1)} kN`, {
      size: 8,
      anchor: "start",
      fill: C.load,
      bold: true,
    });
    if (v !== 0) {
      const z = zPlateTop - 6;
      b +=
        v > 0
          ? arrow(X(-N / 2) - 40, z, X(-N / 2) - 6, z)
          : arrow(X(N / 2) + 40, z, X(N / 2) + 6, z);
      b += T(
        v > 0 ? X(-N / 2) - 42 : X(N / 2) + 42,
        z - 4,
        `V${along} ${Math.abs(v).toFixed(1)} kN`,
        { size: 8, anchor: v > 0 ? "start" : "end", fill: C.load },
      );
    }
    if (mm !== 0) {
      const r0 = 22,
        z = top + 30;
      // +M puts the resultant towards + (counter-clockwise in this view for A-A when +Y is right).
      const sweep = mm > 0 ? 1 : 0;
      b += `<path d="M${tx - r0},${z} A${r0},${r0} 0 0 ${sweep} ${tx + r0},${z}" fill="none" stroke="${C.load}" stroke-width="1.6" marker-end="url(#bpArrow)"/>`;
      b += T(
        X(colW / 2) + 6,
        z - 12,
        `M${along === "y" ? "x" : "y"} ${Math.abs(mm).toFixed(1)} kN·m`,
        { size: 8, anchor: "start", fill: C.load },
      );
    }
  }
  // Dimensions.
  b += dim(
    X(-N / 2),
    zBottom + 14,
    X(N / 2),
    zBottom + 14,
    `${along === "y" ? "By" : "Bx"} ${n1(N)}`,
    1,
  );
  b += dim(
    X(-P / 2),
    zBottom + 28,
    X(P / 2),
    zBottom + 28,
    `Pedestal ${n1(P)}`,
    1,
  );
  // Plate / grout callouts with leaders (thin layers: text beside, not between ticks).
  const lx = X(N / 2) + 6,
    tx2 = X(P / 2) + 4;
  b +=
    L(lx, (zPlateTop + zPlateBot) / 2, tx2, zPlateTop - 10, C.dim, 0.5) +
    T(tx2 + 2, zPlateTop - 12, `PL tp ${n1(i.plate.tp)}`, {
      size: 8,
      anchor: "start",
      fill: C.dim,
    });
  if (i.grout.thickness > 0)
    b +=
      L(X(N / 2 + 10), (zPlateBot + zConc) / 2, tx2, zConc + 8, C.dim, 0.5) +
      T(tx2 + 2, zConc + 11, `Grout ${n1(i.grout.thickness)}`, {
        size: 8,
        anchor: "start",
        fill: C.dim,
      });
  const u0 = coords[0]!;
  b += dim(
    X(u0) - 14,
    zConc,
    X(u0) - 14,
    zConc + a.hef * s,
    `hef ${n1(a.hef)}`,
  );
  b += T(
    w - 8,
    h - 6,
    `Section ${cut}-${cut} (along ${along.toUpperCase()}) · ${i.column.designation}`,
    { size: 8, anchor: "end", fill: C.dim },
  );
  return wrap(
    w,
    h,
    `SECTION ${cut}-${cut}${combo ? ` — ${combo.load.id}` : ""}`,
    b,
  );
}
