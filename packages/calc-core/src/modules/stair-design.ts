/**
 * Stairs module — RC waist-slab stair design (Pilot, verification required).
 *
 * Decision sheet 16 Oct 2026 (Stairs_Module_Decision_Sheet.xlsx, all items
 * accepted): straight flight with in-line landings, single span with
 * intermediate landings or dog-leg (two strips sharing the mid landing),
 * 2-D direct-stiffness frame of a 1 m strip on true geometry, ACI 318-19
 * checks with NSCP 2015 recorded as the project standard.
 *
 * Geometry (mm, x horizontal from the strip's first support centreline,
 * y vertical from the strip's base finished level):
 * - Pitch θ = atan(R/T). The pitch line passes through the inner (re-entrant)
 *   corners of the steps; the soffit is the waist t below it, measured
 *   normal to the soffit; the frame runs on the mid-thickness centreline.
 * - Bottom landing length L0: support centreline to the first riser.
 *   L0 = 0: no landing, the waist bears at the first riser line.
 * - Intermediate / mid landing length: last riser line of the lower flight
 *   to the first riser line of the next flight (dog-leg: to the far-edge
 *   support, the same depth for both flights).
 * - Top landing length: last riser line to the top support centreline.
 *   0 = no landing, the waist bears one going beyond the last riser line.
 */
import { z } from "zod";
import { designCheckPolicySchema, designRemarksSchema } from "../design-review";
import type { DesignCheck } from "../design-review";
import {
  FC_ENGINE_MAX,
  FC_ENGINE_MIN,
  PSI_MAX,
  PSI_MIN,
  concreteStrengthNotes,
} from "../concrete-units";
import {
  slabCrackedSection,
  slabEffectiveInertia,
  slabFlexuralStrength,
  slabMinimumSteelRatio,
  slabSqrtFc,
} from "./slab-design";
import {
  FrameInstabilityError,
  solveFrame,
  type FrameMember,
  type FrameNodalLoad,
  type FrameNode,
  type FrameRestraint,
  type FrameResult,
} from "./stair-frame";

export const STAIRS_ENGINE_VERSION = "stairs-0.1.0";

/* ------------------------------------------------------------------ clauses */
const ACI = "ACI 318-19";
const ref = (...parts: string[]) => `${ACI} ${parts.join("; ")}`;
/** Clause strings printed beside each stair check (panel and PDF). */
export const stairClauses = {
  analysis: () =>
    ref("6.6.1 linear elastic first-order frame analysis", "Ec 19.2.2.1"),
  combinations: () => ref("5.3.1 (Table 5.3.1)") + "; NSCP 2015 203.3.1",
  flexure: () => ref("7.5.1.1", "22.2, 22.3", "φ Table 21.2.2"),
  strain: () =>
    ref(
      "tension-controlled limit Table 21.2.2 (in-house; stricter than 7.3.3.1 εt ≥ 0.004)",
    ),
  minimumSteel: () => ref("Table 7.6.1.1", "24.4.3.2"),
  distribution: () =>
    ref("24.4.3.2", "spacing 24.4.3.3", "clear spacing 25.2.1"),
  spacing: () => ref("7.7.2.3", "clear spacing 25.2.1"),
  crack: () => ref("24.3.2 (Table 24.3.2), fs = 2/3 fy 24.3.2.1"),
  shear: () =>
    ref(
      "7.5.3.1",
      "critical section 7.4.3.2",
      "Vc Table 22.5.5.1(c), λs 22.5.5.1.3, Vc ≤ 0.42λ√f′c bd 22.5.5.1.1",
      "√f′c ≤ 8.3 MPa 22.5.3.1",
      "φ Table 21.2.1",
    ),
  axial: () =>
    "In-house screen Pu ≤ 0.10 f′c Ag (cf. ACI 318-19 9.5.2.1); above it the waist must be designed as a compression member (22.4)",
  minimumThickness: () =>
    ref(
      "Table 7.3.1.1, fy factor 7.3.1.1.1 (ℓ along the developed centreline)",
    ),
  deflection: () =>
    ref(
      "Ec 19.2.2.1, fr 19.2.3.1",
      "Ie Table 24.2.3.5 (cantilever 24.2.3.7)",
      "λΔ 24.2.4.1.1",
      "limits Table 24.2.2",
    ),
  development: () =>
    ref("25.4.2.4", "Table 25.4.2.5", "√f′c ≤ 8.3 MPa 25.4.1.4"),
  hook: () =>
    ref("25.4.3.1(a)", "Table 25.4.3.2 (ψr = 1.6, ψo = 1.25 assumed)"),
  simpleSupport: () =>
    ref("7.7.3.8.1 (bottom bars ≥ 150 mm into simple supports)"),
  footingBearing: () =>
    `${ACI} 13.3.1.1 (base area from unfactored loads); NSCP 2015 §304 (allowable bearing)`,
  footingSliding: () =>
    "Sliding resistance μ·N, factor of safety 1.5 (practice)",
  footingFlexure: () =>
    ref(
      "13.3.2.1 (one-way footing per Ch. 7)",
      "critical section at face 13.2.7.1",
      "22.2",
      "φ Table 21.2.2",
    ),
  footingShear: () =>
    ref(
      "13.3.2.1",
      "critical section d from face 7.4.3.2",
      "Vc Table 22.5.5.1(c)",
      "φ Table 21.2.1",
    ),
  footingMinimum: () =>
    ref("13.3.2.1 → Table 7.6.1.1, 24.4.3.2", "spacing 7.7.2.3"),
  seismic: () =>
    "ASCE 7-16 §13.5.10; NSCP 2015 §208 (egress stairs: accommodate storey drift)",
  geometry: () =>
    "IBC 2018 §1011.5.2, §1011.6 (advisory only; local PD 1096 / RA 9514 limits by user)",
  treadLoad: () =>
    "ASCE 7-16 Table 4.3-1 (1.33 kN on 50 × 50 mm, non-concurrent)",
  effectiveWidth: () =>
    "Point-load effective width be = b + 2.4x(1 − x/L) (span) or b + 1.2a (overhang), ≤ flight width — design practice (BS 8110 3.5.2 / EN 1992 style), not an ACI rule",
} as const;

/* ------------------------------------------------------------ code basis */
/**
 * Calculation editions implemented by this module (Code Basis decision
 * K1/K5, 16 Oct 2026: ACI 318-19 now; ACI 318-14 / NSCP 2015 after all
 * concrete modules, through the shared provisions layer). The project
 * standard field `code` is recorded and printed; it does not change the
 * calculation edition until another edition is implemented here.
 */
export const stairCodeEditions = ["ACI 318-19"] as const;
export type StairCodeEdition = (typeof stairCodeEditions)[number];
export function stairCalculationBasis(
  i: Pick<StairsInput, "code">,
): StairCodeEdition {
  void i.code;
  return "ACI 318-19";
}
/** Label printed in the workspace and report. */
export function stairCodeBasisLabel(i: Pick<StairsInput, "code">) {
  const basis = stairCalculationBasis(i);
  return i.code === "NSCP 2015"
    ? `Project standard: NSCP 2015. Calculation basis: ${basis}.`
    : `Calculation basis: ${basis}.`;
}

/* ------------------------------------------------------------------ schema */
export const stairTypes = ["single", "dog-leg"] as const;
export const stairWidthModes = ["strip", "full"] as const;
export const stairEndSupports = ["Fixed", "Pinned", "Sliding", "Free"] as const;
export const stairBottomSupports = ["Fixed", "Pinned", "Sliding"] as const;
export const stairLandingSupports = [
  "None",
  "Fixed",
  "Pinned",
  "Sliding",
] as const;
export type StairEndSupport = (typeof stairEndSupports)[number];
export type StairLandingSupport = (typeof stairLandingSupports)[number];

const barSet = z.object({
  diameter: z.number().min(6).max(40),
  spacing: z.number().min(50).max(1000),
});
const topBarSet = barSet.extend({
  /** Horizontal length each side of the support / knee, mm. */
  extension: z.number().min(0).max(5000),
});
const landingSchema = z.object({
  /** Along the run, mm (see module header). 0 = no landing (end landings). */
  length: z.number().min(0).max(10000),
  thickness: z.number().min(80).max(600),
  /** Across the stair, mm; 0 = flight width (dog-leg mid landing: 2B + gap). */
  width: z.number().min(0).max(20000),
});
const intermediateLandingSchema = landingSchema.extend({
  /** Support under the landing edge at the lower flight's last riser line. */
  startSupport: z.enum(stairLandingSupports),
  /** Support at the far edge (dog-leg: wall/beam carrying both flights). */
  endSupport: z.enum(stairLandingSupports),
});
const flightSchema = z.object({
  risers: z.number().int().min(2).max(30),
  landingAfter: intermediateLandingSchema.nullable(),
});
const footingSchema = z.object({
  design: z.boolean(),
  /** Allowable (service) bearing capacity, kPa. */
  qa: z.number().min(25).max(1500),
  /** Footing width along the run, mm. */
  width: z.number().min(300).max(5000),
  thickness: z.number().min(150).max(1500),
  /** Soil above the footing top, mm. */
  soilCover: z.number().min(0).max(3000),
  soilUnitWeight: z.number().min(12).max(23),
  friction: z.number().min(0.2).max(0.8),
  cover: z.number().min(50).max(100),
  bars: barSet,
});
const localLoadBase = {
  id: z.string().trim().min(1).max(60),
  /** 1 = first strip (dog-leg: lower flight), 2 = upper flight strip. */
  strip: z.union([z.literal(1), z.literal(2)]).default(1),
  case: z.enum(["dead", "live"]),
};
export const stairPointLoadSchema = z.object({
  kind: z.literal("point"),
  ...localLoadBase,
  /** Horizontal position from the strip's first support centreline, mm. */
  x: z.number().min(0).max(30000),
  /** kN. */
  value: z.number().min(0).max(1000),
  /** Loaded width across the stair, mm. */
  width: z.number().min(50).max(6000),
});
export const stairLineLoadSchema = z.object({
  kind: z.literal("line"),
  ...localLoadBase,
  x: z.number().min(0).max(30000),
  /** kN/m across the full stair width. */
  value: z.number().min(0).max(500),
});
export const stairAreaLoadSchema = z.object({
  kind: z.literal("area"),
  ...localLoadBase,
  x0: z.number().min(0).max(30000),
  x1: z.number().min(0).max(30000),
  /** kPa on plan. */
  value: z.number().min(0).max(200),
  /** Loaded width across the stair, mm. */
  width: z.number().min(50).max(20000),
});
export const stairLocalLoadSchema = z.discriminatedUnion("kind", [
  stairPointLoadSchema,
  stairLineLoadSchema,
  stairAreaLoadSchema,
]);
export type StairLocalLoad = z.infer<typeof stairLocalLoadSchema>;

export const stairsInputSchema = z
  .object({
    code: z.enum(["ACI 318-19", "NSCP 2015"]),
    /** Documentation only — does not change the calculation basis. */
    otherCodes: z.string().max(300).optional(),
    stairType: z.enum(stairTypes),
    widthMode: z.enum(stairWidthModes),
    fc: z.number().min(FC_ENGINE_MIN).max(FC_ENGINE_MAX),
    fcPsi: z.number().min(PSI_MIN).max(PSI_MAX).nullable().optional(),
    fy: z.number().min(200).max(420),
    rebarStandard: z.enum(["PNS49", "ASTM"]).optional(),
    gradeId: z.string().max(20).nullable().optional(),
    es: z.number().min(150000).max(220000),
    unitWeight: z.number().min(20).max(26),
    topCover: z.number().min(15).max(100),
    bottomCover: z.number().min(15).max(100),
    aggregate: z.number().min(5).max(40),
    riser: z.number().min(100).max(250),
    going: z.number().min(200).max(400),
    /** Waist thickness normal to the soffit, mm (G3). */
    waist: z.number().min(80).max(400),
    flightWidth: z.number().min(600).max(6000),
    /** Dog-leg: clear gap between the two flights, mm. */
    flightGap: z.number().min(0).max(3000),
    bottomLanding: landingSchema,
    topLanding: landingSchema,
    flights: z.array(flightSchema).min(1).max(3),
    bottomSupport: z.object({
      condition: z.enum(stairBottomSupports),
      /** Bearing (seat) width along the run, mm. */
      bearing: z.number().min(100).max(1500),
      /** Support beam depth, mm; beam top flush with the finished level (drawings only). */
      beamDepth: z.number().min(150).max(2000).optional(),
      onGround: z.boolean(),
      footing: footingSchema,
    }),
    topSupport: z.object({
      condition: z.enum(stairEndSupports),
      bearing: z.number().min(100).max(1500),
      /** Also used for landing-edge supports (drawings only). */
      beamDepth: z.number().min(150).max(2000).optional(),
    }),
    bars: z.object({
      mainBottom: barSet,
      topBottom: topBarSet,
      topTop: topBarSet,
      /** Top bars at knees, intermediate and mid-landing supports. */
      topKnee: topBarSet,
      distribution: barSet,
    }),
    /** Straight extension of bars crossing a knee, past the knee, mm. */
    kneeExtension: z.number().min(100).max(3000),
    /** Finishes on plan (tread + riser toppings), kPa. */
    finishes: z.number().min(0).max(20),
    /** Soffit finish per sloping area, kPa. */
    soffitFinish: z.number().min(0).max(5),
    live: z.number().min(0).max(30),
    /** Sustained fraction of live load for long-term deflection. */
    sustainedLiveFactor: z.number().min(0).max(1),
    combinations: z
      .array(
        z.object({
          id: z.string().trim().min(1).max(60),
          deadFactor: z.number().min(0).max(3),
          liveFactor: z.number().min(0).max(3),
          included: z.boolean(),
        }),
      )
      .min(1)
      .max(20),
    localLoads: z.array(stairLocalLoadSchema).max(10).default([]),
    deflection: z.object({
      /** Immediate live-load limit ℓ/n (Table 24.2.2). */
      immediateDivisor: z.number().min(180).max(1000),
      /** After-attachment (long-term + live) limit ℓ/n. */
      totalDivisor: z.number().min(180).max(1000),
    }),
    seismic: z.object({ connection: z.enum(["integral", "isolated"]) }),
    geometryLimits: z.object({
      riserMax: z.number().min(100).max(250),
      goingMin: z.number().min(150).max(400),
      blondelMin: z.number().min(400).max(800),
      blondelMax: z.number().min(400).max(800),
    }),
  })
  .refine(
    (i) => i.flights[i.flights.length - 1].landingAfter === null,
    "The last flight cannot have a landing after it — use the top landing.",
  )
  .refine(
    (i) =>
      i.stairType === "single" ||
      (i.flights.length === 2 && i.flights[0].landingAfter !== null),
    "Dog-leg stairs need exactly two flights with the mid landing after the first.",
  )
  .refine(
    (i) =>
      new Set(i.combinations.map((c) => c.id)).size === i.combinations.length,
    "Load combination labels must be unique.",
  )
  .refine(
    (i) => new Set(i.localLoads.map((l) => l.id)).size === i.localLoads.length,
    "Local load labels must be unique.",
  )
  .refine(
    (i) => i.localLoads.every((l) => l.kind !== "area" || l.x1 > l.x0),
    "Area loads need x1 > x0.",
  )
  .refine(
    (i) => i.geometryLimits.blondelMax > i.geometryLimits.blondelMin,
    "2R + T limits must satisfy max > min.",
  );
export type StairsInput = z.infer<typeof stairsInputSchema>;

export const stairsDraftSchema = z.object({
  kind: z.literal("stairs"),
  version: z.literal(1),
  input: stairsInputSchema,
  designPolicy: designCheckPolicySchema.optional(),
  remarks: designRemarksSchema.optional(),
  reviewCompleted: z.boolean().optional(),
  /** Quantity estimate switched on (decision V2). */
  estimate: z.object({ enabled: z.boolean() }).optional(),
});
export type StairsDraft = z.infer<typeof stairsDraftSchema>;

export function defaultStairsInput(): StairsInput {
  return {
    code: "ACI 318-19",
    stairType: "single",
    widthMode: "strip",
    fc: 28,
    fy: 420,
    rebarStandard: "PNS49",
    es: 200000,
    unitWeight: 24,
    topCover: 20,
    bottomCover: 20,
    aggregate: 20,
    riser: 175,
    going: 275,
    waist: 200,
    flightWidth: 1200,
    flightGap: 100,
    bottomLanding: { length: 0, thickness: 200, width: 0 },
    topLanding: { length: 1200, thickness: 200, width: 0 },
    flights: [{ risers: 10, landingAfter: null }],
    bottomSupport: {
      condition: "Pinned",
      bearing: 250,
      beamDepth: STAIR_BEAM_DEPTH,
      onGround: false,
      footing: {
        design: false,
        qa: 100,
        width: 600,
        thickness: 300,
        soilCover: 300,
        soilUnitWeight: 18,
        friction: 0.45,
        cover: 75,
        bars: { diameter: 12, spacing: 200 },
      },
    },
    topSupport: {
      condition: "Pinned",
      bearing: 250,
      beamDepth: STAIR_BEAM_DEPTH,
    },
    bars: {
      mainBottom: { diameter: 12, spacing: 150 },
      topBottom: { diameter: 12, spacing: 300, extension: 700 },
      topTop: { diameter: 12, spacing: 300, extension: 700 },
      topKnee: { diameter: 12, spacing: 200, extension: 700 },
      distribution: { diameter: 10, spacing: 200 },
    },
    kneeExtension: 600,
    finishes: 1.5,
    soffitFinish: 0.25,
    live: 4.8,
    sustainedLiveFactor: 0,
    combinations: [
      { id: "LC1", deadFactor: 1.2, liveFactor: 1.6, included: true },
      { id: "LC2", deadFactor: 1.4, liveFactor: 0, included: true },
    ],
    localLoads: [],
    deflection: { immediateDivisor: 360, totalDivisor: 240 },
    seismic: { connection: "integral" },
    geometryLimits: {
      riserMax: 178,
      goingMin: 279,
      blondelMin: 600,
      blondelMax: 650,
    },
  };
}

/* ------------------------------------------------------------------ basic helpers */
const area = (d: number) => (Math.PI * d * d) / 4;
/** Bar area per metre width, mm²/m. */
export const stairBarArea = (b: { diameter: number; spacing: number }) =>
  (area(b.diameter) * 1000) / b.spacing;

export function stairPitch(riser: number, going: number) {
  const theta = Math.atan2(riser, going);
  return {
    theta,
    degrees: (theta * 180) / Math.PI,
    cos: Math.cos(theta),
    tan: riser / going,
  };
}

/**
 * Dead load on plan of a flight, kPa (L1): waist γ·t/cosθ + steps γ·R/2 +
 * finishes + soffit finish/cosθ.
 */
export function stairFlightDeadLoad(
  i: Pick<
    StairsInput,
    "unitWeight" | "waist" | "riser" | "going" | "finishes" | "soffitFinish"
  >,
) {
  const { cos } = stairPitch(i.riser, i.going);
  const waist = (i.unitWeight * i.waist) / 1000 / cos,
    steps = (i.unitWeight * i.riser) / 1000 / 2,
    soffit = i.soffitFinish / cos;
  return {
    waist,
    steps,
    finishes: i.finishes,
    soffit,
    total: waist + steps + i.finishes + soffit,
  };
}
export function stairLandingDeadLoad(
  i: Pick<StairsInput, "unitWeight" | "finishes" | "soffitFinish">,
  thickness: number,
) {
  const self = (i.unitWeight * thickness) / 1000;
  return {
    self,
    finishes: i.finishes,
    soffit: i.soffitFinish,
    total: self + i.finishes + i.soffitFinish,
  };
}

/** ψg, Table 25.4.2.5. */
const gradeFactor = (fy: number) => (fy <= 420 ? 1 : fy <= 550 ? 1.15 : 1.3);
/**
 * Straight tension development length, ACI 318-19 25.4.2.4 (Ktr = 0,
 * normal-weight, uncoated): ld = fy ψt ψe ψs ψg / (1.1 λ √f′c (cb/db)) · db ≥ 300.
 */
export function stairDevelopmentLength(
  i: Pick<StairsInput, "fc" | "fy">,
  bar: { diameter: number; spacing: number },
  cover: number,
  topBar = false,
) {
  const db = bar.diameter,
    cb = Math.min(cover + db / 2, bar.spacing / 2),
    psiT = topBar ? 1.3 : 1,
    psiS = db <= 19 ? 0.8 : 1;
  const ld =
    ((i.fy * psiT * psiS * gradeFactor(i.fy)) /
      (1.1 * slabSqrtFc(i.fc) * Math.min(2.5, cb / db))) *
    db;
  return Math.max(300, ld);
}
/**
 * Standard hook development length, ACI 318-19 25.4.3.1(a):
 * ldh = fy ψe ψr ψo ψc / (23 λ √f′c) · db^1.5 ≥ max(8db, 150 mm);
 * ψr = 1.6 (no confining reinforcement) and ψo = 1.25 assumed (conservative).
 */
export function stairHookLength(i: Pick<StairsInput, "fc" | "fy">, db: number) {
  const psiC = i.fc < 40 ? i.fc / 105 + 0.6 : 1;
  const ldh =
    ((i.fy * 1.6 * 1.25 * psiC) / (23 * slabSqrtFc(i.fc))) * db ** 1.5;
  return Math.max(ldh, 8 * db, 150);
}
/**
 * One-way shear strength per metre without shear reinforcement, kN/m:
 * Table 22.5.5.1(c) Vc = [0.66 λs λ ρw^(1/3) √f′c + Nu/(6Ag)] bw d ≤ 0.42 λ √f′c bw d,
 * λs = √(2/(1 + 0.004d)) ≤ 1 (22.5.5.1.3). Nu (kN, compression +) is only
 * applied when tensile (compression benefit conservatively ignored).
 */
export function stairOneWayShear(
  fc: number,
  as: number,
  d: number,
  h: number,
  nu = 0,
) {
  if (!(as > 0) || !(d > 0)) return { phiVc: 0, vc: 0, lambdaS: 0, rho: 0 };
  const b = 1000,
    lambdaS = Math.min(1, Math.sqrt(2 / (1 + 0.004 * d))),
    rho = as / (b * d),
    root = slabSqrtFc(fc);
  const axial = (Math.min(0, nu) * 1000) / (6 * b * h); // MPa
  const stress = Math.max(
    0,
    Math.min(0.66 * lambdaS * Math.cbrt(rho) * root + axial, 0.42 * root),
  );
  const vc = (stress * b * d) / 1000;
  return { phiVc: 0.75 * vc, vc, lambdaS, rho };
}
/** ACI 318-19 Table 7.3.1.1 minimum thickness with the 7.3.1.1.1 fy factor. */
export function stairMinimumThickness(
  lengthMm: number,
  continuousEnds: 0 | 1 | 2 | "cantilever",
  fy: number,
) {
  const divisor =
    continuousEnds === "cantilever" ? 10 : [20, 24, 28][continuousEnds];
  const factor = fy === 420 ? 1 : 0.4 + fy / 700;
  return { hmin: (lengthMm / divisor) * factor, divisor, factor };
}
/**
 * Edition-dependent provisions used by this module. Only ACI 318-19 is
 * implemented; ACI 318-14 (NSCP 2015 basis) is added here — or replaced by
 * the shared provisions layer — after all concrete modules (Code Basis K1).
 */
export interface StairProvisions {
  oneWayShear: typeof stairOneWayShear;
  developmentLength: typeof stairDevelopmentLength;
  hookLength: typeof stairHookLength;
  minimumThickness: typeof stairMinimumThickness;
  /** Tension-controlled strain limit used by this suite. */
  tensionStrain: (fy: number, es: number) => number;
}
export const stairProvisions: Record<StairCodeEdition, StairProvisions> = {
  "ACI 318-19": {
    oneWayShear: stairOneWayShear,
    developmentLength: stairDevelopmentLength,
    hookLength: stairHookLength,
    minimumThickness: stairMinimumThickness,
    tensionStrain: (fy, es) => fy / es + 0.003,
  },
};
const prov = (i: Pick<StairsInput, "code">) =>
  stairProvisions[stairCalculationBasis(i)];

/** Point-load effective width across the stair, mm (L5a, practice). */
export function stairEffectiveWidth(
  loadWidth: number,
  flightWidth: number,
  span:
    | { kind: "span"; x: number; length: number }
    | { kind: "overhang"; a: number },
) {
  const spread =
    span.kind === "span"
      ? 2.4 * span.x * (1 - span.x / span.length)
      : 1.2 * span.a;
  return Math.min(flightWidth, Math.max(loadWidth, loadWidth + spread));
}

/* ------------------------------------------------------------------ geometry */
export type StairPieceKind = "landing" | "flight";
export interface StairPiece {
  kind: StairPieceKind;
  label: string;
  /** Centreline end points, mm. */
  start: { x: number; y: number };
  end: { x: number; y: number };
  /** Section thickness normal to the member, mm. */
  h: number;
}
export type StairSupportRole = "bottom" | "top" | "mid" | "intermediate";
export interface StairSupportDef {
  id: string;
  label: string;
  role: StairSupportRole;
  condition: Exclude<StairEndSupport, "Free">;
  /** Horizontal position, mm. */
  x: number;
  bearing: number;
}
export interface StairLoadRegion {
  x0: number;
  x1: number;
  /** Dead load on plan, kPa. */
  dead: number;
  kind: StairPieceKind;
  label: string;
}
export interface StairStripGeometry {
  index: 1 | 2;
  label: string;
  /** Base finished level of the strip relative to the bottom floor, mm. */
  baseLevel: number;
  pieces: StairPiece[];
  supports: StairSupportDef[];
  /** Free ends (no support), mm. */
  freeEnds: { x: number; label: string }[];
  knees: { x: number; y: number }[];
  regions: StairLoadRegion[];
  /** Riser lines of each flight in this strip: first-riser x, risers, base level. */
  flights: { label: string; xa: number; risers: number; base: number }[];
  /** Concrete outline (steps on top, soffit below), mm, closed polygon. */
  outline: { x: number; y: number }[];
  /** Stepped top surface, left to right, mm. */
  top: { x: number; y: number }[];
  /** Soffit, left to right, mm. */
  soffit: { x: number; y: number }[];
  /**
   * Top reference line, left to right, mm: landing tops and the pitch line
   * through the inner step corners (top-bar cover is measured from it).
   */
  topRef: { x: number; y: number }[];
  /** Strip length on plan, mm. */
  length: number;
}

interface StripSpec {
  index: 1 | 2;
  label: string;
  base: number;
  start: {
    length: number;
    thickness: number;
    support: StairLandingSupport | Exclude<StairEndSupport, "Free">;
    role: StairSupportRole;
    bearing: number;
    label: string;
  };
  flights: {
    label: string;
    risers: number;
    after:
      (z.infer<typeof intermediateLandingSchema> & { label: string }) | null;
  }[];
  end: {
    length: number;
    thickness: number;
    support: StairLandingSupport | StairEndSupport;
    role: StairSupportRole;
    bearing: number;
    label: string;
  };
}

function stripSpecs(i: StairsInput): StripSpec[] {
  const bottom = {
    length: i.bottomLanding.length,
    thickness: i.bottomLanding.thickness,
    support: i.bottomSupport.condition,
    role: "bottom" as const,
    bearing: i.bottomSupport.bearing,
    label: i.bottomSupport.onGround
      ? "Bottom support (on ground)"
      : "Bottom support",
  };
  const top = {
    length: i.topLanding.length,
    thickness: i.topLanding.thickness,
    support: i.topSupport.condition,
    role: "top" as const,
    bearing: i.topSupport.bearing,
    label: "Top support",
  };
  if (i.stairType === "dog-leg") {
    const mid = i.flights[0].landingAfter!;
    const midEnd = {
      length: mid.length,
      thickness: mid.thickness,
      support: mid.endSupport,
      role: "mid" as const,
      bearing: i.topSupport.bearing,
      label: "Mid-landing support",
    };
    return [
      {
        index: 1,
        label: "Flight 1 strip",
        base: 0,
        start: bottom,
        flights: [
          { label: "Flight 1", risers: i.flights[0].risers, after: null },
        ],
        end: midEnd,
      },
      {
        index: 2,
        label: "Flight 2 strip",
        base: i.flights[0].risers * i.riser,
        start: midEnd as StripSpec["start"],
        flights: [
          { label: "Flight 2", risers: i.flights[1].risers, after: null },
        ],
        end: top,
      },
    ];
  }
  return [
    {
      index: 1,
      label: "Stair strip",
      base: 0,
      start: bottom,
      flights: i.flights.map((f, k) => ({
        label: `Flight ${k + 1}`,
        risers: f.risers,
        after: f.landingAfter
          ? { ...f.landingAfter, label: `Landing ${k + 1}` }
          : null,
      })),
      end: top,
    },
  ];
}

export class StairGeometryError extends Error {}

function buildStrip(i: StairsInput, spec: StripSpec): StairStripGeometry {
  const { tan, cos } = stairPitch(i.riser, i.going);
  const R = i.riser,
    T = i.going,
    t = i.waist;
  const off = (tl: number) => (t / (2 * cos) - tl / 2) / tan;
  const offSoffit = (tl: number) => (t / cos - tl) / tan;
  const pieces: StairPiece[] = [];
  const knees: { x: number; y: number }[] = [];
  const regions: StairLoadRegion[] = [];
  const flights: StairStripGeometry["flights"] = [];
  const supports: StairSupportDef[] = [];
  const freeEnds: StairStripGeometry["freeEnds"] = [];
  const top: { x: number; y: number }[] = [];
  const soffit: { x: number; y: number }[] = [];
  const landingDead = (h: number) => stairLandingDeadLoad(i, h).total;
  const flightDead = stairFlightDeadLoad(i).total;

  let base = spec.base;
  let xa: number;
  let cursor: { x: number; y: number };
  // start
  if (spec.start.length > 0) {
    const tl = spec.start.thickness;
    xa = spec.start.length;
    const knee = { x: xa + off(tl), y: base - tl / 2 };
    if (knee.x <= 1)
      throw new StairGeometryError(
        `${spec.start.label}: landing length ${spec.start.length} mm is shorter than the knee offset; increase it to at least ${Math.ceil(spec.start.length - knee.x + 50)} mm.`,
      );
    pieces.push({
      kind: "landing",
      label: spec.index === 2 ? "Mid landing" : "Bottom landing",
      start: { x: 0, y: base - tl / 2 },
      end: knee,
      h: tl,
    });
    knees.push(knee);
    cursor = knee;
    regions.push({
      x0: 0,
      x1: xa,
      dead: landingDead(tl),
      kind: "landing",
      label: pieces[0].label,
    });
    top.push({ x: 0, y: base });
    soffit.push({ x: 0, y: base - tl });
    soffit.push({ x: xa + offSoffit(tl), y: base - tl });
  } else {
    xa = 0;
    cursor = { x: 0, y: base - t / (2 * cos) };
    top.push({ x: 0, y: base });
    soffit.push({ x: 0, y: base - t / cos });
  }
  const startX = 0;
  // flights
  let endX = 0;
  spec.flights.forEach((f, k) => {
    const n = f.risers;
    flights.push({ label: f.label, xa, risers: n, base });
    for (let r = 0; r < n; r++) {
      const xr = xa + r * T;
      top.push({ x: xr, y: base + r * R }, { x: xr, y: base + (r + 1) * R });
      if (r < n - 1) top.push({ x: xr + T, y: base + (r + 1) * R });
    }
    const xe = xa + (n - 1) * T;
    const isLast = k === spec.flights.length - 1;
    const next = isLast ? spec.end : f.after;
    const landingLength = next ? next.length : 0;
    // n risers, n − 1 treads: the stepped length ends at the last riser line
    // xe when a landing follows (its top is the last tread); without a
    // landing the waist bears one going beyond xe.
    regions.push({
      x0: xa,
      x1: next && landingLength > 0 ? xe : xe + T,
      dead: flightDead,
      kind: "flight",
      label: f.label,
    });
    if (!next || landingLength === 0) {
      // no landing: waist bears one going beyond the last riser line
      const end = { x: xe + T, y: base + n * R - t / (2 * cos) };
      pieces.push({ kind: "flight", label: f.label, start: cursor, end, h: t });
      top.push({ x: xe + T, y: base + n * R });
      soffit.push({ x: xe + T, y: base + n * R - t / cos });
      cursor = end;
      endX = xe + T;
      return;
    }
    const tl = next.thickness;
    const knee = { x: xa + n * T + off(tl), y: base + n * R - tl / 2 };
    pieces.push({
      kind: "flight",
      label: f.label,
      start: cursor,
      end: knee,
      h: t,
    });
    knees.push(knee);
    soffit.push({ x: xa + n * T + offSoffit(tl), y: base + n * R - tl });
    const landLabel = isLast
      ? spec.index === 1 && spec.end.role === "mid"
        ? "Mid landing"
        : "Top landing"
      : (next as { label: string }).label;
    if (isLast) {
      const xEnd = xe + landingLength;
      if (xEnd <= knee.x + 1)
        throw new StairGeometryError(
          `${landLabel}: length ${landingLength} mm must exceed one going plus the knee offset (> ${Math.ceil(knee.x - xe + 50)} mm), or be 0 for no landing.`,
        );
      pieces.push({
        kind: "landing",
        label: landLabel,
        start: knee,
        end: { x: xEnd, y: knee.y },
        h: tl,
      });
      regions.push({
        x0: xe,
        x1: xEnd,
        dead: landingDead(tl),
        kind: "landing",
        label: landLabel,
      });
      top.push({ x: xEnd, y: base + n * R });
      soffit.push({ x: xEnd, y: base + n * R - tl });
      cursor = { x: xEnd, y: knee.y };
      endX = xEnd;
    } else {
      // intermediate landing: to the next flight's lower knee
      const xa2 = xe + landingLength;
      const lower = { x: xa2 + off(tl), y: knee.y };
      if (lower.x <= knee.x + 1)
        throw new StairGeometryError(
          `${landLabel}: length ${landingLength} mm must exceed one going (${T} mm) so the soffits do not overlap.`,
        );
      pieces.push({
        kind: "landing",
        label: landLabel,
        start: knee,
        end: lower,
        h: tl,
      });
      regions.push({
        x0: xe,
        x1: xa2,
        dead: landingDead(tl),
        kind: "landing",
        label: landLabel,
      });
      knees.push(lower);
      top.push({ x: xa2, y: base + n * R });
      soffit.push({ x: xa2 + offSoffit(tl), y: base + n * R - tl });
      const after = f.after!;
      for (const [cond, x, edge] of [
        [after.startSupport, xe, "start edge"],
        [after.endSupport, xa2, "far edge"],
      ] as const)
        if (cond !== "None")
          supports.push({
            id: `s${spec.index}-${landLabel.toLowerCase().replace(/\s+/g, "-")}-${edge === "start edge" ? "start" : "end"}`,
            label: `${landLabel} ${edge}`,
            role: "intermediate",
            condition: cond,
            x,
            bearing: i.topSupport.bearing,
          });
      cursor = lower;
      base += n * R;
      xa = xa2;
    }
  });
  // end supports
  const add = (
    s: StripSpec["start"] | StripSpec["end"],
    x: number,
    where: "start" | "end",
  ) => {
    if (s.support === "None" || s.support === "Free")
      freeEnds.push({ x, label: `${s.label} (free)` });
    else
      supports.push({
        id: `s${spec.index}-${where}`,
        label: s.label,
        role: s.role,
        condition: s.support,
        x,
        bearing: s.bearing,
      });
  };
  add(spec.start, startX, "start");
  add(spec.end, endX, "end");
  supports.sort((a, b) => a.x - b.x);
  const soffitLR = soffit.map((p) => ({ ...p }));
  const outline = [...top, ...soffit.reverse()];
  const ref: { x: number; y: number }[] = [{ x: 0, y: spec.base }];
  for (const f of flights)
    ref.push(
      { x: f.xa, y: f.base },
      { x: f.xa + f.risers * T, y: f.base + f.risers * R },
    );
  const lastLevel = ref[ref.length - 1].y;
  ref.push({ x: endX, y: lastLevel });
  const topRef = ref.filter(
    (p, k) =>
      k === 0 ||
      Math.abs(p.x - ref[k - 1].x) > 1e-6 ||
      Math.abs(p.y - ref[k - 1].y) > 1e-6,
  );
  return {
    index: spec.index,
    label: spec.label,
    baseLevel: spec.base,
    pieces,
    supports,
    freeEnds,
    knees,
    regions,
    flights,
    outline,
    top: top.map((p) => ({ ...p })),
    soffit: soffitLR,
    topRef,
    length: endX,
  };
}

export function stairGeometry(i: StairsInput): StairStripGeometry[] {
  return stripSpecs(i).map((s) => buildStrip(i, s));
}

/* ------------------------------------------------------------------ results */
export interface StairStation {
  /** Developed (centreline) distance from the strip start, mm. */
  s: number;
  x: number;
  y: number;
  piece: number;
  kind: StairPieceKind;
  h: number;
  /** Factored envelopes per metre: kN·m/m, kN/m. */
  mPos: number;
  mNeg: number;
  /** |Vu| max and the sign of Mu in that combination (for ρw). */
  vu: number;
  vuCombination: string;
  vuMomentSign: 1 | -1;
  nuTension: number;
  nuCompression: number;
  /** Service D + L moment, kN·m/m. */
  mService: number;
  /** Service vertical deflection (D + L, cracked), mm, downward positive. */
  deflection: number;
  /** Top bars at this station (null where none are provided). */
  topSet: StairTopSetId | null;
}
export type StairTopSetId = "topBottom" | "topTop" | "topKnee";
export type StairBarSetId = keyof StairsInput["bars"];
/** Bar marks shared by checks, drawings, 3-D view and the bar schedule. */
export const stairBarMarks: Record<StairBarSetId, string> = {
  mainBottom: "B1",
  topBottom: "T1",
  topTop: "T2",
  topKnee: "T3",
  distribution: "D1",
};
export const stairBarLabels: Record<StairBarSetId, string> = {
  mainBottom: "main bottom bars",
  topBottom: "top bars · bottom support",
  topTop: "top bars · top support",
  topKnee: "top bars · knees / landing supports",
  distribution: "distribution bars",
};
/** Default support-beam depth (decision V1: beam top flush with the landing / floor). */
export const STAIR_BEAM_DEPTH = 500;
export interface StairReaction {
  support: StairSupportDef;
  /** Per metre width. Vertical up +, horizontal (+x) +, moment CCW +. */
  dead: { v: number; h: number; m: number };
  live: { v: number; h: number; m: number };
  service: { v: number; h: number; m: number };
  factored: {
    vMax: number;
    vMin: number;
    hAbsMax: number;
    mAbsMax: number;
    combination: string;
  };
  /** Width used for per-flight totals, m (null in 1 m strip mode). */
  widthM: number | null;
}
export interface StairSpanResult {
  label: string;
  kind: "span" | "overhang";
  x0: number;
  x1: number;
  /** Developed centreline length, mm. */
  developed: number;
  /** Horizontal length, mm. */
  horizontal: number;
  continuousEnds: 0 | 1 | 2 | "cantilever";
  hmin: number;
  hProvided: number;
  ma: number;
  mcr: number;
  ieRatio: number;
  immediateLive: number;
  immediateSustained: number;
  longTerm: number;
  total: number;
  limitImmediate: number;
  limitTotal: number;
}
export interface StairStripResult {
  geometry: StairStripGeometry;
  stations: StairStation[];
  reactions: StairReaction[];
  spans: StairSpanResult[];
}
export interface StairFootingResult {
  widthMm: number;
  thicknessMm: number;
  serviceP: number;
  serviceH: number;
  eccentricity: number;
  qMax: number;
  qa: number;
  slidingFs: number | null;
  qu: number;
  cantilever: number;
  d: number;
  mu: number;
  phiMn: number;
  vu: number;
  phiVc: number;
  as: number;
  asMin: number;
  dowelRequired: number;
  dowelAvailable: number;
}
export interface StairCheck extends DesignCheck {
  group:
    | "Flexure"
    | "Shear"
    | "Axial"
    | "Reinforcement"
    | "Serviceability"
    | "Detailing"
    | "Foundation";
}
export interface StairsResult {
  engineVersion: string;
  input: StairsInput;
  pitch: { degrees: number; riser: number; going: number; blondel: number };
  loads: {
    flight: ReturnType<typeof stairFlightDeadLoad>;
    landings: { label: string; thickness: number; dead: number }[];
    live: number;
  };
  strips: StairStripResult[];
  footing: StairFootingResult | null;
  checks: StairCheck[];
  warnings: string[];
  notes: string[];
  /** Fatal geometry / stability message; when set, strips and checks are empty. */
  error: string | null;
}

/* ------------------------------------------------------------------ analysis */
const MAX_ELEMENT = 100; // mm

interface Mesh {
  nodes: FrameNode[];
  /** station data per node */
  nodeX: number[];
  members: (FrameMember & { piece: number })[];
  nodeAt: (x: number) => number;
}

function yAt(g: StairStripGeometry, x: number) {
  for (const p of g.pieces)
    if (x >= p.start.x - 1e-6 && x <= p.end.x + 1e-6) {
      const r = (x - p.start.x) / (p.end.x - p.start.x || 1);
      return p.start.y + r * (p.end.y - p.start.y);
    }
  const last = g.pieces[g.pieces.length - 1];
  return x < g.pieces[0].start.x ? g.pieces[0].start.y : last.end.y;
}

function buildMesh(g: StairStripGeometry, breaks: number[], ec: number): Mesh {
  const xs = new Set<number>();
  for (const p of g.pieces) {
    xs.add(round(p.start.x));
    xs.add(round(p.end.x));
  }
  for (const b of breaks) if (b >= 0 && b <= g.length) xs.add(round(b));
  const sorted = [...xs].sort((a, b) => a - b);
  const all: number[] = [];
  for (let k = 0; k < sorted.length - 1; k++) {
    const a = sorted[k],
      b = sorted[k + 1];
    if (b - a < 0.5) continue;
    const n = Math.max(1, Math.ceil((b - a) / MAX_ELEMENT));
    for (let j = 0; j < n; j++) all.push(a + ((b - a) * j) / n);
  }
  all.push(sorted[sorted.length - 1]);
  const nodes = all.map((x) => ({ x: x / 1000, y: yAt(g, x) / 1000 }));
  const members = all.slice(1).map((x1, k) => {
    const xm = (all[k] + x1) / 2;
    const piece = g.pieces.findIndex(
      (p) => xm >= p.start.x - 1e-6 && xm <= p.end.x + 1e-6,
    );
    const h = g.pieces[Math.max(0, piece)].h / 1000;
    return {
      i: k,
      j: k + 1,
      ei: (ec * 1000 * h ** 3) / 12,
      ea: ec * 1000 * h,
      q: 0,
      piece: Math.max(0, piece),
    };
  });
  const nodeAt = (x: number) => {
    let best = 0;
    for (let k = 1; k < all.length; k++)
      if (Math.abs(all[k] - x) < Math.abs(all[best] - x)) best = k;
    return best;
  };
  return { nodes, nodeX: all, members, nodeAt };
}
const round = (x: number) => Math.round(x * 1000) / 1000;

function memberMidX(mesh: Mesh, e: number) {
  return (mesh.nodeX[mesh.members[e].i] + mesh.nodeX[mesh.members[e].j]) / 2;
}

function spanFor(g: StairStripGeometry, x: number) {
  const xs = g.supports.map((s) => s.x);
  const left = xs.filter((v) => v <= x + 1e-6),
    right = xs.filter((v) => v >= x - 1e-6);
  if (left.length && right.length) {
    const a = Math.max(...left),
      b = Math.min(...right);
    if (b - a > 1) return { kind: "span" as const, x: x - a, length: b - a };
    return { kind: "overhang" as const, a: 0 };
  }
  if (!xs.length) return { kind: "overhang" as const, a: 0 };
  return {
    kind: "overhang" as const,
    a: left.length ? x - Math.max(...left) : Math.min(...right) - x,
  };
}

/** Per-metre equivalent of a local load (S6, L5a). */
function localPerMetre(
  i: StairsInput,
  g: StairStripGeometry,
  l: StairLocalLoad,
) {
  const B = i.flightWidth;
  if (l.kind === "line") return { factor: 1, be: null as number | null };
  const x = l.kind === "point" ? l.x : (l.x0 + l.x1) / 2;
  if (i.widthMode === "strip")
    return {
      factor: l.kind === "point" ? 1 : Math.min(l.width, 1000) / 1000,
      be: null,
    };
  const be = stairEffectiveWidth(l.width, B, spanFor(g, x));
  // point: P/be per metre; area: q·w/be per metre of the loaded strip
  return { factor: l.kind === "point" ? 1000 / be : l.width / be, be };
}

function restraintFor(
  node: number,
  c: StairSupportDef["condition"],
): FrameRestraint {
  return {
    node,
    ux: c !== "Sliding",
    uy: true,
    rz: c === "Fixed",
  };
}

const topSets: StairTopSetId[] = ["topBottom", "topTop", "topKnee"];

export function analyzeStairs(raw: StairsInput): StairsResult {
  const i = stairsInputSchema.parse(raw);
  const pitch = stairPitch(i.riser, i.going);
  const flightLoad = stairFlightDeadLoad(i);
  const warnings: string[] = concreteStrengthNotes(i.fc).map((n) => n.text);
  const notes: string[] = [];
  const empty = (error: string): StairsResult => ({
    engineVersion: STAIRS_ENGINE_VERSION,
    input: i,
    pitch: {
      degrees: pitch.degrees,
      riser: i.riser,
      going: i.going,
      blondel: 2 * i.riser + i.going,
    },
    loads: { flight: flightLoad, landings: [], live: i.live },
    strips: [],
    footing: null,
    checks: [],
    warnings,
    notes,
    error,
  });
  let geos: StairStripGeometry[];
  try {
    geos = stairGeometry(i);
  } catch (e) {
    if (e instanceof StairGeometryError) return empty(e.message);
    throw e;
  }
  const ec = 4700 * Math.sqrt(i.fc); // MPa (19.2.2.1(b))
  const included = i.combinations.filter((c) => c.included);
  const combos = included.length ? included : i.combinations;
  const widthM = i.widthMode === "full" ? i.flightWidth / 1000 : null;
  const checks: StairCheck[] = [];
  const strips: StairStripResult[] = [];
  const landings: StairsResult["loads"]["landings"] = [];

  for (const g of geos) {
    for (const p of g.pieces)
      if (p.kind === "landing" && !landings.some((l) => l.label === p.label))
        landings.push({
          label: p.label,
          thickness: p.h,
          dead: stairLandingDeadLoad(i, p.h).total,
        });
    if (!g.supports.length)
      return empty(`${g.label}: no supports — the strip is unstable.`);
    const loadsHere = i.localLoads.filter(
      (l) => i.stairType === "single" || (l.strip ?? 1) === g.index,
    );
    const d0 = i.waist - i.bottomCover - i.bars.mainBottom.diameter / 2;
    const breaks: number[] = [];
    for (const s of g.supports) {
      breaks.push(
        s.x,
        s.x - s.bearing / 2 - d0,
        s.x + s.bearing / 2 + d0,
        s.x - s.bearing / 2,
        s.x + s.bearing / 2,
      );
    }
    for (const r of g.regions) breaks.push(r.x0, r.x1);
    for (const l of loadsHere) {
      if (l.kind === "area") breaks.push(l.x0, l.x1);
      else breaks.push(l.x);
    }
    const setRanges = topBarRanges(i, g);
    for (const r of setRanges) breaks.push(r.x0, r.x1);
    const mesh = buildMesh(g, breaks, ec);
    for (const l of loadsHere) {
      const x = l.kind === "area" ? l.x1 : l.x;
      if (x > g.length + 1)
        warnings.push(
          `Local load ${l.id} lies beyond ${g.label} (${(g.length / 1000).toFixed(2)} m on plan); it is ignored.`,
        );
    }
    // load cases
    const qDead = mesh.members.map((_, e) => {
      const x = memberMidX(mesh, e);
      const reg = g.regions.find((r) => x >= r.x0 - 1e-6 && x <= r.x1 + 1e-6);
      return reg
        ? reg.dead
        : stairLandingDeadLoad(i, g.pieces[mesh.members[e].piece].h).total;
    });
    const qLive = mesh.members.map(() => i.live);
    const nodalDead: FrameNodalLoad[] = [],
      nodalLive: FrameNodalLoad[] = [];
    for (const l of loadsHere) {
      const { factor, be } = localPerMetre(i, g, l);
      if (be !== null && be < i.flightWidth && i.widthMode === "full")
        notes.push(
          `${l.id}: effective width be = ${be.toFixed(0)} mm < flight width; load per metre = ${l.kind === "point" ? `P/be` : `q·w/be`} (${stairClauses.effectiveWidth()}).`,
        );
      if (l.kind === "area") {
        mesh.members.forEach((_, e) => {
          const x = memberMidX(mesh, e);
          if (x >= l.x0 && x <= l.x1)
            (l.case === "dead" ? qDead : qLive)[e] += l.value * factor;
        });
      } else if (l.x <= g.length + 1) {
        const node = mesh.nodeAt(l.x);
        (l.case === "dead" ? nodalDead : nodalLive).push({
          node,
          fy: l.value * factor,
        });
      }
    }
    const restraints = g.supports.map((s) =>
      restraintFor(mesh.nodeAt(s.x), s.condition),
    );
    // Thrust envelope: with two or more horizontal restraints the strip works
    // as a bent and the thrust relieves +M. Supports can yield horizontally,
    // so +M, shear, axial and deflection are enveloped with every horizontal
    // restraint but the first one released.
    const uxNodes = restraints.filter((r) => r.ux).map((r) => r.node);
    const variants: FrameRestraint[][] = [restraints];
    if (uxNodes.length >= 2)
      variants.push(
        restraints.map((r) =>
          r.ux && r.node !== uxNodes[0] ? { ...r, ux: false } : r,
        ),
      );
    const cases = [
      { q: qDead, nodalLoads: nodalDead },
      { q: qLive, nodalLoads: nodalLive },
    ];
    const models: FrameResult[][] = [];
    for (const [k, rs] of variants.entries()) {
      try {
        models.push(
          solveFrame(
            { nodes: mesh.nodes, members: mesh.members, restraints: rs },
            cases,
          ),
        );
      } catch (e) {
        if (!(e instanceof FrameInstabilityError)) throw e;
        if (k === 0)
          return empty(
            `${g.label}: unstable supports (${g.supports.map((s) => `${s.label} ${s.condition}`).join(", ") || "none"}). Provide a Fixed support, or two supports with at least one Pinned or Fixed.`,
          );
        variants.splice(k, 1);
      }
    }
    const base = models[0];
    // stations at element ends and mid-points
    const nodeS: number[] = [0];
    mesh.members.forEach((m, e) =>
      nodeS.push(nodeS[e] + base[0].members[e].length * 1000),
    );
    const stations: StairStation[] = [];
    const pointNodes = new Set([...nodalDead, ...nodalLive].map((p) => p.node));
    const at = (r: FrameResult, e: number, where: 0 | 0.5 | 1) => {
      const m = r.members[e];
      if (where === 0) return { ...m.start };
      if (where === 1) return { ...m.end };
      return {
        n: (m.start.n + m.end.n) / 2,
        v: (m.start.v + m.end.v) / 2,
        m: m.mid,
      };
    };
    mesh.members.forEach((mem, e) => {
      for (const where of [0, 0.5, 1] as const) {
        if (where === 0 && e > 0 && !pointNodes.has(mem.i)) continue;
        let mPos = -Infinity,
          mNeg = Infinity,
          vu = 0,
          vuComb = combos[0].id,
          vuSign: 1 | -1 = 1,
          nT = -Infinity,
          nC = Infinity,
          mService = 0;
        for (const [D, L] of models) {
          const d = at(D, e, where),
            l = at(L, e, where);
          if (Math.abs(d.m + l.m) > Math.abs(mService)) mService = d.m + l.m;
          for (const c of combos) {
            const m = c.deadFactor * d.m + c.liveFactor * l.m,
              v = c.deadFactor * d.v + c.liveFactor * l.v,
              n = c.deadFactor * d.n + c.liveFactor * l.n;
            mPos = Math.max(mPos, m);
            mNeg = Math.min(mNeg, m);
            if (Math.abs(v) > Math.abs(vu)) {
              vu = v;
              vuComb = c.id;
              vuSign = m >= 0 ? 1 : -1;
            }
            nT = Math.max(nT, n);
            nC = Math.min(nC, n);
          }
        }
        const x =
          mesh.nodeX[mem.i] + (mesh.nodeX[mem.j] - mesh.nodeX[mem.i]) * where;
        stations.push({
          s: nodeS[e] + (nodeS[e + 1] - nodeS[e]) * where,
          x,
          y: yAt(g, x),
          piece: mem.piece,
          kind: g.pieces[mem.piece].kind,
          h: g.pieces[mem.piece].h,
          mPos: Math.max(0, mPos),
          mNeg: Math.min(0, mNeg),
          vu: Math.abs(vu),
          vuCombination: vuComb,
          vuMomentSign: vuSign,
          nuTension: Math.max(0, nT),
          nuCompression: Math.max(0, -nC),
          mService,
          deflection: 0,
          topSet: topSetAt(setRanges, x),
        });
      }
    });
    // reactions: unfactored values from the model with the larger service
    // vertical reaction; factored values enveloped over both models
    const reactions: StairReaction[] = g.supports.map((s, k) => {
      const pick = models.reduce((best, m) =>
        m[0].reactions[k].ry + m[1].reactions[k].ry >
        best[0].reactions[k].ry + best[1].reactions[k].ry
          ? m
          : best,
      );
      const rd = pick[0].reactions[k],
        rl = pick[1].reactions[k];
      let vMax = -Infinity,
        vMin = Infinity,
        hAbs = 0,
        mAbs = 0,
        comb = combos[0].id;
      for (const [D, L] of models)
        for (const c of combos) {
          const fd = D.reactions[k],
            fl = L.reactions[k];
          const v = c.deadFactor * fd.ry + c.liveFactor * fl.ry;
          if (v > vMax) {
            vMax = v;
            comb = c.id;
          }
          vMin = Math.min(vMin, v);
          hAbs = Math.max(
            hAbs,
            Math.abs(c.deadFactor * fd.rx + c.liveFactor * fl.rx),
          );
          mAbs = Math.max(
            mAbs,
            Math.abs(c.deadFactor * fd.mz + c.liveFactor * fl.mz),
          );
        }
      return {
        support: s,
        dead: { v: rd.ry, h: rd.rx, m: rd.mz },
        live: { v: rl.ry, h: rl.rx, m: rl.mz },
        service: { v: rd.ry + rl.ry, h: rd.rx + rl.rx, m: rd.mz + rl.mz },
        factored: {
          vMax,
          vMin,
          hAbsMax: hAbs,
          mAbsMax: mAbs,
          combination: comb,
        },
        widthM,
      };
    });
    if (models.length > 1) {
      const h0 = base[0].reactions.find((r) => r.node === uxNodes[0])!,
        h1 = base[1].reactions.find((r) => r.node === uxNodes[0])!;
      notes.push(
        `${g.label}: ${uxNodes.length} supports restrain horizontal movement, so the strip carries thrust (service H ≈ ${fmt(Math.abs(h0.rx + h1.rx))} kN/m). Flexure, shear, axial force and deflection are enveloped with the horizontal restraint released at all but the first support, in case the supports yield; confirm the supports and diaphragms can resist the thrust.`,
      );
    }
    for (const r of reactions)
      if (r.factored.vMin < -1e-6)
        warnings.push(
          `${g.label} · ${r.support.label}: uplift (factored vertical reaction down to ${fmt(r.factored.vMin)} kN/m). Anchor the bars into the support for tension or change the support condition (e.g. Sliding).`,
        );
    // spans and deflection
    const spans = stripSpans(i, g, stations);
    const deflected = crackedDeflection(
      i,
      g,
      mesh,
      spans,
      stations,
      qDead,
      qLive,
      nodalDead,
      nodalLive,
      variants,
    );
    stations.forEach((st) => {
      const node = mesh.nodeAt(st.x);
      st.deflection = deflected.total[node] ?? 0;
    });
    strips.push({ geometry: g, stations, reactions, spans: deflected.spans });
    checks.push(
      ...stripChecks(
        i,
        g,
        stations,
        deflected.spans,
        [...nodalDead, ...nodalLive].map((p) => mesh.nodeX[p.node]),
      ),
    );
  }

  // global reinforcement checks
  checks.push(...reinforcementChecks(i, geos));
  // footing
  let footing: StairFootingResult | null = null;
  if (i.bottomSupport.onGround) {
    const bottom = strips[0].reactions.find((r) => r.support.role === "bottom");
    if (bottom && i.bottomSupport.footing.design) {
      footing = footingDesign(i, bottom);
      checks.push(...footingChecks(i, footing));
    } else if (bottom) {
      notes.push(
        `Bottom support on ground, footing by others: service reaction ${bottom.service.v.toFixed(2)} kN/m (D ${bottom.dead.v.toFixed(2)}, L ${bottom.live.v.toFixed(2)}), factored max ${bottom.factored.vMax.toFixed(2)} kN/m (${bottom.factored.combination})${widthM ? `; × ${widthM.toFixed(2)} m flight width = ${(bottom.service.v * widthM).toFixed(1)} kN service` : ""}.`,
      );
    }
    if (i.topSupport.condition !== "Free")
      warnings.push(
        "Bottom end bears on ground while the top end is suspended: differential settlement can crack the top support region — confirm the founding level and detail accordingly.",
      );
  }
  checks.push(...detailingChecks(i, geos));
  // advisories and seismic
  const lim = i.geometryLimits,
    blondel = 2 * i.riser + i.going;
  if (i.riser > lim.riserMax)
    warnings.push(
      `Geometry (advisory): riser ${i.riser} mm > ${lim.riserMax} mm limit (${stairClauses.geometry()}).`,
    );
  if (i.going < lim.goingMin)
    warnings.push(
      `Geometry (advisory): going ${i.going} mm < ${lim.goingMin} mm limit (${stairClauses.geometry()}).`,
    );
  if (blondel < lim.blondelMin || blondel > lim.blondelMax)
    warnings.push(
      `Geometry (advisory): 2R + T = ${blondel} mm outside ${lim.blondelMin}–${lim.blondelMax} mm.`,
    );
  for (const l of landingList(i)) {
    const w =
      l.width || (l.mid ? 2 * i.flightWidth + i.flightGap : i.flightWidth);
    if (l.length > 0 && w < i.flightWidth)
      warnings.push(
        `Geometry (advisory): ${l.label} width ${w} mm < flight width ${i.flightWidth} mm (${stairClauses.geometry()}).`,
      );
    if (l.length > 0 && l.length < Math.min(i.flightWidth, 1220))
      warnings.push(
        `Geometry (advisory): ${l.label} depth ${l.length} mm < min(flight width, 1220 mm) (${stairClauses.geometry()}).`,
      );
  }
  warnings.push(
    i.seismic.connection === "integral"
      ? `Seismic: stair cast integral with the floors acts as a diagonal brace between storeys — include it in the building model (ETABS) or provide a sliding/isolated end; this module does not design for storey drift (${stairClauses.seismic()}).`
      : `Seismic: isolated stair — provide a sliding seat at one end sized for the design storey drift (seat-length check planned for Phase 2) (${stairClauses.seismic()}).`,
  );
  if (
    i.seismic.connection === "isolated" &&
    i.bottomSupport.condition !== "Sliding" &&
    i.topSupport.condition !== "Sliding"
  )
    warnings.push(
      "Seismic: connection is 'isolated' but neither end is Sliding — set one end to Sliding so the analysis matches the detail.",
    );
  notes.push(
    `Concentrated tread load (${stairClauses.treadLoad()}) is not checked in v1; it rarely governs a waist-type RC stair.`,
    `Analysis: ${stairClauses.analysis()}; 1 m strip on the true centreline geometry with gross EcIg for strength. Loads are applied per plan length; the steps' self-weight γR/2 is applied over the stepped length only (n − 1 treads; the landing top is the last tread).`,
    `Load combinations: ${stairClauses.combinations()}.`,
    i.widthMode === "full"
      ? `Full-width mode: results per metre; reactions and quantities × flight width ${i.flightWidth} mm. Point and area loads use an effective width be (${stairClauses.effectiveWidth()}).`
      : "1 m strip mode: local point and area loads are placed entirely on the design strip (conservative).",
  );
  for (const g of geos)
    for (const s of g.supports)
      if (s.condition === "Pinned" || s.condition === "Sliding")
        notes.push(
          `${g.label} · ${s.label} (${s.condition}): monolithic ends still crack in hogging — top bars with As ≥ As,min are required there (decision A5).`,
        );

  return {
    engineVersion: STAIRS_ENGINE_VERSION,
    input: i,
    pitch: { degrees: pitch.degrees, riser: i.riser, going: i.going, blondel },
    loads: { flight: flightLoad, landings, live: i.live },
    strips,
    footing,
    checks,
    warnings,
    notes,
    error: null,
  };
}

function landingList(i: StairsInput) {
  const out: { label: string; length: number; width: number; mid: boolean }[] =
    [
      {
        label: "Bottom landing",
        length: i.bottomLanding.length,
        width: i.bottomLanding.width,
        mid: false,
      },
      {
        label: "Top landing",
        length: i.topLanding.length,
        width: i.topLanding.width,
        mid: false,
      },
    ];
  i.flights.forEach((f, k) => {
    if (f.landingAfter)
      out.push({
        label: i.stairType === "dog-leg" ? "Mid landing" : `Landing ${k + 1}`,
        length: f.landingAfter.length,
        width: f.landingAfter.width,
        mid: i.stairType === "dog-leg",
      });
  });
  return out;
}

/* ---------------------------------------------------- top bar zones */
interface TopRange {
  set: StairTopSetId;
  x0: number;
  x1: number;
}
function topBarRanges(i: StairsInput, g: StairStripGeometry): TopRange[] {
  const out: TopRange[] = [];
  const firstStrip = g.index === 1,
    lastStrip = i.stairType === "single" || g.index === 2;
  for (const s of g.supports) {
    const set: StairTopSetId =
      s.role === "bottom" && firstStrip
        ? "topBottom"
        : s.role === "top" && lastStrip
          ? "topTop"
          : "topKnee";
    const ext = i.bars[set].extension;
    out.push({
      set,
      x0: Math.max(0, s.x - ext),
      x1: Math.min(g.length, s.x + ext),
    });
  }
  for (const k of g.knees) {
    const ext = i.bars.topKnee.extension;
    out.push({
      set: "topKnee",
      x0: Math.max(0, k.x - ext),
      x1: Math.min(g.length, k.x + ext),
    });
  }
  return out;
}
function topSetAt(ranges: TopRange[], x: number): StairTopSetId | null {
  const hit = ranges.filter((r) => x >= r.x0 - 1e-6 && x <= r.x1 + 1e-6);
  if (!hit.length) return null;
  return hit.sort((a, b) => topSets.indexOf(a.set) - topSets.indexOf(b.set))[0]
    .set;
}

/* ---------------------------------------------------- section strength */
function strength(
  i: StairsInput,
  as: number,
  h: number,
  face: "bottom" | "top",
  db: number,
) {
  const d = h - (face === "bottom" ? i.bottomCover : i.topCover) - db / 2;
  return { ...slabFlexuralStrength(i, [{ as, d }]), d };
}

/* ---------------------------------------------------- spans / deflection */
function stripSpans(
  i: StairsInput,
  g: StairStripGeometry,
  stations: StairStation[],
): StairSpanResult[] {
  const xs = g.supports.map((s) => s.x);
  const devAt = (x: number) => {
    let best = stations[0];
    for (const s of stations)
      if (Math.abs(s.x - x) < Math.abs(best.x - x)) best = s;
    return best.s;
  };
  const out: StairSpanResult[] = [];
  const isCont = (k: number) =>
    g.supports[k].condition === "Fixed" || (k > 0 && k < g.supports.length - 1);
  for (let k = 0; k < xs.length - 1; k++) {
    if (xs[k + 1] - xs[k] < 1) continue;
    const ends = ((isCont(k) ? 1 : 0) + (isCont(k + 1) ? 1 : 0)) as 0 | 1 | 2;
    out.push(
      blankSpan(
        `Span ${out.length + 1}`,
        "span",
        xs[k],
        xs[k + 1],
        devAt(xs[k + 1]) - devAt(xs[k]),
        ends,
        i,
        g,
        stations,
      ),
    );
  }
  if (xs[0] > 1)
    out.push(
      blankSpan(
        "Overhang (start)",
        "overhang",
        0,
        xs[0],
        devAt(xs[0]),
        "cantilever",
        i,
        g,
        stations,
      ),
    );
  const last = xs[xs.length - 1];
  if (g.length - last > 1)
    out.push(
      blankSpan(
        "Overhang (end)",
        "overhang",
        last,
        g.length,
        devAt(g.length) - devAt(last),
        "cantilever",
        i,
        g,
        stations,
      ),
    );
  return out;
}
function blankSpan(
  label: string,
  kind: "span" | "overhang",
  x0: number,
  x1: number,
  developed: number,
  ends: 0 | 1 | 2 | "cantilever",
  i: StairsInput,
  g: StairStripGeometry,
  stations: StairStation[],
): StairSpanResult {
  const inside = stations.filter((s) => s.x >= x0 - 1e-6 && s.x <= x1 + 1e-6);
  const hProvided = Math.min(...inside.map((s) => s.h));
  const { hmin } = prov(i).minimumThickness(developed, ends, i.fy);
  void g;
  return {
    label,
    kind,
    x0,
    x1,
    developed,
    horizontal: x1 - x0,
    continuousEnds: ends,
    hmin,
    hProvided,
    ma: 0,
    mcr: 0,
    ieRatio: 1,
    immediateLive: 0,
    immediateSustained: 0,
    longTerm: 0,
    total: 0,
    limitImmediate: (x1 - x0) / i.deflection.immediateDivisor,
    limitTotal: (x1 - x0) / i.deflection.totalDivisor,
  };
}

function crackedDeflection(
  i: StairsInput,
  g: StairStripGeometry,
  mesh: Mesh,
  spans: StairSpanResult[],
  stations: StairStation[],
  qDead: number[],
  qLive: number[],
  nodalDead: FrameNodalLoad[],
  nodalLive: FrameNodalLoad[],
  variants: FrameRestraint[][],
) {
  const ratio = mesh.members.map(() => 1);
  for (const sp of spans) {
    const inside = stations.filter(
      (s) => s.x >= sp.x0 - 1e-6 && s.x <= sp.x1 + 1e-6,
    );
    if (!inside.length) continue;
    // governing service section: max sagging (spans) or support hogging (overhangs, 24.2.3.7)
    const gov = inside.reduce((a, b) =>
      sp.kind === "overhang"
        ? b.mService < a.mService
          ? b
          : a
        : b.mService > a.mService
          ? b
          : a,
    );
    const ma = Math.abs(gov.mService);
    const face = gov.mService >= 0 ? "bottom" : "top";
    const set =
      face === "bottom"
        ? i.bars.mainBottom
        : gov.topSet
          ? i.bars[gov.topSet]
          : null;
    const as = set ? stairBarArea(set) : 0;
    const d =
      gov.h -
      (face === "bottom" ? i.bottomCover : i.topCover) -
      (set?.diameter ?? 12) / 2;
    const cs = slabCrackedSection({ fc: i.fc, es: i.es, h: gov.h }, as, d);
    const ie = slabEffectiveInertia(cs, ma);
    sp.ma = ma;
    sp.mcr = cs.mcr;
    sp.ieRatio = cs.ig > 0 ? ie / cs.ig : 1;
    mesh.members.forEach((_, e) => {
      const x = memberMidX(mesh, e);
      if (x >= sp.x0 - 1e-6 && x <= sp.x1 + 1e-6)
        ratio[e] = Math.min(ratio[e], sp.ieRatio);
    });
  }
  const members = mesh.members.map((m, e) => ({
    ...m,
    ei: m.ei * Math.max(ratio[e], 1e-3),
  }));
  const results = variants.map((restraints) =>
    solveFrame({ nodes: mesh.nodes, members, restraints }, [
      { q: qDead, nodalLoads: nodalDead },
      { q: qLive, nodalLoads: nodalLive },
    ]),
  );
  const lambda = 2; // ξ = 2.0 (≥ 5 years), ρ′ = 0 → λΔ = 2.0 (24.2.4.1.1)
  const psi = i.sustainedLiveFactor;
  const down = (r: FrameResult, n: number) => -r.displacements[n].uy * 1000; // mm, downward +
  const env = (f: (d: FrameResult, l: FrameResult, n: number) => number) =>
    mesh.nodes.map((_, n) => Math.max(...results.map(([d, l]) => f(d, l, n))));
  const live = env((_, l, n) => down(l, n));
  const sustained = env((d, l, n) => down(d, n) + psi * down(l, n));
  const total = env(
    (d, l, n) => lambda * (down(d, n) + psi * down(l, n)) + down(l, n),
  );
  for (const sp of spans) {
    const ns = mesh.nodeX
      .map((x, n) => ({ x, n }))
      .filter((p) => p.x >= sp.x0 - 1e-6 && p.x <= sp.x1 + 1e-6)
      .map((p) => p.n);
    const max = (v: number[]) => Math.max(0, ...ns.map((n) => v[n]));
    sp.immediateLive = max(live);
    sp.immediateSustained = max(sustained);
    sp.longTerm = lambda * sp.immediateSustained;
    sp.total = max(total);
  }
  void g;
  return { spans, total };
}

/* ---------------------------------------------------- strip checks */
function maxBy<T>(xs: T[], f: (x: T) => number) {
  let best: T | null = null,
    v = -Infinity;
  for (const x of xs) {
    const fx = f(x);
    if (fx > v) {
      v = fx;
      best = x;
    }
  }
  return { item: best, value: v };
}
const fmt = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : "∞");

function stripChecks(
  i: StairsInput,
  g: StairStripGeometry,
  stations: StairStation[],
  spans: StairSpanResult[],
  pointXs: number[],
): StairCheck[] {
  const out: StairCheck[] = [];
  const tag = i.stairType === "single" ? "" : `${g.label} · `;
  const fcCache = new Map<string, ReturnType<typeof strength>>();
  const cap = (as: number, h: number, face: "bottom" | "top", db: number) => {
    const k = `${as}|${h}|${face}|${db}`;
    if (!fcCache.has(k)) fcCache.set(k, strength(i, as, h, face, db));
    return fcCache.get(k)!;
  };
  const bottom = i.bars.mainBottom,
    asB = stairBarArea(bottom);
  for (const kind of ["flight", "landing"] as const) {
    const st = stations.filter((s) => s.kind === kind);
    if (!st.length) continue;
    const name = kind === "flight" ? "Waist" : "Landings";
    // +M
    const pos = maxBy(st, (s) =>
      s.mPos > 0
        ? s.mPos /
          Math.max(1e-9, cap(asB, s.h, "bottom", bottom.diameter).phiMn)
        : 0,
    );
    if (pos.item && pos.item.mPos > 1e-3) {
      const c = cap(asB, pos.item.h, "bottom", bottom.diameter);
      out.push({
        id: `s${g.index}:${kind}:flexure-pos`,
        group: "Flexure",
        label: `${tag}${name} · Flexure +M (bottom bars)`,
        dcr: c.phiMn > 0 ? pos.item.mPos / c.phiMn : Infinity,
        clause: stairClauses.flexure(),
        detail: `Mu = ${fmt(pos.item.mPos)} kN·m/m at x = ${fmt(pos.item.x / 1000)} m vs φMn = ${fmt(c.phiMn)} kN·m/m (As ${fmt(asB, 0)} mm²/m, d ${fmt(c.d, 1)} mm, h ${pos.item.h} mm, φ ${fmt(c.phi, 3)}).`,
      });
      out.push({
        id: `s${g.index}:${kind}:strain-pos`,
        group: "Flexure",
        label: `${tag}${name} · Tension-Controlled Strain (bottom)`,
        dcr:
          c.strain > 0
            ? prov(i).tensionStrain(i.fy, i.es) / c.strain
            : Infinity,
        clause: stairClauses.strain(),
        detail: `εt = ${fmt(c.strain, 4)} vs εty + 0.003 = ${fmt(i.fy / i.es + 0.003, 4)}.`,
      });
    }
    // −M, one check per top-bar zone (T1 bottom support, T2 top support,
    // T3 knees / landing supports) so each set is judged on its own zone.
    const negSt = st.filter((s) => s.mNeg < -1e-3);
    const groups = new Map<StairTopSetId | "none", StairStation[]>();
    for (const s of negSt) {
      const key = s.topSet ?? "none";
      groups.set(key, [...(groups.get(key) ?? []), s]);
    }
    for (const [set, list] of groups) {
      if (set === "none") {
        const s = list.reduce((a, b) => (b.mNeg < a.mNeg ? b : a));
        out.push({
          id: `s${g.index}:${kind}:flexure-neg:none`,
          group: "Flexure",
          label: `${tag}${name} · Hogging Beyond Top-Bar Zones`,
          dcr: Infinity,
          clause: stairClauses.flexure(),
          invalidLabel: "Hogging Beyond Top-Bar Cut-Off",
          detail: `Hogging Mu = ${fmt(s.mNeg)} kN·m/m at x = ${fmt(s.x / 1000)} m where no top bars are provided — extend the nearest top-bar zone.`,
        });
        continue;
      }
      const bar = i.bars[set];
      const capOf = (s: StairStation) =>
        cap(stairBarArea(bar), s.h, "top", bar.diameter);
      const s = maxBy(list, (x) => {
        const c = capOf(x);
        return c.phiMn > 0 ? -x.mNeg / c.phiMn : Infinity;
      }).item!;
      const c = capOf(s);
      const mark = `${stairBarMarks[set]} ${stairBarLabels[set]}`;
      out.push({
        id: `s${g.index}:${kind}:flexure-neg:${set}`,
        group: "Flexure",
        label: `${tag}${name} · Flexure −M (${mark})`,
        dcr: c.phiMn > 0 ? -s.mNeg / c.phiMn : Infinity,
        clause: stairClauses.flexure(),
        detail: `Mu = ${fmt(s.mNeg)} kN·m/m at x = ${fmt(s.x / 1000)} m vs φMn = ${fmt(c.phiMn)} kN·m/m (${stairBarMarks[set]} Ø${bar.diameter} @ ${bar.spacing}, d ${fmt(c.d, 1)} mm, h ${s.h} mm).`,
      });
      if (c.strain > 0)
        out.push({
          id: `s${g.index}:${kind}:strain-neg:${set}`,
          group: "Flexure",
          label: `${tag}${name} · Tension-Controlled Strain (${stairBarMarks[set]})`,
          dcr: prov(i).tensionStrain(i.fy, i.es) / c.strain,
          clause: stairClauses.strain(),
          detail: `εt = ${fmt(c.strain, 4)} vs εty + 0.003 = ${fmt(i.fy / i.es + 0.003, 4)}.`,
        });
    }
  }
  // shear at d from support faces (7.4.3.2), knees and point loads included
  const zones = g.supports.map((s) => {
    const dd = i.waist - i.bottomCover - bottom.diameter / 2;
    const pointInside = pointXs.some(
      (x) => Math.abs(x - s.x) <= s.bearing / 2 + dd + 1e-6,
    );
    return {
      x: s.x,
      half: pointInside ? s.bearing / 2 : s.bearing / 2 + dd,
      pointInside,
    };
  });
  const shearSt = stations.filter(
    (s) => !zones.some((z) => Math.abs(s.x - z.x) < z.half - 1e-6),
  );
  const shearCap = (s: StairStation) => {
    const face = s.vuMomentSign >= 0 ? "bottom" : "top";
    const set = face === "bottom" ? bottom : s.topSet ? i.bars[s.topSet] : null;
    const as = set ? stairBarArea(set) : 0;
    const d =
      s.h -
      (face === "bottom" ? i.bottomCover : i.topCover) -
      (set?.diameter ?? 12) / 2;
    return { ...prov(i).oneWayShear(i.fc, as, d, s.h, -s.nuTension), d, face };
  };
  const sh = maxBy(shearSt, (s) =>
    s.vu > 0 ? s.vu / Math.max(1e-9, shearCap(s).phiVc) : 0,
  );
  if (sh.item) {
    const c = shearCap(sh.item);
    out.push({
      id: `s${g.index}:shear`,
      group: "Shear",
      label: `${tag}One-Way Shear`,
      dcr: c.phiVc > 0 ? sh.item.vu / c.phiVc : Infinity,
      clause: stairClauses.shear(),
      detail: `Vu = ${fmt(sh.item.vu)} kN/m (${sh.item.vuCombination}) at x = ${fmt(sh.item.x / 1000)} m (${sh.item.kind}) vs φVc = ${fmt(c.phiVc)} kN/m; d ${fmt(c.d, 1)} mm, ρw ${fmt(c.rho, 4)} (${c.face} bars), λs ${fmt(c.lambdaS, 3)}.${zones.some((z) => z.pointInside) ? " Point load within d of a support: critical section at the support face." : ""}`,
    });
  }
  // axial screen
  const ax = maxBy(
    stations,
    (s) => Math.max(s.nuCompression, s.nuTension) / (0.1 * i.fc * s.h),
  );
  if (ax.item) {
    const s = ax.item,
      nu = Math.max(s.nuCompression, s.nuTension);
    out.push({
      id: `s${g.index}:axial`,
      group: "Axial",
      label: `${tag}Axial Force Screen`,
      dcr: nu / (0.1 * i.fc * s.h),
      clause: stairClauses.axial(),
      detail: `${s.nuTension >= s.nuCompression ? "Tension" : "Compression"} Pu = ${fmt(nu)} kN/m at x = ${fmt(s.x / 1000)} m vs 0.10 f′c Ag = ${fmt(0.1 * i.fc * s.h)} kN/m.`,
    });
  }
  // thickness and deflection per span
  for (const sp of spans) {
    const thicknessOk = sp.hProvided >= sp.hmin;
    const calcDcr = Math.max(
      sp.limitImmediate > 0 ? sp.immediateLive / sp.limitImmediate : 0,
      sp.limitTotal > 0 ? sp.total / sp.limitTotal : 0,
    );
    out.push({
      id: `s${g.index}:${sp.label.toLowerCase().replace(/\W+/g, "-")}:thickness`,
      group: "Serviceability",
      label: `${tag}${sp.label} · Minimum Thickness`,
      dcr: thicknessOk ? sp.hmin / sp.hProvided : calcDcr,
      clause: thicknessOk
        ? stairClauses.minimumThickness()
        : `${stairClauses.deflection()}; h < hmin per ${stairClauses.minimumThickness()}`,
      detail: `ℓ = ${fmt(sp.developed, 0)} mm developed, ${sp.continuousEnds === "cantilever" ? "cantilever ℓ/10" : `${sp.continuousEnds} continuous end(s) ℓ/${[20, 24, 28][sp.continuousEnds as 0 | 1 | 2]}`} → hmin ${fmt(sp.hmin, 0)} mm vs h ${sp.hProvided} mm.${thicknessOk ? "" : " h < hmin: status follows the calculated deflection (7.3.2)."}`,
    });
    out.push({
      id: `s${g.index}:${sp.label.toLowerCase().replace(/\W+/g, "-")}:deflection`,
      group: "Serviceability",
      label: `${tag}${sp.label} · Calculated Deflection`,
      dcr: calcDcr,
      clause: stairClauses.deflection(),
      detail: `Immediate live ${fmt(sp.immediateLive)} mm vs ℓ/${i.deflection.immediateDivisor} = ${fmt(sp.limitImmediate)} mm; long-term λΔ·Δsus + ΔL = ${fmt(sp.total)} mm vs ℓ/${i.deflection.totalDivisor} = ${fmt(sp.limitTotal)} mm (ℓ = ${fmt(sp.horizontal, 0)} mm on plan; Ma ${fmt(sp.ma)} kN·m/m, Mcr ${fmt(sp.mcr)} kN·m/m, Ie/Ig ${fmt(sp.ieRatio, 3)}, λΔ = 2.0).`,
    });
  }
  return out;
}

/* ---------------------------------------------------- reinforcement checks */
function reinforcementChecks(
  i: StairsInput,
  geos: StairStripGeometry[],
): StairCheck[] {
  const out: StairCheck[] = [];
  const rhoMin = slabMinimumSteelRatio(i.fy);
  const pieces = geos.flatMap((g) => g.pieces);
  const hMax = Math.max(...pieces.map((p) => p.h)),
    hMin = Math.min(...pieces.map((p) => p.h));
  const fs = (2 / 3) * i.fy;
  const crackMax = (cc: number) =>
    Math.min(380 * (280 / fs) - 2.5 * cc, 300 * (280 / fs));
  const clearReq = (db: number) => Math.max(25, db, (4 / 3) * i.aggregate);
  const sets: {
    key: keyof StairsInput["bars"];
    label: string;
    face: "bottom" | "top";
    main: boolean;
    used: boolean;
  }[] = [
    {
      key: "mainBottom",
      label: "Main bottom bars",
      face: "bottom",
      main: true,
      used: true,
    },
    {
      key: "topBottom",
      label: "Top bars at bottom support",
      face: "top",
      main: true,
      used: true,
    },
    {
      key: "topTop",
      label: "Top bars at top support",
      face: "top",
      main: true,
      used: i.topSupport.condition !== "Free",
    },
    {
      key: "topKnee",
      label: "Top bars at knees / landing supports",
      face: "top",
      main: true,
      used: geos.some(
        (g) =>
          g.knees.length > 0 ||
          g.supports.some((s) => s.role === "mid" || s.role === "intermediate"),
      ),
    },
    {
      key: "distribution",
      label: "Distribution bars",
      face: "bottom",
      main: false,
      used: true,
    },
  ];
  for (const s of sets.filter((x) => x.used)) {
    const b = i.bars[s.key];
    const as = stairBarArea(b);
    const hRef = s.main ? hMax : hMax;
    const need = rhoMin * 1000 * hRef;
    out.push({
      id: `bars:${s.key}:minimum`,
      group: "Reinforcement",
      label: `${s.label} · Minimum Area`,
      dcr: as > 0 ? need / as : Infinity,
      clause: s.main
        ? stairClauses.minimumSteel()
        : stairClauses.distribution(),
      detail: `As ${fmt(as, 0)} mm²/m vs ${fmt(rhoMin, 4)} × 1000 × ${hRef} = ${fmt(need, 0)} mm²/m.`,
    });
    const smax = s.main ? Math.min(3 * hMin, 450) : Math.min(5 * hMin, 450);
    const clear = b.spacing - b.diameter;
    out.push({
      id: `bars:${s.key}:spacing`,
      group: "Reinforcement",
      label: `${s.label} · Spacing`,
      dcr: Math.max(
        b.spacing / smax,
        clear > 0 ? clearReq(b.diameter) / clear : Infinity,
      ),
      invalidLabel: "Bars Overlap / Invalid Clear Spacing",
      clause: s.main ? stairClauses.spacing() : stairClauses.distribution(),
      detail: `s ${b.spacing} mm vs max ${fmt(smax, 0)} mm (${s.main ? "3h" : "5h"}, 450); clear ${fmt(clear, 0)} mm vs min ${fmt(clearReq(b.diameter), 1)} mm.`,
    });
    if (s.main) {
      const cc = s.face === "bottom" ? i.bottomCover : i.topCover;
      const lim = crackMax(cc);
      out.push({
        id: `bars:${s.key}:crack`,
        group: "Serviceability",
        label: `${s.label} · Crack-Control Spacing`,
        dcr: lim > 0 ? b.spacing / lim : Infinity,
        clause: stairClauses.crack(),
        detail: `s ${b.spacing} mm vs min(380(280/fs) − 2.5cc, 300(280/fs)) = ${fmt(lim, 0)} mm (fs ${fmt(fs, 0)} MPa, cc ${cc} mm).`,
      });
    }
  }
  return out;
}

/* ---------------------------------------------------- detailing checks */
function detailingChecks(
  i: StairsInput,
  geos: StairStripGeometry[],
): StairCheck[] {
  const out: StairCheck[] = [];
  const hasKnee = geos.some((g) => g.knees.length > 0);
  if (hasKnee) {
    const ldB = prov(i).developmentLength(i, i.bars.mainBottom, i.bottomCover);
    out.push({
      id: "detail:knee-bottom",
      group: "Detailing",
      label: "Knee · Bottom Bars Crossing (Straight Extension)",
      dcr: ldB / i.kneeExtension,
      clause: stairClauses.development(),
      detail: `ld = ${fmt(ldB, 0)} mm vs extension past the knee ${i.kneeExtension} mm. Bars must cross at the inside (re-entrant) corner, not bend round it.`,
    });
    const k = i.bars.topKnee;
    const ldT = prov(i).developmentLength(
      i,
      k,
      i.topCover,
      Math.max(i.waist, ...geos.flatMap((g) => g.pieces.map((p) => p.h))) -
        i.topCover >
        300,
    );
    out.push({
      id: "detail:knee-top",
      group: "Detailing",
      label: "Knee · Top Bars Development",
      dcr: ldT / Math.max(1, k.extension),
      clause: stairClauses.development(),
      detail: `ld = ${fmt(ldT, 0)} mm vs top-bar extension ${k.extension} mm each side of the knee.`,
    });
  }
  const ends: {
    role: "bottom" | "top";
    cond: StairEndSupport;
    bearing: number;
    set: "topBottom" | "topTop";
    skip: boolean;
  }[] = [
    {
      role: "bottom",
      cond: i.bottomSupport.condition,
      bearing: i.bottomSupport.bearing,
      set: "topBottom",
      skip: i.bottomSupport.onGround && i.bottomSupport.footing.design,
    },
    {
      role: "top",
      cond: i.topSupport.condition,
      bearing: i.topSupport.bearing,
      set: "topTop",
      skip: i.topSupport.condition === "Free",
    },
  ];
  for (const e of ends) {
    if (e.skip) continue;
    const available = e.bearing - 50;
    const name = e.role === "bottom" ? "Bottom" : "Top";
    if (e.cond === "Fixed") {
      const b = i.bars[e.set];
      const ld = prov(i).developmentLength(i, b, i.topCover, true);
      const ldh = prov(i).hookLength(i, b.diameter);
      const straight = ld <= available;
      out.push({
        id: `detail:${e.role}-anchorage`,
        group: "Detailing",
        label: `${name} Support · Top-Bar Anchorage (Fixed)`,
        dcr: available > 0 ? (straight ? ld : ldh) / available : Infinity,
        clause: straight ? stairClauses.development() : stairClauses.hook(),
        detail: `Available ${fmt(available, 0)} mm (bearing − 50). ld ${fmt(ld, 0)} mm${straight ? " fits straight" : `; standard hook ldh ${fmt(ldh, 0)} mm required`}.`,
      });
    } else {
      out.push({
        id: `detail:${e.role}-embedment`,
        group: "Detailing",
        label: `${name} Support · Bottom-Bar Embedment (${e.cond})`,
        dcr: available > 0 ? 150 / available : Infinity,
        clause: stairClauses.simpleSupport(),
        detail: `Embedment available ${fmt(available, 0)} mm vs 150 mm minimum.`,
      });
    }
  }
  return out;
}

/* ---------------------------------------------------- footing */
export function footingDesign(
  i: StairsInput,
  r: StairReaction,
): StairFootingResult {
  const f = i.bottomSupport.footing;
  const B = f.width / 1000,
    hf = f.thickness / 1000;
  const wFtg = i.unitWeight * B * hf,
    wSoil =
      f.soilUnitWeight *
      (f.soilCover / 1000) *
      Math.max(0, B - i.bottomSupport.bearing / 1000);
  const P = r.service.v + wFtg + wSoil;
  const H = r.service.h;
  const M = r.service.m;
  const e = P > 0 ? Math.abs(M + H * hf) / P : Infinity;
  const qMax = !(P > 0)
    ? Infinity
    : e <= B / 6
      ? (P / B) * (1 + (6 * e) / B)
      : e < B / 2
        ? (2 * P) / (3 * (B / 2 - e))
        : Infinity;
  const slidingFs =
    i.bottomSupport.condition === "Sliding" || Math.abs(H) < 1e-9
      ? null
      : (f.friction * P) / Math.abs(H);
  // strength: net factored pressure from the stair reaction (trapezoid peak, conservative)
  const ru = Math.max(0, r.factored.vMax);
  const eu = ru > 0 ? (r.factored.mAbsMax + r.factored.hAbsMax * hf) / ru : 0;
  const qu = !(ru > 0)
    ? 0
    : eu <= B / 6
      ? (ru / B) * (1 + (6 * eu) / B)
      : eu < B / 2
        ? (2 * ru) / (3 * (B / 2 - eu))
        : Infinity;
  const c = Math.max(0, (f.width - i.bottomSupport.bearing) / 2); // mm
  const d = f.thickness - f.cover - f.bars.diameter / 2;
  const mu = (qu * (c / 1000) ** 2) / 2;
  const vu = c > d ? qu * ((c - d) / 1000) : 0;
  const as = stairBarArea(f.bars);
  const st = slabFlexuralStrength(i, [{ as, d }]);
  const sv = prov(i).oneWayShear(i.fc, as, d, f.thickness);
  const dowelAvailable = f.thickness - f.cover - f.bars.diameter;
  return {
    widthMm: f.width,
    thicknessMm: f.thickness,
    serviceP: P,
    serviceH: H,
    eccentricity: e,
    qMax,
    qa: f.qa,
    slidingFs,
    qu,
    cantilever: c,
    d,
    mu,
    phiMn: st.phiMn,
    vu,
    phiVc: sv.phiVc,
    as,
    asMin: slabMinimumSteelRatio(i.fy) * 1000 * f.thickness,
    dowelRequired: prov(i).hookLength(i, i.bars.mainBottom.diameter),
    dowelAvailable,
  };
}
function footingChecks(i: StairsInput, f: StairFootingResult): StairCheck[] {
  const fb = i.bottomSupport.footing.bars;
  const out: StairCheck[] = [
    {
      id: "footing:bearing",
      group: "Foundation",
      label: "Footing · Bearing Pressure",
      dcr: f.qMax / f.qa,
      clause: stairClauses.footingBearing(),
      invalidLabel: "Resultant Outside Footing",
      detail: `P = ${fmt(f.serviceP)} kN/m (stair + footing + soil), e = ${fmt(f.eccentricity, 3)} m, q,max = ${fmt(f.qMax, 1)} kPa vs qa = ${f.qa} kPa (footing ${f.widthMm} × ${f.thicknessMm} mm).`,
    },
  ];
  if (f.slidingFs !== null)
    out.push({
      id: "footing:sliding",
      group: "Foundation",
      label: "Footing · Sliding",
      dcr: f.slidingFs > 0 ? 1.5 / f.slidingFs : Infinity,
      clause: stairClauses.footingSliding(),
      detail: `μN / H = ${fmt(f.slidingFs)} vs 1.5 (H = ${fmt(Math.abs(f.serviceH))} kN/m service).`,
    });
  out.push(
    {
      id: "footing:flexure",
      group: "Foundation",
      label: "Footing · Flexure",
      dcr: f.phiMn > 0 ? f.mu / f.phiMn : Infinity,
      clause: stairClauses.footingFlexure(),
      detail: `qu = ${fmt(f.qu, 1)} kPa, cantilever ${fmt(f.cantilever, 0)} mm → Mu = ${fmt(f.mu)} kN·m/m vs φMn = ${fmt(f.phiMn)} kN·m/m (As ${fmt(f.as, 0)} mm²/m, d ${fmt(f.d, 1)} mm).`,
    },
    {
      id: "footing:shear",
      group: "Foundation",
      label: "Footing · One-Way Shear",
      dcr: f.vu === 0 ? 0 : f.phiVc > 0 ? f.vu / f.phiVc : Infinity,
      clause: stairClauses.footingShear(),
      detail: `Vu = ${fmt(f.vu)} kN/m at d from face vs φVc = ${fmt(f.phiVc)} kN/m.`,
    },
    {
      id: "footing:minimum",
      group: "Foundation",
      label: "Footing · Minimum Steel and Spacing",
      dcr: Math.max(
        f.as > 0 ? f.asMin / f.as : Infinity,
        fb.spacing / Math.min(3 * f.thicknessMm, 450),
      ),
      clause: stairClauses.footingMinimum(),
      detail: `As ${fmt(f.as, 0)} vs As,min ${fmt(f.asMin, 0)} mm²/m; s ${fb.spacing} vs ${fmt(Math.min(3 * f.thicknessMm, 450), 0)} mm.`,
    },
    {
      id: "footing:dowels",
      group: "Foundation",
      label: "Footing · Stair Bars Anchored (Hooked)",
      dcr: f.dowelAvailable > 0 ? f.dowelRequired / f.dowelAvailable : Infinity,
      clause: stairClauses.hook(),
      detail: `ldh = ${fmt(f.dowelRequired, 0)} mm (Ø${i.bars.mainBottom.diameter}) vs ${fmt(f.dowelAvailable, 0)} mm available (h − cover − footing bar).`,
    },
  );
  return out;
}
