/**
 * Geometry helpers for the stair section drawing (mm): bar lines offset
 * from the soffit / top reference line, clipped to bar zones, with
 * crossed bars at re-entrant knees (decision C6: no bar bent round a
 * re-entrant corner).
 */
import type { StairStripGeometry, StairsInput } from "@nola/calc-core";

export type Pt = { x: number; y: number };

const sub = (a: Pt, b: Pt) => ({ x: a.x - b.x, y: a.y - b.y });
const unit = (v: Pt) => {
  const l = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / l, y: v.y / l };
};
/** Left normal of a direction (upward for left-to-right travel). */
const left = (v: Pt) => ({ x: -v.y, y: v.x });

/**
 * Offset an open polyline by d (positive = to the left of travel, i.e.
 * upward for a left-to-right line), mitred at vertices.
 */
export function offsetPolyline(points: Pt[], d: number): Pt[] {
  if (points.length < 2) return points.slice();
  const segs = points.slice(1).map((p, k) => {
    const dir = unit(sub(p, points[k])),
      n = left(dir);
    return {
      a: { x: points[k].x + n.x * d, y: points[k].y + n.y * d },
      b: { x: p.x + n.x * d, y: p.y + n.y * d },
      dir,
    };
  });
  const out: Pt[] = [segs[0].a];
  for (let k = 0; k < segs.length - 1; k++) {
    const s1 = segs[k],
      s2 = segs[k + 1];
    const cross = s1.dir.x * s2.dir.y - s1.dir.y * s2.dir.x;
    if (Math.abs(cross) < 1e-9) {
      out.push(s1.b);
      continue;
    }
    const t =
      ((s2.a.x - s1.a.x) * s2.dir.y - (s2.a.y - s1.a.y) * s2.dir.x) / cross;
    out.push({ x: s1.a.x + s1.dir.x * t, y: s1.a.y + s1.dir.y * t });
  }
  out.push(segs[segs.length - 1].b);
  return out;
}

/** Portion of a polyline with x in [x0, x1] (plan positions). */
export function clipPolyline(points: Pt[], x0: number, x1: number): Pt[] {
  const out: Pt[] = [];
  const at = (a: Pt, b: Pt, x: number) =>
    Math.abs(b.x - a.x) < 1e-9
      ? { x, y: a.y }
      : { x, y: a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y) };
  for (let k = 0; k < points.length - 1; k++) {
    const a = points[k],
      b = points[k + 1];
    const lo = Math.max(x0, Math.min(a.x, b.x)),
      hi = Math.min(x1, Math.max(a.x, b.x));
    if (hi < lo - 1e-9) continue;
    const p = at(a, b, lo),
      q = at(a, b, hi);
    if (
      !out.length ||
      Math.hypot(out[out.length - 1].x - p.x, out[out.length - 1].y - p.y) >
        1e-6
    )
      out.push(p);
    out.push(q);
  }
  return out;
}

/**
 * Split a bar polyline at vertices where the bar would bend round a
 * re-entrant corner (turning direction `concave`: +1 turns left/up, −1
 * turns right/down), extending each part past the vertex by `extension`.
 */
export function crossAtKnees(
  points: Pt[],
  concave: 1 | -1,
  extension: number,
  boundary?: Pt[],
): Pt[][] {
  const parts: Pt[][] = [];
  let current: Pt[] = [points[0]];
  for (let k = 1; k < points.length - 1; k++) {
    const d1 = unit(sub(points[k], points[k - 1])),
      d2 = unit(sub(points[k + 1], points[k]));
    const turn = d1.x * d2.y - d1.y * d2.x;
    if (Math.sign(turn) === concave && Math.abs(turn) > 1e-3) {
      current.push(...extendWithin(points[k], d1, extension, boundary));
      parts.push(current);
      current = extendWithin(
        points[k],
        { x: -d2.x, y: -d2.y },
        extension,
        boundary,
      ).reverse();
    } else current.push(points[k]);
  }
  current.push(points[points.length - 1]);
  parts.push(current);
  return parts;
}

/**
 * Points of a straight extension from p along dir for `length`; if it
 * meets the opposite bar layer (`boundary`) first, it stops there and runs
 * along that layer for the remaining length (bar stays inside the section).
 */
export function extendWithin(
  p: Pt,
  dir: Pt,
  length: number,
  boundary?: Pt[],
): Pt[] {
  const end = { x: p.x + dir.x * length, y: p.y + dir.y * length };
  if (!boundary || boundary.length < 2) return [end];
  let best: { t: number; q: Pt } | null = null;
  for (let k = 0; k < boundary.length - 1; k++) {
    const a = boundary[k],
      b = boundary[k + 1];
    const e = sub(b, a);
    const den = dir.x * e.y - dir.y * e.x;
    if (Math.abs(den) < 1e-12) continue;
    const w = sub(a, p);
    const t = (w.x * e.y - w.y * e.x) / den,
      u = (w.x * dir.y - w.y * dir.x) / den;
    if (t > 1e-6 && t < length && u >= -1e-9 && u <= 1 + 1e-9)
      if (!best || t < best.t)
        best = { t, q: { x: p.x + dir.x * t, y: p.y + dir.y * t } };
  }
  if (!best) return [end];
  const rest = length - best.t,
    sign = dir.x >= 0 ? 1 : -1;
  const along = clipPolyline(
    boundary,
    Math.min(best.q.x, best.q.x + sign * rest),
    Math.max(best.q.x, best.q.x + sign * rest),
  );
  const ordered = sign > 0 ? along : along.slice().reverse();
  return [best.q, ...ordered.slice(1)];
}

export interface StairBarLines {
  bottom: Pt[][];
  top: { set: "topBottom" | "topTop" | "topKnee"; lines: Pt[][] }[];
  distribution: Pt[];
}

/** Bar lines of one strip for the section drawing. */
export function stairBarLines(
  i: StairsInput,
  g: StairStripGeometry,
): StairBarLines {
  const mb = i.bars.mainBottom;
  // Bottom bars: up from the soffit; soffit turning down-to-flat from below
  // (slope decreasing → turn right, −1) is the re-entrant (upper) knee.
  const bottomLine = offsetPolyline(g.soffit, i.bottomCover + mb.diameter / 2);
  const topLine = offsetPolyline(g.topRef, -(i.topCover + mb.diameter / 2));
  // Extensions past a knee stop at the opposite layer and run along it.
  const bottom = crossAtKnees(bottomLine, -1, i.kneeExtension, topLine);
  const firstStrip = g.index === 1,
    lastStrip = i.stairType === "single" || g.index === 2;
  const zones: {
    set: "topBottom" | "topTop" | "topKnee";
    x0: number;
    x1: number;
  }[] = [];
  for (const s of g.supports) {
    const set =
      s.role === "bottom" && firstStrip
        ? "topBottom"
        : s.role === "top" && lastStrip
          ? "topTop"
          : "topKnee";
    const e = i.bars[set].extension;
    zones.push({
      set,
      x0: Math.max(0, s.x - e),
      x1: Math.min(g.length, s.x + e),
    });
  }
  for (const k of g.knees) {
    const e = i.bars.topKnee.extension;
    zones.push({
      set: "topKnee",
      x0: Math.max(0, k.x - e),
      x1: Math.min(g.length, k.x + e),
    });
  }
  const top = zones.map((z) => {
    const b = i.bars[z.set];
    const line = clipPolyline(
      offsetPolyline(g.topRef, -(i.topCover + b.diameter / 2)),
      z.x0,
      z.x1,
    );
    // Top line turning up (slope increasing, +1) is the re-entrant (lower) knee.
    return {
      set: z.set,
      lines:
        line.length > 1
          ? crossAtKnees(line, 1, Math.min(i.kneeExtension, 300), bottomLine)
          : [],
    };
  });
  // Distribution bars: dots on the inner side of the main bottom bars.
  const d = i.bars.distribution;
  const distLine = offsetPolyline(
    g.soffit,
    i.bottomCover + mb.diameter + d.diameter / 2,
  );
  const distribution: Pt[] = [];
  let carry = d.spacing / 2;
  for (let k = 0; k < distLine.length - 1; k++) {
    const a = distLine[k],
      b = distLine[k + 1],
      len = Math.hypot(b.x - a.x, b.y - a.y);
    let s = carry;
    while (s <= len) {
      distribution.push({
        x: a.x + ((b.x - a.x) * s) / len,
        y: a.y + ((b.y - a.y) * s) / len,
      });
      s += d.spacing;
    }
    carry = s - len;
  }
  return { bottom, top, distribution };
}

/** SVG path data for a polyline in drawing coordinates (y flipped). */
export const pathOf = (pts: Pt[]) =>
  pts
    .map((p, k) => `${k ? "L" : "M"}${p.x.toFixed(1)} ${(-p.y).toFixed(1)}`)
    .join(" ");
