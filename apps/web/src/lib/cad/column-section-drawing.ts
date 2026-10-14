/**
 * Column section drawing model (format-neutral, model space in mm, y up).
 * One source for the DXF file, the on-screen preview and the report figure.
 *
 * Office conventions (CAD decisions sheet, 14 Oct 2026):
 * - Sections at Lo and at Lc side by side (always, when lo zones exist),
 *   column mark heading, MAIN BARS line and TIES table (@Lo / @Lc / @Lj).
 * - Bars: SOLID-filled circles; hoops and cross-ties double-line, to scale,
 *   with Table 25.3.3 bend radii and the selected hook basis.
 * - Dimensions: overall b × h and a "CLR" cover dimension; filled arrows.
 * - Plot scale 1:20: text 2.5 / 3.5 mm on paper = 50 / 70 mm in model.
 * - No bar marks; small notes block; Ø written as %%c in DXF text.
 */
import {
  columnHookBasisLabel,
  columnHookGeometry,
  rebarGradeLabel,
  type ColumnQuantityInput,
  type ColumnTieDesignInput,
  type RectangularColumnInput,
  type TransverseResult,
} from "@nola/calc-core";

export type Pt = [number, number];
export type Layer =
  | "S-CONC"
  | "S-CONC-COVR"
  | "S-REBR-MAIN"
  | "S-REBR-TIES"
  | "S-REBR-XTIE"
  | "S-REBR-TIES-MID"
  | "S-DIMS"
  | "S-ANNO"
  | "S-ANNO-TTLB"
  | "S-CNTR"
  | "S-NOTE";

/** Office layer standard: ACI colour and linetype (lineweight by .ctb). */
export const LAYERS: Record<Layer, { color: number; lineType: string }> = {
  "S-CONC": { color: 4, lineType: "CONTINUOUS" },
  "S-CONC-COVR": { color: 8, lineType: "DASHED" },
  "S-REBR-MAIN": { color: 5, lineType: "CONTINUOUS" },
  "S-REBR-TIES": { color: 30, lineType: "CONTINUOUS" },
  "S-REBR-XTIE": { color: 2, lineType: "CONTINUOUS" },
  "S-REBR-TIES-MID": { color: 3, lineType: "CONTINUOUS" },
  "S-DIMS": { color: 1, lineType: "CONTINUOUS" },
  "S-ANNO": { color: 3, lineType: "CONTINUOUS" },
  "S-ANNO-TTLB": { color: 6, lineType: "CONTINUOUS" },
  "S-CNTR": { color: 8, lineType: "CENTER" },
  "S-NOTE": { color: 7, lineType: "CONTINUOUS" },
};

export type Vertex = { p: Pt; bulge?: number };
export type Prim =
  | { t: "poly"; layer: Layer; v: Vertex[]; closed?: boolean }
  | { t: "line"; layer: Layer; a: Pt; b: Pt }
  | { t: "disc"; layer: Layer; c: Pt; r: number }
  | {
      t: "text";
      layer: Layer;
      p: Pt;
      h: number;
      s: string;
      align?: "left" | "center" | "right";
      rot?: number;
    }
  | {
      t: "dim";
      layer: Layer;
      /** Measured points. */
      a: Pt;
      b: Pt;
      /** Dimension-line position: y for horizontal, x for vertical. */
      at: number;
      vertical: boolean;
      text: string;
    };

export const SCALE = 20;
export const TXT = 2.5 * SCALE; // 50 mm in model
export const TTL = 3.5 * SCALE; // 70 mm in model
export const ARROW = 2.5 * SCALE;

export interface SectionDrawing {
  prims: Prim[];
  /** Model extents [minX, minY, maxX, maxY]. */
  bounds: [number, number, number, number];
  title: string;
  fileName: string;
}

// ── path geometry ─────────────────────────────────────────────────────────
type Seg =
  | { k: "line"; a: Pt; b: Pt }
  /** Counter-clockwise arc from a0 to a1 (rad, a1 > a0). */
  | { k: "arc"; c: Pt; r: number; a0: number; a1: number };
const at = (c: Pt, r: number, a: number): Pt => [
  c[0] + r * Math.cos(a),
  c[1] + r * Math.sin(a),
];
/** Offset a tangent-continuous path to its left (+h) or right (−h). */
function offsetPath(segs: Seg[], h: number): Vertex[] {
  const v: Vertex[] = [];
  for (const s of segs) {
    if (s.k === "line") {
      const dx = s.b[0] - s.a[0],
        dy = s.b[1] - s.a[1];
      const L = Math.hypot(dx, dy) || 1;
      const n: Pt = [(-dy / L) * h, (dx / L) * h];
      v.push({ p: [s.a[0] + n[0], s.a[1] + n[1]] });
      v.push({ p: [s.b[0] + n[0], s.b[1] + n[1]] });
    } else {
      // CCW: the left side is towards the centre.
      const r = s.r - h;
      v.push({
        p: at(s.c, r, s.a0),
        bulge: Math.tan((s.a1 - s.a0) / 4),
      });
      v.push({ p: at(s.c, r, s.a1) });
    }
  }
  // Merge coincident consecutive vertices, keeping the bulge of the first.
  const out: Vertex[] = [];
  for (const x of v) {
    const last = out[out.length - 1];
    if (
      last &&
      Math.hypot(last.p[0] - x.p[0], last.p[1] - x.p[1]) < 1e-6
    ) {
      if (x.bulge !== undefined) last.bulge = x.bulge;
      continue;
    }
    out.push({ ...x });
  }
  return out;
}
/** Double-line bar of diameter d along a centreline path, closed at the ends. */
function barOutline(segs: Seg[], d: number, layer: Layer): Prim {
  const left = offsetPath(segs, d / 2);
  const right = offsetPath(segs, -d / 2);
  // Reverse the right side (arc bulges change sign and shift by one vertex).
  const rev: Vertex[] = [];
  for (let i = right.length - 1; i >= 0; i--)
    rev.push({
      p: right[i]!.p,
      bulge: i > 0 && right[i - 1]!.bulge ? -right[i - 1]!.bulge! : undefined,
    });
  return { t: "poly", layer, v: [...left, ...rev], closed: true };
}

// ── text helpers ──────────────────────────────────────────────────────────
const dia = (d: number) => `%%c${+d.toFixed(1)}`;
export const displayText = (s: string) => s.replaceAll("%%c", "Ø");

export interface SectionDrawingArgs {
  input: RectangularColumnInput;
  tie: ColumnTieDesignInput;
  design: TransverseResult;
  hookBasis: ColumnQuantityInput["hookBasis"];
  title: string;
  projectName?: string;
  date?: Date;
}

/** YYMMDD_ABC_<mark>_Section.dxf (date in Asia/Manila). */
export function sectionFileName(
  projectName: string | undefined,
  title: string,
  date = new Date(),
) {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Manila",
  })
    .format(date)
    .replaceAll("-", "");
  const abc =
    (projectName ?? "")
      .replace(/[^\p{L}]/gu, "")
      .slice(0, 3)
      .toUpperCase() || "PRJ";
  const mark =
    title
      .trim()
      .replace(/[^\p{L}\p{N}-]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "COLUMN";
  return `${ymd}_${abc}_${mark}_Section.dxf`;
}

/** Bars grouped as "4 - %%c25 + 8 - %%c20" (largest first). */
function barText(input: RectangularColumnInput) {
  const groups = new Map<number, number>();
  for (const b of input.bars)
    groups.set(b.diameter, (groups.get(b.diameter) ?? 0) + 1);
  return [...groups]
    .sort((a, b) => b[0] - a[0])
    .map(([d, n]) => `${n} - ${dia(d)}`)
    .join(" + ");
}

/** One section (centre at ox, 0): concrete, cover, bars, hoop, cross-ties. */
function section(
  a: SectionDrawingArgs,
  ox: number,
  zone: "lo" | "mid",
  title: string,
): Prim[] {
  const { input } = a;
  const { width: w, depth: h, cover: c } = input;
  const d = a.tie.tie.diameter;
  let hook: ReturnType<typeof columnHookGeometry>;
  try {
    hook = columnHookGeometry(d, a.hookBasis);
  } catch {
    hook = columnHookGeometry(Math.min(Math.max(d, 9.5), 25.4), "aci135");
  }
  const lay = zone === "mid" ? a.design.layoutMid : a.design.layout;
  const P = (x: number, y: number): Pt => [ox + x, y];
  const out: Prim[] = [];
  // Concrete and cover.
  const rect = (hw: number, hh: number, layer: Layer): Prim => ({
    t: "poly",
    layer,
    closed: true,
    v: [P(-hw, -hh), P(hw, -hh), P(hw, hh), P(-hw, hh)].map((p) => ({ p })),
  });
  out.push(rect(w / 2, h / 2, "S-CONC"));
  out.push(rect(w / 2 - c, h / 2 - c, "S-CONC-COVR"));
  // Centre lines.
  out.push({ t: "line", layer: "S-CNTR", a: P(-w / 2 - 100, 0), b: P(w / 2 + 100, 0) });
  out.push({ t: "line", layer: "S-CNTR", a: P(0, -h / 2 - 100), b: P(0, h / 2 + 100) });
  // Hoop: rounded rectangle on the bar centreline, 135° hooks at top-left.
  const tieLayer: Layer = zone === "mid" ? "S-REBR-TIES-MID" : "S-REBR-TIES";
  const xLayer: Layer = zone === "mid" ? "S-REBR-TIES-MID" : "S-REBR-XTIE";
  const hw = w / 2 - c - d / 2,
    hd = h / 2 - c - d / 2;
  const rad = Math.min((hook.insideBend ?? 4 * d) / 2 + d / 2, hw, hd);
  const q = Math.PI / 2;
  const hoop: Seg[] = [
    { k: "line", a: P(-hw + rad, -hd), b: P(hw - rad, -hd) },
    { k: "arc", c: P(hw - rad, -hd + rad), r: rad, a0: -q, a1: 0 },
    { k: "line", a: P(hw, -hd + rad), b: P(hw, hd - rad) },
    { k: "arc", c: P(hw - rad, hd - rad), r: rad, a0: 0, a1: q },
    { k: "line", a: P(hw - rad, hd), b: P(-hw + rad, hd) },
    { k: "arc", c: P(-hw + rad, hd - rad), r: rad, a0: q, a1: 2 * q },
    { k: "line", a: P(-hw, hd - rad), b: P(-hw, -hd + rad) },
    { k: "arc", c: P(-hw + rad, -hd + rad), r: rad, a0: 2 * q, a1: 3 * q },
  ];
  for (const side of [d / 2, -d / 2]) {
    const ring = offsetPath(hoop, side);
    const f = ring[0]!.p,
      l = ring[ring.length - 1]!.p;
    if (Math.hypot(f[0] - l[0], f[1] - l[1]) < 1e-6) ring.pop();
    out.push({ t: "poly", layer: tieLayer, closed: true, v: ring });
  }
  const E = hook.extension / Math.SQRT2;
  for (const s of [
    { k: "line" as const, a: P(-hw + rad, hd), b: P(-hw + rad + E, hd - E) },
    { k: "line" as const, a: P(-hw, hd - rad), b: P(-hw + E, hd - rad - E) },
  ])
    out.push(barOutline([s], d, tieLayer));
  // Cross-ties (135° both ends, or 135° + 90° alternated).
  const ninety = hook.crossTieSecondAngle === 90 ? hook.crossTieEnds[1] : null;
  const bend = (hook.insideBend ?? 4 * d) / 2 + d / 2;
  const tieAlong = (
    positions: number[],
    axis: "X" | "Y",
  ): void => {
    positions.forEach((pos, i) => {
      const engaged = input.bars
        .filter((b) => Math.abs((axis === "X" ? b.y : b.x) - pos) < 0.1)
        .sort((m, n) => (axis === "X" ? m.x - n.x : m.y - n.y));
      if (engaged.length < 2) return;
      const hug = Math.max(...engaged.map((b) => b.diameter / 2 + d / 2));
      const r = Math.max(bend, hug);
      const s0 = (axis === "X" ? engaged[0]!.x : engaged[0]!.y) + (r - hug);
      const s1 =
        (axis === "X" ? engaged.at(-1)!.x : engaged.at(-1)!.y) - (r - hug);
      // Local frame: u along the leg, v towards the tails (u × v = +1).
      const u: Pt = axis === "X" ? [1, 0] : [0, 1];
      const v: Pt = axis === "X" ? [0, 1] : [-1, 0];
      const base: Pt = axis === "X" ? P(0, pos) : P(pos, 0);
      const G = (s: number, t: number): Pt => [
        base[0] + s * u[0] + t * v[0],
        base[1] + s * u[1] + t * v[1],
      ];
      const rot = Math.atan2(u[1], u[0]);
      const ninetyAt = ninety ? (i % 2 ? "a" : "b") : null;
      const Q = r / Math.SQRT2,
        T = hook.crossTieEnds[0] / Math.SQRT2;
      const segs: Seg[] = [];
      if (ninetyAt === "a")
        segs.push(
          { k: "line", a: G(s0 - r, ninety!), b: G(s0 - r, 0) },
          { k: "arc", c: G(s0, 0), r, a0: rot + Math.PI, a1: rot + 1.5 * Math.PI },
        );
      else
        segs.push(
          { k: "line", a: G(s0 - Q + T, Q + T), b: G(s0 - Q, Q) },
          { k: "arc", c: G(s0, 0), r, a0: rot + 0.75 * Math.PI, a1: rot + 1.5 * Math.PI },
        );
      segs.push({ k: "line", a: G(s0, -r), b: G(s1, -r) });
      if (ninetyAt === "b")
        segs.push(
          { k: "arc", c: G(s1, 0), r, a0: rot + 1.5 * Math.PI, a1: rot + 2 * Math.PI },
          { k: "line", a: G(s1 + r, 0), b: G(s1 + r, ninety!) },
        );
      else
        segs.push(
          { k: "arc", c: G(s1, 0), r, a0: rot + 1.5 * Math.PI, a1: rot + 2.25 * Math.PI },
          { k: "line", a: G(s1 + Q, Q), b: G(s1 + Q - T, Q + T) },
        );
      out.push(barOutline(segs, d, xLayer));
    });
  };
  tieAlong(lay.crossX, "X");
  tieAlong(lay.crossY, "Y");
  // Longitudinal bars.
  for (const b of input.bars)
    out.push({ t: "disc", layer: "S-REBR-MAIN", c: P(b.x, b.y), r: b.diameter / 2 });
  // Dimensions: width on top, depth on the left, clear cover.
  out.push({
    t: "dim",
    layer: "S-DIMS",
    a: P(-w / 2, h / 2),
    b: P(w / 2, h / 2),
    at: h / 2 + 15 * SCALE,
    vertical: false,
    text: `${w}`,
  });
  out.push({
    t: "dim",
    layer: "S-DIMS",
    a: P(-w / 2, -h / 2),
    b: P(-w / 2, h / 2),
    at: ox - w / 2 - 15 * SCALE,
    vertical: true,
    text: `${h}`,
  });
  out.push({
    t: "dim",
    layer: "S-DIMS",
    a: P(-w / 2, h / 2 - c),
    b: P(-w / 2, h / 2),
    at: ox - w / 2 - 6 * SCALE,
    vertical: true,
    text: `${c} CLR`,
  });
  // View title.
  out.push({
    t: "text",
    layer: "S-ANNO-TTLB",
    p: P(0, -h / 2 - 12 * SCALE),
    h: TTL,
    s: title,
    align: "center",
  });
  return out;
}

/** Leader: line + filled arrowhead + text (S-ANNO). */
function leader(to: Pt, from: Pt, text: string, alignRight = false): Prim[] {
  const dx = to[0] - from[0],
    dy = to[1] - from[1];
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L,
    uy = dy / L;
  const tail: Pt = [to[0] - ux * ARROW, to[1] - uy * ARROW];
  const wv: Pt = [(-uy * ARROW) / 6, (ux * ARROW) / 6];
  return [
    { t: "line", layer: "S-ANNO", a: from, b: tail },
    {
      t: "poly",
      layer: "S-ANNO",
      closed: true,
      v: [
        { p: to },
        { p: [tail[0] + wv[0], tail[1] + wv[1]] },
        { p: [tail[0] - wv[0], tail[1] - wv[1]] },
      ],
    },
    {
      t: "line",
      layer: "S-ANNO",
      a: from,
      b: [from[0] + (alignRight ? -1 : 1) * 2 * SCALE, from[1]],
    },
    {
      t: "text",
      layer: "S-ANNO",
      p: [from[0] + (alignRight ? -1 : 1) * 3 * SCALE, from[1] - TXT / 2],
      h: TXT,
      s: text,
      align: alignRight ? "right" : "left",
    },
  ];
}

export function columnSectionDrawing(a: SectionDrawingArgs): SectionDrawing {
  const { input, design } = a;
  const { width: w, depth: h } = input;
  const seismic = design.seismic && design.adopted.lo > 0;
  // Room for the leader text between the two sections.
  const leaderRoom =
    Math.max(
      `${barText(input)} MAIN BARS`.length,
      `%%c16 HOOP + CROSSTIES 99 (X) / 99 (Y)`.length,
    ) *
    TXT *
    0.62;
  const gap = w + 30 * SCALE + leaderRoom + 40 * SCALE;
  const prims: Prim[] = [];
  const views: { zone: "lo" | "mid"; title: string }[] = seismic
    ? [
        { zone: "lo", title: "SECTION AT Lo" },
        { zone: "mid", title: "SECTION AT Lc" },
      ]
    : [{ zone: "mid", title: "SECTION" }];
  views.forEach((v, i) => prims.push(...section(a, i * gap, v.zone, v.title)));
  // Leaders on the first section: main bars and ties.
  const firstBar = [...input.bars].sort((m, n) => n.y - m.y || n.x - m.x)[0];
  const right = (views.length - 1) * gap + w / 2;
  if (firstBar)
    prims.push(
      ...leader(
        [firstBar.x + firstBar.diameter / 2, firstBar.y],
        [w / 2 + 25 * SCALE, h / 2 + 5 * SCALE],
        `${barText(input)} MAIN BARS`,
      ),
    );
  const lay = design.layout;
  const d = a.tie.tie.diameter;
  prims.push(
    ...leader(
      [w / 2 - input.cover - d / 2, -h / 4],
      [w / 2 + 25 * SCALE, -h / 4 - 5 * SCALE],
      `${dia(d)} HOOP + CROSSTIES ${lay.legsX - 2} (X) / ${lay.legsY - 2} (Y)`,
    ),
  );
  // Heading (column mark), above the sections.
  const midX = ((views.length - 1) * gap) / 2;
  const top = h / 2 + 40 * SCALE;
  prims.push({
    t: "text",
    layer: "S-ANNO-TTLB",
    p: [midX, top],
    h: TTL * 1.3,
    s: a.title.toUpperCase(),
    align: "center",
  });
  // MAIN BARS line and TIES table (reference style).
  let y = -h / 2 - 30 * SCALE;
  prims.push({
    t: "text",
    layer: "S-ANNO",
    p: [midX, y],
    h: TXT,
    s: `MAIN BARS: ${barText(input)}`,
    align: "center",
  });
  const { sEnd, sMid } = design.adopted;
  const rows: [string, string, string][] = seismic
    ? [
        ["@Lo", "So", `${sEnd}`],
        ["@Lc", "Sc", `${sMid}`],
        ["@Lj", "Sj", `${sEnd}`],
      ]
    : [
        ["@L", "S", `${sMid}`],
        ["@Lj", "Sj", `${sMid}`],
      ];
  const colW = [24, 26, 18, 22, 26].map((x) => x * SCALE);
  const rowH = 9 * SCALE;
  const tw = colW.reduce((s, x) => s + x, 0);
  const x0 = midX - tw / 2;
  y -= 8 * SCALE;
  const nRows = rows.length + 1;
  const cx = (i: number) => x0 + colW.slice(0, i).reduce((s, x) => s + x, 0);
  // Outer frame and grid.
  prims.push({
    t: "poly",
    layer: "S-ANNO",
    closed: true,
    v: [
      [x0, y],
      [x0 + tw, y],
      [x0 + tw, y - nRows * rowH],
      [x0, y - nRows * rowH],
    ].map((p) => ({ p: p as Pt })),
  });
  for (let r = 1; r < nRows; r++)
    prims.push({
      t: "line",
      layer: "S-ANNO",
      a: [cx(1), y - r * rowH],
      b: [x0 + tw, y - r * rowH],
    });
  for (let k = 1; k < colW.length; k++)
    prims.push({
      t: "line",
      layer: "S-ANNO",
      a: [cx(k), k === 4 ? y - rowH : y],
      b: [cx(k), y - nRows * rowH],
    });
  const cell = (col: number, row: number, s: string, span = 1) =>
    prims.push({
      t: "text",
      layer: "S-ANNO",
      p: [
        cx(col) + colW.slice(col, col + span).reduce((t, x) => t + x, 0) / 2,
        y - row * rowH - rowH / 2 - TXT / 2,
      ],
      h: TXT,
      s,
      align: "center",
    });
  prims.push({
    t: "text",
    layer: "S-ANNO",
    p: [x0 + colW[0]! / 2, y - (nRows * rowH) / 2 - TXT / 2],
    h: TXT,
    s: "TIES",
    align: "center",
  });
  cell(1, 0, "LOC.");
  cell(2, 0, "%%c");
  cell(3, 0, "SPACING", 2);
  rows.forEach(([loc, sym, val], r) => {
    cell(1, r + 1, loc);
    cell(2, r + 1, `${+d.toFixed(1)}`);
    cell(3, r + 1, sym);
    cell(4, r + 1, val);
  });
  // Notes block.
  const std = input.rebarStandard ?? "PNS49";
  const notes = [
    "NOTES:",
    `1. COLUMN ${w} x ${h} mm; CLEAR COVER ${input.cover} mm TO TIES.`,
    `2. f'c = ${input.fc} MPa; MAIN BARS ${rebarGradeLabel(std, input.fy, input.gradeId).toUpperCase()} (fy ${input.fy} MPa); TIES fyt ${a.tie.tie.fyt} MPa.`,
    `3. HOOKS: ${columnHookBasisLabel[a.hookBasis].toUpperCase()}.`,
    ...(seismic
      ? [
          `4. Lo = ${design.adopted.lo} mm AT EACH END; Lc = REMAINING CLEAR HEIGHT; Lj = BEAM-COLUMN JOINT.`,
        ]
      : []),
    `${seismic ? 5 : 4}. DESIGN BASIS: ACI 318-19. DIMENSIONS IN mm.`,
  ];
  let ny = y - nRows * rowH - 14 * SCALE;
  for (const n of notes) {
    prims.push({ t: "text", layer: "S-NOTE", p: [x0, ny], h: TXT, s: n, align: "left" });
    ny -= TXT * 1.7;
  }
  void right;
  return {
    prims,
    bounds: drawingBounds(prims),
    title: a.title,
    fileName: sectionFileName(a.projectName, a.title, a.date),
  };
}

/** Extents of all primitives (text width estimated at 0.62·h per character). */
export function drawingBounds(prims: Prim[]): [number, number, number, number] {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  const add = (p: Pt) => {
    x0 = Math.min(x0, p[0]);
    y0 = Math.min(y0, p[1]);
    x1 = Math.max(x1, p[0]);
    y1 = Math.max(y1, p[1]);
  };
  for (const p of prims) {
    if (p.t === "poly") p.v.forEach((v) => add(v.p));
    else if (p.t === "line") {
      add(p.a);
      add(p.b);
    } else if (p.t === "disc") {
      add([p.c[0] - p.r, p.c[1] - p.r]);
      add([p.c[0] + p.r, p.c[1] + p.r]);
    }
    else if (p.t === "dim") {
      add(p.a);
      add(p.b);
      add(p.vertical ? [p.at - TXT * 2, p.a[1]] : [p.a[0], p.at + TXT * 2]);
    } else {
      const wdt = displayText(p.s).length * p.h * 0.62;
      const left =
        p.align === "center" ? p.p[0] - wdt / 2 : p.align === "right" ? p.p[0] - wdt : p.p[0];
      add([left, p.p[1]]);
      add([left + wdt, p.p[1] + p.h]);
    }
  }
  const m = 10 * SCALE;
  return [x0 - m, y0 - m, x1 + m, y1 + m];
}

/** Dimension appearance (lines, filled arrows, text) for the anonymous block. */
export function dimGeometry(p: Extract<Prim, { t: "dim" }>): Prim[] {
  const out: Prim[] = [];
  const exo = 0.625 * SCALE,
    exe = 1.25 * SCALE,
    gap = 0.625 * SCALE;
  const v = p.vertical;
  // Points on the dimension line.
  const A: [number, number] = v ? [p.at, p.a[1]] : [p.a[0], p.at];
  const B: [number, number] = v ? [p.at, p.b[1]] : [p.b[0], p.at];
  for (const [m, d] of [
    [p.a, A],
    [p.b, B],
  ] as const) {
    const dir = v ? Math.sign(d[0] - m[0]) || -1 : Math.sign(d[1] - m[1]) || 1;
    out.push({
      t: "line",
      layer: "S-DIMS",
      a: v ? [m[0] + dir * exo, m[1]] : [m[0], m[1] + dir * exo],
      b: v ? [d[0] + dir * exe, d[1]] : [d[0], d[1] + dir * exe],
    });
  }
  const len = Math.abs(v ? B[1] - A[1] : B[0] - A[0]);
  const inside = len >= 2.4 * ARROW;
  out.push({ t: "line", layer: "S-DIMS", a: A, b: B });
  const arrow = (tip: [number, number], dir: number): Prim => {
    const w = ARROW / 6;
    const base: [number, number] = v
      ? [tip[0], tip[1] + dir * ARROW]
      : [tip[0] + dir * ARROW, tip[1]];
    return {
      t: "poly",
      layer: "S-DIMS",
      closed: true,
      v: [
        { p: tip },
        { p: v ? [base[0] - w, base[1]] : [base[0], base[1] - w] },
        { p: v ? [base[0] + w, base[1]] : [base[0], base[1] + w] },
      ],
    };
  };
  const lo = v ? (A[1] < B[1] ? A : B) : A[0] < B[0] ? A : B;
  const hi = lo === A ? B : A;
  if (inside) {
    out.push(arrow(lo, 1), arrow(hi, -1));
  } else {
    // Short dimension: arrows outside pointing in, with extension stubs.
    out.push(arrow(lo, -1), arrow(hi, 1));
    out.push({
      t: "line",
      layer: "S-DIMS",
      a: v ? [lo[0], lo[1] - 1.6 * ARROW] : [lo[0] - 1.6 * ARROW, lo[1]],
      b: v ? [hi[0], hi[1] + 1.6 * ARROW] : [hi[0] + 1.6 * ARROW, hi[1]],
    });
  }
  // Text above the line (left of it for vertical dimensions), centred; a
  // short dimension's text sits past the upper/right arrow.
  const mid = inside
    ? v
      ? (A[1] + B[1]) / 2
      : (A[0] + B[0]) / 2
    : v
      ? hi[1] + 1.8 * ARROW + (p.text.length * TXT * 0.62) / 2
      : hi[0] + 1.8 * ARROW + (p.text.length * TXT * 0.62) / 2;
  out.push({
    t: "text",
    layer: "S-DIMS",
    p: v ? [p.at - gap, mid] : [mid, p.at + gap],
    h: TXT,
    s: p.text,
    align: "center",
    rot: v ? 90 : 0,
  });
  return out;
}

/** Centre of the dimension text (DIMENSION group 11). */
export function dimTextPoint(p: Extract<Prim, { t: "dim" }>): Pt {
  const t = dimGeometry(p).find((g) => g.t === "text");
  if (!t || t.t !== "text") return p.a;
  return p.vertical ? [t.p[0] - t.h / 2, t.p[1]] : [t.p[0], t.p[1] + t.h / 2];
}
