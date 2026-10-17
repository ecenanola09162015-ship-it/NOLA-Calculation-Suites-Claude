/**
 * Stiffened base plates (engine base-plate-0.3.0).
 *
 * AISC DG1 3rd Ed. Sec. 3.1 places stiffened bases outside its scope, so the
 * method is assembled from the following and printed in the report:
 * - Plate panels: the DG1 zones (m beyond 0.95d, n beyond 0.80bf, HSS 0.95,
 *   round 0.80D) keep their DG1 critical lines as supported back edges;
 *   stiffeners add side supports. Panels with three supported edges (P3) or
 *   two adjacent supported edges (P2) are designed by
 *   (a) yield-line analysis (upper bound; standard mechanism families for a
 *       uniformly loaded panel, fixed supports m′ = m; ×1.10 corner-lever
 *       allowance; never more than the unstiffened DG1 cantilever), or
 *   (b) Hillerborg's simple strip method (lower bound; 45° load dispersion to
 *       the nearest support, cantilever strips).
 *   Plastic moment per unit width φb Fy tp²/4 as DG1.
 * - Tension side: AISC DG1 3rd Ed. Example 4.7-7 — each rod bends the plate
 *   about its nearest support (column face per DG1 or stiffener face), lever
 *   a, 45° effective width 2a clipped to the support length.
 * - Stiffener as a cantilever bracket from the column face: flexure
 *   (AISC 360-22 F11 rectangular bar incl. lateral-torsional buckling, or F9
 *   tee with an EN 1993-1-5 9.1 effective plate width 15εtp each side),
 *   shear yielding J4.2(a), free-edge slenderness hc/ts ≤ 0.56√(E/Fy)
 *   (Table B4.1a case 1 limit applied to the bracket, engine rule), fillet
 *   welds J2.4 (stiffener-to-plate per DG1 Ex. 4.7-7 with kds = 1.5).
 * - Column at a web-line stiffener (I-shapes): J10.2 web local yielding and
 *   J10.3 web crippling at the member end; force couple from the root
 *   moment, H = 1.5 M / Lw over lb = Lw / 2 (engine rule).
 * Units: N, mm, MPa.
 */
import { z } from "zod";

import {
  aiscFactors,
  designFactor,
  type SteelDesignMethod,
} from "../steel-design-method";

const pos = z.number().finite().positive();
const nonneg = z.number().finite().nonnegative();
const E_STEEL = 200000;
/** Corner-lever allowance on yield-line moments (engine assumption). */
export const YIELD_LINE_ALLOWANCE = 1.1;

export const stiffenerLayouts = [
  "none",
  "web-line",
  "flange-tip",
  "web-side",
  "web-line+web-side",
  "hss-mid",
  "radial-4",
] as const;
export type StiffenerLayout = (typeof stiffenerLayouts)[number];
type Family = "I" | "HSS-RECT" | "HSS-ROUND";

export const stiffenerLayoutInfo: Record<
  StiffenerLayout,
  { label: string; families: Family[]; count: number; description: string }
> = {
  none: {
    label: "None (unstiffened)",
    families: ["I", "HSS-RECT", "HSS-ROUND"],
    count: 0,
    description: "DG1 cantilever plate.",
  },
  "web-line": {
    label: "Web-line — 2 plates outside the flanges",
    families: ["I"],
    count: 2,
    description:
      "In the plane of the web, from each flange face to the plate edge.",
  },
  "flange-tip": {
    label: "Flange-tip — 4 plates outside the flanges",
    families: ["I"],
    count: 4,
    description: "In line with the flange tips, from each flange to the edge.",
  },
  "web-side": {
    label: "Web-side — 2 plates from the web past the flange tips",
    families: ["I"],
    count: 2,
    description: "At mid-depth, from the web face to the plate edge.",
  },
  "web-line+web-side": {
    label: "Cross — web-line + web-side (4 plates)",
    families: ["I"],
    count: 4,
    description: "Both web-line and web-side stiffeners.",
  },
  "hss-mid": {
    label: "Mid-side — 4 plates",
    families: ["HSS-RECT"],
    count: 4,
    description: "At the middle of each wall, to the plate edge.",
  },
  "radial-4": {
    label: "Radial — 4 plates at 90°",
    families: ["HSS-ROUND"],
    count: 4,
    description: "On the X and Y axes, from the wall to the plate edge.",
  },
};
export function stiffenerLayoutsFor(family: Family): StiffenerLayout[] {
  return stiffenerLayouts.filter((l) =>
    stiffenerLayoutInfo[l].families.includes(family),
  );
}

export const defaultStiffenerInput = () => ({
  layout: "none" as StiffenerLayout,
  t: 16,
  hc: 250,
  he: 100,
  clip: 20,
  fy: 248,
  weldColumn: 8,
  weldPlate: 8,
  section: "plate" as "plate" | "tee",
  plateMethod: "yield-line" as "yield-line" | "strip",
});
export const basePlateStiffenerSchema = z
  .object({
    layout: z.enum(stiffenerLayouts),
    /** Thickness ts, height at the column hc, height at the plate edge he. */
    t: pos,
    hc: pos,
    he: nonneg,
    /** Corner snip at the column / plate corner (weld access), mm. */
    clip: nonneg,
    fy: pos,
    /** Fillet sizes, both sides: stiffener-to-column and -to-plate. */
    weldColumn: pos,
    weldPlate: pos,
    /** Flexure section: stiffener alone (default) or tee with the plate. */
    section: z.enum(["plate", "tee"]),
    /** Plate panels: yield-line (default) or Hillerborg strip. */
    plateMethod: z.enum(["yield-line", "strip"]),
  })
  .refine(
    (s) => s.he <= s.hc,
    "Stiffener: height at the plate edge he must not exceed hc.",
  )
  .refine(
    (s) => s.clip < s.hc / 2,
    "Stiffener: corner snip must be less than hc / 2.",
  );
export type BasePlateStiffenerInput = z.infer<typeof basePlateStiffenerSchema>;

/** Geometry and material the stiffener engine needs (from the base plate). */
export interface StiffenerContext {
  bx: number;
  by: number;
  tp: number;
  plateFy: number;
  family: Family;
  d: number;
  bf: number;
  tf: number;
  tw: number;
  columnFy: number;
  /** Rotation 0°: flanges face ±Y (d along Y). */
  flangesFaceY: boolean;
  /** Column outline along X / Y and DG1 critical-line factors. */
  colX: number;
  colY: number;
  kx: number;
  ky: number;
  method: SteelDesignMethod;
  fexx: number;
  washer: number;
}

export type StiffenerGroup =
  "web-line" | "flange-tip" | "web-side" | "mid-side" | "radial";
/**
 * A straight steel element the plate can bend about under rod tension:
 * a stiffener, or the column web / flange for rods between the flanges.
 */
export interface SupportPlate {
  id: string;
  axis: "x" | "y";
  side: 1 | -1;
  pos: number;
  root: number;
  tip: number;
  /** Plate thickness (stiffener ts, web tw, flange tf), mm. */
  t: number;
  /** Only rods inside this half-size rectangle (|x|, |y|) may use it. */
  insideOnly?: { hx: number; hy: number };
}
export interface StiffenerPlate extends SupportPlate {
  group: StiffenerGroup;
  /** Direction the plate runs (its length). */
  axis: "x" | "y";
  side: 1 | -1;
  /** Across coordinate of the centreline, mm. */
  pos: number;
  /** |along| coordinate of the root (column face) and tip (plate edge). */
  root: number;
  tip: number;
  length: number;
  /** Start of the bearing load on the plate (|along|): DG1 critical line. */
  loadFrom: number;
  /** |along| of the zone's DG1 critical line (strip distances start here). */
  zoneStart: number;
  /**
   * Strip-method reach into the adjacent panels (−across / +across side):
   * b/2 for a P3 panel, b for a P2 panel, 0 for none.
   */
  capNeg: number;
  capPos: number;
}

export type ZoneId = "+x" | "-x" | "+y" | "-y";
export interface StiffenedPanel {
  id: string;
  zone: ZoneId;
  type: "P2" | "P3";
  /** Depth (back edge to free edge) and width, mm. */
  a: number;
  b: number;
  /** Local frame: origin, ex (along the back edge), ey (outward). */
  o: [number, number];
  ex: [number, number];
  ey: [number, number];
  supports: string[];
}
export interface StiffenerZone {
  id: ZoneId;
  axis: "x" | "y";
  side: 1 | -1;
  /** |along| of the DG1 critical line and the zone depth. */
  start: number;
  depth: number;
  stiffened: boolean;
}
export interface Stiffening {
  input: BasePlateStiffenerInput;
  plates: StiffenerPlate[];
  zones: StiffenerZone[];
  panels: StiffenedPanel[];
}

const unit = (axis: "x" | "y"): [number, number] =>
  axis === "x" ? [1, 0] : [0, 1];
const other = (axis: "x" | "y"): "x" | "y" => (axis === "x" ? "y" : "x");

/** Stiffener plates in plate coordinates for the selected layout. */
export function stiffenerPlates(
  ctx: StiffenerContext,
  s: BasePlateStiffenerInput,
): StiffenerPlate[] {
  const out: StiffenerPlate[] = [];
  const dAxis: "x" | "y" = ctx.flangesFaceY ? "y" : "x";
  const add = (
    group: StiffenerGroup,
    axis: "x" | "y",
    positions: number[],
    root: number,
    loadFrom: number,
  ) => {
    const tip = axis === "x" ? ctx.bx / 2 : ctx.by / 2;
    for (const side of [1, -1] as const)
      for (const p of positions)
        out.push({
          id: `S${out.length + 1}`,
          group,
          axis,
          side,
          pos: p,
          root,
          tip,
          length: tip - root,
          t: s.t,
          loadFrom: Math.max(root, loadFrom),
          zoneStart: loadFrom,
          capNeg: 0,
          capPos: 0,
        });
  };
  const crit = (axis: "x" | "y") =>
    axis === "x" ? (ctx.kx * ctx.colX) / 2 : (ctx.ky * ctx.colY) / 2;
  const L = s.layout;
  if (ctx.family === "I") {
    if (L === "web-line" || L === "web-line+web-side")
      add("web-line", dAxis, [0], ctx.d / 2, crit(dAxis));
    if (L === "flange-tip") {
      const p = ctx.bf / 2 - s.t / 2;
      add("flange-tip", dAxis, [-p, p], ctx.d / 2, crit(dAxis));
    }
    if (L === "web-side" || L === "web-line+web-side")
      add("web-side", other(dAxis), [0], ctx.tw / 2, crit(other(dAxis)));
  } else if (
    (ctx.family === "HSS-RECT" && L === "hss-mid") ||
    (ctx.family === "HSS-ROUND" && L === "radial-4")
  ) {
    const g: StiffenerGroup = L === "hss-mid" ? "mid-side" : "radial";
    add(g, "y", [0], ctx.colY / 2, crit("y"));
    add(g, "x", [0], ctx.colX / 2, crit("x"));
  }
  return out;
}

/** Zones, panels and stiffener tributary widths. */
export function buildStiffening(
  ctx: StiffenerContext,
  s: BasePlateStiffenerInput,
): Stiffening | null {
  if (s.layout === "none") return null;
  const plates = stiffenerPlates(ctx, s);
  if (!plates.length) return null;
  const zones: StiffenerZone[] = [];
  const panels: StiffenedPanel[] = [];
  for (const axis of ["y", "x"] as const)
    for (const side of [1, -1] as const) {
      const id = `${side > 0 ? "+" : "-"}${axis}` as ZoneId;
      const half = axis === "y" ? ctx.by / 2 : ctx.bx / 2;
      const width = axis === "y" ? ctx.bx : ctx.by;
      const start =
        axis === "y" ? (ctx.ky * ctx.colY) / 2 : (ctx.kx * ctx.colX) / 2;
      const depth = half - start;
      const zs = plates
        .filter((p) => p.axis === axis && p.side === side)
        .sort((a, b) => a.pos - b.pos);
      zones.push({ id, axis, side, start, depth, stiffened: zs.length > 0 });
      if (!zs.length || depth <= 0) continue;
      const al = unit(axis),
        ac = unit(other(axis));
      const at = (across: number): [number, number] => [
        ac[0] * across + al[0] * side * start,
        ac[1] * across + al[1] * side * start,
      ];
      const ey: [number, number] = [al[0] * side, al[1] * side];
      const mk = (
        type: "P2" | "P3",
        from: number,
        dir: 1 | -1,
        b: number,
        supports: StiffenerPlate[],
      ) => {
        if (b <= 1e-6) return null;
        const p: StiffenedPanel = {
          id: `${id}·${panels.length + 1}`,
          zone: id,
          type,
          a: depth,
          b,
          o: at(from),
          ex: [ac[0] * dir, ac[1] * dir],
          ey,
          supports: supports.map((x) => x.id),
        };
        panels.push(p);
        return p;
      };
      const t = s.t;
      // Outer panel on the −across side: support at its +across end.
      const first = zs[0]!;
      const p0 = mk(
        "P2",
        first.pos - t / 2,
        -1,
        first.pos - t / 2 + width / 2,
        [first],
      );
      first.capNeg = p0 ? p0.b : 0;
      for (let k = 0; k + 1 < zs.length; k++) {
        const l = zs[k]!,
          r = zs[k + 1]!;
        const p = mk("P3", l.pos + t / 2, 1, r.pos - t / 2 - (l.pos + t / 2), [
          l,
          r,
        ]);
        l.capPos = p ? p.b / 2 : 0;
        r.capNeg = p ? p.b / 2 : 0;
      }
      const last = zs[zs.length - 1]!;
      const p1 = mk("P2", last.pos + t / 2, 1, width / 2 - (last.pos + t / 2), [
        last,
      ]);
      last.capPos = p1 ? p1.b : 0;
    }
  return { input: s, plates, zones, panels };
}

/* ------------------------------------------------------------------ */
/* Polygons                                                            */
/* ------------------------------------------------------------------ */

type Pt = [number, number];
export interface PlateRect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}
function clipHalf(poly: Pt[], inside: (p: Pt) => number): Pt[] {
  // Sutherland–Hodgman against the half-plane inside(p) ≥ 0 (linear).
  const out: Pt[] = [];
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k]!,
      b = poly[(k + 1) % poly.length]!;
    const fa = inside(a),
      fb = inside(b);
    if (fa >= 0) out.push(a);
    if (fa >= 0 !== fb >= 0) {
      const t = fa / (fa - fb);
      out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  return out;
}
export function clipToRect(poly: Pt[], r: PlateRect): Pt[] {
  let p = poly;
  p = clipHalf(p, (q) => q[0] - r.x0);
  if (p.length) p = clipHalf(p, (q) => r.x1 - q[0]);
  if (p.length) p = clipHalf(p, (q) => q[1] - r.y0);
  if (p.length) p = clipHalf(p, (q) => r.y1 - q[1]);
  return p;
}
/** Area and first moments ∫x dA, ∫y dA of a simple polygon. */
export function polygonMoments(poly: Pt[]) {
  let a = 0,
    sx = 0,
    sy = 0;
  for (let k = 0; k < poly.length; k++) {
    const [x0, y0] = poly[k]!,
      [x1, y1] = poly[(k + 1) % poly.length]!;
    const c = x0 * y1 - x1 * y0;
    a += c;
    sx += (x0 + x1) * c;
    sy += (y0 + y1) * c;
  }
  const sgn = a < 0 ? -1 : 1;
  return { area: (sgn * a) / 2, ix: (sgn * sx) / 6, iy: (sgn * sy) / 6 };
}

/* ------------------------------------------------------------------ */
/* Panel analysis                                                      */
/* ------------------------------------------------------------------ */

type Axis = "back" | "left" | "right";
interface Segment {
  poly: Pt[];
  axis: Axis;
  theta: number;
}
interface Mechanism {
  segs: Segment[];
  /** Internal work / m for unit deflection (m′ = m on supports). */
  wint: number;
}
/** Standard mechanism families (local x along the back, y outward). */
export const mechanismFamilies = {
  /** P3: diagonals from the back corners to the free edge at s. */
  p3A: (a: number, b: number, s: number): Mechanism => ({
    segs: [
      {
        poly: [
          [0, 0],
          [b, 0],
          [b - s, a],
          [s, a],
        ],
        axis: "back",
        theta: 1 / a,
      },
      {
        poly: [
          [0, 0],
          [s, a],
          [0, a],
        ],
        axis: "left",
        theta: 1 / s,
      },
      {
        poly: [
          [b, 0],
          [b, a],
          [b - s, a],
        ],
        axis: "right",
        theta: 1 / s,
      },
    ],
    wint: (b + 2 * s) / a + (4 * a) / s,
  }),
  /** P3: diagonals meeting at (b/2, c), then a line to the free edge. */
  p3B: (a: number, b: number, c: number): Mechanism => ({
    segs: [
      {
        poly: [
          [0, 0],
          [b, 0],
          [b / 2, c],
        ],
        axis: "back",
        theta: 1 / c,
      },
      {
        poly: [
          [0, 0],
          [b / 2, c],
          [b / 2, a],
          [0, a],
        ],
        axis: "left",
        theta: 2 / b,
      },
      {
        poly: [
          [b, 0],
          [b, a],
          [b / 2, a],
          [b / 2, c],
        ],
        axis: "right",
        theta: 2 / b,
      },
    ],
    wint: (2 * b) / c + (8 * a) / b,
  }),
  /** P2: one line from the supported corner to (s, a) on the outer edge. */
  p2C1: (a: number, b: number, s: number): Mechanism => ({
    segs: [
      {
        poly: [
          [0, 0],
          [b, 0],
          [b, a],
          [s, a],
        ],
        axis: "back",
        theta: 1 / a,
      },
      {
        poly: [
          [0, 0],
          [s, a],
          [0, a],
        ],
        axis: "left",
        theta: 1 / s,
      },
    ],
    wint: (s + b) / a + (2 * a) / s,
  }),
  /** P2: one line from the supported corner to (b, t) on the free side. */
  p2C2: (a: number, b: number, t: number): Mechanism => ({
    segs: [
      {
        poly: [
          [0, 0],
          [b, 0],
          [b, t],
        ],
        axis: "back",
        theta: 1 / t,
      },
      {
        poly: [
          [0, 0],
          [b, t],
          [b, a],
          [0, a],
        ],
        axis: "left",
        theta: 1 / b,
      },
    ],
    wint: (2 * b) / t + (a + t) / b,
  }),
};

function externalWork(m: Mechanism, b: number, load: PlateRect) {
  let w = 0;
  for (const s of m.segs) {
    const p = clipToRect(s.poly, load);
    if (p.length < 3) continue;
    const mo = polygonMoments(p);
    const arm =
      s.axis === "back"
        ? mo.iy
        : s.axis === "left"
          ? mo.ix
          : b * mo.area - mo.ix;
    w += s.theta * arm;
  }
  return w;
}
/** Max over a parameter of We/Wi (grid + golden-section refinement). */
function maximise(f: (p: number) => number, lo: number, hi: number) {
  const n = 160;
  let best = -Infinity,
    bp = hi;
  for (let k = 1; k <= n; k++) {
    const p = lo + ((hi - lo) * k) / n;
    const v = f(p);
    if (v > best) {
      best = v;
      bp = p;
    }
  }
  let a = Math.max(lo + 1e-9, bp - (hi - lo) / n),
    c = Math.min(hi, bp + (hi - lo) / n);
  const g = (Math.sqrt(5) - 1) / 2;
  for (let k = 0; k < 40; k++) {
    const x1 = c - g * (c - a),
      x2 = a + g * (c - a);
    if (f(x1) >= f(x2)) c = x2;
    else a = x1;
  }
  const pr = (a + c) / 2;
  const vr = f(pr);
  return vr > best ? { value: vr, param: pr } : { value: best, param: bp };
}

export interface PanelDemand {
  /** Required plastic moment / fp (mm²) and governing mechanism. */
  coefficient: number;
  mechanism: string;
}
/**
 * Yield-line coefficient: m_req = fp × coefficient (N·mm/mm), load = the
 * loaded rectangle in panel coordinates (already clipped to the panel).
 */
export function yieldLinePanel(
  type: "P2" | "P3",
  a: number,
  b: number,
  load: PlateRect,
): PanelDemand {
  const fam =
    type === "P3"
      ? [
          {
            name: "P3-A (diagonals to the free edge)",
            f: (s: number) => mechanismFamilies.p3A(a, b, s),
            hi: b / 2,
          },
          {
            name: "P3-B (diagonals meet, line to the free edge)",
            f: (c: number) => mechanismFamilies.p3B(a, b, c),
            hi: a,
          },
        ]
      : [
          {
            name: "P2-C1 (diagonal to the outer edge)",
            f: (s: number) => mechanismFamilies.p2C1(a, b, s),
            hi: b,
          },
          {
            name: "P2-C2 (diagonal to the free side)",
            f: (t: number) => mechanismFamilies.p2C2(a, b, t),
            hi: a,
          },
        ];
  let best: PanelDemand = { coefficient: 0, mechanism: "" };
  for (const m of fam) {
    const r = maximise(
      (p) => {
        const mech = m.f(p);
        return externalWork(mech, b, load) / mech.wint;
      },
      0,
      m.hi,
    );
    if (r.value > best.coefficient)
      best = {
        coefficient: r.value,
        mechanism: `${m.name}, parameter ${r.param.toFixed(1)} mm`,
      };
  }
  return best;
}
/** ∫ s ds over [lo, hi] ∩ [l0, l1] (moment of a loaded strip about s = 0). */
function stripMoment(len: number, l0: number, l1: number) {
  const lo = Math.max(0, l0),
    hi = Math.min(len, l1);
  return hi > lo ? (hi * hi - lo * lo) / 2 : 0;
}
/** Hillerborg simple strip method (45° division to the nearest support). */
export function stripPanel(
  type: "P2" | "P3",
  a: number,
  b: number,
  load: PlateRect,
): PanelDemand {
  const n = 200;
  let best = 0,
    where = "";
  for (let k = 0; k <= n; k++) {
    // Strips perpendicular to the back edge at x.
    const x = (b * k) / n;
    if (x >= load.x0 && x <= load.x1) {
      const len = type === "P3" ? Math.min(x, b - x, a) : Math.min(x, a);
      const v = stripMoment(len, load.y0, load.y1);
      if (v > best) {
        best = v;
        where = `strip to the back edge at x = ${x.toFixed(0)} mm, length ${len.toFixed(0)} mm`;
      }
    }
    // Strips perpendicular to the side support(s) at y.
    const y = (a * k) / n;
    if (y >= load.y0 && y <= load.y1) {
      const len = type === "P3" ? Math.min(y, b / 2) : Math.min(y, b);
      const vl = stripMoment(len, load.x0, load.x1);
      const vr = type === "P3" ? stripMoment(len, b - load.x1, b - load.x0) : 0;
      const v = Math.max(vl, vr);
      if (v > best) {
        best = v;
        where = `strip to the stiffener at y = ${y.toFixed(0)} mm, length ${len.toFixed(0)} mm`;
      }
    }
  }
  return { coefficient: best, mechanism: `Strip method: ${where}` };
}
/** Unstiffened cantilever about the back edge for the same load (DG1). */
function cantileverCoefficient(a: number, b: number, load: PlateRect) {
  return load.x1 > load.x0 && b > 0 ? stripMoment(a, load.y0, load.y1) : 0;
}

/** Plate-coordinates rectangle → panel-local loaded rectangle (or null). */
export function panelLoad(p: StiffenedPanel, r: PlateRect): PlateRect | null {
  const cs: Pt[] = [
    [r.x0, r.y0],
    [r.x1, r.y0],
    [r.x0, r.y1],
    [r.x1, r.y1],
  ];
  const loc = cs.map(
    ([x, y]) =>
      [
        (x - p.o[0]) * p.ex[0] + (y - p.o[1]) * p.ex[1],
        (x - p.o[0]) * p.ey[0] + (y - p.o[1]) * p.ey[1],
      ] as Pt,
  );
  const x0 = Math.max(0, Math.min(...loc.map((q) => q[0]))),
    x1 = Math.min(p.b, Math.max(...loc.map((q) => q[0]))),
    y0 = Math.max(0, Math.min(...loc.map((q) => q[1]))),
    y1 = Math.min(p.a, Math.max(...loc.map((q) => q[1])));
  return x1 - x0 > 1e-9 && y1 - y0 > 1e-9 ? { x0, x1, y0, y1 } : null;
}

export interface PanelResult {
  id: string;
  zone: ZoneId;
  type: "P2" | "P3";
  a: number;
  b: number;
  fp: number;
  /** Required plastic moment per unit width, N·mm/mm. */
  mReq: number;
  tpReq: number;
  mechanism: string;
  /** True when the unstiffened cantilever value governed the panel (cap). */
  capped: boolean;
}
/** tp,req = √(4 m / (φb Fy)) or √(4 m Ωb / Fy). */
export const tpFromM = (m: number, fy: number, fb: number) =>
  Math.sqrt((4 * Math.max(m, 0)) / (fb * fy));

/** Bearing demand on every stiffened panel for one uniform block. */
export function panelBearing(
  st: Stiffening,
  region: PlateRect,
  fp: number,
  plateFy: number,
  fb: number,
): PanelResult[] {
  const out: PanelResult[] = [];
  for (const p of st.panels) {
    const load = panelLoad(p, region);
    if (!load || fp <= 0) continue;
    const d =
      st.input.plateMethod === "strip"
        ? stripPanel(p.type, p.a, p.b, load)
        : yieldLinePanel(p.type, p.a, p.b, load);
    const factor = st.input.plateMethod === "strip" ? 1 : YIELD_LINE_ALLOWANCE;
    const cant = cantileverCoefficient(p.a, p.b, load);
    const coef = Math.min(d.coefficient * factor, cant);
    const mReq = fp * coef;
    out.push({
      id: p.id,
      zone: p.zone,
      type: p.type,
      a: p.a,
      b: p.b,
      fp,
      mReq,
      tpReq: tpFromM(mReq, plateFy, fb),
      mechanism:
        coef < d.coefficient * factor - 1e-9
          ? "Unstiffened DG1 cantilever (governs over the panel mechanism)"
          : d.mechanism +
            (factor > 1 ? ` × ${YIELD_LINE_ALLOWANCE} corner allowance` : ""),
      capped: coef < d.coefficient * factor - 1e-9,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Tension side (DG1 Ex. 4.7-7)                                        */
/* ------------------------------------------------------------------ */

export interface TensionRod {
  id: string;
  x: number;
  y: number;
  t: number;
}
export interface TensionGroup {
  /** "column" (DG1 column face) or a stiffener id. */
  support: string;
  rods: string[];
  levers: number[];
  tensions: number[];
  /** Positions along the stiffener from its root (stiffener groups). */
  xi: number[];
  beff: number;
  m: number;
  tpReq: number;
}
function unionLength(iv: [number, number][]) {
  const s = iv.filter(([a, b]) => b > a).sort((p, q) => p[0] - q[0]);
  let total = 0,
    cur: [number, number] | null = null;
  for (const [a, b] of s) {
    if (!cur || a > cur[1]) {
      if (cur) total += cur[1] - cur[0];
      cur = [a, b];
    } else cur[1] = Math.max(cur[1], b);
  }
  if (cur) total += cur[1] - cur[0];
  return total;
}
/** Lever from a rod to a stiffener face, or null when the rod is not beside it. */
export function stiffenerLever(
  p: SupportPlate,
  ts: number,
  x: number,
  y: number,
) {
  if (
    p.insideOnly &&
    !(Math.abs(x) < p.insideOnly.hx && Math.abs(y) < p.insideOnly.hy)
  )
    return null;
  const along = p.axis === "x" ? x : y;
  const across = p.axis === "x" ? y : x;
  if (Math.sign(along) !== p.side) return null;
  const al = Math.abs(along);
  if (al < p.root || al > p.tip) return null;
  return {
    lever: Math.abs(across - p.pos) - ts / 2,
    xi: al - p.root,
    sideOf: across >= p.pos ? 1 : -1,
  };
}
/**
 * Plate bending at a line of tension rods: each rod to its nearest support.
 * Column face (DG1 Eq. 4-60/4-62): lever `columnLever`, full plate width
 * `acrossWidth` (B). Stiffener, web or flange face (DG1 Ex. 4.7-3, 4.7-7):
 * clear lever a, 45° width 2a clipped to the support length.
 */
export function tensionLine(
  plates: SupportPlate[],
  axis: "x" | "y",
  rods: TensionRod[],
  columnLever: number,
  acrossWidth: number,
  plateFy: number,
  fb: number,
) {
  const groups = new Map<string, TensionGroup & { iv: [number, number][] }>();
  for (const r of rods) {
    if (!(r.t > 0)) continue;
    let best: {
      key: string;
      support: string;
      lever: number;
      xi: number;
      iv: [number, number];
    } | null = null;
    if (columnLever > 0) {
      best = {
        key: "column",
        support: "column",
        lever: columnLever,
        xi: 0,
        iv: [-acrossWidth / 2, acrossWidth / 2],
      };
    }
    for (const p of plates) {
      const l = stiffenerLever(p, p.t, r.x, r.y);
      if (!l || l.lever <= 0) continue;
      if (!best || l.lever < best.lever) {
        const at = l.xi + p.root;
        best = {
          key: `${p.id}${l.sideOf > 0 ? "+" : "-"}`,
          support: p.id,
          lever: l.lever,
          xi: l.xi,
          iv: [Math.max(p.root, at - l.lever), Math.min(p.tip, at + l.lever)],
        };
      }
    }
    if (!best) continue;
    const g = groups.get(best.key) ?? {
      support: best.support,
      rods: [],
      levers: [],
      tensions: [],
      xi: [],
      beff: 0,
      m: 0,
      tpReq: 0,
      iv: [],
    };
    g.rods.push(r.id);
    g.levers.push(best.lever);
    g.tensions.push(r.t);
    g.xi.push(best.xi);
    g.iv.push(best.iv);
    groups.set(best.key, g);
  }
  const out: TensionGroup[] = [];
  for (const g of groups.values()) {
    const beff = unionLength(g.iv);
    const M = g.tensions.reduce((s, t, k) => s + t * g.levers[k]!, 0);
    const m = beff > 0 ? M / beff : Infinity;
    const { iv: _iv, ...rest } = g;
    void _iv;
    out.push({ ...rest, beff, m, tpReq: tpFromM(m, plateFy, fb) });
  }
  return { groups: out, tp: Math.max(0, ...out.map((g) => g.tpReq)) };
}

/* ------------------------------------------------------------------ */
/* Stiffener member checks                                             */
/* ------------------------------------------------------------------ */

/** Point loads on a stiffener at distances xi from its root. */
export interface StiffenerPointLoads {
  t: number[];
  xi: number[];
}
export interface StiffenerTensionLoad extends StiffenerPointLoads {
  /** Weld length engaged on the rod side (45°, DG1 Ex. 4.7-7), mm. */
  beff: number;
}
/**
 * Bearing on a stiffener from a uniform block (plate coords): the load the
 * strip method sends to the stiffener (45° lines from the back corners: the
 * width min(y, cap) on each side at distance y from the critical line, plus
 * the stiffener thickness), lumped in 50 slices.
 */
export function stiffenerBearingLoad(
  p: StiffenerPlate,
  ts: number,
  region: PlateRect,
  fp: number,
): StiffenerPointLoads | null {
  if (fp <= 0) return null;
  const [rAlo, rAhi, rClo, rChi] =
    p.axis === "x"
      ? [region.x0, region.x1, region.y0, region.y1]
      : [region.y0, region.y1, region.x0, region.x1];
  const n = 50;
  const L = p.tip - p.loadFrom;
  if (L <= 0) return null;
  const out: StiffenerPointLoads = { t: [], xi: [] };
  for (let k = 0; k < n; k++) {
    const al = p.loadFrom + ((k + 0.5) * L) / n;
    const along = p.side * al;
    if (along < rAlo || along > rAhi) continue;
    const y = al - p.zoneStart;
    const lo = p.pos - ts / 2 - Math.min(y, p.capNeg),
      hi = p.pos + ts / 2 + Math.min(y, p.capPos);
    const w = Math.min(hi, rChi) - Math.max(lo, rClo);
    if (w <= 0) continue;
    out.t.push((fp * w * L) / n);
    out.xi.push(al - p.root);
  }
  return out.t.length ? out : null;
}

export interface SectionCapacity {
  mn: number;
  basis: string;
}
/** Nominal flexural strength of the stiffener section of height h. */
export function stiffenerMn(
  s: BasePlateStiffenerInput,
  h: number,
  lb: number,
  kind: "bearing" | "tension",
  tee: { tp: number; plateFy: number; be: number } | null,
): SectionCapacity {
  const t = s.t;
  const fy = s.fy;
  if (h <= 0) return { mn: 0, basis: "" };
  if (!tee) {
    const z = (t * h * h) / 4,
      sx = (t * h * h) / 6;
    const mp = fy * z;
    if (kind === "tension")
      return { mn: mp, basis: "F11.1 Mp = Fy Z (free edge in tension)" };
    const lam = (lb * h) / (t * t);
    if (lam <= (0.08 * E_STEEL) / fy)
      return { mn: mp, basis: `F11.1 Mp (Lb d/t² ${lam.toFixed(0)})` };
    if (lam <= (1.9 * E_STEEL) / fy)
      return {
        mn: Math.min(mp, (1.52 - (0.274 * lam * fy) / E_STEEL) * fy * sx),
        basis: `F11-3 LTB, Cb 1.0 (Lb d/t² ${lam.toFixed(0)})`,
      };
    const fcr = (1.9 * E_STEEL) / lam;
    return {
      mn: Math.min(mp, fcr * sx),
      basis: `F11-4 LTB, Fcr ${fcr.toFixed(0)} MPa (Lb d/t² ${lam.toFixed(0)})`,
    };
  }
  // Tee: stem = stiffener (t × h above the plate), flange = plate be × tp.
  const fyt = Math.min(fy, tee.plateFy);
  const af = tee.be * tee.tp,
    as = t * h,
    A = af + as;
  // y measured up from the plate top surface; flange at −tp..0.
  const ybar = (af * (-tee.tp / 2) + as * (h / 2)) / A;
  const I =
    (tee.be * tee.tp ** 3) / 12 +
    af * (ybar + tee.tp / 2) ** 2 +
    (t * h ** 3) / 12 +
    as * (h / 2 - ybar) ** 2;
  const cTip = h - ybar,
    cFl = ybar + tee.tp;
  const myMin = (fyt * I) / Math.max(cTip, cFl);
  // Plastic neutral axis.
  let z: number;
  if (af >= A / 2) {
    // PNA in the plate at depth dp below its top surface.
    const dp = A / (2 * tee.be);
    z =
      as * (h / 2 + dp) +
      (tee.be * dp * dp) / 2 +
      ((af - tee.be * dp) * (tee.tp - dp)) / 2;
  } else {
    const yp = (A / 2 - af) / t;
    z =
      af * (yp + tee.tp / 2) +
      t * yp * (yp / 2) +
      t * (h - yp) * ((h - yp) / 2);
  }
  if (kind === "tension")
    return {
      mn: Math.min(fyt * z, 1.6 * myMin),
      basis: `F9.1 tee, stem in tension: Mp ≤ 1.6My (be ${tee.be.toFixed(0)} mm)`,
    };
  const ls = h / t,
    r = Math.sqrt(E_STEEL / fyt);
  const fcr =
    ls <= 0.84 * r
      ? fyt
      : ls <= 1.52 * r
        ? (1.43 - 0.515 * ls * Math.sqrt(fyt / E_STEEL)) * fyt
        : (1.52 * E_STEEL) / (ls * ls);
  return {
    mn: (fcr * I) / cTip,
    basis: `F9 tee, stem in compression: Mn = Fcr Sx,tip, Fcr ${fcr.toFixed(0)} MPa (be ${tee.be.toFixed(0)} mm)`,
  };
}

export interface StiffenerMemberResult {
  id: string;
  group: StiffenerGroup;
  /** Governing load kind and root actions. */
  kind: "bearing" | "tension" | "none";
  vRoot: number;
  mRoot: number;
  flexure: {
    dcr: number;
    xi: number;
    h: number;
    mu: number;
    phiMn: number;
    basis: string;
  };
  shear: { dcr: number; vu: number; phiVn: number };
  weldColumn: { dcr: number; f: number; capacity: number; length: number };
  weldPlate: { dcr: number; f: number; capacity: number; length: number };
  column: {
    dcr: number;
    h: number;
    lb: number;
    phiRnWly: number;
    phiRnWcr: number;
  } | null;
}
export function memberCheck(
  ctx: StiffenerContext,
  st: Stiffening,
  p: StiffenerPlate,
  bearing: StiffenerPointLoads[],
  tension: StiffenerTensionLoad[],
): StiffenerMemberResult {
  const s = st.input;
  const fb = designFactor(aiscFactors.plateFlexure, ctx.method);
  const fv = designFactor(aiscFactors.elementShear, ctx.method);
  const fw = designFactor(aiscFactors.weld, ctx.method);
  const Ls = p.length;
  const h = (xi: number) => s.hc - ((s.hc - s.he) * xi) / Ls;
  const eps = Math.sqrt(235 / s.fy);
  const tee =
    s.section === "tee"
      ? {
          tp: ctx.tp,
          plateFy: ctx.plateFy,
          be:
            s.t +
            Math.min(15 * eps * ctx.tp, p.capNeg) +
            Math.min(15 * eps * ctx.tp, p.capPos),
        }
      : null;
  const flex = { dcr: 0, xi: 0, h: s.hc, mu: 0, phiMn: 0, basis: "" };
  const shear = { dcr: 0, vu: 0, phiVn: fv * 0.6 * s.fy * s.t * s.hc };
  let vRoot = 0,
    mRoot = 0,
    kind: StiffenerMemberResult["kind"] = "none";
  const cases: {
    kind: "bearing" | "tension";
    m: (xi: number) => number;
    v: (xi: number) => number;
  }[] = [
    ...[
      ...bearing.map((b) => ({ kind: "bearing" as const, l: b })),
      ...tension.map((b) => ({ kind: "tension" as const, l: b })),
    ].map(({ kind, l }) => ({
      kind,
      m: (xi: number) =>
        l.t.reduce(
          (acc, t, k) => acc + (l.xi[k]! > xi ? t * (l.xi[k]! - xi) : 0),
          0,
        ),
      v: (xi: number) =>
        l.t.reduce((acc, t, k) => acc + (l.xi[k]! > xi ? t : 0), 0),
    })),
  ];
  for (const c of cases) {
    const m0 = c.m(0);
    if (m0 > mRoot) {
      mRoot = m0;
      vRoot = c.v(0);
      kind = c.kind;
    }
    for (let k = 0; k <= 18; k++) {
      const xi = (Ls * k) / 20;
      const hh = h(xi);
      const mu = c.m(xi),
        vu = c.v(xi);
      if (mu > 0) {
        const cap = stiffenerMn(s, hh, Ls, c.kind, tee);
        const d = mu / (fb * cap.mn);
        if (d > flex.dcr)
          Object.assign(flex, {
            dcr: d,
            xi,
            h: hh,
            mu,
            phiMn: fb * cap.mn,
            basis: cap.basis,
          });
      }
      const phiVn = fv * 0.6 * s.fy * s.t * hh;
      if (vu > 0 && vu / phiVn > shear.dcr)
        Object.assign(shear, { dcr: vu / phiVn, vu, phiVn });
    }
  }
  // Stiffener-to-column fillets (two lines of Lw): V and M at the root.
  const lw = s.hc - s.clip;
  const capC = fw * 0.6 * ctx.fexx * 0.7071 * s.weldColumn;
  let fc = 0;
  for (const c of cases) {
    const v = c.v(0),
      m = c.m(0);
    fc = Math.max(fc, Math.hypot(v / (2 * lw), m / ((2 * lw * lw) / 6)));
  }
  // Stiffener-to-plate: rod tension over the 45° length on the rod side
  // (one fillet, kds = 1.5, DG1 Ex. 4.7-7). Bearing is by contact; with the
  // tee section the horizontal shear flow VQ/I is added (two fillets).
  const capP1 = fw * 0.6 * ctx.fexx * 0.7071 * s.weldPlate;
  let dcrP = 0,
    fP = 0,
    capP = capP1 * 1.5,
    lenP = Ls - s.clip;
  let qFlow = 0;
  if (tee) {
    const af = tee.be * tee.tp,
      as = s.t * s.hc;
    const ybar = (af * (-tee.tp / 2) + as * (s.hc / 2)) / (af + as);
    const I =
      (tee.be * tee.tp ** 3) / 12 +
      af * (ybar + tee.tp / 2) ** 2 +
      (s.t * s.hc ** 3) / 12 +
      as * (s.hc / 2 - ybar) ** 2;
    const Q = af * (ybar + tee.tp / 2);
    for (const c of cases) qFlow = Math.max(qFlow, (c.v(0) * Q) / I / 2);
  }
  for (const tl of tension) {
    const T = tl.t.reduce((a, b) => a + b, 0);
    const len = Math.max(tl.beff - s.clip, 1e-6);
    const ft = T / len;
    const f = tee ? Math.hypot(ft, qFlow) : ft;
    const cap = tee ? capP1 : capP1 * 1.5;
    if (f / cap > dcrP) {
      dcrP = f / cap;
      fP = f;
      capP = cap;
      lenP = len;
    }
  }
  if (tee && qFlow / capP1 > dcrP) {
    dcrP = qFlow / capP1;
    fP = qFlow;
    capP = capP1;
  }
  // Column web at a web-line stiffener (I-shape): J10.2 / J10.3 at the end.
  let column: StiffenerMemberResult["column"] = null;
  if (p.group === "web-line" && ctx.family === "I") {
    const H = (1.5 * mRoot) / lw,
      lb = lw / 2;
    const k = ctx.tf; // no fillet (kdes not stored): conservative
    const wly =
      designFactor(aiscFactors.webYielding, ctx.method) *
      ctx.columnFy *
      ctx.tw *
      (2.5 * k + lb);
    const ratio = lb / ctx.d;
    const base =
      0.4 * ctx.tw ** 2 * Math.sqrt((E_STEEL * ctx.columnFy * ctx.tf) / ctx.tw);
    const wcr =
      designFactor(aiscFactors.webCrippling, ctx.method) *
      base *
      (ratio <= 0.2
        ? 1 + 3 * ratio * (ctx.tw / ctx.tf) ** 1.5
        : 1 + (4 * ratio - 0.2) * (ctx.tw / ctx.tf) ** 1.5);
    column = {
      dcr: Math.max(H / wly, H / wcr),
      h: H,
      lb,
      phiRnWly: wly,
      phiRnWcr: wcr,
    };
  }
  return {
    id: p.id,
    group: p.group,
    kind,
    vRoot,
    mRoot,
    flexure: flex,
    shear,
    weldColumn: { dcr: fc / capC, f: fc, capacity: capC, length: lw },
    weldPlate: { dcr: dcrP, f: fP, capacity: capP, length: lenP },
    column,
  };
}

/** Free-edge slenderness: hc / ts vs 0.56√(E/Fy). */
export function stiffenerSlenderness(s: BasePlateStiffenerInput) {
  const limit = 0.56 * Math.sqrt(E_STEEL / s.fy);
  return { ratio: s.hc / s.t, limit, dcr: s.hc / s.t / limit };
}

/** Clear distance from each rod to the nearest stiffener face (beside it). */
export function stiffenerRodClearance(
  st: Stiffening,
  rods: { id: string; x: number; y: number }[],
  washer: number,
) {
  let min = Infinity,
    rod = "";
  for (const r of rods)
    for (const p of st.plates) {
      const along = p.axis === "x" ? r.x : r.y;
      const across = p.axis === "x" ? r.y : r.x;
      if (Math.sign(along) !== p.side) continue;
      const al = Math.abs(along);
      if (al < p.root - washer / 2 || al > p.tip + washer / 2) continue;
      const c = Math.abs(across - p.pos) - st.input.t / 2;
      if (c < min) {
        min = c;
        rod = r.id;
      }
    }
  const required = washer / 2 + st.input.weldPlate;
  return { min, rod, required };
}
