/**
 * Pure 3D model of a retaining wall strip extruded along the wall (display
 * only). Engineering axes: x across the section from the toe edge, y along
 * the wall, z up from the footing underside (m). Section polygons come from
 * the shared engine geometry, so the 3D view, the section view and the
 * calculations always agree.
 */
import {
  clipPolygon,
  type RetainingWallInput,
  type RetainingWallResult,
} from "@nola/calc-core";

export type Pt2 = { x: number; z: number };
export type PrismKind = "concrete" | "soil" | "water" | "slab" | "prop";
export interface Prism {
  id: string;
  kind: PrismKind;
  polygon: Pt2[];
  y0: number;
  y1: number;
}
export interface PressureArrow {
  id: string;
  component: string;
  /** Arrow head on the stem back face; the tail is `length` towards +x. */
  x: number;
  y: number;
  z: number;
  length: number;
  /** Pressure at this point (service), kPa. */
  p: number;
}
export interface RetainingWall3DModel {
  length: number;
  prisms: Prism[];
  arrows: PressureArrow[];
  extent: number;
  center: { x: number; y: number; z: number };
}

const toPts = (p: { x: number; y: number }[]): Pt2[] => p.map((q) => ({ x: q.x, z: q.y }));

export function buildRetainingWall3DModel(
  i: RetainingWallInput,
  r: RetainingWallResult,
  length = 5,
): RetainingWall3DModel {
  const g = r.geometry,
    L = Math.max(1, length),
    tf = i.footing,
    top = g.stemTopLevel,
    basement = i.wallType === "basement";
  const prisms: Prism[] = [];
  const add = (id: string, kind: PrismKind, poly: { x: number; y: number }[] | null, y0 = 0, y1 = L) => {
    if (poly && poly.length >= 3) prisms.push({ id, kind, polygon: toPts(poly), y0, y1 });
  };
  add("stem", "concrete", g.stem);
  if (basement) {
    const ext = 1.2;
    add("base-slab", "slab", [
      { x: -ext, y: 0 },
      { x: g.backBase, y: 0 },
      { x: g.backBase, y: tf },
      { x: -ext, y: tf },
    ]);
    const ts = Math.max(0.15, tf);
    add("top-slab", "slab", [
      { x: -ext, y: top },
      { x: g.backTop, y: top },
      { x: g.backTop, y: top + ts },
      { x: -ext, y: top + ts },
    ]);
    add("backfill", "soil", [
      { x: g.backBase, y: tf },
      { x: g.backBase + 1.2, y: tf },
      { x: g.backBase + 1.2, y: top },
      { x: g.backTop, y: top },
    ]);
  } else {
    add("footing", "concrete", g.footing);
    add("key", "concrete", g.key);
    add("backfill", "soil", g.backfill);
    add("toe-soil", "soil", g.toeSoil);
  }
  if (i.water.enabled && i.water.back > (basement ? tf : 0)) {
    const wet = clipPolygon(
      basement
        ? [
            { x: g.backBase, y: tf },
            { x: g.backBase + 1.2, y: tf },
            { x: g.backBase + 1.2, y: top },
            { x: g.backTop, y: top },
          ]
        : g.backfill,
      i.water.back,
      "below",
    );
    add("water", "water", wet, -0.01, L + 0.01);
  }
  if (i.wallType === "propped") {
    const z = tf + i.prop.height,
      xf = g.frontBase + ((g.frontTop - g.frontBase) * i.prop.height) / i.height;
    const n = Math.max(2, Math.round(L / 1.5) + 1);
    for (let k = 0; k < n; k++) {
      const yc = (L * (k + 0.5)) / n;
      add(`prop-${k}`, "prop", [
        { x: xf - 1, y: z - 0.06 },
        { x: xf, y: z - 0.06 },
        { x: xf, y: z + 0.06 },
        { x: xf - 1, y: z + 0.06 },
      ], yc - 0.06, yc + 0.06);
    }
  }
  // Pressure arrows: one column per component along the wall, 8 levels each.
  const comps = r.stem.components.filter((c) => c.id !== "inertia" && c.force > 0);
  const pmax = Math.max(
    1e-9,
    ...comps.flatMap((c) => [0, 0.25, 0.5, 0.75, 1].map((f) => r.stem.pressure(c.id, f * i.height))),
  );
  const scale = (0.35 * i.height) / pmax;
  const arrows: PressureArrow[] = [];
  comps.forEach((c, k) => {
    const y = (L * (k + 1)) / (comps.length + 1);
    for (let j = 0; j < 8; j++) {
      const h = (i.height * (j + 0.5)) / 8;
      const p = r.stem.pressure(c.id, h);
      if (p <= 1e-6) continue;
      const xb = g.backBase + ((g.backTop - g.backBase) * h) / i.height;
      arrows.push({ id: `${c.id}-${j}`, component: c.id, x: xb, y, z: tf + h, length: p * scale, p });
    }
  });
  const xs = prisms.flatMap((p) => p.polygon.map((q) => q.x)),
    zs = prisms.flatMap((p) => p.polygon.map((q) => q.z));
  const xmin = Math.min(...xs, 0),
    xmax = Math.max(...xs, g.width) + 0.4 * i.height,
    zmin = Math.min(...zs, 0),
    zmax = Math.max(...zs, top);
  return {
    length: L,
    prisms,
    arrows,
    extent: Math.hypot(xmax - xmin, L, zmax - zmin),
    center: { x: (xmin + xmax) / 2, y: L / 2, z: (zmin + zmax) / 2 },
  };
}
