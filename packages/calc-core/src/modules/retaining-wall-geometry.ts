/**
 * Retaining wall section geometry (per metre). x from the toe edge towards the
 * heel, y up from the underside of the footing (m). Polygons are listed
 * counter-clockwise and shared by the engine (weights, lever arms) and the
 * drawings (section view, 3D), so both always agree.
 */
import type { RetainingWallInput } from "./retaining-wall";

export type Pt = { x: number; y: number };
export type Polygon = Pt[];

export interface RetainingWallGeometry {
  /** Total base width B = toe + stem base + heel. */
  width: number;
  /** Stem faces at the base and the top. */
  frontBase: number;
  backBase: number;
  frontTop: number;
  backTop: number;
  /** Top of footing and top of stem levels. */
  footingTop: number;
  stemTopLevel: number;
  /** Ground level at the heel end (virtual back plane top). */
  heelGround: number;
  /** Height of the virtual back plane through the heel end, from the footing underside. */
  virtualHeight: number;
  stem: Polygon;
  footing: Polygon;
  key: Polygon | null;
  /** Retained soil above the heel and behind the stem, up to the ground line. */
  backfill: Polygon;
  /** Soil over the toe (null when there is no cover or no toe). */
  toeSoil: Polygon | null;
}

/** Stem thickness at height y above the top of the footing (m). */
export function stemThickness(i: RetainingWallInput, y: number) {
  const r = Math.min(1, Math.max(0, y / i.height));
  return i.stemBase + (i.stemTop - i.stemBase) * r;
}

export function retainingWallGeometry(i: RetainingWallInput): RetainingWallGeometry {
  const basement = i.wallType === "basement";
  const toe = basement ? 0 : i.toe,
    heel = basement ? 0 : i.heel;
  const width = toe + i.stemBase + heel,
    tf = i.footing,
    top = tf + i.height;
  const frontBase = toe,
    backBase = toe + i.stemBase;
  const frontTop = i.batter === "front" ? backBase - i.stemTop : frontBase;
  const backTop = i.batter === "front" ? backBase : frontBase + i.stemTop;
  const slope = Math.tan((i.soil.beta * Math.PI) / 180);
  const heelGround = top + (width - backTop) * slope;
  const stem: Polygon = [
    { x: frontBase, y: tf },
    { x: backBase, y: tf },
    { x: backTop, y: top },
    { x: frontTop, y: top },
  ];
  const footing: Polygon = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: tf },
    { x: 0, y: tf },
  ];
  const key =
    i.key.enabled && !basement
      ? [
          { x: i.key.offset, y: -i.key.depth },
          { x: i.key.offset + i.key.width, y: -i.key.depth },
          { x: i.key.offset + i.key.width, y: 0 },
          { x: i.key.offset, y: 0 },
        ]
      : null;
  const backfill: Polygon = [
    { x: backBase, y: tf },
    { x: width, y: tf },
    { x: width, y: heelGround },
    { x: backTop, y: top },
  ];
  const cover = Math.min(i.toeSoil.cover, i.height);
  const frontAt = (y: number) =>
    frontBase + ((y - tf) / i.height) * (frontTop - frontBase);
  const toeSoil =
    cover > 0 && toe > 0 && !basement
      ? [
          { x: 0, y: tf },
          { x: frontBase, y: tf },
          { x: frontAt(tf + cover), y: tf + cover },
          { x: 0, y: tf + cover },
        ]
      : null;
  return {
    width,
    frontBase,
    backBase,
    frontTop,
    backTop,
    footingTop: tf,
    stemTopLevel: top,
    heelGround,
    virtualHeight: heelGround,
    stem,
    footing,
    key,
    backfill,
    toeSoil,
  };
}

/** Signed area (counter-clockwise positive) and centroid of a polygon. */
export function polygonProperties(p: Polygon) {
  let a = 0,
    cx = 0,
    cy = 0;
  for (let k = 0; k < p.length; k++) {
    const u = p.at(k)!,
      v = p.at((k + 1) % p.length)!,
      c = u.x * v.y - v.x * u.y;
    a += c;
    cx += (u.x + v.x) * c;
    cy += (u.y + v.y) * c;
  }
  a /= 2;
  if (Math.abs(a) < 1e-12) return { area: 0, cx: 0, cy: 0 };
  return { area: a, cx: cx / (6 * a), cy: cy / (6 * a) };
}

/** Clip a polygon to the half-plane y ≤ level (below) or y ≥ level (above). */
export function clipPolygon(p: Polygon, level: number, keep: "below" | "above") {
  const inside = (q: Pt) => (keep === "below" ? q.y <= level : q.y >= level);
  const out: Polygon = [];
  for (let k = 0; k < p.length; k++) {
    const u = p.at(k)!,
      v = p.at((k + 1) % p.length)!;
    if (inside(u)) out.push(u);
    if (inside(u) !== inside(v)) {
      const t = (level - u.y) / (v.y - u.y);
      out.push({ x: u.x + t * (v.x - u.x), y: level });
    }
  }
  return out;
}
