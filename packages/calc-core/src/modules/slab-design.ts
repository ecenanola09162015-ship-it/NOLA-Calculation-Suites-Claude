import { designCheckPolicySchema, designRemarksSchema } from "../design-review";
import { z } from "zod";
import { slabQuantitySchema } from "./slab-quantity-schema";
import { solveSlabPlate } from "./slab-plate";
import { solvePatchLoads, type PatchFieldValue } from "./slab-patch-fe";
export type SlabDirection = "short" | "long";
export type SlabFace = "bottom" | "top";
export type SlabEdge = "west" | "east" | "south" | "north";
export const slabLayers = [
  "short-bottom",
  "long-bottom",
  "short-top",
  "long-top",
] as const;
export type SlabLayer = (typeof slabLayers)[number];
const barSchema = z.object({
  diameter: z.number().min(6).max(40),
  spacing: z.number().min(20).max(1000),
  elevation: z.number().min(0).max(2000).nullable(),
  enabled: z.boolean(),
});
/**
 * Concentrated (patch) load on the slab surface. Centre (x, y) in metres from
 * the south-west corner of the panel (x along lx, y along ly); loaded area
 * bx × by in mm; unfactored dead and live resultants in kN.
 */
export const slabPointLoadSchema = z.object({
  id: z.string().trim().min(1).max(40),
  x: z.number().min(0).max(30),
  y: z.number().min(0).max(30),
  bx: z.number().min(50).max(5000),
  by: z.number().min(50).max(5000),
  dead: z.number().min(0).max(10000),
  live: z.number().min(0).max(10000),
});
export type SlabPointLoad = z.infer<typeof slabPointLoadSchema>;
const barsSchema = z.object({
  "short-bottom": barSchema,
  "long-bottom": barSchema,
  "short-top": barSchema,
  "long-top": barSchema,
});
export const slabInputSchema = z
  .object({
    code: z.enum(["ACI 318-19", "NSCP 2015"]),
    lx: z.number().min(0.5).max(30),
    ly: z.number().min(0.5).max(30),
    h: z.number().min(70).max(1000),
    fc: z.number().min(17).max(70),
    fy: z.number().min(200).max(420),
    es: z.number().min(150000).max(220000),
    unitWeight: z.number().min(20).max(26),
    nu: z.number().min(0.1).max(0.3),
    topCover: z.number().min(10).max(150),
    bottomCover: z.number().min(10).max(150),
    sideCover: z.number().min(10).max(150),
    aggregate: z.number().min(5).max(40),
    dcrLimit: z.number().min(0.5).max(1.2),
    deflectionDivisor: z.number().min(180).max(500),
    supportWidth: z.number().min(100).max(1500),
    supports: z.object({
      west: z.enum(["Fixed", "Pinned"]),
      east: z.enum(["Fixed", "Pinned"]),
      south: z.enum(["Fixed", "Pinned"]),
      north: z.enum(["Fixed", "Pinned"]),
    }),
    main: barsSchema,
    extra: barsSchema,
    cutoffs: z.object({
      bottomStart: z.number().min(0).max(0.49),
      bottomEnd: z.number().min(0.51).max(1),
      west: z.number().min(0.05).max(0.45),
      east: z.number().min(0.05).max(0.45),
      south: z.number().min(0.05).max(0.45),
      north: z.number().min(0.05).max(0.45),
    }),
    sdl: z.number().min(0).max(100),
    partition: z.number().min(0).max(100),
    live: z.number().min(0).max(100),
    loads: z
      .array(
        z.object({
          id: z.string().trim().min(1).max(100),
          deadFactor: z.number().min(0).max(3),
          liveFactor: z.number().min(0).max(3),
          serviceLiveFactor: z.number().min(0).max(1),
          included: z.boolean(),
        }),
      )
      .min(1)
      .max(100),
    pointLoads: z.array(slabPointLoadSchema).max(20).default([]),
  })
  .refine(
    (i) => new Set(i.loads.map((l) => l.id)).size === i.loads.length,
    "Load combination labels must be unique.",
  )
  .refine(
    (i) => new Set(i.pointLoads.map((p) => p.id)).size === i.pointLoads.length,
    "Point load labels must be unique.",
  )
  .refine(
    (i) =>
      i.pointLoads.every(
        (p) =>
          p.x - p.bx / 2000 >= -1e-9 &&
          p.x + p.bx / 2000 <= i.lx + 1e-9 &&
          p.y - p.by / 2000 >= -1e-9 &&
          p.y + p.by / 2000 <= i.ly + 1e-9,
      ),
    "Each point load's loaded area must lie within the slab panel (0 ≤ x ± bx/2 ≤ Lx, 0 ≤ y ± by/2 ≤ Ly).",
  );
export const slabDraftSchema = z.object({
  kind: z.literal("slab"),
  version: z.literal(1),
  input: slabInputSchema,
  quantity: slabQuantitySchema.optional(),
  designPolicy: designCheckPolicySchema.optional(),
  remarks: designRemarksSchema.optional(),
  reviewCompleted: z.boolean().optional(),
});
export type SlabInput = z.infer<typeof slabInputSchema>;
export type SlabBar = z.infer<typeof barSchema>;
export interface SlabResolvedBar extends SlabBar {
  group: "main" | "extra";
  layer: SlabLayer;
  direction: SlabDirection;
  face: SlabFace;
  z: number;
  d: number;
  positions: number[];
  as: number;
}
export interface SlabStrength {
  phiMn: number;
  mn: number;
  phi: number;
  strain: number;
  tensionControlled: boolean;
  as: number;
  d: number;
}
export interface SlabRegion extends SlabStrength {
  id: string;
  label: string;
  layer: SlabLayer;
  mu: number;
  dcr: number;
  combination: string;
  minAs: number;
  requiredAs: number;
  maxSpacing: number;
  minClear: number;
  spacingOk: boolean;
  minimumOk: boolean;
  mainAs: number;
  extraAs: number;
  position: number;
  extraActive: boolean;
  spacingChecks: {
    label: string;
    minClear: number;
    requiredClear: number;
    maxPitch: number;
    maxSpacing: number;
  }[];
  zones: SlabFlexuralZone[];
  samples: {
    mu: number;
    extra: boolean;
    combination: string;
    position: number;
  }[];
}
export interface SlabFlexuralZone extends SlabStrength {
  id: string;
  label: string;
  mainAs: number;
  extraAs: number;
  mu: number;
  dcr: number;
  combination: string;
  position: number;
}
export interface SlabResult {
  type: "one-way" | "two-way";
  ratio: number;
  shortSpan: number;
  longSpan: number;
  shortAxis: "X" | "Y";
  bars: SlabResolvedBar[];
  method: string;
  coefficients: {
    shortPositive: number;
    longPositive: number;
    westNegative: number;
    eastNegative: number;
    southNegative: number;
    northNegative: number;
    beta: number;
  };
  regions: SlabRegion[];
  /** Two-way (punching) shear at each point load, ACI 318-19 22.6. */
  punching: SlabPunchingCheck[];
  shear: {
    edge: SlabEdge;
    vu: number;
    phiVc: number;
    dcr: number;
    d: number;
    rho: number;
    lambdaS: number;
    combination: string;
    /** Critical section distance from the idealized support line, mm. */
    section: number;
    /** A point load lies within d of the support: checked at the support line. */
    concentratedWithinD: boolean;
  }[];
  deflection: {
    /** Uncracked (gross Ig) immediate deflection, mm. */
    immediate: number;
    limit: number;
    combination: string;
    cracked: boolean;
    /** Immediate deflection using effective inertia Ie, mm. */
    crackedImmediate: number;
    crackedCombination: string;
    /** Midspan service moment of the governing combination, kN·m/m. */
    ma: number;
    mcr: number;
    ig: number;
    icr: number;
    ieMid: number;
    ieAvg: number | null;
    ie: number;
    minimumThickness: SlabMinimumThickness;
    /** "thickness": h ≥ hmin waives calculation; "calculation": Δcr governs. */
    governedBy: "thickness" | "calculation";
    ok: boolean;
  };
  recommendations: {
    layer: SlabLayer;
    spacing: number | null;
    diameter: number;
    reason: string;
  }[];
  detailing: {
    ok: boolean;
    messages: string[];
    development: {
      layer: SlabLayer;
      ld: number;
      extension: number;
      ok: boolean;
    }[];
  };
  status: "SCREENING PASS" | "REVISE";
  warnings: string[];
  dead: number;
  unit: "metric";
  engineVersion: string;
}
export function defaultSlabInput(): SlabInput {
  const main = Object.fromEntries(
    slabLayers.map((l) => [
      l,
      {
        diameter: 12,
        spacing: l.startsWith("short") ? 150 : 200,
        elevation: null,
        enabled: true,
      },
    ]),
  ) as SlabInput["main"];
  const extra = Object.fromEntries(
    slabLayers.map((l) => [
      l,
      { diameter: 12, spacing: 300, elevation: null, enabled: false },
    ]),
  ) as SlabInput["extra"];
  return {
    code: "ACI 318-19",
    lx: 4.3,
    ly: 2.5,
    h: 150,
    fc: 28,
    fy: 420,
    es: 200000,
    unitWeight: 24,
    nu: 0.2,
    topCover: 20,
    bottomCover: 20,
    sideCover: 20,
    aggregate: 20,
    dcrLimit: 1,
    deflectionDivisor: 240,
    supportWidth: 300,
    supports: { west: "Fixed", east: "Fixed", south: "Fixed", north: "Fixed" },
    main,
    extra,
    cutoffs: {
      bottomStart: 0.25,
      bottomEnd: 0.75,
      west: 1 / 3,
      east: 1 / 3,
      south: 1 / 3,
      north: 1 / 3,
    },
    sdl: 2.4,
    partition: 0.5,
    live: 1.92,
    loads: [
      {
        id: "LC1",
        deadFactor: 1.2,
        liveFactor: 1.6,
        serviceLiveFactor: 1,
        included: true,
      },
      {
        id: "LC2",
        deadFactor: 1.4,
        liveFactor: 0,
        serviceLiveFactor: 1,
        included: true,
      },
    ],
    pointLoads: [],
  };
}
/** Positions along the transverse width in mm. Main spacing is a maximum; extras are staggered. */
export function slabBarPositions(
  width: number,
  cover: number,
  diameter: number,
  spacing: number,
  offset = 0,
): number[] {
  const first = cover + diameter / 2,
    last = width - first;
  if (
    ![width, cover, diameter, spacing, offset].every(Number.isFinite) ||
    last <= first ||
    spacing <= 0
  )
    return [];
  if (offset > 0) {
    const out: number[] = [];
    for (let p = first + offset; p <= last + 1e-6; p += spacing) {
      out.push(p);
      if (out.length > 1600) break;
    }
    return out;
  }
  const intervals = Math.ceil((last - first) / spacing);
  return Array.from(
    { length: intervals + 1 },
    (_, k) => first + ((last - first) * k) / intervals,
  );
}
/** Centerline elevation; Auto long steel clears all enabled short-direction layers. */
export function slabBarElevation(
  i: SlabInput,
  group: "main" | "extra",
  layer: SlabLayer,
): number {
  const b = i[group][layer],
    face: SlabFace = layer.endsWith("bottom") ? "bottom" : "top";
  if (b.elevation !== null) return b.elevation;
  const cover = face === "bottom" ? i.bottomCover : i.topCover;
  if (layer.startsWith("short"))
    return face === "bottom"
      ? cover + b.diameter / 2
      : i.h - cover - b.diameter / 2;
  const shortLayer = `short-${face}` as SlabLayer;
  const shorts = (["main", "extra"] as const)
    .filter((g) => i[g][shortLayer].enabled)
    .map((g) => ({
      z: slabBarElevation(i, g, shortLayer),
      diameter: i[g][shortLayer].diameter,
    }));
  return face === "bottom"
    ? Math.max(...shorts.map((v) => v.z + v.diameter / 2)) + b.diameter / 2
    : Math.min(...shorts.map((v) => v.z - v.diameter / 2)) - b.diameter / 2;
}
export function resolveSlabBars(i: SlabInput): SlabResolvedBar[] {
  const short = Math.min(i.lx, i.ly),
    long = Math.max(i.lx, i.ly),
    oneWay = long / short >= 2;
  const out: SlabResolvedBar[] = [];
  for (const group of ["main", "extra"] as const)
    for (const layer of slabLayers) {
      const b = i[group][layer],
        direction: SlabDirection = layer.startsWith("short") ? "short" : "long",
        face: SlabFace = layer.endsWith("bottom") ? "bottom" : "top";
      if (!b.enabled || (group === "extra" && oneWay && direction === "long"))
        continue;
      const z = slabBarElevation(i, group, layer);
      const width = (direction === "short" ? long : short) * 1000;
      const mainPositions = slabBarPositions(
        width,
        i.sideCover,
        Math.max(
          i.main[layer].diameter,
          i.extra[layer].enabled ? i.extra[layer].diameter : 0,
        ),
        i.main[layer].spacing,
      );
      const mainPitch =
        mainPositions.length > 1
          ? mainPositions[1] - mainPositions[0]
          : i.main[layer].spacing;
      const gridDiameter = Math.max(
        i.main[layer].diameter,
        i.extra[layer].enabled ? i.extra[layer].diameter : 0,
      );
      const extraPitch =
        b.spacing >= mainPitch
          ? mainPitch * Math.max(1, Math.floor((b.spacing + 1e-8) / mainPitch))
          : mainPitch / Math.ceil(mainPitch / b.spacing);
      const positions =
        group === "main"
          ? mainPositions
          : slabBarPositions(
              width,
              i.sideCover,
              gridDiameter,
              extraPitch,
              Math.min(mainPitch, extraPitch) / 2,
            );
      const effectiveSpacing = group === "main" ? mainPitch : extraPitch;
      out.push({
        ...b,
        layer,
        group,
        direction,
        face,
        z,
        d: face === "bottom" ? i.h - z : z,
        positions,
        as: (((Math.PI * b.diameter ** 2) / 4) * 1000) / effectiveSpacing,
      });
    }
  return out;
}
export function slabFlexuralStrength(
  i: Pick<SlabInput, "fc" | "fy" | "es">,
  bars: Pick<SlabResolvedBar, "as" | "d">[],
): SlabStrength {
  const as = bars.reduce((s, b) => s + b.as, 0);
  if (!as || !bars.length)
    return {
      phiMn: 0,
      mn: 0,
      phi: 0,
      strain: 0,
      tensionControlled: false,
      as: 0,
      d: 0,
    };
  const beta = Math.max(0.65, 0.85 - (0.05 * Math.max(0, i.fc - 28)) / 7),
    deepest = Math.max(...bars.map((b) => b.d));
  let lo = 0.0001,
    hi = deepest;
  for (let k = 0; k < 60; k++) {
    const c = (lo + hi) / 2;
    const steel = bars.reduce(
      (s, b) =>
        s + b.as * Math.max(0, Math.min(i.fy, (i.es * 0.003 * (b.d - c)) / c)),
      0,
    );
    if (0.85 * i.fc * 1000 * beta * c > steel) hi = c;
    else lo = c;
  }
  const c = (lo + hi) / 2,
    a = beta * c;
  const mn =
    bars.reduce(
      (s, b) =>
        s +
        b.as *
          Math.max(0, Math.min(i.fy, (i.es * 0.003 * (b.d - c)) / c)) *
          (b.d - a / 2),
      0,
    ) / 1e6;
  const strain = (0.003 * (deepest - c)) / c,
    ey = i.fy / i.es,
    phi = 0.65 + 0.25 * Math.max(0, Math.min(1, (strain - ey) / 0.003));
  return {
    phiMn: phi * mn,
    mn,
    phi,
    strain,
    tensionControlled: strain >= ey + 0.003 - 1e-10,
    as,
    d: bars.reduce((s, b) => s + b.as * b.d, 0) / as,
  };
}
/**
 * √f'c for shear (ACI 318-19 22.5.3.1) and development length (25.4.1.4),
 * limited to 8.3 MPa. Not applied to Ec (19.2.2.1) or fr (19.2.3.1).
 * 22.5.3.2 (minimum shear reinforcement) does not apply: slabs here carry none.
 */
export const SLAB_SQRT_FC_LIMIT = 8.3;
export function slabSqrtFc(fc: number) {
  return Math.min(Math.sqrt(fc), SLAB_SQRT_FC_LIMIT);
}
/** ACI 318-19 Table 25.4.2.5 casting-position factor psi_t (z from soffit, mm). */
export function slabTopBarFactor(b: Pick<SlabResolvedBar, "face" | "z">) {
  return b.face === "top" && b.z > 300 ? 1.3 : 1;
}
/**
 * Minimum flexural / shrinkage-temperature steel ratio on gross area,
 * ACI 318-19 Table 7.6.1.1 (one-way), 8.6.1.1 (two-way) and 24.4.3.2:
 * deformed bars fy < 420 MPa -> 0.0020; fy >= 420 MPa -> max(0.0018*420/fy, 0.0014).
 */
export function slabMinimumSteelRatio(fy: number) {
  return fy < 420 ? 0.002 : Math.max((0.0018 * 420) / fy, 0.0014);
}
export function slabDevelopmentLength(i: SlabInput, b: SlabResolvedBar) {
  const cb = Math.min(
    (b.face === "bottom" ? i.bottomCover : i.topCover) + b.diameter / 2,
    b.spacing / 2,
  );
  // ACI 318-19 25.4.2.4(a), Ktr = 0: normal-weight, uncoated, fy <= 420 MPa.
  // Table 25.4.2.5 psi_t = 1.3 when more than 300 mm of fresh concrete is placed
  // below the bar. z is measured from the slab soffit, so concrete below = z.
  const psiTop = slabTopBarFactor(b);
  const psiSize = b.diameter <= 19 ? 0.8 : 1;
  return Math.max(
    300,
    (((i.fy / (1.1 * slabSqrtFc(i.fc))) * psiTop * psiSize) /
      Math.min(2.5, cb / b.diameter)) *
      b.diameter,
  );
}
export interface SlabPunchingCheck {
  id: string;
  /** Loaded area along x and y, mm. */
  c1: number;
  c2: number;
  /** Average effective depth of the two bottom MAIN layers, mm (22.6.2.1). */
  d: number;
  /** Critical perimeter at d/2 from the loaded area, truncated at support faces, mm (22.6.4.1). */
  b0: number;
  /** Number of perimeter sides inside the panel (4 interior, 3 edge, 2 corner). */
  sides: number;
  alphaS: number;
  /** Long / short side of the loaded area. */
  beta: number;
  lambdaS: number;
  /** Table 22.6.5.2 (a), (b), (c) stress limits, MPa. */
  vcLimits: [number, number, number];
  vc: number;
  /** Area enclosed by the critical section, m². */
  area: number;
  phiVc: number;
  vu: number;
  dcr: number;
  combination: string;
}
/**
 * Two-way (punching) shear at each point load, ACI 318-19 22.6, no shear
 * reinforcement, normal-weight concrete (λ = 1), no moment transfer.
 * Critical section at d/2 from the loaded area (22.6.4.1); sides beyond a
 * support face (supportWidth/2 from the idealized support line) are dropped
 * and αs = 40/30/20 for 4/3/2 remaining sides. vc = least of Table 22.6.5.2
 * (a) 0.33, (b) 0.17(1 + 2/β), (c) 0.083(2 + αs d/b0), each × λs √f′c,
 * λs per 22.5.5.1.3, √f′c ≤ 8.3 MPa (22.6.3.1), φ = 0.75.
 * Vu = factored point load + factored uniform load inside the critical section.
 */
export function slabPunching(
  i: SlabInput,
  bars: SlabResolvedBar[],
  loads: SlabInput["loads"],
  dead: number,
): SlabPunchingCheck[] {
  const bottom = bars.filter((b) => b.group === "main" && b.face === "bottom");
  const d = bottom.reduce((s, b) => s + b.d, 0) / Math.max(1, bottom.length),
    face = i.supportWidth / 2,
    lx = i.lx * 1000,
    ly = i.ly * 1000,
    lambdaS = Math.min(1, Math.sqrt(2 / (1 + 0.004 * d))),
    root = slabSqrtFc(i.fc);
  return i.pointLoads.map((p) => {
    const c1 = p.bx,
      c2 = p.by;
    let x0 = p.x * 1000 - c1 / 2 - d / 2,
      x1 = p.x * 1000 + c1 / 2 + d / 2,
      y0 = p.y * 1000 - c2 / 2 - d / 2,
      y1 = p.y * 1000 + c2 / 2 + d / 2;
    const west = x0 > face,
      east = x1 < lx - face,
      south = y0 > face,
      north = y1 < ly - face;
    x0 = Math.max(x0, face);
    x1 = Math.min(x1, lx - face);
    y0 = Math.max(y0, face);
    y1 = Math.min(y1, ly - face);
    const wx = Math.max(0, x1 - x0),
      wy = Math.max(0, y1 - y0),
      b0 =
        (west ? wy : 0) + (east ? wy : 0) + (south ? wx : 0) + (north ? wx : 0),
      sides = [west, east, south, north].filter(Boolean).length,
      alphaS = sides >= 4 ? 40 : sides === 3 ? 30 : 20,
      beta = Math.max(c1, c2) / Math.min(c1, c2);
    const vcLimits = [
      0.33,
      0.17 * (1 + 2 / beta),
      0.083 * (2 + (alphaS * d) / b0),
    ].map((k) => k * lambdaS * root) as [number, number, number];
    const vc = Math.min(...vcLimits),
      area = (wx * wy) / 1e6,
      phiVc = b0 > 0 ? (0.75 * vc * b0 * d) / 1000 : 0;
    let vu = 0,
      combination = "";
    for (const l of loads) {
      const v =
        l.deadFactor * p.dead +
        l.liveFactor * p.live +
        (l.deadFactor * dead + l.liveFactor * i.live) * area;
      if (v >= vu) {
        vu = v;
        combination = l.id;
      }
    }
    return {
      id: p.id,
      c1,
      c2,
      d,
      b0,
      sides,
      alphaS,
      beta,
      lambdaS,
      vcLimits,
      vc,
      area,
      phiVc,
      vu,
      dcr: b0 > 0 ? vu / phiVc : NaN,
      combination,
    };
  });
}
export interface SlabMinimumThickness {
  system: "one-way" | "two-way";
  /** Required minimum thickness, mm. */
  hmin: number;
  /** One-way: centre-to-centre span ℓ; two-way: clear long span ℓn (mm). */
  span: number;
  /** Two-way only: clear long / clear short span. */
  beta: number | null;
  /** One-way end condition used for the ℓ/20, ℓ/24, ℓ/28 divisor. */
  continuity:
    "simply supported" | "one end continuous" | "both ends continuous" | null;
  /** Edges treated as discontinuous (Pinned) for the 8.3.1.2.1 note. */
  discontinuousEdges: SlabEdge[];
  formula: string;
  ok: boolean;
}
/**
 * Minimum slab thickness for which calculated deflection may be waived.
 * One-way: ACI 318-19 Table 7.3.1.1 with 7.3.1.1.1 fy modifier, ℓ = c/c span;
 * Fixed edge = continuous end, Pinned = simple support.
 * Two-way edge-supported panels: Table 8.3.1.2 with αfm > 2.0 assumed
 * (rigid beam/wall edges), ℓn = clear long span = long span − support width.
 * Normal-weight concrete only (schema limits unit weight to 20–26 kN/m³).
 */
export function slabMinimumThickness(i: SlabInput): SlabMinimumThickness {
  const short = Math.min(i.lx, i.ly) * 1000,
    long = Math.max(i.lx, i.ly) * 1000,
    shortAxisX = i.lx <= i.ly;
  const discontinuousEdges = (
    ["west", "east", "south", "north"] as const
  ).filter((e) => i.supports[e] === "Pinned");
  if (long / short >= 2) {
    const fixed = (
      shortAxisX ? (["west", "east"] as const) : (["south", "north"] as const)
    ).filter((e) => i.supports[e] === "Fixed").length;
    const divisor = [20, 24, 28][fixed];
    const fyFactor = i.fy === 420 ? 1 : 0.4 + i.fy / 700;
    const hmin = (short / divisor) * fyFactor;
    return {
      system: "one-way",
      hmin,
      span: short,
      beta: null,
      continuity: (
        [
          "simply supported",
          "one end continuous",
          "both ends continuous",
        ] as const
      )[fixed],
      discontinuousEdges,
      formula: `hmin = ℓ/${divisor} x (0.4 + fy/700) = ${short.toFixed(0)}/${divisor} x ${fyFactor.toFixed(3)} = ${hmin.toFixed(1)} mm`,
      ok: i.h >= hmin - 1e-9,
    };
  }
  const ln = long - i.supportWidth,
    lnShort = short - i.supportWidth,
    beta = ln / lnShort;
  const eq = (ln * (0.8 + i.fy / 1400)) / (36 + 9 * beta),
    hmin = Math.max(eq, 90);
  return {
    system: "two-way",
    hmin,
    span: ln,
    beta,
    continuity: null,
    discontinuousEdges,
    formula: `hmin = max[ℓn(0.8 + fy/1400)/(36 + 9β), 90] = max[${ln.toFixed(0)} x ${(0.8 + i.fy / 1400).toFixed(3)}/(36 + 9 x ${beta.toFixed(3)}) = ${eq.toFixed(1)}, 90] = ${hmin.toFixed(1)} mm`,
    ok: i.h >= hmin - 1e-9,
  };
}
export interface SlabCrackedSection {
  ec: number;
  n: number;
  fr: number;
  /** Gross, cracked-transformed and effective inertia per metre strip, mm⁴. */
  ig: number;
  icr: number;
  /** Neutral axis depth of the cracked transformed section, mm. */
  x: number;
  /** Cracking moment, kN·m/m. */
  mcr: number;
}
/**
 * Cracked transformed section of a 1000 mm strip, tension steel only
 * (compression steel conservatively neglected). Ec = 4700√f'c (19.2.2.1),
 * fr = 0.62λ√f'c with λ = 1 (19.2.3.1), yt = h/2.
 */
export function slabCrackedSection(
  i: Pick<SlabInput, "fc" | "es" | "h">,
  as: number,
  d: number,
): SlabCrackedSection {
  const b = 1000,
    ec = 4700 * Math.sqrt(i.fc),
    n = i.es / ec,
    fr = 0.62 * Math.sqrt(i.fc),
    ig = (b * i.h ** 3) / 12;
  const nas = n * Math.max(0, as);
  // b x²/2 = n As (d − x)
  const x = nas > 0 ? (-nas + Math.sqrt(nas ** 2 + 2 * b * nas * d)) / b : 0;
  const icr = nas > 0 ? (b * x ** 3) / 3 + nas * (d - x) ** 2 : 0;
  return { ec, n, fr, ig, icr, x, mcr: (fr * ig) / (i.h / 2) / 1e6 };
}
/** ACI 318-19 Table 24.2.3.5: Ie = Ig if Ma ≤ (2/3)Mcr, else Icr / [1 − ((2/3)Mcr/Ma)²(1 − Icr/Ig)]. */
export function slabEffectiveInertia(
  s: Pick<SlabCrackedSection, "ig" | "icr" | "mcr">,
  ma: number,
): number {
  if (ma <= (2 / 3) * s.mcr) return s.ig;
  return Math.min(
    s.ig,
    s.icr / (1 - (((2 / 3) * s.mcr) / ma) ** 2 * (1 - s.icr / s.ig)),
  );
}
interface PatchShortLong {
  w: number;
  mShort: number;
  mLong: number;
  qShort: number;
  qLong: number;
}
const shortLong = (v: PatchFieldValue, shortAxis: "X" | "Y"): PatchShortLong =>
  shortAxis === "X"
    ? { w: v.w, mShort: v.mx, mLong: v.my, qShort: v.qx, qLong: v.qy }
    : { w: v.w, mShort: v.my, mLong: v.mx, qShort: v.qy, qLong: v.qx };
const edgeDirection = (i: SlabInput, edge: SlabEdge): SlabDirection =>
  (edge === "west" || edge === "east") === i.lx <= i.ly ? "short" : "long";
export function slabExtraActive(
  i: SlabInput,
  layer: SlabLayer,
  position: number,
): boolean {
  if (layer.endsWith("bottom"))
    return (
      position >= i.cutoffs.bottomStart - 1e-9 &&
      position <= i.cutoffs.bottomEnd + 1e-9
    );
  const dir = layer.startsWith("short") ? "short" : "long";
  const near: SlabEdge = (dir === "short") === i.lx <= i.ly ? "west" : "south",
    far: SlabEdge = near === "west" ? "east" : "north";
  return (
    (i.supports[near] === "Fixed" && position <= i.cutoffs[near] + 1e-9) ||
    (i.supports[far] === "Fixed" && position >= 1 - i.cutoffs[far] - 1e-9)
  );
}
function layerSpacing(
  i: SlabInput,
  bars: SlabResolvedBar[],
  layer: SlabLayer,
  includeExtra: boolean,
  max: number,
) {
  const selected = bars.filter(
    (b) => b.layer === layer && (b.group === "main" || includeExtra),
  );
  const positions = selected
    .flatMap((b) => b.positions.map((p) => ({ p, diameter: b.diameter })))
    .sort((a, b) => a.p - b.p);
  let minClear = Infinity,
    maxPitch = 0;
  for (let k = 1; k < positions.length; k++) {
    const a = positions[k - 1],
      b = positions[k];
    minClear = Math.min(minClear, b.p - a.p - (a.diameter + b.diameter) / 2);
    maxPitch = Math.max(maxPitch, b.p - a.p);
  }
  const min = Math.max(
    25,
    (i.aggregate * 4) / 3,
    ...selected.map((b) => b.diameter),
  );
  return {
    minClear,
    requiredClear: min,
    maxPitch,
    maxSpacing: max,
    ok:
      minClear >= min - 1e-6 &&
      maxPitch <= max + 1e-6 &&
      selected.length > 0 &&
      positions.length >= 2,
  };
}
export function analyzeSlab(raw: SlabInput, suggestions = true): SlabResult {
  const i = slabInputSchema.parse(raw),
    activeLoads = i.loads.filter((l) => l.included);
  if (!activeLoads.length)
    throw new Error("Include at least one load combination.");
  for (const layer of slabLayers)
    if (!i.main[layer].enabled)
      throw new Error(
        "All MAIN BARS layers are required; use distribution steel in the one-way transverse direction.",
      );
  const shortSpan = Math.min(i.lx, i.ly),
    longSpan = Math.max(i.lx, i.ly),
    ratio = longSpan / shortSpan,
    type = ratio >= 2 ? "one-way" : "two-way",
    shortAxis = i.lx <= i.ly ? "X" : "Y";
  const bars = resolveSlabBars(i),
    messages: string[] = [];
  if (bars.some((b) => b.d <= 0 || b.z <= 0 || b.z >= i.h))
    throw new Error(
      "Bar elevations must lie inside the slab and give positive effective depths.",
    );
  for (const b of bars) {
    if (
      b.z - b.diameter / 2 < i.bottomCover - 1e-8 ||
      b.z + b.diameter / 2 > i.h - i.topCover + 1e-8
    )
      messages.push(
        `${b.group} ${b.layer}: elevation violates top or bottom cover.`,
      );
    if (b.d <= 0 || b.positions.length < 2)
      messages.push(
        `${b.group} ${b.layer}: insufficient depth or distribution width.`,
      );
  }
  for (const face of ["bottom", "top"] as const) {
    const ss = bars.filter((b) => b.face === face && b.direction === "short"),
      ll = bars.filter((b) => b.face === face && b.direction === "long");
    for (const a of ss)
      for (const b of ll) {
        if (Math.abs(a.z - b.z) + 1e-8 < (a.diameter + b.diameter) / 2)
          messages.push(`${face}: crossing short/long bars overlap.`);
        if ((face === "bottom" && a.z > b.z) || (face === "top" && a.z < b.z))
          messages.push(
            `${face}: short-span reinforcement is not the outer layer.`,
          );
      }
    const bottom = bars.filter((b) => b.face === "bottom"),
      top = bars.filter((b) => b.face === "top");
    if (
      face === "bottom" &&
      Math.min(...top.map((b) => b.z - b.diameter / 2)) -
        Math.max(...bottom.map((b) => b.z + b.diameter / 2)) <
        Math.max(25, (i.aggregate * 4) / 3)
    )
      messages.push(
        "Top/bottom mats do not have the required clear vertical separation.",
      );
  }
  const near: SlabEdge = shortAxis === "X" ? "west" : "south",
    far: SlabEdge = shortAxis === "X" ? "east" : "north";
  const fn = i.supports[near] === "Fixed",
    ff = i.supports[far] === "Fixed";
  const beam = {
    left: fn ? (ff ? -1 / 12 : -1 / 8) : 0,
    right: ff ? (fn ? -1 / 12 : -1 / 8) : 0,
    reaction: fn === ff ? 0.5 : fn ? 0.625 : 0.375,
  };
  const beamMoment = (t: number) => beam.left + beam.reaction * t - (t * t) / 2;
  const normalized =
    shortAxis === "X"
      ? i.supports
      : {
          west: i.supports.south,
          east: i.supports.north,
          south: i.supports.west,
          north: i.supports.east,
        };
  const plate =
    type === "two-way"
      ? solveSlabPlate(
          ratio,
          {
            west: normalized.west === "Fixed",
            east: normalized.east === "Fixed",
            south: normalized.south === "Fixed",
            north: normalized.north === "Fixed",
          },
          i.nu,
        )
      : null;
  // Beam deflection w''''=1/EI; integration constants satisfy the end rotations/displacements.
  const beamC = 1 / 24 - beam.left / 2 - beam.reaction / 6;
  const beamW = (t: number) =>
    t ** 4 / 24 -
    (beam.reaction * t ** 3) / 6 -
    (beam.left * t * t) / 2 -
    beamC * t;
  let beamBeta = 0;
  for (let k = 0; k <= 200; k++) beamBeta = Math.max(beamBeta, beamW(k / 200));
  const coefficients = plate
    ? {
        shortPositive: plate.shortPositive,
        longPositive: plate.longPositive,
        westNegative:
          shortAxis === "X" ? plate.westNegative : plate.southNegative,
        eastNegative:
          shortAxis === "X" ? plate.eastNegative : plate.northNegative,
        southNegative:
          shortAxis === "X" ? plate.southNegative : plate.westNegative,
        northNegative:
          shortAxis === "X" ? plate.northNegative : plate.eastNegative,
        beta: plate.beta,
      }
    : {
        shortPositive: beamMoment(beam.reaction),
        longPositive: 0,
        westNegative: shortAxis === "X" ? -beam.left : 0,
        eastNegative: shortAxis === "X" ? -beam.right : 0,
        southNegative: shortAxis === "Y" ? -beam.left : 0,
        northNegative: shortAxis === "Y" ? -beam.right : 0,
        beta: beamBeta,
      };
  const dead = (i.h / 1000) * i.unitWeight + i.sdl + i.partition;
  // Concentrated (patch) loads: Kirchhoff plate FE on the actual panel and
  // supports, superposed on the uniform-load solution (linear elastic).
  // Flexure, one-way shear and deflection use the load dispersed at 45° to the
  // slab mid-plane (bx + h, by + h); punching uses the actual loaded area.
  const pointLoads = i.pointLoads,
    hasPatches = pointLoads.length > 0;
  const dispersed = pointLoads.map((p) => {
    const hx = (p.bx + i.h) / 2000,
      hy = (p.by + i.h) / 2000;
    return {
      x0: Math.max(0, p.x - hx),
      x1: Math.min(i.lx, p.x + hx),
      y0: Math.max(0, p.y - hy),
      y1: Math.min(i.ly, p.y + hy),
    };
  });
  const patchFe = hasPatches
    ? solvePatchLoads(
        i.lx,
        i.ly,
        {
          west: i.supports.west === "Fixed",
          east: i.supports.east === "Fixed",
          south: i.supports.south === "Fixed",
          north: i.supports.north === "Fixed",
        },
        i.nu,
        dispersed,
      )
    : null;
  const range = (n: number) => Array.from({ length: n + 1 }, (_, k) => k / n);
  /** Plate-normalised (tS, tL ∈ [0, 1]) → global metres. */
  const toGlobal = (tS: number, tL: number): [number, number] =>
    shortAxis === "X"
      ? [tS * shortSpan, tL * longSpan]
      : [tL * longSpan, tS * shortSpan];
  /** Per-load field at (tS, tL) resolved into short/long components. */
  const patchCache = new Map<string, PatchShortLong[]>();
  const patchAt = (tS: number, tL: number): PatchShortLong[] => {
    const key = `${tS}|${tL}`,
      hit = patchCache.get(key);
    if (hit) return hit;
    const [x, y] = toGlobal(tS, tL);
    const values = pointLoads.map((_, k) =>
      shortLong(patchFe!.at(k, x, y), shortAxis),
    );
    patchCache.set(key, values);
    return values;
  };
  /** Normalised lines through each dispersed patch (edges and centre). */
  const patchLines = (axis: SlabDirection) =>
    dispersed.flatMap((r) => {
      const globalX = (axis === "short") === (shortAxis === "X"),
        a = globalX ? r.x0 : r.y0,
        b = globalX ? r.x1 : r.y1,
        length = axis === "short" ? shortSpan : longSpan;
      return [a, (a + b) / 2, b].map((v) =>
        Math.min(1, Math.max(0, v / length)),
      );
    });
  /**
   * Factored point-load moment (kN·m/m) at (tS, tL) in the given sense
   * (+1 sagging, −1 hogging). Dead always acts; live point loads only where
   * adverse (ACI 318-19 6.4 pattern loading intent).
   */
  const patchMoment = (
    l: SlabInput["loads"][number],
    tS: number,
    tL: number,
    long: boolean,
    sense: number,
  ) => {
    if (!hasPatches) return 0;
    let total = 0;
    patchAt(tS, tL).forEach((v, k) => {
      const m = sense * (long ? v.mLong : v.mShort);
      total +=
        l.deadFactor * pointLoads[k].dead * m +
        Math.max(0, l.liveFactor * pointLoads[k].live * m);
    });
    return total;
  };
  const minAs = slabMinimumSteelRatio(i.fy) * 1000 * i.h;
  const specs: { id: string; label: string; layer: SlabLayer }[] = [
    {
      id: "short-positive",
      label: "Short-span positive / bottom",
      layer: "short-bottom",
    },
    {
      id: "long-positive",
      label: "Long-span positive / distribution",
      layer: "long-bottom",
    },
    {
      id: "short-negative",
      label: "Short-span negative / top",
      layer: "short-top",
    },
    {
      id: "long-negative",
      label: "Long-span negative / distribution",
      layer: "long-top",
    },
  ];
  const regions = specs.map((spec) => {
    const isLong = spec.layer.startsWith("long"),
      isTop = spec.layer.endsWith("top");
    const maxSpacing = Math.min(
      (type === "two-way" ? 2 : isLong ? 5 : 3) * i.h,
      450,
    );
    const samples: SlabRegion["samples"] = [];
    const sense = isTop ? -1 : 1;
    // Uniform-load moment coefficient (× wu·Lshort²) at plate-normalised (tS, tL).
    const uniform = (tS: number, tL: number) => {
      if (!plate) return isLong ? 0 : beamMoment(tS);
      const m = plate.at(tS, tL * ratio);
      return isLong ? m.my : m.mx;
    };
    const push = (
      l: (typeof activeLoads)[number],
      tS: number,
      tL: number,
      position: number,
    ) => {
      const wu = l.deadFactor * dead + l.liveFactor * i.live;
      samples.push({
        mu: Math.max(
          0,
          sense * uniform(tS, tL) * wu * shortSpan ** 2 +
            patchMoment(l, tS, tL, isLong, sense),
        ),
        extra: slabExtraActive(i, spec.layer, position),
        combination: l.id,
        position,
      });
    };
    const shortGrid = [
        ...range(plate ? 30 : 100),
        ...(hasPatches ? patchLines("short") : []),
      ],
      longGrid =
        plate || hasPatches
          ? [...range(30), ...(hasPatches ? patchLines("long") : [])]
          : [0];
    // One-way strip without point loads keeps the short-direction position for both layers.
    const positionOf = (tS: number, tL: number) =>
      isLong && (plate || hasPatches) ? tL : tS;
    for (const l of activeLoads)
      for (const tS of shortGrid)
        for (const tL of longGrid) push(l, tS, tL, positionOf(tS, tL));
    // Include either side of cutoffs, so a mesh cannot credit unavailable extra steel.
    const cuts = isTop
      ? [
          i.cutoffs[isLong ? (shortAxis === "X" ? "south" : "west") : near],
          1 - i.cutoffs[isLong ? (shortAxis === "X" ? "north" : "east") : far],
        ]
      : [i.cutoffs.bottomStart, i.cutoffs.bottomEnd];
    const across = isLong ? shortGrid : longGrid;
    for (const t0 of cuts)
      for (const t of [Math.max(0, t0 - 0.00001), Math.min(1, t0 + 0.00001)])
        for (const l of activeLoads)
          for (const u of plate || hasPatches ? across : [0])
            push(l, isLong ? u : t, isLong ? t : u, t);
    const select = (extra: boolean) =>
      bars.filter(
        (b) => b.layer === spec.layer && (b.group === "main" || extra),
      );
    const strengths = [
      slabFlexuralStrength(i, select(false)),
      slabFlexuralStrength(i, select(true)),
    ];
    const mainAs = select(false).reduce((sum, b) => sum + b.as, 0);
    const extraAs = select(true)
      .filter((b) => b.group === "extra")
      .reduce((sum, b) => sum + b.as, 0);
    const zoneMap = new Map<string, SlabFlexuralZone>();
    const nearEdge = isLong ? (shortAxis === "X" ? "south" : "west") : near;
    const farEdge = isLong ? (shortAxis === "X" ? "north" : "east") : far;
    for (const sample of samples) {
      const active = sample.extra && extraAs > 0;
      const zoneId =
        extraAs <= 0
          ? "full-span"
          : active
            ? isTop
              ? sample.position < 0.5
                ? "near-support"
                : "far-support"
              : "extra-midspan"
            : isTop
              ? "interior"
              : sample.position < i.cutoffs.bottomStart
                ? "outside-near"
                : "outside-far";
      const zoneLabel =
        zoneId === "full-span"
          ? "Full Span · MAIN BARS Only"
          : zoneId === "extra-midspan"
            ? "Midspan · MAIN + EXTRA BARS"
            : zoneId === "near-support"
              ? `${nearEdge} Support · MAIN + EXTRA BARS`
              : zoneId === "far-support"
                ? `${farEdge} Support · MAIN + EXTRA BARS`
                : zoneId === "interior"
                  ? "Interior Beyond Top Cutoffs · MAIN BARS Only"
                  : `Outside Bottom Cutoff · ${zoneId === "outside-near" ? nearEdge : farEdge} Side · MAIN BARS Only`;
      const capacity = strengths[active ? 1 : 0];
      const utilization =
        capacity.phiMn > 0 ? sample.mu / capacity.phiMn : Infinity;
      const previous = zoneMap.get(zoneId);
      if (!previous || utilization > previous.dcr)
        zoneMap.set(zoneId, {
          ...capacity,
          id: zoneId,
          label: zoneLabel,
          mainAs,
          extraAs: active ? extraAs : 0,
          mu: sample.mu,
          dcr: utilization,
          combination: sample.combination,
          position: sample.position,
        });
    }
    let worst = samples[0],
      dcr = -1;
    for (const s of samples) {
      const c = strengths[s.extra ? 1 : 0].phiMn,
        r = c > 0 ? s.mu / c : Infinity;
      if (r > dcr) {
        worst = s;
        dcr = r;
      }
    }
    const strength = strengths[worst.extra ? 1 : 0],
      spacingBase = layerSpacing(i, bars, spec.layer, false, maxSpacing),
      spacingExtra = layerSpacing(i, bars, spec.layer, true, maxSpacing);
    let requiredAs = minAs;
    const main = select(false)[0];
    if (main) {
      let lo = 0,
        hi = 1000 * i.h * 0.04;
      for (let k = 0; k < 40; k++) {
        const mid = (lo + hi) / 2;
        if (
          slabFlexuralStrength(i, [{ as: mid, d: main.d }]).phiMn *
            i.dcrLimit >=
          worst.mu
        )
          hi = mid;
        else lo = mid;
      }
      requiredAs = Math.max(minAs, hi);
    }
    return {
      ...spec,
      ...strength,
      mu: worst.mu,
      dcr: Math.max(0, dcr),
      combination: worst.combination,
      minAs,
      requiredAs,
      maxSpacing,
      minClear: Math.min(spacingBase.minClear, spacingExtra.minClear),
      spacingOk: spacingBase.ok && spacingExtra.ok,
      minimumOk: strengths[0].as >= minAs - 1e-8,
      mainAs,
      extraAs: worst.extra ? extraAs : 0,
      extraActive: worst.extra && extraAs > 0,
      position: worst.position,
      spacingChecks: [
        { label: "MAIN BARS Only", ...spacingBase },
        ...(extraAs > 0
          ? [{ label: "MAIN + EXTRA BARS", ...spacingExtra }]
          : []),
      ],
      zones: [...zoneMap.values()],
      samples,
    };
  });
  const shear: SlabResult["shear"] = [];
  for (const edge of ["west", "east", "south", "north"] as const) {
    const direction = edgeDirection(i, edge);
    if (type === "one-way" && direction === "long" && !hasPatches) continue;
    // Main steel only: no shear credit to curtailed extras until anchorage has independent review.
    const face: SlabFace = i.supports[edge] === "Fixed" ? "top" : "bottom",
      b = bars.find(
        (b) => b.group === "main" && b.layer === `${direction}-${face}`,
      )!;
    const rho = b.as / (1000 * b.d),
      lambdaS = Math.min(1, Math.sqrt(2 / (1 + 0.004 * b.d)));
    const phiVc =
      (0.75 *
        Math.min(0.66 * lambdaS * Math.cbrt(rho), 0.42) *
        slabSqrtFc(i.fc) *
        1000 *
        b.d) /
      1000;
    const nearSide = edge === "west" || edge === "south",
      span = direction === "short" ? shortSpan : longSpan;
    // ACI 318-19 7.4.3.2(c): with a concentrated load between the support and
    // the section at d, design for the shear at the support line instead.
    const loadWithinD = pointLoads.some((p) => {
      const lo =
          edge === "west" || edge === "east"
            ? p.x - p.bx / 2000
            : p.y - p.by / 2000,
        hi =
          edge === "west" || edge === "east"
            ? p.x + p.bx / 2000
            : p.y + p.by / 2000,
        length = edge === "west" || edge === "east" ? i.lx : i.ly;
      return nearSide ? lo < b.d / 1000 : length - hi < b.d / 1000;
    });
    const offset = loadWithinD ? 0 : b.d / 1000,
      fraction = nearSide ? offset / span : 1 - offset / span,
      sign = nearSide ? 1 : -1;
    const along = [
      ...Array.from({ length: 39 }, (_, k) => (k + 1) / 40),
      ...(hasPatches
        ? patchLines(direction === "short" ? "long" : "short")
        : []),
    ];
    const patchShear = (l: SlabInput["loads"][number], t: number) => {
      if (!hasPatches) return 0;
      let total = 0;
      patchAt(
        direction === "short" ? fraction : t,
        direction === "long" ? fraction : t,
      ).forEach((v, k) => {
        const q = sign * (direction === "short" ? v.qShort : v.qLong);
        total +=
          l.deadFactor * pointLoads[k].dead * q +
          Math.max(0, l.liveFactor * pointLoads[k].live * q);
      });
      return total;
    };
    let vu = 0,
      combination = "";
    for (const l of activeLoads) {
      const wu = l.deadFactor * dead + l.liveFactor * i.live;
      let demand = 0;
      if (!plate) {
        const strip =
          direction === "long"
            ? 0
            : wu *
              Math.max(
                0,
                (edge === near ? beam.reaction : 1 - beam.reaction) *
                  shortSpan -
                  offset,
              );
        demand = hasPatches
          ? Math.max(0, ...along.map((t) => strip + patchShear(l, t)))
          : strip;
      } else
        for (const t of along) {
          const p = plate.at(
            direction === "short" ? fraction : t,
            (direction === "long" ? fraction : t) * ratio,
          );
          demand = Math.max(
            demand,
            Math.abs(direction === "short" ? p.qx : p.qy) * wu * shortSpan +
              patchShear(l, t),
          );
        }
      if (demand >= vu) {
        vu = demand;
        combination = l.id;
      }
    }
    shear.push({
      edge,
      vu,
      phiVc,
      dcr: vu / phiVc,
      d: b.d,
      rho,
      lambdaS,
      combination,
      section: offset * 1000,
      concentratedWithinD: loadWithinD,
    });
  }
  let immediate = 0,
    combination = "";
  const ec = 4700 * Math.sqrt(i.fc),
    rigidity =
      (ec * 1000 * (i.h / 1000) ** 3) / 12 / (plate ? 1 - i.nu ** 2 : 1);
  // Point loads: service field sampled on a grid through every patch.
  const plateRigidity = (ec * 1000 * (i.h / 1000) ** 3) / 12 / (1 - i.nu ** 2),
    serviceGrid = hasPatches
      ? {
          short: [...range(20), ...patchLines("short")],
          long: [...range(20), ...patchLines("long")],
        }
      : null;
  /** Service point-load effect: field(v) summed with PD + γL,service·PL. */
  const servicePatch = (
    l: SlabInput["loads"][number],
    tS: number,
    tL: number,
    field: (v: PatchShortLong) => number,
  ) =>
    patchAt(tS, tL).reduce(
      (s, v, k) =>
        s +
        (pointLoads[k].dead + l.serviceLiveFactor * pointLoads[k].live) *
          field(v),
      0,
    );
  /** Gross-section immediate deflection, mm (uniform + point loads). */
  const grossDeflection = (l: SlabInput["loads"][number]) => {
    const ws = dead + l.serviceLiveFactor * i.live;
    if (!serviceGrid)
      return ((coefficients.beta * ws * shortSpan ** 4) / rigidity) * 1000;
    let max = 0;
    for (const tS of serviceGrid.short)
      for (const tL of serviceGrid.long) {
        const shapeU = plate ? plate.at(tS, tL * ratio).w : beamW(tS);
        max = Math.max(
          max,
          ((shapeU * ws * shortSpan ** 4) / rigidity +
            servicePatch(l, tS, tL, (v) => v.w) / plateRigidity) *
            1000,
        );
      }
    return max;
  };
  /** Largest service short-direction moment with point loads (sense +1 sagging, −1 hogging along an edge line tS). */
  const servicePatchMoment = (
    l: SlabInput["loads"][number],
    sense: number,
    tSLine: number | null,
  ) => {
    if (!serviceGrid) return 0;
    const ws = dead + l.serviceLiveFactor * i.live;
    let max = 0;
    for (const tS of tSLine === null ? serviceGrid.short : [tSLine])
      for (const tL of serviceGrid.long) {
        const mU = plate ? plate.at(tS, tL * ratio).mx : beamMoment(tS);
        max = Math.max(
          max,
          sense * mU * ws * shortSpan ** 2 +
            sense * servicePatch(l, tS, tL, (v) => v.mShort),
        );
      }
    return max;
  };
  for (const l of activeLoads) {
    const delta = grossDeflection(l);
    if (delta >= immediate) {
      immediate = delta;
      combination = l.id;
    }
  }
  // Cracked immediate deflection, short-direction strip (ACI 318-19 24.2.3).
  const minimumThickness = slabMinimumThickness(i);
  const sectionAt = (face: SlabFace, position: number) => {
    const set = bars.filter(
      (b) =>
        b.direction === "short" &&
        b.face === face &&
        (b.group === "main" || slabExtraActive(i, b.layer, position)),
    );
    const as = set.reduce((s, b) => s + b.as, 0);
    return slabCrackedSection(
      i,
      as,
      as > 0 ? set.reduce((s, b) => s + b.as * b.d, 0) / as : 0,
    );
  };
  const midSection = sectionAt("bottom", 0.5);
  const ends = (
    [
      [near, 0],
      [far, 1],
    ] as const
  )
    .filter(([edge]) => i.supports[edge] === "Fixed")
    .map(([edge, t]) => ({ edge, section: sectionAt("top", t) }));
  let crackedImmediate = 0,
    crackedCombination = "",
    governingMa = 0,
    governingIe = midSection.ig,
    governingIeMid = midSection.ig,
    governingIeAvg: number | null = null;
  for (const l of activeLoads) {
    const ws = dead + l.serviceLiveFactor * i.live;
    const delta = grossDeflection(l);
    const maMid = Math.max(
      Math.max(0, coefficients.shortPositive) * ws * shortSpan ** 2,
      servicePatchMoment(l, 1, null),
    );
    const ieMid = slabEffectiveInertia(midSection, maMid);
    // 24.2.3.6: average of positive- and negative-moment sections; 24.2.3.7:
    // midspan value permitted for prismatic members. Use the lesser (conservative).
    const ieNeg = ends.length
      ? ends.reduce(
          (s, e) =>
            s +
            slabEffectiveInertia(
              e.section,
              Math.max(
                Math.abs(coefficients[`${e.edge}Negative`]) *
                  ws *
                  shortSpan ** 2,
                servicePatchMoment(l, -1, e.edge === near ? 0 : 1),
              ),
            ),
          0,
        ) / ends.length
      : null;
    const ieAvg = ieNeg === null ? null : (ieMid + ieNeg) / 2;
    const ie = Math.min(ieMid, ieAvg ?? Infinity);
    const deltaCr = ie > 0 ? (delta * midSection.ig) / ie : Infinity;
    if (deltaCr >= crackedImmediate) {
      crackedImmediate = deltaCr;
      crackedCombination = l.id;
      governingMa = maMid;
      governingIe = ie;
      governingIeMid = ieMid;
      governingIeAvg = ieAvg;
    }
  }
  const deflectionLimit = (shortSpan * 1000) / i.deflectionDivisor;
  const crackedDeflectionOk = crackedImmediate <= deflectionLimit + 1e-9;
  const deflectionOk = minimumThickness.ok || crackedDeflectionOk;
  const development: SlabResult["detailing"]["development"] = [];
  for (const b of bars.filter((b) => b.group === "extra")) {
    const span = (b.direction === "short" ? shortSpan : longSpan) * 1000,
      ld = slabDevelopmentLength(i, b);
    const extension =
      b.face === "bottom"
        ? Math.min(0.5 - i.cutoffs.bottomStart, i.cutoffs.bottomEnd - 0.5) *
          span
        : Math.min(
            ...(["west", "east", "south", "north"] as const)
              .filter(
                (e) =>
                  edgeDirection(i, e) === b.direction &&
                  i.supports[e] === "Fixed",
              )
              .map((e) => i.cutoffs[e] * span),
          );
    const ok =
      Number.isFinite(extension) &&
      extension >= ld + Math.max(b.d, 12 * b.diameter);
    development.push({
      layer: b.layer,
      ld,
      extension: Number.isFinite(extension) ? extension : 0,
      ok,
    });
    if (!ok)
      messages.push(
        `Extra ${b.layer}: available extension is insufficient for the development/cutoff screening, or no fixed support is selected.`,
      );
  }
  const minDepth = Math.min(...bars.map((b) => b.d));
  const recommendations = suggestions
    ? slabLayers.map((layer) => {
        const current = bars.find(
          (b) => b.group === "main" && b.layer === layer,
        )!;
        const region = regions.find((r) => r.layer === layer)!;
        let spacing: number | null = null;
        for (
          let s = Math.floor(region.maxSpacing / 25) * 25;
          s >= Math.max(50, current.diameter + 25);
          s -= 25
        ) {
          const candidate = {
              ...i,
              main: { ...i.main, [layer]: { ...i.main[layer], spacing: s } },
            },
            candidateBars = resolveSlabBars(candidate);
          const noExtra = candidateBars.filter(
              (b) => b.layer === layer && b.group === "main",
            ),
            withExtra = candidateBars.filter((b) => b.layer === layer);
          const strengths = [
            slabFlexuralStrength(i, noExtra),
            slabFlexuralStrength(i, withExtra),
          ];
          if (
            strengths[0].as < minAs ||
            !strengths.every((c) => c.tensionControlled) ||
            !layerSpacing(
              candidate,
              candidateBars,
              layer,
              false,
              region.maxSpacing,
            ).ok ||
            !layerSpacing(
              candidate,
              candidateBars,
              layer,
              true,
              region.maxSpacing,
            ).ok
          )
            continue;
          if (
            region.samples.every(
              (sample) =>
                sample.mu <=
                strengths[sample.extra ? 1 : 0].phiMn * i.dcrLimit + 1e-8,
            )
          ) {
            spacing = s;
            break;
          }
        }
        return {
          layer,
          spacing,
          diameter: current.diameter,
          reason:
            spacing === null
              ? "No arrangement found for this diameter on the 25 mm spacing grid. Increase diameter or thickness and review elevations."
              : "Largest 25 mm-grid main-bar spacing meeting flexure, minimum steel, tension control and combined spacing. Shear, anchorage and serviceability require recheck; inputs unchanged.",
        };
      })
    : [];
  const warnings = [
    "Development pilot — independent engineering review required before design use.",
    "Deflection: h ≥ hmin (ACI 318-19 Table 7.3.1.1 / 8.3.1.2) waives calculation; otherwise immediate deflection uses cracked effective inertia Ie (Table 24.2.3.5, lesser of midspan and 24.2.3.6 average), compression steel neglected. Thickness tables assume no attached partitions likely to be damaged by large deflections. Sustained-load (long-term) deflection is not evaluated.",
    "Straight-bar development/cutoff screening is not a complete anchorage check. Support embedment, hooks, laps and curtailment beyond the theoretical cutoff require designer review.",
    "No openings, column-supported slabs, corner torsion steel, redistribution or pattern live loading are evaluated; punching only at entered point loads.",
  ];
  if (type === "two-way")
    warnings.push(
      "Two-way moments use elastic Kirchhoff plate Ritz analysis, not ACI tabulated coefficients or the Direct Design Method. Local plate shear and corner effects require independent review.",
    );
  if (minimumThickness.ok && !crackedDeflectionOk)
    warnings.push(
      `Information: h = ${i.h} mm ≥ hmin = ${minimumThickness.hmin.toFixed(1)} mm, so calculated deflection is waived, but cracked immediate deflection ${crackedImmediate.toFixed(2)} mm exceeds L/${i.deflectionDivisor} = ${deflectionLimit.toFixed(2)} mm. Review where partitions or finishes are deflection-sensitive.`,
    );
  if (
    minimumThickness.system === "two-way" &&
    minimumThickness.discontinuousEdges.length
  )
    warnings.push(
      `Minimum thickness assumes rigid edge supports (αfm > 2.0). Discontinuous (Pinned) edges ${minimumThickness.discontinuousEdges.join(", ")}: ACI 318-19 8.3.1.2.1 requires an edge beam with αf ≥ 0.80, or hmin increased by 10%.`,
    );
  if (i.code === "NSCP 2015")
    warnings.push(
      "Project standard: NSCP 2015. Calculation basis: ACI 318-19 by designer selection; this is not a separate NSCP code-compliance certification.",
    );
  if (i.dcrLimit > 1)
    warnings.push(
      "Designer DCR limit exceeds 1.00; meeting this limit does not establish code strength compliance.",
    );
  if (
    type === "one-way" &&
    (i.extra["long-bottom"].enabled || i.extra["long-top"].enabled)
  )
    warnings.push(
      "Long-span EXTRA BARS are excluded in one-way mode. Main transverse distribution reinforcement remains included.",
    );
  const cracked =
    Math.max(
      coefficients.shortPositive,
      coefficients.longPositive,
      coefficients.westNegative,
      coefficients.eastNegative,
      coefficients.southNegative,
      coefficients.northNegative,
    ) *
      Math.max(...activeLoads.map((l) => dead + l.serviceLiveFactor * i.live)) *
      shortSpan ** 2 >
      (0.62 * Math.sqrt(i.fc) * 1000 * i.h ** 2) / 6 / 1e6 ||
    (hasPatches &&
      governingMa > (0.62 * Math.sqrt(i.fc) * 1000 * i.h ** 2) / 6 / 1e6);
  if (minDepth <= 0) messages.push("Bar effective depth must be positive.");
  const punching = slabPunching(i, bars, activeLoads, dead);
  if (hasPatches) {
    warnings.push(
      "Point loads: Kirchhoff plate FE (16-DOF Bogner–Fox–Schmit rectangles, graded mesh) on the actual panel and supports, superposed on the uniform-load solution. Flexure, shear and deflection use the load dispersed at 45° to the mid-plane (bx + h, by + h); punching uses the actual loaded area. Design moments are elastic peak values per metre without lateral redistribution or Wood–Armer torsion; live point loads are counted only where adverse.",
    );
    for (const v of shear.filter((v) => v.concentratedWithinD))
      warnings.push(
        `${v.edge} edge: point load within d of the support; one-way shear checked at the support line (ACI 318-19 7.4.3.2(c)). Review direct load transfer to the support.`,
      );
    for (const v of punching) {
      if (v.sides < 4)
        warnings.push(
          `${v.id}: punching critical section reaches a support face; ${v.sides}-sided perimeter used with αs = ${v.alphaS}. Review load transfer to the support.`,
        );
      if (!(v.b0 > 0))
        warnings.push(
          `${v.id}: punching not evaluated: the loaded area spans between support faces.`,
        );
    }
  }
  const status =
    regions.every(
      (r) =>
        r.dcr <= i.dcrLimit &&
        r.minimumOk &&
        r.spacingOk &&
        r.tensionControlled,
    ) &&
    shear.every((r) => r.dcr <= i.dcrLimit) &&
    punching.every((p) => !(p.dcr > i.dcrLimit)) &&
    !messages.length &&
    deflectionOk
      ? "SCREENING PASS"
      : "REVISE";
  return {
    type,
    ratio,
    shortSpan,
    longSpan,
    shortAxis,
    bars,
    method:
      (plate
        ? "Elastic Kirchhoff plate · Ritz 8×8 basis · exact aspect ratio"
        : "Elastic one-metre beam strip · exact Fixed/Pinned end solution") +
      (hasPatches
        ? " + point loads: Kirchhoff plate FE (BFS 16-DOF, graded mesh)"
        : ""),
    coefficients,
    regions,
    shear,
    deflection: {
      immediate,
      limit: deflectionLimit,
      combination,
      cracked,
      crackedImmediate,
      crackedCombination,
      ma: governingMa,
      mcr: midSection.mcr,
      ig: midSection.ig,
      icr: midSection.icr,
      ieMid: governingIeMid,
      ieAvg: governingIeAvg,
      ie: governingIe,
      minimumThickness,
      governedBy: minimumThickness.ok ? "thickness" : "calculation",
      ok: deflectionOk,
    },
    punching,
    recommendations,
    detailing: {
      ok: !messages.length,
      messages: [...new Set(messages)],
      development,
    },
    status,
    warnings,
    dead,
    unit: "metric",
    engineVersion: "slab-0.3.0",
  };
}
export function parseSlabLoads(text: string): SlabInput["loads"] {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (!lines.length)
    throw new Error("Paste a header and load combination rows.");
  const split = (line: string) =>
    line.split(line.includes("\t") ? "\t" : ",").map((s) => s.trim());
  const header = split(lines[0]).map((s) =>
    s.toLowerCase().replace(/[ _-]/g, ""),
  );
  const required = ["id", "deadfactor", "livefactor", "servicelivefactor"];
  if (!required.every((h) => header.includes(h)))
    throw new Error(
      "Use columns: ID, DeadFactor, LiveFactor, ServiceLiveFactor. Factors multiply total D (including self-weight) and L.",
    );
  const number = (s: string | undefined) => {
    if (!s || !/^\d*\.?\d+$/.test(s))
      throw new Error("Load factors must be explicit nonnegative numbers.");
    return Number(s);
  };
  const loads = lines.slice(1).map((line) => {
    const c = split(line);
    if (c.length !== header.length)
      throw new Error("Every row must match the header column count.");
    return {
      id: c[header.indexOf("id")],
      deadFactor: number(c[header.indexOf("deadfactor")]),
      liveFactor: number(c[header.indexOf("livefactor")]),
      serviceLiveFactor: number(c[header.indexOf("servicelivefactor")]),
      included: true,
    };
  });
  const validated = slabInputSchema.safeParse({ ...defaultSlabInput(), loads });
  if (!validated.success)
    throw new Error(
      "Use 1–100 combinations with unique nonblank IDs, strength factors 0–3 and service live factors 0–1.",
    );
  return validated.data.loads;
}
