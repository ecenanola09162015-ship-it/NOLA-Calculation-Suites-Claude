/**
 * Pure geometry for the 3D P–Mx–My interaction view (no WebGL here, so it is
 * unit-tested and reused by the PDF figure). Scene axes: X = Mx, Y = P (up),
 * Z = My, all scaled into a ±1 box so both surfaces fit any section.
 */
import {
  biaxialSection,
  designCheckStatus,
  interactionSurface,
  type DesignCheckPolicy,
  type InteractionSurface,
  type RectangularColumnInput,
  type RectangularColumnResult,
} from "@nola/calc-core";

export type Vec3 = [number, number, number];
export interface Scale {
  m: number;
  pMin: number;
  pMax: number;
}
export interface DemandPoint {
  id: string;
  pu: number;
  mux: number;
  muy: number;
  dcr: number | null;
  status: string;
  color: string;
  governing: boolean;
  /** Capacity point on the design surface along the load ray at Pu. */
  capacity: { mx: number; my: number } | null;
}
export interface Interaction3DModel {
  surface: InteractionSurface;
  scale: Scale;
  points: DemandPoint[];
  governingPu: number;
}

export function buildInteraction3D(
  input: RectangularColumnInput,
  result: RectangularColumnResult,
  policy: DesignCheckPolicy,
): Interaction3DModel {
  const surface = interactionSurface(biaxialSection(input));
  let m = 0,
    pMin = Infinity,
    pMax = -Infinity;
  for (const grid of [surface.design, surface.nominal])
    for (const row of grid)
      for (const [mx, my, p] of row) {
        m = Math.max(m, Math.abs(mx), Math.abs(my));
        pMin = Math.min(pMin, p);
        pMax = Math.max(pMax, p);
      }
  const governingId = result.governing?.load.id;
  const points: DemandPoint[] = result.checks
    .filter((c) => c.load.included)
    .map((c) => {
      const dcr = Math.max(c.axialRatio ?? 0, c.biaxialRatio ?? 0);
      const st = designCheckStatus(dcr, policy);
      const ray =
        c.biaxial && c.biaxial.capacity > 0
          ? { mx: c.biaxial.mx, my: c.biaxial.my }
          : null;
      return {
        id: c.load.id,
        pu: c.load.pu,
        mux: c.mux,
        muy: c.muy,
        dcr,
        status: st.label,
        color: st.color,
        governing: c.load.id === governingId,
        capacity: ray,
      };
    });
  for (const p of points) {
    m = Math.max(m, Math.abs(p.mux), Math.abs(p.muy));
    pMin = Math.min(pMin, p.pu);
    pMax = Math.max(pMax, p.pu);
  }
  return {
    surface,
    scale: { m: m || 1, pMin, pMax: pMax > pMin ? pMax : pMin + 1 },
    points,
    governingPu: result.governing?.load.pu ?? 0,
  };
}

/** Engineering values → scene coordinates (±1 box). */
export function toScene(s: Scale, mx: number, my: number, p: number): Vec3 {
  const mid = (s.pMax + s.pMin) / 2,
    half = (s.pMax - s.pMin) / 2;
  return [mx / s.m, (p - mid) / half, my / s.m];
}
export function fromSceneP(s: Scale, y: number) {
  return (s.pMax + s.pMin) / 2 + (y * (s.pMax - s.pMin)) / 2;
}

/** Triangle mesh over the θ × c grid (θ wraps around). */
export function surfaceMesh(grid: Vec3[][], s: Scale) {
  const nt = grid.length,
    nc = grid[0]?.length ?? 0;
  const positions = new Float32Array(nt * nc * 3);
  grid.forEach((row, i) =>
    row.forEach(([mx, my, p], k) => {
      const v = toScene(s, mx, my, p);
      positions.set(v, (i * nc + k) * 3);
    }),
  );
  const indices: number[] = [];
  for (let i = 0; i < nt; i++) {
    const j = (i + 1) % nt;
    for (let k = 0; k < nc - 1; k++) {
      const a = i * nc + k,
        b = j * nc + k,
        c = j * nc + k + 1,
        d = i * nc + k + 1;
      indices.push(a, b, c, a, c, d);
    }
  }
  return { positions, indices, triangles: indices.length / 3 };
}

/**
 * Mx–My contour of a surface at axial load P, by linear interpolation along
 * each θ meridian (first crossing from tension upward).
 */
export function sliceAt(grid: Vec3[][], p: number): [number, number][] {
  const out: [number, number][] = [];
  for (const row of grid) {
    for (let k = 0; k < row.length - 1; k++) {
      const [x0, y0, p0] = row[k]!,
        [x1, y1, p1] = row[k + 1]!;
      if ((p0 - p) * (p1 - p) <= 0 && p1 !== p0) {
        const t = (p - p0) / (p1 - p0);
        out.push([x0 + t * (x1 - x0), y0 + t * (y1 - y0)]);
        break;
      }
    }
  }
  return out;
}

export type View3D = "iso" | "pmx" | "pmy" | "mxmy";
/** Camera position and up vector for each view (orthographic). */
export function cameraFor(view: View3D): { position: Vec3; up: Vec3 } {
  switch (view) {
    case "pmx":
      return { position: [0, 0, 6], up: [0, 1, 0] };
    case "pmy":
      return { position: [-6, 0, 0], up: [0, 1, 0] };
    case "mxmy":
      return { position: [0, -6, 0], up: [0, 0, 1] };
    default:
      return { position: [4, 3, 4], up: [0, 1, 0] };
  }
}

/** Isometric projection for the static PDF figure. */
export function isoProject([x, y, z]: Vec3): [number, number] {
  const a = Math.PI / 6;
  return [(x - z) * Math.cos(a), -y + (x + z) * Math.sin(a) * 0.6];
}
