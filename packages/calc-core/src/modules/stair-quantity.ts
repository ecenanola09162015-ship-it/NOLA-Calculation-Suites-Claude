/**
 * Stairs quantity estimate (decision U5, sheet 16 Oct 2026): concrete,
 * formwork and reinforcement for the design width — 1.0 m strip or the
 * full flight width (S6). Measured from the support centrelines along the
 * strip geometry of stair-design.ts.
 *
 * Basis (printed in the panel and report):
 * - Concrete: area between the stepped top and the soffit × width; landings
 *   use their own width in full-width mode (dog-leg mid landing: half the
 *   landing width per strip). Bearing seats beyond the centreline excluded.
 * - Formwork: soffit length × width, riser faces N·R × width, and both side
 *   faces (concrete profile area × 2, deduct where cast against walls).
 * - Reinforcement: bar count = floor(width / s) + 1 across, lengths along
 *   the developed bar line plus anchorage / knee extensions; no laps or
 *   wastage (add per project practice). Mass 7850 kg/m³.
 */
import {
  stairGeometry,
  type StairStripGeometry,
  type StairsInput,
  StairGeometryError,
} from "./stair-design";

export const STEEL_DENSITY = 7850; // kg/m³
/** Bar mass per metre, kg/m. */
export const barMassPerMetre = (db: number) =>
  ((Math.PI * db * db) / 4) * 1e-6 * STEEL_DENSITY;

type Pt = { x: number; y: number };

/** Height of the concrete (top − soffit) at x, mm, from the profile polylines. */
function yOn(poly: Pt[], x: number, pick: "min" | "max") {
  const ys: number[] = [];
  for (let k = 0; k < poly.length - 1; k++) {
    const a = poly[k],
      b = poly[k + 1];
    const lo = Math.min(a.x, b.x),
      hi = Math.max(a.x, b.x);
    if (x < lo - 1e-9 || x > hi + 1e-9) continue;
    if (Math.abs(b.x - a.x) < 1e-9) ys.push(a.y, b.y);
    else ys.push(a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y));
  }
  if (!ys.length) return NaN;
  return pick === "min" ? Math.min(...ys) : Math.max(...ys);
}
/** Profile area between top and soffit over [x0, x1], mm² (midpoint rule, 1 mm steps). */
export function stairProfileArea(g: StairStripGeometry, x0 = 0, x1 = g.length) {
  const n = Math.max(1, Math.ceil(x1 - x0));
  const dx = (x1 - x0) / n;
  let a = 0;
  for (let k = 0; k < n; k++) {
    const x = x0 + (k + 0.5) * dx;
    const h = yOn(g.top, x, "max") - yOn(g.soffit, x, "min");
    if (Number.isFinite(h) && h > 0) a += h * dx;
  }
  return a;
}
const polyLength = (p: Pt[]) =>
  p.slice(1).reduce((s, q, k) => s + Math.hypot(q.x - p[k].x, q.y - p[k].y), 0);
/** Developed length of a polyline between plan positions x0 and x1, mm. */
function polyLengthBetween(p: Pt[], x0: number, x1: number) {
  let s = 0;
  for (let k = 0; k < p.length - 1; k++) {
    const a = p[k],
      b = p[k + 1];
    if (Math.abs(b.x - a.x) < 1e-9) continue;
    const lo = Math.max(x0, Math.min(a.x, b.x)),
      hi = Math.min(x1, Math.max(a.x, b.x));
    if (hi <= lo) continue;
    s += (hi - lo) * (Math.hypot(b.x - a.x, b.y - a.y) / Math.abs(b.x - a.x));
  }
  return s;
}

export interface StairQuantityBarRow {
  mark: string;
  label: string;
  strip: string;
  diameter: number;
  spacing: number;
  count: number;
  /** Length of one bar, mm. */
  length: number;
  /** kg. */
  mass: number;
}
export interface StairQuantityRow {
  item: string;
  strip: string;
  quantity: number;
  unit: "m³" | "m²";
  basis: string;
}
export interface StairQuantityResult {
  widthMode: StairsInput["widthMode"];
  /** Width used for the flight, m. */
  widthM: number;
  concrete: StairQuantityRow[];
  formwork: StairQuantityRow[];
  bars: StairQuantityBarRow[];
  totals: {
    concrete: number;
    formwork: number;
    steel: number;
    steelRatio: number;
  };
  notes: string[];
  error: string | null;
}

export function stairQuantities(i: StairsInput): StairQuantityResult {
  const W = i.widthMode === "full" ? i.flightWidth : 1000; // mm
  const empty = (error: string): StairQuantityResult => ({
    widthMode: i.widthMode,
    widthM: W / 1000,
    concrete: [],
    formwork: [],
    bars: [],
    totals: { concrete: 0, formwork: 0, steel: 0, steelRatio: 0 },
    notes: [],
    error,
  });
  let geos: StairStripGeometry[];
  try {
    geos = stairGeometry(i);
  } catch (e) {
    if (e instanceof StairGeometryError) return empty(e.message);
    throw e;
  }
  const concrete: StairQuantityRow[] = [],
    formwork: StairQuantityRow[] = [],
    bars: StairQuantityBarRow[] = [];
  const full = i.widthMode === "full";
  const landingWidth = (label: string) => {
    if (!full) return 1000;
    const mid = /Mid landing/.test(label);
    const src = /Bottom/.test(label)
      ? i.bottomLanding
      : /Top/.test(label)
        ? i.topLanding
        : i.flights.find((f) => f.landingAfter)?.landingAfter;
    const w =
      src?.width || (mid ? 2 * i.flightWidth + i.flightGap : i.flightWidth);
    return mid ? w / 2 : w;
  };
  const count = (s: number) => Math.floor((W - 2 * i.bottomCover) / s) + 1;
  for (const g of geos) {
    const strip =
      i.stairType === "single" ? "Stair" : g.label.replace(" strip", "");
    // concrete per region (landings may be wider than the flight)
    let profileTotal = 0;
    for (const r of g.regions) {
      const a = stairProfileArea(g, r.x0, r.x1);
      profileTotal += a;
      const w = r.kind === "landing" ? landingWidth(r.label) : W;
      concrete.push({
        item: `Concrete · ${r.label}`,
        strip,
        quantity: (a * w) / 1e9,
        unit: "m³",
        basis: `profile ${(a / 1e6).toFixed(4)} m² × ${(w / 1000).toFixed(3)} m`,
      });
    }
    // soffit, risers, sides
    const soffitLen = polyLength(g.soffit);
    formwork.push({
      item: "Formwork · soffit",
      strip,
      quantity: (soffitLen * W) / 1e6,
      unit: "m²",
      basis: `soffit ${(soffitLen / 1000).toFixed(3)} m × ${(W / 1000).toFixed(3)} m`,
    });
    const risers = g.flights.reduce((s, f) => s + f.risers, 0);
    formwork.push({
      item: "Formwork · riser faces",
      strip,
      quantity: (risers * i.riser * W) / 1e6,
      unit: "m²",
      basis: `${risers} × ${i.riser} mm × ${(W / 1000).toFixed(3)} m`,
    });
    formwork.push({
      item: "Formwork · side faces (both)",
      strip,
      quantity: (2 * profileTotal) / 1e6,
      unit: "m²",
      basis: `2 × profile ${(profileTotal / 1e6).toFixed(4)} m²`,
    });
    // bars
    const devBottom = polyLength(g.soffit);
    const ends = g.supports.filter(
      (s) => s.role === "bottom" || s.role === "top" || s.role === "mid",
    );
    const anchor = ends.reduce((s, e) => s + Math.max(0, e.bearing - 50), 0);
    const add = (row: Omit<StairQuantityBarRow, "mass">) =>
      bars.push({
        ...row,
        mass: row.count * (row.length / 1000) * barMassPerMetre(row.diameter),
      });
    const mb = i.bars.mainBottom;
    add({
      mark: `${g.index}B1`,
      label: "Main bottom bars",
      strip,
      diameter: mb.diameter,
      spacing: mb.spacing,
      count: count(mb.spacing),
      length: devBottom + anchor + g.knees.length * i.kneeExtension,
    });
    const firstStrip = g.index === 1,
      lastStrip = i.stairType === "single" || g.index === 2;
    const tops: {
      mark: string;
      label: string;
      key: "topBottom" | "topTop" | "topKnee";
      ranges: [number, number][];
    }[] = [];
    const rng = (x: number, ext: number): [number, number] => [
      Math.max(0, x - ext),
      Math.min(g.length, x + ext),
    ];
    for (const s of g.supports) {
      const key =
        s.role === "bottom" && firstStrip
          ? "topBottom"
          : s.role === "top" && lastStrip
            ? "topTop"
            : "topKnee";
      tops.push({
        mark: "",
        label:
          key === "topBottom"
            ? "Top bars · bottom support"
            : key === "topTop"
              ? "Top bars · top support"
              : `Top bars · ${s.label}`,
        key,
        ranges: [rng(s.x, i.bars[key].extension)],
      });
    }
    for (const k of g.knees)
      tops.push({
        mark: "",
        label: "Top bars · knee",
        key: "topKnee",
        ranges: [rng(k.x, i.bars.topKnee.extension)],
      });
    tops.forEach((t, n) => {
      const b = i.bars[t.key];
      const len =
        t.ranges.reduce(
          (s, [a, c]) => s + polyLengthBetween(g.topRef, a, c),
          0,
        ) +
        2 * 12 * b.diameter;
      add({
        mark: `${g.index}T${n + 1}`,
        label: t.label,
        strip,
        diameter: b.diameter,
        spacing: b.spacing,
        count: count(b.spacing),
        length: len,
      });
    });
    const dist = i.bars.distribution;
    const nDist = Math.floor(devBottom / dist.spacing) + 1;
    add({
      mark: `${g.index}D1`,
      label: "Distribution bars (bottom layer)",
      strip,
      diameter: dist.diameter,
      spacing: dist.spacing,
      count: nDist,
      length: W - 2 * i.bottomCover,
    });
  }
  // footing
  const f = i.bottomSupport.footing;
  if (i.bottomSupport.onGround && f.design) {
    concrete.push({
      item: "Concrete · strip footing",
      strip: "Footing",
      quantity: (f.width * f.thickness * W) / 1e9,
      unit: "m³",
      basis: `${f.width} × ${f.thickness} mm × ${(W / 1000).toFixed(3)} m`,
    });
    formwork.push({
      item: "Formwork · footing sides",
      strip: "Footing",
      quantity: (2 * f.thickness * W) / 1e6,
      unit: "m²",
      basis: `2 × ${f.thickness} mm × ${(W / 1000).toFixed(3)} m (ends excluded)`,
    });
    const n = Math.floor((W - 2 * f.cover) / f.bars.spacing) + 1;
    bars.push({
      mark: "F1",
      label: "Footing bars (across the run)",
      strip: "Footing",
      diameter: f.bars.diameter,
      spacing: f.bars.spacing,
      count: n,
      length: f.width - 2 * f.cover,
      mass:
        n * ((f.width - 2 * f.cover) / 1000) * barMassPerMetre(f.bars.diameter),
    });
  }
  const totalConcrete = concrete.reduce((s, r) => s + r.quantity, 0),
    totalForm = formwork.reduce((s, r) => s + r.quantity, 0),
    totalSteel = bars.reduce((s, r) => s + r.mass, 0);
  return {
    widthMode: i.widthMode,
    widthM: W / 1000,
    concrete,
    formwork,
    bars,
    totals: {
      concrete: totalConcrete,
      formwork: totalForm,
      steel: totalSteel,
      steelRatio: totalConcrete > 0 ? totalSteel / totalConcrete : 0,
    },
    notes: [
      full
        ? `Full width: flight ${i.flightWidth} mm; landings at their own width (dog-leg mid landing shared half per flight).`
        : "1 m design strip: quantities per metre width of flight and landings.",
      "Measured from support centrelines; bearing seats and supporting beams/walls excluded.",
      "Side formwork assumes both faces are formed — deduct faces cast against walls.",
      "Bar lengths include support anchorage (bearing − 50 mm), knee extensions and 12db end allowance on top bars; no laps or wastage.",
    ],
    error: null,
  };
}
