import { designCheckPolicySchema, designRemarksSchema } from "../design-review";
import { z } from "zod";
import { slabQuantitySchema } from "./slab-quantity-schema";
import { solveSlabPlate } from "./slab-plate";
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
  })
  .refine(
    (i) => new Set(i.loads.map((l) => l.id)).size === i.loads.length,
    "Load combination labels must be unique.",
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
  shear: {
    edge: SlabEdge;
    vu: number;
    phiVc: number;
    dcr: number;
    d: number;
    rho: number;
    lambdaS: number;
    combination: string;
  }[];
  deflection: {
    immediate: number;
    limit: number;
    combination: string;
    cracked: boolean;
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
    (((i.fy / (1.1 * Math.sqrt(i.fc))) * psiTop * psiSize) /
      Math.min(2.5, cb / b.diameter)) *
      b.diameter,
  );
}
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
    for (const l of activeLoads) {
      const wu = l.deadFactor * dead + l.liveFactor * i.live;
      if (!plate) {
        for (let k = 0; k <= 100; k++) {
          const t = k / 100,
            m = isLong ? 0 : beamMoment(t);
          samples.push({
            mu: Math.max(0, isTop ? -m : m) * wu * shortSpan ** 2,
            extra: slabExtraActive(i, spec.layer, t),
            combination: l.id,
            position: t,
          });
        }
      } else {
        for (let k = 0; k <= 30; k++)
          for (let j = 0; j <= 30; j++) {
            const x = k / 30,
              y = j / 30,
              m = plate.at(x, y * ratio);
            const mu = isLong ? m.my : m.mx,
              t = isLong ? y : x;
            samples.push({
              mu: Math.max(0, isTop ? -mu : mu) * wu * shortSpan ** 2,
              extra: slabExtraActive(i, spec.layer, t),
              combination: l.id,
              position: t,
            });
          }
      }
    }
    // Include either side of cutoffs, so a mesh cannot credit unavailable extra steel.
    const cuts = isTop
      ? [
          i.cutoffs[isLong ? (shortAxis === "X" ? "south" : "west") : near],
          1 - i.cutoffs[isLong ? (shortAxis === "X" ? "north" : "east") : far],
        ]
      : [i.cutoffs.bottomStart, i.cutoffs.bottomEnd];
    for (const t0 of cuts)
      for (const t of [Math.max(0, t0 - 0.00001), Math.min(1, t0 + 0.00001)])
        for (const l of activeLoads)
          for (let k = 0; k <= (plate ? 30 : 0); k++) {
            const p = plate?.at(
              isLong ? k / 30 : t,
              (isLong ? t : k / 30) * ratio,
            );
            const m = p ? (isLong ? p.my : p.mx) : isLong ? 0 : beamMoment(t);
            samples.push({
              mu:
                Math.max(0, isTop ? -m : m) *
                (l.deadFactor * dead + l.liveFactor * i.live) *
                shortSpan ** 2,
              extra: slabExtraActive(i, spec.layer, t),
              combination: l.id,
              position: t,
            });
          }
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
    if (type === "one-way" && direction === "long") continue;
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
        Math.sqrt(i.fc) *
        1000 *
        b.d) /
      1000;
    let vu = 0,
      combination = "";
    for (const l of activeLoads) {
      const wu = l.deadFactor * dead + l.liveFactor * i.live;
      let demand = 0;
      if (!plate)
        demand =
          wu *
          Math.max(
            0,
            (edge === near ? beam.reaction : 1 - beam.reaction) * shortSpan -
              b.d / 1000,
          );
      else
        for (let k = 1; k < 40; k++) {
          const nearSide = edge === "west" || edge === "south",
            fraction = nearSide
              ? b.d / 1000 / (direction === "short" ? shortSpan : longSpan)
              : 1 - b.d / 1000 / (direction === "short" ? shortSpan : longSpan);
          const p = plate.at(
            direction === "short" ? fraction : k / 40,
            (direction === "long" ? fraction : k / 40) * ratio,
          );
          demand = Math.max(
            demand,
            Math.abs(direction === "short" ? p.qx : p.qy) * wu * shortSpan,
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
    });
  }
  let immediate = 0,
    combination = "";
  const ec = 4700 * Math.sqrt(i.fc),
    rigidity =
      (ec * 1000 * (i.h / 1000) ** 3) / 12 / (plate ? 1 - i.nu ** 2 : 1);
  for (const l of activeLoads) {
    const delta =
      ((coefficients.beta *
        (dead + l.serviceLiveFactor * i.live) *
        shortSpan ** 4) /
        rigidity) *
      1000;
    if (delta >= immediate) {
      immediate = delta;
      combination = l.id;
    }
  }
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
    "Immediate deflection uses gross uncracked stiffness only; cracked, sustained-load and long-term deflection are not evaluated.",
    "Straight-bar development/cutoff screening is not a complete anchorage check. Support embedment, hooks, laps and curtailment beyond the theoretical cutoff require designer review.",
    "No openings, punching shear, column-supported slabs, concentrated loads, corner torsion reinforcement, redistribution or pattern live loading are evaluated.",
  ];
  if (type === "two-way")
    warnings.push(
      "Two-way moments use elastic Kirchhoff plate Ritz analysis, not ACI tabulated coefficients or the Direct Design Method. Local plate shear and corner effects require independent review.",
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
    (0.62 * Math.sqrt(i.fc) * 1000 * i.h ** 2) / 6 / 1e6;
  if (minDepth <= 0) messages.push("Bar effective depth must be positive.");
  const status =
    regions.every(
      (r) =>
        r.dcr <= i.dcrLimit &&
        r.minimumOk &&
        r.spacingOk &&
        r.tensionControlled,
    ) &&
    shear.every((r) => r.dcr <= i.dcrLimit) &&
    !messages.length &&
    immediate <= (shortSpan * 1000) / i.deflectionDivisor
      ? "SCREENING PASS"
      : "REVISE";
  return {
    type,
    ratio,
    shortSpan,
    longSpan,
    shortAxis,
    bars,
    method: plate
      ? "Elastic Kirchhoff plate · Ritz 8×8 basis · exact aspect ratio"
      : "Elastic one-metre beam strip · exact Fixed/Pinned end solution",
    coefficients,
    regions,
    shear,
    deflection: {
      immediate,
      limit: (shortSpan * 1000) / i.deflectionDivisor,
      combination,
      cracked,
    },
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
    engineVersion: "slab-0.1.1",
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
