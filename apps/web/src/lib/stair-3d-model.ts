/**
 * Pure 3-D model of a stair for the three.js view (decision D5): solids
 * extruded from the strip profiles, supports, design-strip band and loads.
 * Engineering coordinates in metres: X along the run on plan, Y up,
 * Z across the stair (0 at the flight-1 outer edge).
 */
import { stairBarLines } from "./stair-drawing";
import {
  STAIR_BEAM_DEPTH,
  stairGeometry,
  type StairBarSetId,
  type StairLocalLoad,
  type StairStripGeometry,
  type StairsInput,
} from "@nola/calc-core";

export interface Stair3DPoint {
  x: number;
  y: number;
}
export interface Stair3DSolid {
  label: string;
  /** Profile in the X–Y plane (m), closed. */
  profile: Stair3DPoint[];
  z0: number;
  z1: number;
}
export interface Stair3DBox {
  label: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
  kind: "beam" | "footing" | "landing" | "wall";
}
export interface Stair3DArrow {
  x: number;
  y: number;
  z: number;
  length: number;
}
export interface Stair3DLoad {
  id: string;
  kind: "uniform" | StairLocalLoad["kind"];
  label: string;
  arrows: Stair3DArrow[];
  /** Footprint on the walking surface (m). */
  footprint: { x0: number; x1: number; z0: number; z1: number; y: number };
}
export interface Stair3DModel {
  solids: Stair3DSolid[];
  boxes: Stair3DBox[];
  loads: Stair3DLoad[];
  /** Design strip band (1 m strip mode): polylines along the walking line. */
  band: { z0: number; z1: number; line: Stair3DPoint[] }[] | null;
  /** Rebar layer (V3): straight segments per bar set, metres. */
  bars: Stair3DBarSet[];
  extent: number;
  centre: { x: number; y: number; z: number };
  widthMode: StairsInput["widthMode"];
}
export interface Stair3DBarSet {
  set: StairBarSetId;
  /** Bar radius, m. */
  radius: number;
  /** [x1, y1, z1, x2, y2, z2] segments, m. */
  segments: [number, number, number, number, number, number][];
}

type Pt = { x: number; y: number };
const yTop = (top: Pt[], x: number) => {
  let best = -Infinity;
  for (let k = 0; k < top.length - 1; k++) {
    const a = top[k],
      b = top[k + 1];
    const lo = Math.min(a.x, b.x),
      hi = Math.max(a.x, b.x);
    if (x < lo - 1e-6 || x > hi + 1e-6) continue;
    const y =
      Math.abs(b.x - a.x) < 1e-9
        ? Math.max(a.y, b.y)
        : a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y);
    best = Math.max(best, y);
  }
  return Number.isFinite(best) ? best : top[top.length - 1].y;
};
const ySoffit = (soffit: Pt[], x: number) => {
  for (let k = 0; k < soffit.length - 1; k++) {
    const a = soffit[k],
      b = soffit[k + 1];
    if (x >= a.x - 1e-6 && x <= b.x + 1e-6)
      return Math.abs(b.x - a.x) < 1e-9
        ? Math.min(a.y, b.y)
        : a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y);
  }
  return soffit[soffit.length - 1].y;
};

/** Plan mapping of a strip: X = sign·x + offset, Z band. */
interface Placement {
  g: StairStripGeometry;
  sign: 1 | -1;
  offset: number;
  z0: number;
  z1: number;
}

export function buildStair3DModel(i: StairsInput): Stair3DModel {
  const geos = stairGeometry(i);
  const B = i.flightWidth / 1000,
    gap = i.flightGap / 1000;
  const L1 = geos[0].length / 1000;
  const places: Placement[] = geos.map((g, k) =>
    k === 0
      ? { g, sign: 1, offset: 0, z0: 0, z1: B }
      : { g, sign: -1, offset: L1, z0: B + gap, z1: 2 * B + gap },
  );
  const X = (p: Placement, xmm: number) => p.offset + (p.sign * xmm) / 1000;
  const solids: Stair3DSolid[] = places.map((p) => ({
    label: p.g.label,
    profile: p.g.outline.map((q) => ({ x: X(p, q.x), y: q.y / 1000 })),
    z0: p.z0,
    z1: p.z1,
  }));
  const boxes: Stair3DBox[] = [];
  // Landings wider than the flight (single type) and the dog-leg mid-landing gap.
  for (const p of places)
    for (const r of p.g.regions) {
      if (r.kind !== "landing") continue;
      const piece = p.g.pieces.find((q) => q.label === r.label);
      if (!piece) continue;
      const topY = (piece.start.y + piece.h / 2) / 1000,
        h = piece.h / 1000;
      const xa = X(p, r.x0),
        xb = X(p, r.x1);
      const mid = /Mid landing/.test(r.label);
      if (mid && p.g.index === 1 && gap > 0)
        boxes.push({
          label: "Mid landing (between flights)",
          x0: Math.min(xa, xb),
          x1: Math.max(xa, xb),
          y0: topY - h,
          y1: topY,
          z0: B,
          z1: B + gap,
          kind: "landing",
        });
      const src = /Bottom/.test(r.label)
        ? i.bottomLanding
        : /Top/.test(r.label)
          ? i.topLanding
          : null;
      const w = (src?.width ?? 0) / 1000;
      if (!mid && i.stairType === "single" && w > B + 1e-6)
        boxes.push({
          label: `${r.label} (beyond flight width)`,
          x0: Math.min(xa, xb),
          x1: Math.max(xa, xb),
          y0: topY - h,
          y1: topY,
          z0: B,
          z1: w,
          kind: "landing",
        });
    }
  // Supports
  const zAll = (p: Placement) =>
    i.stairType === "dog-leg"
      ? { z0: 0, z1: 2 * B + gap }
      : { z0: p.z0, z1: p.z1 };
  const seen = new Set<string>();
  for (const p of places)
    for (const s of p.g.supports) {
      const key = s.role === "mid" ? "mid" : `${p.g.index}:${s.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const x = X(p, s.x),
        half = s.bearing / 2000,
        ys = ySoffit(p.g.soffit, s.x) / 1000;
      const ground = s.role === "bottom" && i.bottomSupport.onGround;
      const zz = s.role === "mid" ? zAll(p) : { z0: p.z0, z1: p.z1 };
      if (ground) {
        const f = i.bottomSupport.footing;
        const fw = (f.design ? f.width : s.bearing) / 1000,
          ft = (f.design ? f.thickness : 300) / 1000;
        boxes.push({
          label: f.design ? "Strip footing" : "Bearing on ground",
          x0: x - fw / 2,
          x1: x + fw / 2,
          y0: ys - ft,
          y1: ys,
          z0: zz.z0,
          z1: zz.z1,
          kind: "footing",
        });
      } else {
        // V1: beam top flush with the finished level (landing / floor) at the support.
        // Strip ends take the floor level there (first / last point of the
        // stepped top); elsewhere the landing level at the support.
        const top =
          (s.x <= 0.5
            ? p.g.top[0].y
            : s.x >= p.g.length - 0.5
              ? p.g.top[p.g.top.length - 1].y
              : yTop(p.g.top, s.x)) / 1000;
        const depth =
          ((s.role === "bottom"
            ? i.bottomSupport.beamDepth
            : i.topSupport.beamDepth) ?? STAIR_BEAM_DEPTH) / 1000;
        boxes.push({
          label: `${s.label} · ${s.condition} · beam ${s.bearing}×${Math.round(depth * 1000)}`,
          x0: x - half,
          x1: x + half,
          y0: top - depth,
          y1: top,
          z0: zz.z0,
          z1: zz.z1,
          kind: "beam",
        });
      }
    }
  // Loads
  const loads: Stair3DLoad[] = [];
  const uniformLen = 0.22;
  for (const p of places) {
    const n = Math.max(4, Math.round(p.g.length / 450));
    const arrows: Stair3DArrow[] = [];
    for (let k = 0; k <= n; k++) {
      const xmm = (p.g.length * k) / n;
      for (const t of [0.2, 0.5, 0.8])
        arrows.push({
          x: X(p, xmm),
          y: yTop(p.g.top, Math.min(p.g.length - 1, Math.max(1, xmm))) / 1000,
          z: p.z0 + t * (p.z1 - p.z0),
          length: uniformLen,
        });
    }
    loads.push({
      id: `U${p.g.index}`,
      kind: "uniform",
      label: `Live ${i.live} kPa + finishes ${i.finishes} kPa (plan)`,
      arrows,
      footprint: {
        x0: X(p, 0),
        x1: X(p, p.g.length),
        z0: p.z0,
        z1: p.z1,
        y: 0,
      },
    });
  }
  const maxOf = (kind: StairLocalLoad["kind"]) =>
    Math.max(
      1e-9,
      ...i.localLoads.filter((l) => l.kind === kind).map((l) => l.value),
    );
  for (const l of i.localLoads) {
    const p = i.stairType === "single" ? places[0] : places[(l.strip ?? 1) - 1];
    if (!p) continue;
    const scale = 0.35 + 0.45 * (l.value / maxOf(l.kind));
    const zc = (p.z0 + p.z1) / 2;
    if (l.kind === "point") {
      if (l.x > p.g.length) continue;
      const y =
          yTop(p.g.top, Math.max(1, Math.min(p.g.length - 1, l.x))) / 1000,
        w = Math.min(l.width / 1000, p.z1 - p.z0);
      const x = X(p, l.x);
      loads.push({
        id: l.id,
        kind: "point",
        label: `${l.id} ${l.value} kN (${l.case === "dead" ? "D" : "L"})`,
        arrows: [{ x, y, z: zc, length: scale }],
        footprint: {
          x0: x - 0.05,
          x1: x + 0.05,
          z0: zc - w / 2,
          z1: zc + w / 2,
          y,
        },
      });
    } else if (l.kind === "line") {
      if (l.x > p.g.length) continue;
      const y =
        yTop(p.g.top, Math.max(1, Math.min(p.g.length - 1, l.x))) / 1000;
      const x = X(p, l.x);
      loads.push({
        id: l.id,
        kind: "line",
        label: `${l.id} ${l.value} kN/m (${l.case === "dead" ? "D" : "L"})`,
        arrows: [0.1, 0.5, 0.9].map((t) => ({
          x,
          y,
          z: p.z0 + t * (p.z1 - p.z0),
          length: scale,
        })),
        footprint: { x0: x - 0.04, x1: x + 0.04, z0: p.z0, z1: p.z1, y },
      });
    } else {
      const a = Math.min(l.x0, p.g.length),
        b = Math.min(l.x1, p.g.length);
      if (b <= a) continue;
      const w = Math.min(l.width / 1000, p.z1 - p.z0);
      const arrows: Stair3DArrow[] = [];
      for (const t of [0.15, 0.5, 0.85])
        for (const u of [0.25, 0.75]) {
          const xmm = a + t * (b - a);
          arrows.push({
            x: X(p, xmm),
            y: yTop(p.g.top, xmm) / 1000,
            z: zc - w / 2 + u * w,
            length: scale,
          });
        }
      const xa = X(p, a),
        xb = X(p, b);
      loads.push({
        id: l.id,
        kind: "area",
        label: `${l.id} ${l.value} kPa (${l.case === "dead" ? "D" : "L"})`,
        arrows,
        footprint: {
          x0: Math.min(xa, xb),
          x1: Math.max(xa, xb),
          z0: zc - w / 2,
          z1: zc + w / 2,
          y: yTop(p.g.top, (a + b) / 2) / 1000,
        },
      });
    }
  }
  // Design strip band: 1 m centred on each flight (whole flight if B < 1 m).
  const band =
    i.widthMode === "strip"
      ? places.map((p) => {
          const zc = (p.z0 + p.z1) / 2,
            half = Math.min(0.5, (p.z1 - p.z0) / 2);
          return {
            z0: zc - half,
            z1: zc + half,
            line: p.g.top.map((q) => ({ x: X(p, q.x), y: q.y / 1000 + 0.004 })),
          };
        })
      : null;
  // Rebar layer: longitudinal bars repeated across each flight at their
  // spacing (cover from the edges), distribution bars across the width.
  const barSets = new Map<StairBarSetId, Stair3DBarSet>();
  const setOf = (set: StairBarSetId) => {
    if (!barSets.has(set))
      barSets.set(set, {
        set,
        radius: i.bars[set].diameter / 2000,
        segments: [],
      });
    return barSets.get(set)!;
  };
  const MAX_ACROSS = 40;
  for (const p of places) {
    const lines = stairBarLines(i, p.g);
    const cover = i.bottomCover / 1000;
    const across = (spacing: number) => {
      const w = p.z1 - p.z0 - 2 * cover,
        n = Math.min(MAX_ACROSS, Math.floor(w / (spacing / 1000)) + 1);
      return Array.from(
        { length: n },
        (_, k) => p.z0 + cover + (n > 1 ? (k * w) / (n - 1) : w / 2),
      );
    };
    const push = (set: StairBarSetId, poly: { x: number; y: number }[]) => {
      const zs = across(i.bars[set].spacing);
      const out = setOf(set).segments;
      for (const z of zs)
        for (let k = 0; k < poly.length - 1; k++)
          out.push([
            X(p, poly[k].x),
            poly[k].y / 1000,
            z,
            X(p, poly[k + 1].x),
            poly[k + 1].y / 1000,
            z,
          ]);
    };
    for (const line of lines.bottom) push("mainBottom", line);
    for (const t of lines.top) for (const line of t.lines) push(t.set, line);
    const dist = setOf("distribution").segments;
    for (const d of lines.distribution)
      dist.push([
        X(p, d.x),
        d.y / 1000,
        p.z0 + cover,
        X(p, d.x),
        d.y / 1000,
        p.z1 - cover,
      ]);
  }
  const xs = solids.flatMap((s) => s.profile.map((q) => q.x)),
    ys = solids.flatMap((s) => s.profile.map((q) => q.y));
  const zMax = i.stairType === "dog-leg" ? 2 * B + gap : B;
  const extent = Math.max(
    Math.max(...xs) - Math.min(...xs),
    Math.max(...ys) - Math.min(...ys),
    zMax,
  );
  return {
    solids,
    boxes,
    loads,
    band,
    bars: [...barSets.values()],
    extent,
    centre: {
      x: (Math.max(...xs) + Math.min(...xs)) / 2,
      y: (Math.max(...ys) + Math.min(...ys)) / 2,
      z: zMax / 2,
    },
    widthMode: i.widthMode,
  };
}
