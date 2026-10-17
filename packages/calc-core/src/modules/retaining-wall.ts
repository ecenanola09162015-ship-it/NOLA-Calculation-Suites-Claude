/**
 * RC retaining wall — input schema, defaults and shared types (engine rwall-0.1.0).
 *
 * Phase 1: 1 m strip analysis of cantilever, propped and basement walls.
 * Calculation basis ACI 318-19 (SI) first; NSCP 2015 is the project standard
 * for load combinations (Sec. 203), stability (Sec. 307) and seismic (Sec. 208),
 * labelled "calculated per ACI 318-19".
 *
 * Units: m for geometry, kN/m³ unit weights, kPa pressures, deg angles,
 * MPa materials, mm bars and covers. Results per metre of wall.
 * Coordinates: x from the toe edge towards the heel, y up from the underside
 * of the footing. Stem height H is measured from the top of the footing.
 */
import { z } from "zod";

import { designCheckPolicySchema, designRemarksSchema } from "../design-review";
import { retainingWallQuantitySchema } from "./retaining-wall-quantity";
import {
  FC_ENGINE_MAX,
  FC_ENGINE_MIN,
  PSI_MAX,
  PSI_MIN,
} from "../concrete-units";

export const RETAINING_WALL_ENGINE = "rwall-0.1.0";

export const retainingWallTypes = ["cantilever", "propped", "basement"] as const;
export type RetainingWallType = (typeof retainingWallTypes)[number];
export const earthPressureTheories = [
  "rankine",
  "coulomb",
  "at-rest",
  "user",
] as const;
export type EarthPressureTheory = (typeof earthPressureTheories)[number];
export const seismicMethods = ["none", "mononobe-okabe", "wood"] as const;
export type SeismicMethod = (typeof seismicMethods)[number];
export const combinationSets = ["NSCP 2015", "ASCE 7-16"] as const;
export type CombinationSet = (typeof combinationSets)[number];

const barSchema = z.object({
  /** Calculation diameter, mm (π d²/4 = nominal area). */
  diameter: z.number().min(6).max(57.5),
  /** Centre-to-centre spacing, mm. */
  spacing: z.number().min(50).max(600),
});
export type RetainingWallBar = z.infer<typeof barSchema>;

const combinationSchema = z.object({
  id: z.string().trim().min(1).max(100),
  /** Dead load: self-weight, soil weight, dead surcharge (vertical). */
  d: z.number().min(0).max(3),
  /** Lateral earth pressure H: soil, dead-surcharge lateral and groundwater. */
  h: z.number().min(0).max(3),
  /** Live surcharge (lateral and vertical). */
  l: z.number().min(0).max(3),
  /** Seismic earth-pressure increment and wall inertia. */
  e: z.number().min(0).max(3),
  /** Wind on the exposed stem. */
  w: z.number().min(0).max(3).default(0),
  included: z.boolean(),
});
export type RetainingWallCombination = z.infer<typeof combinationSchema>;

const barRef = z.object({ diameter: z.number().min(6).max(57.5), spacing: z.number().min(50).max(600) });
export function defaultCounterfort() {
  return {
    topReach: 0.3,
    cover: 50,
    tension: { diameter: 25, count: 4 },
    ties: { diameter: 12, spacing: 200 },
    heelTies: { diameter: 16, spacing: 200 },
    support: "elastic" as const,
    stiffnessFactor: 1,
  };
}
export const retainingWallInputSchema = z
  .object({
    code: z.enum(["ACI 318-19", "NSCP 2015"]),
    otherCodes: z.string().max(300).optional(),
    wallType: z.enum(retainingWallTypes),
    /** 1 m strip (Phase 1) or full-width plate of the stem (Phase 2). */
    analysis: z.enum(["strip", "plate"]).default("strip"),
    /** Full-width stem plate: length, edge restraints and buttresses. */
    plate: z
      .object({
        length: z.number().min(1).max(60),
        /** Ends of the wall: free, or a perpendicular wall (pinned / fixed). */
        left: z.enum(["free", "pinned", "fixed"]),
        right: z.enum(["free", "pinned", "fixed"]),
        /** Top edge for cantilever walls (propped and basement walls set it). */
        top: z.enum(["free", "pinned", "fixed"]),
        base: z.enum(["fixed", "pinned"]),
        /** Buttresses / counterforts: position from the left end and height above the footing. */
        buttresses: z
          .array(z.object({ x: z.number().min(0.1).max(60), height: z.number().min(0.2).max(12), width: z.number().min(0.15).max(1.5) }))
          .max(12),
        /** Design moments: peak elastic values or averaged over 1 m beside supports. */
        averaging: z.enum(["peak", "1m"]),
        divisions: z.number().int().min(8).max(32),
        /** Counterfort design (Phase 3): shape and bars, common to all buttresses. */
        counterfort: z
          .object({
            /** Horizontal reach of the counterfort behind the stem at its top, m (base reach = heel). */
            topReach: z.number().min(0.1).max(5),
            cover: z.number().min(25).max(100),
            /** Main tension bars along the inclined back edge. */
            tension: z.object({ diameter: z.number().min(10).max(40), count: z.number().int().min(2).max(16) }),
            /** Horizontal ties stem → counterfort (2 legs). */
            ties: barRef,
            /** Vertical ties heel → counterfort (2 legs). */
            heelTies: barRef,
            /** Buttress as a rigid line support or an elastic T-beam cantilever sharing the stem's w and w,y. */
            support: z.enum(["rigid", "elastic"]).default("elastic"),
            /** Multiplier on the buttress EI relative to the stem (e.g. 0.35/0.70 = 0.5 for a cracked buttress beside an uncracked wall, ACI 318-19 6.6.3.1.1). */
            stiffnessFactor: z.number().min(0.05).max(5).default(1),
          })
          .default(defaultCounterfort()),
      })
      .default({ length: 10, left: "free", right: "free", top: "free", base: "fixed", buttresses: [], averaging: "peak", divisions: 16, counterfort: defaultCounterfort() }),
    /** Stem height above the top of the footing (retained soil at stem top). */
    height: z.number().min(0.5).max(12),
    stemTop: z.number().min(0.12).max(1.5),
    stemBase: z.number().min(0.12).max(2.5),
    /** Which stem face is battered when stemBase > stemTop. */
    batter: z.enum(["front", "back"]),
    toe: z.number().min(0).max(8),
    heel: z.number().min(0).max(12),
    footing: z.number().min(0.1).max(2.5),
    key: z.object({
      enabled: z.boolean(),
      /** Under the stem (centred), at the heel end, or at the custom offset. */
      position: z.enum(["stem", "heel", "custom"]).default("custom"),
      depth: z.number().min(0.1).max(2),
      width: z.number().min(0.15).max(2),
      /** Vertical bars on the key's front (toe-side) face, hooked into the footing. */
      bar: barSchema.default({ diameter: 16, spacing: 200 }),
      /** Distance from the toe edge to the front face of the key, m. */
      offset: z.number().min(0).max(20),
    }),
    /** Propped wall: prop height above the top of the footing. */
    prop: z.object({
      height: z.number().min(0.3).max(12),
      rigid: z.boolean(),
      /** Spring stiffness per metre of wall, kN/m per m. */
      stiffness: z.number().min(1).max(1e8),
    }),
    /** Basement wall: restraint at the top slab and at the base slab, and the storeys. */
    basement: z.object({
      top: z.enum(["fixed", "pinned"]),
      base: z.enum(["fixed", "pinned"]),
      /**
       * Storeys from the top (B1) down: floor-to-floor height and the slab at the
       * storey's top (ground slab for B1), m. Intermediate slabs are pinned line
       * supports of the continuous wall. Empty = one storey of the stem height.
       */
      levels: z
        .array(z.object({ height: z.number().min(1.5).max(8), slab: z.number().min(0.1).max(1.5) }))
        .max(8)
        .default([]),
      /** Also check the stage before the top (ground) slab is cast, with the backfill complete. */
      stage: z.boolean().default(false),
    }),
    soil: z.object({
      theory: z.enum(earthPressureTheories),
      phi: z.number().min(15).max(50),
      gamma: z.number().min(12).max(24),
      gammaSat: z.number().min(14).max(25),
      /** Wall / virtual-plane friction for Coulomb, deg. */
      delta: z.number().min(0).max(40),
      /** Backfill slope, deg (rising away from the wall). */
      beta: z.number().min(0).max(40),
      ocr: z.number().min(1).max(10),
      userK: z.number().min(0.05).max(3),
      /**
       * Basement walls: soil layers from the ground down (thickness, unit weights,
       * φ); the last layer continues to the base. Empty = the single soil above.
       */
      layers: z
        .array(
          z.object({
            thickness: z.number().min(0.1).max(30),
            gamma: z.number().min(12).max(24),
            gammaSat: z.number().min(14).max(25),
            phi: z.number().min(15).max(50),
          }),
        )
        .max(8)
        .default([]),
    }),
    surcharge: z.object({
      dead: z.number().min(0).max(200),
      live: z.number().min(0).max(200),
    }),
    /** Strip surcharge on level ground behind the wall (Boussinesq, rigid wall). */
    strip: z
      .object({
        enabled: z.boolean(),
        q: z.number().min(0).max(1000),
        /** Distance from the stem back face (at the top) to the near edge, m. */
        distance: z.number().min(0).max(50),
        width: z.number().min(0.1).max(50),
        kind: z.enum(["dead", "live"]),
      })
      .default({ enabled: false, q: 20, distance: 1, width: 1, kind: "live" }),
    /** Line load on the stem top (e.g. beam or slab bearing), per metre. */
    axial: z
      .object({
        enabled: z.boolean(),
        dead: z.number().min(0).max(5000),
        live: z.number().min(0).max(5000),
        /** Eccentricity from the stem-top centreline, + towards the toe, m. */
        eccentricity: z.number().min(-2).max(2),
      })
      .default({ enabled: false, dead: 10, live: 5, eccentricity: 0 }),
    /** Wind on the exposed stem, acting towards the toe. */
    wind: z
      .object({
        enabled: z.boolean(),
        pressure: z.number().min(0).max(20),
        /** Height of the stem exposed to wind, measured down from the stem top, m. */
        height: z.number().min(0.1).max(12),
      })
      .default({ enabled: false, pressure: 1, height: 1 }),
    water: z.object({
      enabled: z.boolean(),
      /** Water level behind the wall above the underside of the footing, m. */
      back: z.number().min(0).max(20),
      /** Water level in front of the wall above the underside of the footing, m. */
      front: z.number().min(0).max(20),
      gammaW: z.number().min(9.5).max(10.5),
    }),
    toeSoil: z.object({
      /** Soil cover above the top of the footing at the stem front face, m. */
      cover: z.number().min(0).max(5),
      /** Ground slope in front of the wall, falling away from it, deg. */
      slope: z.number().min(0).max(40).default(0),
      gamma: z.number().min(12).max(24),
      phi: z.number().min(15).max(50),
      includeWeight: z.boolean(),
      passive: z.boolean(),
      /** Passive mobilisation factor (geotechnical approval required). */
      mobilization: z.number().min(0).max(1),
    }),
    base: z.object({
      mu: z.number().min(0.1).max(1),
      /** Allowable bearing pressure (service), kPa. */
      allowable: z.number().min(10).max(2000),
      /** Allowable increase for seismic service combinations. */
      seismicIncrease: z.number().min(1).max(1.5),
    }),
    seismic: z.object({
      method: z.enum(seismicMethods),
      kh: z.number().min(0).max(0.6),
      kv: z.number().min(0).max(0.4),
      inertia: z.boolean(),
    }),
    stability: z.object({
      overturning: z.number().min(1).max(3),
      sliding: z.number().min(1).max(3),
      seismic: z.number().min(1).max(2),
    }),
    fc: z.number().min(FC_ENGINE_MIN).max(FC_ENGINE_MAX),
    fcPsi: z.number().min(PSI_MIN).max(PSI_MAX).nullable().optional(),
    fy: z.number().min(200).max(550),
    rebarStandard: z.enum(["PNS49", "ASTM"]).optional(),
    gradeId: z.string().max(20).nullable().optional(),
    es: z.number().min(150000).max(220000),
    concreteWeight: z.number().min(20).max(26),
    cover: z.object({
      /** Stem face against the backfill, mm (Table 20.5.1.3.1). */
      stemBack: z.number().min(20).max(100),
      /** Exposed stem face, mm. */
      stemFront: z.number().min(20).max(100),
      /** Footing bottom, cast against earth, mm. */
      footingBottom: z.number().min(40).max(150),
      footingTop: z.number().min(20).max(100),
    }),
    bars: z.object({
      stemBack: barSchema,
      /** Alternate back-face bars stop at this height (spacing doubles above). */
      stemCut: z.object({
        enabled: z.boolean(),
        height: z.number().min(0.2).max(12),
      }),
      stemFront: barSchema,
      /** Horizontal bars, each face. */
      stemHorizontal: barSchema,
      toeBottom: barSchema,
      heelTop: barSchema,
      /** Distribution bars along the wall, each face of the footing. */
      footingDistribution: barSchema,
    }),
    dcrLimit: z.number().min(0.5).max(1.2),
    combinationSet: z.enum(combinationSets),
    strength: z.array(combinationSchema).min(1).max(40),
    service: z.array(combinationSchema).min(1).max(20),
  })
  .refine(
    (i) => i.plate.buttresses.every((b) => b.x < i.plate.length && b.height <= i.height + 1e-9),
    "Buttresses must lie within the wall length and not exceed the stem height.",
  )
  .refine(
    (i) => i.wallType !== "basement" || i.basement.levels.length < 2 || Math.abs(i.basement.levels.reduce((s, l) => s + l.height, 0) - i.height) < 1e-6,
    "The storey heights must add up to the wall height.",
  )
  .refine(
    (i) => i.stemBase >= i.stemTop - 1e-9,
    "Stem base thickness must be at least the stem top thickness.",
  )
  .refine(
    (i) => i.wallType !== "propped" || i.prop.height <= i.height + 1e-9,
    "The prop must be within the stem height.",
  )
  .refine(
    (i) =>
      !i.key.enabled ||
      i.key.position !== "custom" ||
      i.key.offset + i.key.width <= i.toe + i.stemBase + i.heel + 1e-9,
    "The shear key must lie under the footing.",
  )
  .refine(
    (i) =>
      new Set(i.strength.map((c) => c.id)).size === i.strength.length &&
      new Set(i.service.map((c) => c.id)).size === i.service.length,
    "Load combination labels must be unique.",
  );
export type RetainingWallInput = z.infer<typeof retainingWallInputSchema>;

export const retainingWallDraftSchema = z.object({
  kind: z.literal("retaining-wall"),
  version: z.literal(1),
  input: retainingWallInputSchema,
  quantity: retainingWallQuantitySchema.optional(),
  designPolicy: designCheckPolicySchema.optional(),
  remarks: designRemarksSchema.optional(),
  reviewCompleted: z.boolean().optional(),
});
export type RetainingWallDraft = z.infer<typeof retainingWallDraftSchema>;

/**
 * Strength (LRFD) and service (ASD, for stability) combination presets.
 * Strength: NSCP 2015 Sec. 203.3.1 Eqs. 203-1, 203-2, 203-6 (W = 0), 203-5 and
 * 203-7; ASCE 7-16 2.3. H is taken at 1.6 wherever it adds to the effect
 * (ACI 318-19 5.3.8(a)); groundwater is treated as part of H. Seismic
 * combinations are included only when a seismic method is selected.
 * Service: NSCP 2015 Sec. 203.4 / ASCE 7-16 2.4 with factors of safety.
 */
export function retainingWallCombinationPreset(
  set: CombinationSet,
  seismic: boolean,
  wind = false,
): Pick<RetainingWallInput, "strength" | "service"> {
  const nscp = set === "NSCP 2015";
  const c = (id: string, d: number, h: number, l: number, e = 0, w = 0): RetainingWallCombination => ({
    id,
    d,
    h,
    l,
    e,
    w,
    included: true,
  });
  const strength: RetainingWallCombination[] = [
    c(nscp ? "203-1: 1.4D" : "2.3.1(1): 1.4D", 1.4, 0, 0),
    c(nscp ? "203-2: 1.2D + 1.6L + 1.6H" : "2.3.1(2): 1.2D + 1.6L + 1.6H", 1.2, 1.6, 1.6),
    c(nscp ? "203-6: 0.9D + 1.6H (W = 0)" : "2.3.1(5): 0.9D + 1.6H (W = 0)", 0.9, 1.6, 0),
  ];
  if (wind)
    strength.push(
      c(nscp ? "203-4: 1.2D + 1.0W + 0.5L + 1.6H" : "2.3.1(4): 1.2D + 1.0W + 0.5L + 1.6H", 1.2, 1.6, 0.5, 0, 1),
      c(nscp ? "203-6: 0.9D + 1.0W + 1.6H" : "2.3.1(5): 0.9D + 1.0W + 1.6H", 0.9, 1.6, 0, 0, 1),
    );
  if (seismic)
    strength.push(
      c(nscp ? "203-5: 1.2D + 1.0E + 0.5L + 1.6H" : "2.3.6(6): 1.2D + 1.0E + 0.5L + 1.6H", 1.2, 1.6, 0.5, 1),
      c(nscp ? "203-7: 0.9D + 1.0E + 1.6H" : "2.3.6(7): 0.9D + 1.0E + 1.6H", 0.9, 1.6, 0, 1),
    );
  const service: RetainingWallCombination[] = [c("S1: D + H + L", 1, 1, 1), c("S2: D + H", 1, 1, 0)];
  if (wind) service.push(c("S4: D + H + 0.6W", 1, 1, 0, 0, 0.6));
  if (seismic) service.push(c("S3: D + H + 0.7E", 1, 1, 0, 0.7));
  return { strength, service };
}

/** Default wall: your RW-01 (Maison Gran Duetto) inputs with the audit fixes. */
export function defaultRetainingWallInput(): RetainingWallInput {
  return {
    code: "ACI 318-19",
    wallType: "cantilever",
    height: 3.8,
    stemTop: 0.3,
    stemBase: 0.3,
    batter: "front",
    toe: 1,
    heel: 1.4,
    footing: 0.3,
    key: {
      enabled: false,
      position: "stem",
      depth: 0.4,
      width: 0.3,
      offset: 1,
      bar: { diameter: 16, spacing: 200 },
    },
    prop: { height: 3.8, rigid: true, stiffness: 50000 },
    analysis: "strip",
    plate: { length: 10, left: "free", right: "free", top: "free", base: "fixed", buttresses: [], averaging: "peak", divisions: 16, counterfort: defaultCounterfort() },
    basement: { top: "pinned", base: "fixed", levels: [], stage: false },
    soil: {
      theory: "rankine",
      phi: 30,
      gamma: 18,
      gammaSat: 20,
      delta: 20,
      beta: 0,
      ocr: 1,
      layers: [],
      userK: 0.5,
    },
    surcharge: { dead: 0, live: 0 },
    strip: { enabled: false, q: 20, distance: 1, width: 1, kind: "live" },
    axial: { enabled: false, dead: 10, live: 5, eccentricity: 0 },
    wind: { enabled: false, pressure: 1, height: 1 },
    water: { enabled: false, back: 0, front: 0, gammaW: 9.81 },
    toeSoil: {
      cover: 0.5,
      slope: 0,
      gamma: 18,
      phi: 30,
      includeWeight: true,
      passive: false,
      mobilization: 0.5,
    },
    base: { mu: 0.5, allowable: 70, seismicIncrease: 1 },
    seismic: { method: "none", kh: 0.2, kv: 0, inertia: true },
    stability: { overturning: 2, sliding: 1.5, seismic: 1.1 },
    fc: 21,
    fcPsi: 3000,
    fy: 280,
    rebarStandard: "PNS49",
    gradeId: "PNS-280",
    es: 200000,
    concreteWeight: 24,
    cover: { stemBack: 50, stemFront: 40, footingBottom: 75, footingTop: 50 },
    bars: {
      stemBack: { diameter: 16, spacing: 100 },
      stemCut: { enabled: false, height: 1.9 },
      stemFront: { diameter: 12, spacing: 300 },
      stemHorizontal: { diameter: 12, spacing: 300 },
      toeBottom: { diameter: 16, spacing: 200 },
      heelTop: { diameter: 16, spacing: 200 },
      footingDistribution: { diameter: 12, spacing: 300 },
    },
    dcrLimit: 1,
    combinationSet: "NSCP 2015",
    ...retainingWallCombinationPreset("NSCP 2015", false),
  };
}

/** Front-face offset of the shear key from the toe edge, m. */
export function keyOffset(i: Pick<RetainingWallInput, "key" | "toe" | "stemBase" | "heel">) {
  const B = i.toe + i.stemBase + i.heel;
  if (i.key.position === "stem") return Math.max(0, i.toe + (i.stemBase - i.key.width) / 2);
  if (i.key.position === "heel") return Math.max(0, B - i.key.width);
  return i.key.offset;
}

/** Bar area per metre, mm²/m. */
/**
 * Basement storeys resolved: intermediate slab heights above the base slab top
 * (descending) and each storey's [bottom, top] span, m.
 */
export function basementStoreys(i: Pick<RetainingWallInput, "height" | "basement" | "wallType">) {
  const lv = i.wallType === "basement" && i.basement.levels.length >= 2 ? i.basement.levels : [{ height: i.height, slab: 0 }];
  const storeys: { name: string; bottom: number; top: number; slab: number }[] = [];
  let top = i.height;
  lv.forEach((l, k) => {
    const bottom = k === lv.length - 1 ? 0 : Math.max(0, top - l.height);
    storeys.push({ name: `B${k + 1}`, bottom, top, slab: l.slab });
    top = bottom;
  });
  return { storeys, intermediate: storeys.slice(0, -1).map((s) => s.bottom) };
}

export const barAreaPerMetre = (b: RetainingWallBar) =>
  (((Math.PI * b.diameter ** 2) / 4) * 1000) / b.spacing;
