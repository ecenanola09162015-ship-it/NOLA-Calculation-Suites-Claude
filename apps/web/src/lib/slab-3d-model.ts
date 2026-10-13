import {
  slabBeamSizes,
  slabLoadPatch,
  type SlabInput,
  type SlabLocalLoadKind,
} from "@nola/calc-core";

import { loadStyles } from "./load-styles";

/**
 * Display-only scene description for the 3D slab view, in engineering axes:
 * x east, y north, z up (m), slab soffit at z = 0, top at z = h. True scale
 * (thickness is never exaggerated). The viewer maps x → x, y → −z, z → y.
 */
export interface Box3 {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
}
/**
 * Bounding-beam downstand (below the slab soffit; the beam top is the slab
 * itself, flush). Edge beams lie outside the clear panel; corner pieces join
 * adjacent beams into one ring at the deeper of the two soffits.
 */
export interface Slab3DSupport {
  id: string;
  edge: "west" | "east" | "south" | "north" | "corner";
  kind: "Fixed" | "Pinned" | "corner";
  /** Beam width x total depth, mm. */
  size: { width: number; depth: number };
  box: Box3;
}
export interface Slab3DArrow {
  x: number;
  y: number;
  /** Tail height above the top surface, m (tip touches the surface). */
  length: number;
}
export interface Slab3DLoad {
  id: string;
  kind: SlabLocalLoadKind;
  color: string;
  /** Loaded footprint on the top surface. */
  footprint: { x0: number; x1: number; y0: number; y1: number };
  /** Governing factored intensity in its own unit. */
  factored: number;
  unit: "kN" | "kN/m" | "kPa";
  combination: string;
  arrows: Slab3DArrow[];
  label: string;
}
export interface Slab3DModel {
  slab: { lx: number; ly: number; h: number };
  /** Slab top/body footprint: clear panel plus beams on supported edges. */
  footprint: { x0: number; x1: number; y0: number; y1: number };
  /** Support condition per edge, including Free. */
  supportKinds: SlabInput["supports"];
  supports: Slab3DSupport[];
  loads: Slab3DLoad[];
  /** Longest arrow, m (arrows scale with factored intensity within each load type). */
  arrowReference: number;
  /** Characteristic size for camera framing, m. */
  extent: number;
}

const unitOf = { point: "kN", line: "kN/m", area: "kPa" } as const;
const count = (length: number, pitch: number, max: number) =>
  Math.min(max, Math.max(2, Math.round(length / pitch) + 1));

export function buildSlab3DModel(i: SlabInput): Slab3DModel {
  const h = i.h / 1000,
    extent = Math.max(i.lx, i.ly),
    arrowReference = Math.max(0.3, 0.22 * Math.min(i.lx, i.ly));
  const supports: Slab3DSupport[] = [],
    beam = slabBeamSizes(i),
    w = (e: "west" | "east" | "south" | "north") =>
      (beam[e]?.width ?? 0) / 1000,
    dz = (e: "west" | "east" | "south" | "north") =>
      Math.max(0, (beam[e]?.depth ?? 0) / 1000 - h);
  const footprint = {
    x0: -w("west"),
    x1: i.lx + w("east"),
    y0: -w("south"),
    y1: i.ly + w("north"),
  };
  for (const edge of ["west", "east", "south", "north"] as const) {
    const b = beam[edge];
    if (!b || dz(edge) <= 0) continue;
    const kind = i.supports[edge] as "Fixed" | "Pinned",
      z0 = -dz(edge);
    supports.push({
      id: edge,
      edge,
      kind,
      size: b,
      box:
        edge === "west"
          ? { x0: -w(edge), x1: 0, y0: 0, y1: i.ly, z0, z1: 0 }
          : edge === "east"
            ? { x0: i.lx, x1: i.lx + w(edge), y0: 0, y1: i.ly, z0, z1: 0 }
            : edge === "south"
              ? { x0: 0, x1: i.lx, y0: -w(edge), y1: 0, z0, z1: 0 }
              : { x0: 0, x1: i.lx, y0: i.ly, y1: i.ly + w(edge), z0, z1: 0 },
    });
  }
  // Corners where two beams meet: fill to the deeper soffit (flush ring).
  for (const [a, c] of [
    ["west", "south"],
    ["east", "south"],
    ["west", "north"],
    ["east", "north"],
  ] as const) {
    if (!beam[a] || !beam[c]) continue;
    const depth = Math.max(dz(a), dz(c));
    if (depth <= 0) continue;
    supports.push({
      id: `${a}-${c}`,
      edge: "corner",
      kind: "corner",
      size: { width: 0, depth: Math.max(beam[a]!.depth, beam[c]!.depth) },
      box: {
        x0: a === "west" ? -w(a) : i.lx,
        x1: a === "west" ? 0 : i.lx + w(a),
        y0: c === "south" ? -w(c) : i.ly,
        y1: c === "south" ? 0 : i.ly + w(c),
        z0: -depth,
        z1: 0,
      },
    });
  }
  const active = i.loads.filter((l) => l.included);
  const governing = (dead: number, live: number) => {
    let value = 0,
      combination = "";
    for (const l of active) {
      const v = l.deadFactor * dead + l.liveFactor * live;
      if (v >= value) {
        value = v;
        combination = l.id;
      }
    }
    return { value, combination };
  };
  const raw = (i.pointLoads ?? []).map((p) => {
    const r = slabLoadPatch(p),
      g = governing(p.dead, p.live);
    return { p, r, ...g };
  });
  // Arrow length ∝ factored intensity, normalised within each load type
  // (kN, kN/m and kPa are not comparable); minimum 35 % of the reference.
  const maxOf = (k: SlabLocalLoadKind) =>
    Math.max(0, ...raw.filter((v) => v.r.kind === k).map((v) => v.value));
  const loads = raw.map(({ p, r, value, combination }) => {
    const kind = r.kind,
      peak = maxOf(kind),
      length =
        arrowReference * (peak > 0 ? Math.max(0.35, value / peak) : 0.35);
    const arrows: Slab3DArrow[] = [];
    const cx = (r.x0 + r.x1) / 2,
      cy = (r.y0 + r.y1) / 2;
    if (kind === "point") arrows.push({ x: cx, y: cy, length });
    else if (kind === "line") {
      const alongX = p.kind === "line" && p.direction === "X",
        span = alongX ? r.x1 - r.x0 : r.y1 - r.y0,
        n = count(span, extent / 10, 12);
      for (let k = 0; k < n; k++) {
        const t = k / (n - 1);
        arrows.push(
          alongX
            ? { x: r.x0 + t * span, y: cy, length }
            : { x: cx, y: r.y0 + t * span, length },
        );
      }
    } else {
      const nx = count(r.x1 - r.x0, extent / 8, 6),
        ny = count(r.y1 - r.y0, extent / 8, 6);
      for (let a = 0; a < nx; a++)
        for (let b = 0; b < ny; b++)
          arrows.push({
            x: r.x0 + ((a + 0.5) / nx) * (r.x1 - r.x0),
            y: r.y0 + ((b + 0.5) / ny) * (r.y1 - r.y0),
            length,
          });
    }
    const unit = unitOf[kind];
    return {
      id: p.id,
      kind,
      color: loadStyles[kind].stroke,
      footprint: { x0: r.x0, x1: r.x1, y0: r.y0, y1: r.y1 },
      factored: value,
      unit,
      combination,
      arrows,
      label: `${p.id} · ${value.toFixed(1)} ${unit} (${combination})`,
    };
  });
  return {
    slab: { lx: i.lx, ly: i.ly, h },
    footprint,
    supportKinds: { ...i.supports },
    supports,
    loads,
    arrowReference,
    extent,
  };
}

/** Deterministic PRNG (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Tileable value noise on a `cells` grid, smoothstep interpolation. */
function valueNoise(size: number, cells: number, random: () => number) {
  const grid = Array.from({ length: cells * cells }, () => random()),
    at = (x: number, y: number) =>
      grid[
        (((y % cells) + cells) % cells) * cells +
          (((x % cells) + cells) % cells)
      ],
    s = (t: number) => t * t * (3 - 2 * t);
  /** Sample at continuous texel coordinates (u, v) in [0, size). */
  const sample = (u: number, v: number) => {
    const fx = (u / size) * cells,
      fy = (v / size) * cells,
      x0 = Math.floor(fx),
      y0 = Math.floor(fy),
      tx = s(fx - x0),
      ty = s(fy - y0);
    const top = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx,
      bottom = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
    return top * (1 - ty) + bottom * ty;
  };
  return sample;
}
/** Tileable fractal noise: octaves at `cells`, weights halving. */
function fractal(size: number, cells: number[], random: () => number) {
  const layers = cells.map((c) => valueNoise(size, c, random)),
    weights = cells.map((_, k) => 1 / 2 ** k),
    total = weights.reduce((a, b) => a + b, 0);
  return (u: number, v: number) =>
    layers.reduce((s, l, n) => s + l(u, v) * weights[n], 0) / total;
}
const smooth = (a: number, b: number, t: number) => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};
/**
 * Watercolour concrete texture as RGBA pixels (tileable, deterministic):
 * warm-grey paper base; two domain-warped pigment washes (cool blue-grey and
 * ochre) with softly darkened edges where the pigment dries; sparse
 * aggregate speckle and paper grain.
 */
export function watercolorConcretePixels(size = 256, seed = 7) {
  const random = rng(seed),
    warpX = fractal(size, [3, 6], random),
    warpY = fractal(size, [3, 6], random),
    coolField = fractal(size, [3, 5, 9, 17], random),
    warmField = fractal(size, [4, 7, 13], random),
    grain = valueNoise(size, 128, random);
  const px = new Uint8ClampedArray(size * size * 4);
  const base = [216, 211, 201],
    blue = [148, 158, 171],
    ochre = [192, 172, 138],
    warp = size * 0.18;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const k = y * size + x,
        u = x + (warpX(x, y) - 0.5) * warp,
        v = y + (warpY(x, y) - 0.5) * warp,
        cf = coolField(u, v),
        wf = warmField(u + size / 3, v + size / 5);
      // Wash coverage with a soft edge; the edge band dries darker.
      const c = smooth(0.46, 0.6, cf) * 0.26,
        cEdge = smooth(0.44, 0.5, cf) * (1 - smooth(0.5, 0.6, cf)) * 0.05,
        w = smooth(0.48, 0.64, wf) * 0.2,
        wEdge = smooth(0.46, 0.52, wf) * (1 - smooth(0.52, 0.64, wf)) * 0.035,
        speckle = random() < 0.008 ? 0.14 * random() : 0,
        paper = (grain(x, y) - 0.5) * 0.08;
      for (let ch = 0; ch < 3; ch++) {
        let value = base[ch];
        value = value * (1 - c) + blue[ch] * c;
        value = value * (1 - w) + ochre[ch] * w;
        value *= 1 - cEdge - wEdge - speckle + paper;
        px[k * 4 + ch] = value;
      }
      px[k * 4 + 3] = 255;
    }
  return px;
}
