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
  included: z.boolean(),
});
export type RetainingWallCombination = z.infer<typeof combinationSchema>;

export const retainingWallInputSchema = z
  .object({
    code: z.enum(["ACI 318-19", "NSCP 2015"]),
    otherCodes: z.string().max(300).optional(),
    wallType: z.enum(retainingWallTypes),
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
      depth: z.number().min(0.1).max(2),
      width: z.number().min(0.15).max(2),
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
    /** Basement wall: restraint at the top slab and at the base slab. */
    basement: z.object({
      top: z.enum(["fixed", "pinned"]),
      base: z.enum(["fixed", "pinned"]),
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
    }),
    surcharge: z.object({
      dead: z.number().min(0).max(200),
      live: z.number().min(0).max(200),
    }),
    water: z.object({
      enabled: z.boolean(),
      /** Water level behind the wall above the underside of the footing, m. */
      back: z.number().min(0).max(20),
      /** Water level in front of the wall above the underside of the footing, m. */
      front: z.number().min(0).max(20),
      gammaW: z.number().min(9.5).max(10.5),
    }),
    toeSoil: z.object({
      /** Soil cover above the top of the footing at the toe, m. */
      cover: z.number().min(0).max(5),
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
): Pick<RetainingWallInput, "strength" | "service"> {
  const nscp = set === "NSCP 2015";
  const strength: RetainingWallCombination[] = [
    { id: nscp ? "203-1: 1.4D" : "2.3.1(1): 1.4D", d: 1.4, h: 0, l: 0, e: 0, included: true },
    {
      id: nscp ? "203-2: 1.2D + 1.6L + 1.6H" : "2.3.1(2): 1.2D + 1.6L + 1.6H",
      d: 1.2,
      h: 1.6,
      l: 1.6,
      e: 0,
      included: true,
    },
    {
      id: nscp ? "203-6: 0.9D + 1.6H (W = 0)" : "2.3.1(5): 0.9D + 1.6H (W = 0)",
      d: 0.9,
      h: 1.6,
      l: 0,
      e: 0,
      included: true,
    },
  ];
  if (seismic)
    strength.push(
      {
        id: nscp
          ? "203-5: 1.2D + 1.0E + 0.5L + 1.6H"
          : "2.3.6(6): 1.2D + 1.0E + 0.5L + 1.6H",
        d: 1.2,
        h: 1.6,
        l: 0.5,
        e: 1,
        included: true,
      },
      {
        id: nscp ? "203-7: 0.9D + 1.0E + 1.6H" : "2.3.6(7): 0.9D + 1.0E + 1.6H",
        d: 0.9,
        h: 1.6,
        l: 0,
        e: 1,
        included: true,
      },
    );
  const service: RetainingWallCombination[] = [
    { id: "S1: D + H + L", d: 1, h: 1, l: 1, e: 0, included: true },
    { id: "S2: D + H", d: 1, h: 1, l: 0, e: 0, included: true },
  ];
  if (seismic)
    service.push({ id: "S3: D + H + 0.7E", d: 1, h: 1, l: 0, e: 0.7, included: true });
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
    key: { enabled: false, depth: 0.4, width: 0.3, offset: 1 },
    prop: { height: 3.8, rigid: true, stiffness: 50000 },
    basement: { top: "pinned", base: "fixed" },
    soil: {
      theory: "rankine",
      phi: 30,
      gamma: 18,
      gammaSat: 20,
      delta: 20,
      beta: 0,
      ocr: 1,
      userK: 0.5,
    },
    surcharge: { dead: 0, live: 0 },
    water: { enabled: false, back: 0, front: 0, gammaW: 9.81 },
    toeSoil: {
      cover: 0.5,
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

/** Bar area per metre, mm²/m. */
export const barAreaPerMetre = (b: RetainingWallBar) =>
  (((Math.PI * b.diameter ** 2) / 4) * 1000) / b.spacing;
