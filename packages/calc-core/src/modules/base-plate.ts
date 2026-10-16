/**
 * Steel column base plate & anchor rod design (engine base-plate-0.1.0).
 *
 * Basis: AISC 360-22 J8 (bearing), J2 (welds), J9 (anchor rods → ACI 318);
 * AISC Design Guide 1, 3rd Ed. (2024) Ch. 4 exposed base plates (uniform
 * bearing stress block); AISC Manual 16th Ed. Table 14-2 (holes, washers);
 * ACI 318-19 Chapter 17 (anchors). NSCP 2015 projects are recorded by
 * designer choice and calculated per these editions.
 *
 * Units: inputs kN, kN·m, mm, MPa; internal N, N·mm, mm, MPa.
 * Axes: rotation 0° puts the column depth d along Y and bf along X.
 * Sign: +Mx (about X) puts the resultant towards +Y (compression +Y, rods on
 * −Y in tension); +My puts it towards +X. +Vx acts towards the +X (east) edge,
 * +Vy towards +Y (north). Pu is positive in compression.
 */
import { z } from "zod";

import type { ShapeRecord } from "../steel-shapes";
import {
  anchorKinds,
  futaUsed,
  heavyHexBearingArea,
  isCastIn,
  type AnchorKind,
} from "../anchor-rods";
import { basePlateClauses } from "../code-clauses";
import {
  ASD_TO_STRENGTH_DEFAULT,
  aiscFactors,
  designFactor,
  steelDesignMethods,
  type SteelDesignMethod,
} from "../steel-design-method";
import {
  designCheckPolicySchema,
  designRemarksSchema,
  type DesignCheck,
} from "../design-review";
import {
  getRodSpec,
  rodSpecStrength,
  sizesForSpec,
  table14_2,
} from "../anchor-rods";
import {
  anchorPhi,
  bondStrength,
  defaultCac,
  edgeDistances,
  interaction,
  minimumGeometry,
  pryout,
  pullout,
  shearBreakout,
  sideFaceBlowout,
  steelShear,
  steelTension,
  tensionBreakout,
  type AnchorPoint,
  type ConcreteBlock,
  type PostInstalledProduct,
  type ShearBreakout,
} from "./base-plate-anchors";

export const BASE_PLATE_ENGINE = "base-plate-0.2.0";

export const columnFamilies = ["I", "HSS-RECT", "HSS-ROUND"] as const;
/** User-defined column sections and the engine family each maps to. */
export const customColumnTypes = [
  "built-up-I",
  "box",
  "tube",
  "solid",
] as const;
export type CustomColumnType = (typeof customColumnTypes)[number];
export const customColumnTypeInfo: Record<
  CustomColumnType,
  {
    label: string;
    family: ColumnFamily;
    shapeType: string;
    dims: { key: "d" | "bf" | "tf" | "tw"; label: string }[];
  }
> = {
  "built-up-I": {
    label: "Built-up I / H section (equal flanges)",
    family: "I",
    shapeType: "BU-I",
    dims: [
      { key: "d", label: "Depth d" },
      { key: "bf", label: "Flange width bf" },
      { key: "tf", label: "Flange thickness tf" },
      { key: "tw", label: "Web thickness tw" },
    ],
  },
  box: {
    label: "Rectangular / square box (built-up or tube)",
    family: "HSS-RECT",
    shapeType: "BOX",
    dims: [
      { key: "d", label: "Depth H" },
      { key: "bf", label: "Width B" },
      { key: "tf", label: "Wall thickness t" },
    ],
  },
  tube: {
    label: "Round tube / pipe",
    family: "HSS-ROUND",
    shapeType: "TUBE",
    dims: [
      { key: "d", label: "Outside diameter OD" },
      { key: "tf", label: "Wall thickness t" },
    ],
  },
  solid: {
    label: "Solid rectangular / square bar",
    family: "HSS-RECT",
    shapeType: "BAR",
    dims: [
      { key: "d", label: "Depth H" },
      { key: "bf", label: "Width B" },
    ],
  },
};
export type ColumnFamily = (typeof columnFamilies)[number];

const pos = z.number().finite().positive();
const nonneg = z.number().finite().nonnegative();

export const basePlateColumnSchema = z.object({
  designation: z.string().trim().min(1).max(40),
  /** AISC type of the selected shape (W, HP, M, S, HSS, PIPE, built-up). */
  shapeType: z.string().trim().min(1).max(12),
  family: z.enum(columnFamilies),
  /** Depth d (I), Ht (rect HSS) or OD (round), mm. */
  d: pos,
  /** Flange width bf (I) or B (rect HSS); = d for round. */
  bf: pos,
  /** Flange thickness (I) or design wall thickness (HSS/pipe), mm. */
  tf: pos,
  /** Web thickness (I) or design wall thickness (HSS/pipe), mm. */
  tw: pos,
  fy: pos,
  source: z.string().max(120).default("AISC Shapes Database v16.0"),
  /** AISC database shape or a user-defined (custom) section. */
  sectionSource: z.enum(["database", "custom"]).default("database"),
  customType: z.enum(customColumnTypes).nullable().default(null),
});

export const basePlateProductSchema = z.object({
  name: z.string().trim().min(1).max(80),
  report: z.string().trim().min(1).max(60),
  category: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  kcCr: pos,
  kcUncr: pos,
  tauCr: nonneg,
  tauUncr: nonneg,
  npCr: nonneg.nullable(),
  npUncr: nonneg.nullable(),
  cac: pos.nullable(),
  cmin: pos.nullable(),
  smin: pos.nullable(),
});

export const basePlateLoadSchema = z.object({
  id: z.string().trim().min(1).max(30),
  pu: z.number().finite(),
  mx: z.number().finite(),
  my: z.number().finite(),
  vx: z.number().finite(),
  vy: z.number().finite(),
  /** Combination includes earthquake effect (ACI 17.10 when SDC ≥ C). */
  seismic: z.boolean().default(false),
  included: z.boolean().default(true),
});
export type BasePlateLoad = z.infer<typeof basePlateLoadSchema>;

export const concreteDesignCodes = ["ACI 318-19", "NSCP 2015"] as const;
export const steelDesignCodes = ["AISC 360-22", "NSCP 2015"] as const;
/** Drafts saved before engine 0.2.0 carry one `code`: map it to both codes. */
function migrateBasePlateInput(raw: unknown) {
  if (!raw || typeof raw !== "object") return raw;
  const r = raw as Record<string, unknown>;
  if (!("code" in r) || "concreteCode" in r) return raw;
  const { code, ...rest } = r;
  return {
    ...rest,
    concreteCode: code,
    steelCode: code === "NSCP 2015" ? "NSCP 2015" : "AISC 360-22",
  };
}
const basePlateInputObject = z
  .object({
    /** Concrete bearing and anchorage (ACI 318-19 Ch. 17). */
    concreteCode: z.enum(concreteDesignCodes).default("ACI 318-19"),
    /** Plate, weld and steel checks (AISC 360-22 + DG1). */
    steelCode: z.enum(steelDesignCodes).default("AISC 360-22"),
    /** AISC 360-22 B3: LRFD (φ) or ASD (Ω). Loads must match the method. */
    designMethod: z.enum(steelDesignMethods).default("LRFD"),
    /** ASD only: ASD demand × α for the ACI 318 anchor checks. */
    asdAlpha: z
      .number()
      .finite()
      .min(1.4)
      .max(2)
      .default(ASD_TO_STRENGTH_DEFAULT),
    /** Documentation only (as Slab / Column). */
    otherCodes: z.string().max(300).default(""),
    column: basePlateColumnSchema,
    rotation: z.union([z.literal(0), z.literal(90)]).default(0),
    plate: z.object({ bx: pos, by: pos, tp: pos, fy: pos }),
    pedestal: z.object({
      px: pos,
      py: pos,
      height: pos,
      fc: z.number().finite().min(10).max(103.4),
      /** f′c entered in psi (shared psi dropdown); null = typed MPa. */
      fcPsi: z.number().finite().nullable().default(null),
      lambdaA: z.number().finite().min(0.6).max(1),
      cracked: z.boolean(),
      condition: z.enum(["A", "B"]),
      cover: pos,
    }),
    grout: z.object({ thickness: nonneg }),
    anchors: z.object({
      kind: z.enum(
        anchorKinds.map((k) => k.id) as [AnchorKind, ...AnchorKind[]],
      ),
      specId: z.string().min(1).max(40),
      sizeId: z.string().min(1).max(20),
      da: pos,
      ase: pos,
      fy: pos,
      fu: pos,
      ductile: z.boolean(),
      layout: z.enum(["grid", "perimeter"]),
      nx: z.number().int().min(2).max(8),
      ny: z.number().int().min(2).max(8),
      sx: pos,
      sy: pos,
      hef: pos,
      hole: pos,
      holeSource: z.enum(["table", "custom"]),
      washer: z.object({ size: pos, thickness: pos }),
      /** Plate washers welded to the base plate (rods share shear). */
      weldedWashers: z.boolean(),
      torqued: z.boolean(),
      /** Hooked bolt: inside hook length eh, mm. */
      eh: pos,
      /** Bearing area override (embedded plate washer), mm²; 0 = heavy hex nut. */
      abrg: nonneg,
      /** Sustained share of tension (adhesive 17.5.2.2), 0–1. */
      sustained: z.number().finite().min(0).max(1),
      product: basePlateProductSchema.nullable(),
    }),
    shear: z.object({
      method: z.enum(["anchors", "friction", "lug"]),
      mu: z.number().finite().min(0.2).max(1),
      lug: z.object({
        orientation: z.enum(["x", "y", "cross"]),
        width: pos,
        thickness: pos,
        depth: pos,
        fy: pos,
      }),
    }),
    weld: z.object({ size: pos, fexx: pos }),
    seismic: z.object({
      sdc: z.enum(["A", "B", "C", "D", "E", "F"]),
      option: z.enum(["a", "d"]),
      stretchLength: nonneg,
    }),
    loads: z.array(basePlateLoadSchema).min(1).max(100),
  })
  .superRefine((i, ctx) => {
    const c = i.column;
    const solid = c.sectionSource === "custom" && c.customType === "solid";
    const bad = (message: string) =>
      ctx.addIssue({ code: "custom", path: ["column"], message });
    if (c.family === "I") {
      if (!(2 * c.tf < c.d))
        bad("Column: flange thickness tf must be less than d/2.");
      if (!(c.tw < c.bf)) bad("Column: web thickness tw must be less than bf.");
    } else if (c.family === "HSS-RECT") {
      const lim = Math.min(c.d, c.bf) / 2;
      if (solid ? c.tf > lim + 1e-9 : !(c.tf < lim))
        bad(
          "Column: wall thickness t must be less than half the smaller side.",
        );
    } else if (!(2 * c.tf < c.d))
      bad("Column: wall thickness t must be less than OD/2.");
  })
  .refine(
    (i) => new Set(i.loads.map((l) => l.id)).size === i.loads.length,
    "Load combination labels must be unique.",
  )
  .refine(
    (i) => i.pedestal.px >= i.plate.bx && i.pedestal.py >= i.plate.by,
    "The pedestal must be at least as large as the base plate in both directions.",
  )
  .refine(
    (i) =>
      (i.anchors.nx - 1) * i.anchors.sx < i.plate.bx &&
      (i.anchors.ny - 1) * i.anchors.sy < i.plate.by,
    "The anchor grid must lie inside the base plate.",
  )
  .refine(
    (i) => isCastIn(i.anchors.kind) || i.anchors.product !== null,
    "Post-installed anchors need a product record (ICC-ES ESR / ETA values).",
  );
export const basePlateInputSchema = z.preprocess(
  migrateBasePlateInput,
  basePlateInputObject,
);
export type BasePlateInput = z.infer<typeof basePlateInputObject>;

/** Column built from user-entered dimensions (custom section). */
export function basePlateCustomColumn(
  type: CustomColumnType,
  dims: { d: number; bf: number; tf: number; tw: number },
  fy: number,
  designation?: string,
): BasePlateInput["column"] {
  const t = customColumnTypeInfo[type];
  const r = (v: number) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : v);
  const d = dims.d;
  let { bf, tf, tw } = dims;
  if (type === "box") tw = tf;
  if (type === "tube") {
    bf = d;
    tw = tf;
  }
  if (type === "solid") {
    tf = Math.min(d, bf) / 2;
    tw = tf;
  }
  const auto =
    type === "built-up-I"
      ? `BU-I ${r(d)}×${r(bf)}×${r(tf)}×${r(tw)}`
      : type === "box"
        ? `BOX ${r(d)}×${r(bf)}×${r(tf)}`
        : type === "tube"
          ? `TUBE ${r(d)}×${r(tf)}`
          : `BAR ${r(d)}×${r(bf)}`;
  return {
    designation: (designation?.trim() || auto).slice(0, 40),
    shapeType: t.shapeType,
    family: t.family,
    d,
    bf,
    tf,
    tw,
    fy,
    source: "Custom (user input)",
    sectionSource: "custom",
    customType: type,
  };
}
/** Gross section properties of the column (mm², mm⁴, kg/m; steel 7850 kg/m³). */
export function basePlateColumnProperties(c: BasePlateInput["column"]) {
  let a: number, ix: number, iy: number;
  if (c.family === "I") {
    const h = c.d - 2 * c.tf;
    a = 2 * c.bf * c.tf + h * c.tw;
    ix = (c.bf * c.d ** 3 - (c.bf - c.tw) * h ** 3) / 12;
    iy = (2 * c.tf * c.bf ** 3 + h * c.tw ** 3) / 12;
  } else if (c.family === "HSS-RECT") {
    const hi = Math.max(0, c.d - 2 * c.tf),
      bi = Math.max(0, c.bf - 2 * c.tf);
    a = c.d * c.bf - hi * bi;
    ix = (c.bf * c.d ** 3 - bi * hi ** 3) / 12;
    iy = (c.d * c.bf ** 3 - hi * bi ** 3) / 12;
  } else {
    const di = Math.max(0, c.d - 2 * c.tf);
    a = (Math.PI / 4) * (c.d ** 2 - di ** 2);
    ix = iy = (Math.PI / 64) * (c.d ** 4 - di ** 4);
  }
  return { a, ix, iy, weight: (a * 7850) / 1e6 };
}

export const basePlateDraftSchema = z.object({
  kind: z.literal("base-plate"),
  version: z.literal(1),
  input: basePlateInputSchema,
  designPolicy: designCheckPolicySchema.optional(),
  remarks: designRemarksSchema.optional(),
  reviewCompleted: z.boolean().optional(),
});
export type BasePlateDraft = z.infer<typeof basePlateDraftSchema>;

/** Column snapshot for the engine from a shape-database record (AISC v16.0). */
export function basePlateColumnFromShape(
  rec: ShapeRecord,
  fy: number,
): BasePlateInput["column"] | null {
  const n = (k: string) => Number(rec[k]);
  const base = {
    designation: rec.name,
    shapeType: rec.type,
    fy,
    source: "AISC Shapes Database v16.0",
    sectionSource: "database" as const,
    customType: null,
  };
  if (rec.group === "I")
    return {
      ...base,
      family: "I",
      d: n("d"),
      bf: n("bf"),
      tf: n("tf"),
      tw: n("tw"),
    };
  if (rec.group === "HSS-RECT")
    return {
      ...base,
      family: "HSS-RECT",
      d: n("Ht"),
      bf: n("B"),
      tf: n("tdes"),
      tw: n("tdes"),
    };
  if (rec.group === "HSS-ROUND")
    return {
      ...base,
      family: "HSS-ROUND",
      d: n("OD"),
      bf: n("OD"),
      tf: n("tdes"),
      tw: n("tdes"),
    };
  return null;
}
/** Shape groups a base-plate column may use (DG1 m, n definitions). */
export const basePlateShapeGroups = ["I", "HSS-RECT", "HSS-ROUND"] as const;

/** Default new base plate (decision sheet defaults, W12x40 from the user's workbook). */
export function defaultBasePlateInput(): BasePlateInput {
  const da = 25.4;
  return {
    concreteCode: "ACI 318-19",
    steelCode: "AISC 360-22",
    designMethod: "LRFD",
    asdAlpha: ASD_TO_STRENGTH_DEFAULT,
    otherCodes: "",
    column: {
      designation: "W12X40",
      shapeType: "W",
      family: "I",
      d: 302.26,
      bf: 203.454,
      tf: 13.081,
      tw: 7.493,
      fy: 345,
      source: "AISC Shapes Database v16.0",
      sectionSource: "database",
      customType: null,
    },
    rotation: 0,
    plate: { bx: 450, by: 500, tp: 40, fy: 248 },
    pedestal: {
      px: 900,
      py: 950,
      height: 1000,
      fc: 27.6,
      fcPsi: 4000,
      lambdaA: 1,
      cracked: true,
      condition: "B",
      cover: 50,
    },
    grout: { thickness: 50 },
    anchors: {
      kind: "cast-in-headed-bolt",
      specId: "F1554-36",
      sizeId: "1 in",
      da,
      ase: 390.8,
      fy: 248.2,
      fu: 399.9,
      ductile: true,
      layout: "grid",
      nx: 2,
      ny: 2,
      sx: 340,
      sy: 390,
      hef: 450,
      hole: 46.0375,
      holeSource: "table",
      washer: { size: 76.2, thickness: 9.525 },
      weldedWashers: true,
      torqued: false,
      eh: 3 * da,
      abrg: 0,
      sustained: 0,
      product: null,
    },
    shear: {
      method: "anchors",
      mu: 0.55,
      lug: {
        orientation: "cross",
        width: 150,
        thickness: 25,
        depth: 100,
        fy: 248,
      },
    },
    weld: { size: 8, fexx: 482 },
    seismic: { sdc: "A", option: "d", stretchLength: 0 },
    loads: [
      {
        id: "LC1",
        pu: 900,
        mx: 0,
        my: 0,
        vx: 60,
        vy: 40,
        seismic: false,
        included: true,
      },
      {
        id: "LC2",
        pu: 400,
        mx: 60,
        my: 0,
        vx: 50,
        vy: 0,
        seismic: false,
        included: true,
      },
      {
        id: "LC3",
        pu: 150,
        mx: 70,
        my: 15,
        vx: 35,
        vy: 20,
        seismic: true,
        included: true,
      },
      {
        id: "LC4",
        pu: -80,
        mx: 20,
        my: 0,
        vx: 40,
        vy: 0,
        seismic: false,
        included: true,
      },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

export interface Rod extends AnchorPoint {
  id: string;
  /** Column (0..nx−1) and row (0..ny−1) index. */
  i: number;
  j: number;
}
export function basePlateRods(i: Pick<BasePlateInput, "anchors">): Rod[] {
  const a = i.anchors;
  const out: Rod[] = [];
  for (let j = 0; j < a.ny; j++)
    for (let k = 0; k < a.nx; k++) {
      if (
        a.layout === "perimeter" &&
        k > 0 &&
        k < a.nx - 1 &&
        j > 0 &&
        j < a.ny - 1
      )
        continue;
      out.push({
        id: `A${out.length + 1}`,
        i: k,
        j,
        x: -((a.nx - 1) * a.sx) / 2 + k * a.sx,
        y: -((a.ny - 1) * a.sy) / 2 + j * a.sy,
      });
    }
  return out;
}

/** Column outline dimensions along X and Y after rotation. */
export function basePlateColumnDims(
  i: Pick<BasePlateInput, "column" | "rotation">,
) {
  const c = i.column;
  const rot = i.rotation === 90;
  const alongY = rot ? c.bf : c.d,
    alongX = rot ? c.d : c.bf;
  // DG1 m/n factors: 0.95 on d (I) or both HSS sides; 0.80 on bf (I) and D (round).
  const k = (dim: "d" | "bf") =>
    c.family === "HSS-ROUND"
      ? 0.8
      : c.family === "HSS-RECT"
        ? 0.95
        : dim === "d"
          ? 0.95
          : 0.8;
  return {
    x: alongX,
    y: alongY,
    kx: k(rot ? "d" : "bf"),
    ky: k(rot ? "bf" : "d"),
    /** True when the flanges face ±Y (strong axis bending about X). */
    flangesFaceY: !rot,
  };
}

/** Rectangles (mm, plate coordinates) occupied by the column section. */
export function basePlateColumnRects(
  i: Pick<BasePlateInput, "column" | "rotation">,
) {
  const c = i.column;
  const rot = i.rotation === 90;
  const R = (w: number, h: number, cx = 0, cy = 0) => ({
    x0: cx - w / 2,
    x1: cx + w / 2,
    y0: cy - h / 2,
    y1: cy + h / 2,
  });
  if (c.family !== "I") return [rot ? R(c.d, c.bf) : R(c.bf, c.d)];
  const flange = (s: number) =>
    rot
      ? R(c.tf, c.bf, s * (c.d / 2 - c.tf / 2))
      : R(c.bf, c.tf, 0, s * (c.d / 2 - c.tf / 2));
  const web = rot ? R(c.d - 2 * c.tf, c.tw) : R(c.tw, c.d - 2 * c.tf);
  return [flange(-1), flange(1), web];
}

/* ------------------------------------------------------------------ */
/* Bearing and plate (AISC 360-22 J8, DG1 3rd Ed. Ch. 4)               */
/* ------------------------------------------------------------------ */

export interface BearingCapacity {
  a1: number;
  a2: number;
  ratio: number;
  /** Available bearing stress: φc fp,max (LRFD) or fp,max/Ωc (ASD), MPa. */
  fpMax: number;
  phiPp: number;
}
export function basePlateBearing(i: BasePlateInput): BearingCapacity {
  const a1 = i.plate.bx * i.plate.by;
  // Largest area geometrically similar to and concentric with A1 (J8).
  const s = Math.min(i.pedestal.px / i.plate.bx, i.pedestal.py / i.plate.by);
  const a2 = a1 * s * s;
  const ratio = Math.min(Math.sqrt(a2 / a1), 2);
  // J8-2 (≤ 1.7 f′c via √ ≤ 2) × φc (LRFD) or ÷ Ωc (ASD).
  const fpMax =
    designFactor(aiscFactors.bearing, i.designMethod) *
    0.85 *
    i.pedestal.fc *
    ratio;
  return { a1, a2, ratio, fpMax, phiPp: fpMax * a1 };
}

export type BearingCase =
  "axial" | "small" | "large" | "no-solution" | "uplift" | "biaxial-small";
export interface AxisAnalysis {
  axis: "x" | "y";
  /** Plate dimension along the axis (N) and across (B), mm. */
  n: number;
  b: number;
  m: number;
  nCant: number;
  e: number;
  ecrit: number;
  f: number;
  case: BearingCase;
  y: number;
  fp: number;
  tu: number;
  bearingDcr: number;
  /** Required thickness at the bearing and tension interfaces, mm. */
  tpBearing: number;
  tpTension: number;
  x: number;
  beff: number;
  /** Rods of the tension line. */
  tensionRods: string[];
  /** Resultant side: +1 compression on the + side. */
  sign: 1 | -1;
}

/** Plastic moment per unit width at the bearing interface (DG1 Eq. 4.3-x). */
export const bearingMpl = (fp: number, y: number, l: number) =>
  y >= l ? (fp * l * l) / 2 : fp * y * (l - y / 2);
/** Plate flexure factor: φb = 0.90 (LRFD) or 1/Ωb = 1/1.67 (ASD). */
const plateFactor = (i: Pick<BasePlateInput, "designMethod">) =>
  designFactor(aiscFactors.plateFlexure, i.designMethod);
/** tp,req = √(4 Mpl / (φb Fy)) or √(4 Mpl Ωb / Fy). */
const tpFromMpl = (mpl: number, fy: number, fb: number) =>
  Math.sqrt((4 * Math.max(mpl, 0)) / (fb * fy));

/** Union length of [p−x, p+x] intervals clipped to [−B/2, B/2] (45° spread). */
function effectiveWidth(positions: number[], x: number, b: number) {
  if (x <= 0) return b;
  const iv = positions
    .map((p) => [Math.max(-b / 2, p - x), Math.min(b / 2, p + x)] as const)
    .sort((a, c) => a[0] - c[0]);
  let total = 0,
    cur: [number, number] | null = null;
  for (const [a, c] of iv) {
    if (!cur || a > cur[1]) {
      if (cur) total += cur[1] - cur[0];
      cur = [a, c];
    } else cur[1] = Math.max(cur[1], c);
  }
  if (cur) total += cur[1] - cur[0];
  return Math.min(b, total);
}

/**
 * DG1 uniaxial analysis of one axis with the uniform bearing block.
 * axis "y": bending from Mx, plate length By. axis "x": from My, length Bx.
 */
export function dg1Axis(
  i: BasePlateInput,
  rods: Rod[],
  cap: BearingCapacity,
  axis: "x" | "y",
  pu: number,
  mu: number,
  lambdaNp: number,
): AxisAnalysis {
  const dims = basePlateColumnDims(i);
  const n = axis === "y" ? i.plate.by : i.plate.bx;
  const b = axis === "y" ? i.plate.bx : i.plate.by;
  const colAlong = axis === "y" ? dims.y : dims.x;
  const colAcross = axis === "y" ? dims.x : dims.y;
  const kAlong = axis === "y" ? dims.ky : dims.kx;
  const kAcross = axis === "y" ? dims.kx : dims.ky;
  const m = (n - kAlong * colAlong) / 2;
  const nCant = (b - kAcross * colAcross) / 2;
  const coord = (r: Rod) => (axis === "y" ? r.y : r.x);
  const across = (r: Rod) => (axis === "y" ? r.x : r.y);
  const sign: 1 | -1 = mu >= 0 ? 1 : -1;
  // Tension line: outermost rods on the side opposite the resultant.
  const ext =
    sign > 0 ? Math.min(...rods.map(coord)) : Math.max(...rods.map(coord));
  const line = rods.filter((r) => Math.abs(coord(r) - ext) < 1e-6);
  const f = Math.abs(ext);
  const qmax = cap.fpMax * b;
  const P = pu * 1e3,
    M = Math.abs(mu) * 1e6;
  const e = P > 0 ? M / P : Infinity;
  const ecrit = n / 2 - P / (2 * qmax);
  const fy = i.plate.fy;
  // Tension interface lever arm to the column face (I: flange centre, HSS: wall centre).
  const flangeAlong =
    i.column.family === "I" ? (axis === "y") === dims.flangesFaceY : true;
  const tFace =
    i.column.family === "I" ? (flangeAlong ? i.column.tf : 0) : i.column.tf;
  const x = f - colAlong / 2 + tFace / 2;
  const beff = effectiveWidth(line.map(across), x, b);
  const base = {
    axis,
    n,
    b,
    m,
    nCant,
    e,
    ecrit,
    f,
    x,
    beff,
    sign,
    tensionRods: [] as string[],
  };
  if (M === 0) {
    const fp = P / (b * n);
    const l = Math.max(m, nCant, lambdaNp);
    return {
      ...base,
      case: "axial",
      y: n,
      fp,
      tu: 0,
      bearingDcr: fp / cap.fpMax,
      tpBearing: tpFromMpl((fp * l * l) / 2, fy, plateFactor(i)),
      tpTension: 0,
    };
  }
  // DG1 4.3: bearing interface with l = max(m, n); Y < l uses fp Y (l − Y/2).
  const bendBearing = (fp: number, y: number) =>
    tpFromMpl(bearingMpl(fp, y, Math.max(m, nCant)), fy, plateFactor(i));
  if (e <= ecrit) {
    const y = n - 2 * e;
    const fp = P / (y * b);
    return {
      ...base,
      case: "small",
      y,
      fp,
      tu: 0,
      bearingDcr: fp / cap.fpMax,
      tpBearing: bendBearing(fp, y),
      tpTension: 0,
    };
  }
  const k = f + n / 2;
  const disc = k * k - (2 * P * (e + f)) / qmax;
  if (disc < 0)
    return {
      ...base,
      case: "no-solution",
      y: NaN,
      fp: cap.fpMax,
      tu: NaN,
      bearingDcr: Infinity,
      tpBearing: NaN,
      tpTension: NaN,
      tensionRods: line.map((r) => r.id),
    };
  const y = k - Math.sqrt(disc);
  const tu = qmax * y - P;
  const tpT = x > 0 ? tpFromMpl((tu * x) / beff, fy, plateFactor(i)) : 0;
  return {
    ...base,
    case: "large",
    y,
    fp: cap.fpMax,
    tu,
    bearingDcr: y / k,
    tpBearing: bendBearing(cap.fpMax, y),
    tpTension: tpT,
    tensionRods: line.map((r) => r.id),
  };
}

/** DG1 λn′ for axially loaded plates (cantilever within the column). */
export function dg1LambdaNp(
  i: BasePlateInput,
  pu: number,
  cap: BearingCapacity,
) {
  const c = i.column;
  const d = c.d,
    bf = c.bf;
  const X = Math.min(
    1,
    (((4 * d * bf) / (d + bf) ** 2) * (Math.max(pu, 0) * 1e3)) / cap.phiPp,
  );
  const lambda =
    X >= 1 ? 1 : Math.min(1, (2 * Math.sqrt(X)) / (1 + Math.sqrt(1 - X)));
  // √(d bf)/4 for I and rectangular HSS; D/4 for round sections (engine assumption).
  const np = c.family === "HSS-ROUND" ? d / 4 : Math.sqrt(d * bf) / 4;
  return { X, lambda, np, lambdaNp: lambda * np };
}

/* ------------------------------------------------------------------ */
/* Per-combination analysis                                            */
/* ------------------------------------------------------------------ */

export interface ComboResult {
  load: BasePlateLoad;
  case: BearingCase;
  method: string;
  ex: number;
  ey: number;
  /** Axis analyses (DG1); empty for uplift. */
  axes: AxisAnalysis[];
  bearingDcr: number;
  fp: number;
  lambdaNp: number;
  tpRequired: number;
  /** Rod tension, N (index matches rods). */
  rodTension: number[];
  rodShear: number[];
  shearRods: string[];
  vResultant: number;
  /** Anchor checks. */
  anchor: AnchorChecks;
  weld: {
    fN: number;
    fV: number;
    f: number;
    capacity: number;
    dcr: number;
    length: number;
  };
  friction: { capacity: number; dcr: number } | null;
  lug: LugCheck | null;
  seismicApplies: boolean;
}

export interface AnchorChecks {
  nuaMax: number;
  phiNsa: number;
  steelTensionDcr: number;
  vuaMax: number;
  phiVsa: number;
  steelShearDcr: number;
  breakout:
    | (ReturnType<typeof tensionBreakout> & {
        phi: number;
        nua: number;
        dcr: number;
        seismicFactor: number;
      })
    | null;
  pullout: { phiNpn: number; nua: number; dcr: number; basis: string } | null;
  sideFace: {
    edge: string;
    ca1: number;
    phiNsbg: number;
    nua: number;
    dcr: number;
  }[];
  bond:
    | (ReturnType<typeof bondStrength> & {
        phi: number;
        nua: number;
        dcr: number;
        sustainedDcr: number;
      })
    | null;
  shearBreakout: (ShearBreakout & { phi: number; vua: number; dcr: number })[];
  pryout: { kcp: number; phiVcpg: number; vua: number; dcr: number } | null;
  tensionRatio: number;
  shearRatio: number;
  interaction: { ratio: number; rule: string };
  ductility: { ratio: number; ok: boolean; detail: string } | null;
}

export interface LugCheck {
  direction: "x" | "y";
  vu: number;
  psiBrg: number;
  phiVbrg: number;
  bearingDcr: number;
  ca1: number;
  phiVcb: number;
  breakoutDcr: number;
  phiMn: number;
  mu: number;
  flexureDcr: number;
}

function anchorChecks(
  i: BasePlateInput,
  rods: Rod[],
  tension: number[],
  shear: number,
  vx: number,
  vy: number,
  pu: number,
  shearRodIds: string[],
  seismic: boolean,
): AnchorChecks {
  const a = i.anchors;
  const b: ConcreteBlock = {
    px: i.pedestal.px,
    py: i.pedestal.py,
    ha: i.pedestal.height,
    fc: i.pedestal.fc,
    lambdaA: i.pedestal.lambdaA,
    cracked: i.pedestal.cracked,
    condition: i.pedestal.condition,
  };
  const product = a.product as PostInstalledProduct | null;
  const phi = anchorPhi(a.kind, a.ductile, b.condition, product?.category ?? 1);
  const futa = futaUsed(a.fy, a.fu);
  const sf = seismic ? 0.75 : 1; // 17.10.5.4 concrete-governed tension in E combinations
  const nsa = steelTension(a.ase, futa);
  const vsa = steelShear(a.ase, futa, a.kind, i.grout.thickness > 0);
  const nuaMax = Math.max(0, ...tension);
  const nShear = shearRodIds.length;
  const vuaMax =
    nShear > 0 && i.shear.method === "anchors" ? shear / nShear : 0;
  const abrg = a.abrg > 0 ? a.abrg : heavyHexBearingArea(a.da);
  const cac = defaultCac(a.kind, a.hef);
  const tensioned = rods
    .map((r, k) => ({ r, t: tension[k]! }))
    .filter((x) => x.t > 1e-6);
  let breakout: AnchorChecks["breakout"] = null;
  let pull: AnchorChecks["pullout"] = null;
  let bond: AnchorChecks["bond"] = null;
  const side: AnchorChecks["sideFace"] = [];
  if (tensioned.length) {
    const pts = tensioned.map((x) => x.r),
      fs = tensioned.map((x) => x.t),
      nua = fs.reduce((s, f) => s + f, 0);
    const tb = tensionBreakout(pts, fs, a.hef, b, a.kind, product, cac);
    breakout = {
      ...tb,
      phi: phi.concreteTension,
      nua,
      seismicFactor: sf,
      dcr: nua / (phi.concreteTension * sf * tb.ncbg),
    };
    const p = pullout(a.kind, a.da, abrg, a.eh, b, product);
    if (p)
      pull = {
        phiNpn: phi.pullout * sf * p.npn,
        nua: nuaMax,
        dcr: nuaMax / (phi.pullout * sf * p.npn),
        basis: p.basis,
      };
    for (const edge of ["west", "east", "south", "north"] as const) {
      const d = (r: Rod) => edgeDistances(r, b)[edge];
      const c = Math.min(...pts.map(d));
      const row = tensioned.filter((x) => Math.abs(d(x.r) - c) < 1e-6);
      const s = sideFaceBlowout(
        row.map((x) => x.r),
        row.map((x) => x.t),
        edge,
        a.hef,
        abrg,
        b,
        a.kind,
      );
      if (s) {
        const cap = phi.sideFace * sf * s.nsbg;
        side.push({
          edge,
          ca1: s.ca1,
          phiNsbg: cap,
          nua: s.nua,
          dcr: s.nua / cap,
        });
      }
    }
    if (a.kind === "adhesive" && product) {
      const bs = bondStrength(pts, fs, a.da, a.hef, b, product);
      const cap = phi.pullout * sf * bs.nag;
      const sustained = (a.sustained * nuaMax) / (0.55 * phi.pullout * bs.nba);
      bond = {
        ...bs,
        phi: phi.pullout,
        nua,
        dcr: nua / cap,
        sustainedDcr: sustained,
      };
    }
  }
  // Shear breakout: ACI 17.7.2.1(b) – welded washers: full V on the farthest row; else front row.
  const sb: AnchorChecks["shearBreakout"] = [];
  const shearPts = rods.filter((r) => shearRodIds.includes(r.id));
  if (i.shear.method === "anchors" && shearPts.length) {
    const row = a.weldedWashers ? "back" : "front";
    const add = (edge: "west" | "east" | "south" | "north", v: number) => {
      if (v <= 0) return;
      const s = shearBreakout(shearPts, edge, row, a.hef, a.da, b, a.kind);
      const cap = phi.concreteShear * s.vcbg;
      sb.push({ ...s, phi: phi.concreteShear, vua: v, dcr: v / cap });
    };
    add(vx >= 0 ? "east" : "west", Math.abs(vx) * 1e3);
    add(vy >= 0 ? "north" : "south", Math.abs(vy) * 1e3);
  }
  // Pryout 17.7.3 with all shear anchors, concentric (ψec = 1).
  let pry: AnchorChecks["pryout"] = null;
  if (i.shear.method === "anchors" && shearPts.length && shear > 0) {
    const eq = shearPts.map(() => 1);
    let ncp = tensionBreakout(
      shearPts,
      eq,
      a.hef,
      b,
      a.kind,
      product,
      cac,
    ).ncbg;
    if (a.kind === "adhesive" && product)
      ncp = Math.min(
        ncp,
        bondStrength(shearPts, eq, a.da, a.hef, b, product).nag,
      );
    const p = pryout(ncp, a.hef);
    pry = {
      kcp: p.kcp,
      phiVcpg: phi.pryout * p.vcpg,
      vua: shear,
      dcr: shear / (phi.pryout * p.vcpg),
    };
  }
  const steelTensionDcr = nuaMax / (phi.steelTension * nsa);
  const steelShearDcr = vuaMax / (phi.steelShear * vsa);
  const tensionRatio = Math.max(
    steelTensionDcr,
    breakout?.dcr ?? 0,
    pull?.dcr ?? 0,
    bond?.dcr ?? 0,
    ...side.map((s) => s.dcr),
  );
  const shearRatio = Math.max(
    steelShearDcr,
    ...sb.map((s) => s.dcr),
    pry?.dcr ?? 0,
  );
  // 17.10.5.3(a): ductile steel must govern in E combinations (SDC ≥ C).
  let ductility: AnchorChecks["ductility"] = null;
  if (seismic && i.seismic.option === "a" && tensioned.length && breakout) {
    const nsaGroup = nsa * tensioned.length;
    const concrete = Math.min(
      0.75 * breakout.ncbg,
      pull
        ? ((0.75 * pull.phiNpn) / (phi.pullout * sf)) * tensioned.length
        : Infinity,
      bond ? 0.75 * bond.nag : Infinity,
    );
    const ratio = (1.2 * nsaGroup) / concrete;
    const stretch = i.seismic.stretchLength >= 8 * a.da;
    ductility = {
      ratio: a.ductile && stretch ? ratio : Infinity,
      ok: a.ductile && stretch && ratio <= 1,
      detail: `1.2 Nsa,group ${((1.2 * nsaGroup) / 1e3).toFixed(1)} kN vs 0.75 × concrete ${(concrete / 1e3).toFixed(1)} kN; ductile steel ${a.ductile ? "yes" : "no"}; stretch length ${i.seismic.stretchLength.toFixed(0)} mm (≥ 8da = ${(8 * a.da).toFixed(0)} mm).`,
    };
  }
  void pu;
  return {
    nuaMax,
    phiNsa: phi.steelTension * nsa,
    steelTensionDcr,
    vuaMax,
    phiVsa: phi.steelShear * vsa,
    steelShearDcr,
    breakout,
    pullout: pull,
    sideFace: side,
    bond,
    shearBreakout: sb,
    pryout: pry,
    tensionRatio,
    shearRatio,
    interaction: interaction(tensionRatio, shearRatio),
    ductility,
  };
}

/** Weld lines of the column outline (centreline segments) for the weld group. */
function weldGroup(i: BasePlateInput) {
  const c = i.column;
  const segs: [number, number, number, number][] = [];
  const add = (x0: number, y0: number, x1: number, y1: number) =>
    segs.push([x0, y0, x1, y1]);
  if (c.family === "HSS-ROUND") {
    const r = c.d / 2,
      n = 48;
    for (let k = 0; k < n; k++) {
      const a0 = (2 * Math.PI * k) / n,
        a1 = (2 * Math.PI * (k + 1)) / n;
      add(
        r * Math.cos(a0),
        r * Math.sin(a0),
        r * Math.cos(a1),
        r * Math.sin(a1),
      );
    }
  } else {
    for (const rc of basePlateColumnRects(i)) {
      add(rc.x0, rc.y0, rc.x1, rc.y0);
      add(rc.x1, rc.y0, rc.x1, rc.y1);
      add(rc.x1, rc.y1, rc.x0, rc.y1);
      add(rc.x0, rc.y1, rc.x0, rc.y0);
    }
  }
  let L = 0,
    ix = 0,
    iy = 0,
    xm = 0,
    ym = 0;
  for (const [x0, y0, x1, y1] of segs) {
    const l = Math.hypot(x1 - x0, y1 - y0);
    L += l;
    // Line element second moments about the plate centre.
    ix += (l * (y0 * y0 + y0 * y1 + y1 * y1)) / 3;
    iy += (l * (x0 * x0 + x0 * x1 + x1 * x1)) / 3;
    xm = Math.max(xm, Math.abs(x0), Math.abs(x1));
    ym = Math.max(ym, Math.abs(y0), Math.abs(y1));
  }
  return { L, ix, iy, xm, ym };
}

function lugCheck(
  i: BasePlateInput,
  dir: "x" | "y",
  v: number,
  pu: number,
  nTension: number,
  /** ASD: ACI bearing / breakout use α × demand (1 for LRFD). */
  alpha = 1,
): LugCheck {
  const l = i.shear.lug,
    p = i.pedestal;
  const aef = l.width * l.depth;
  const nsa = steelTension(i.anchors.ase, futaUsed(i.anchors.fy, i.anchors.fu));
  // 17.11.2.1: ψbrg,sl
  const psiBrg =
    pu >= 0
      ? Math.min(2, 1 + (4 * pu * 1e3) / (i.plate.bx * i.plate.by * p.fc))
      : Math.min(
          1,
          Math.max(0, 1 + (pu * 1e3) / (Math.max(nTension, 1) * nsa)),
        );
  const phiVbrg = 0.65 * 1.7 * p.fc * aef * psiBrg;
  // 17.11.3: breakout from the bearing face (Vb upper-bound expression, verify).
  const half = dir === "x" ? p.px / 2 : p.py / 2;
  const across = dir === "x" ? p.py : p.px;
  const ca1 = half - l.thickness / 2;
  const c2 = (across - l.width) / 2;
  const c15 = 1.5 * ca1;
  const avc =
    (l.width + 2 * Math.min(c2, c15)) * Math.min(p.height, l.depth + c15) - aef;
  const avco = 4.5 * ca1 * ca1;
  const psiEd = c2 >= c15 ? 1 : 0.7 + (0.3 * c2) / c15;
  const vb = 3.7 * p.lambdaA * Math.sqrt(Math.min(p.fc, 70)) * ca1 ** 1.5;
  const phiVcb = 0.7 * (avc / avco) * psiEd * (p.cracked ? 1 : 1.4) * vb;
  // Lug cantilever: load at mid-embedment below the grout.
  const mu = v * (i.grout.thickness + l.depth / 2);
  const phiMn = plateFactor(i) * l.fy * ((l.width * l.thickness ** 2) / 4);
  return {
    direction: dir,
    vu: v,
    psiBrg,
    phiVbrg,
    bearingDcr: (alpha * v) / phiVbrg,
    ca1,
    phiVcb,
    breakoutDcr: (alpha * v) / phiVcb,
    phiMn,
    mu,
    flexureDcr: mu / phiMn,
  };
}

export interface BasePlateResult {
  engine: string;
  /** Design method and the strength factors applied. */
  method: {
    name: SteelDesignMethod;
    /** Anchor-demand multiplier (ASD α; 1 for LRFD). */
    anchorDemandFactor: number;
    bearing: number;
    plate: number;
    weld: number;
    friction: number;
  };
  rods: Rod[];
  bearing: BearingCapacity;
  combos: ComboResult[];
  geometry: GeometryResult;
  governing: {
    tp: { value: number; combo: string };
  };
  notes: string[];
}

export interface GeometryResult {
  plateFits: boolean;
  clashes: string[];
  minHoleEdgeClear: number;
  holeEdgeRequired: number;
  minPedestalEdge: number;
  minSpacing: number;
  limits: ReturnType<typeof minimumGeometry>;
  memberThicknessOk: boolean;
  memberThicknessDetail: string;
  rodCount: number;
  table14_2Hole: number | null;
}

export function basePlateGeometry(
  i: BasePlateInput,
  rods: Rod[],
  tableHole: number | null,
): GeometryResult {
  const a = i.anchors;
  const dims = basePlateColumnDims(i);
  const rects = basePlateColumnRects(i);
  const clear = a.hole / 2 + i.weld.size;
  const clashes = rods
    .filter((r) => {
      if (i.column.family === "HSS-ROUND")
        return Math.hypot(r.x, r.y) < i.column.d / 2 + clear;
      return (
        rects.some(
          (rc) =>
            r.x > rc.x0 - clear &&
            r.x < rc.x1 + clear &&
            r.y > rc.y0 - clear &&
            r.y < rc.y1 + clear,
        ) ||
        (i.column.family === "HSS-RECT" &&
          Math.abs(r.x) < dims.x / 2 &&
          Math.abs(r.y) < dims.y / 2)
      );
    })
    .map((r) => r.id);
  const minHoleEdgeClear = Math.min(
    ...rods.map(
      (r) =>
        Math.min(
          i.plate.bx / 2 - Math.abs(r.x),
          i.plate.by / 2 - Math.abs(r.y),
        ) -
        a.hole / 2,
    ),
  );
  const b = { px: i.pedestal.px, py: i.pedestal.py } as ConcreteBlock;
  const minPedestalEdge = Math.min(
    ...rods.flatMap((r) => Object.values(edgeDistances(r, b))),
  );
  const minSpacing = Math.min(a.sx, a.sy);
  const limits = minimumGeometry(
    a.kind,
    a.da,
    a.torqued,
    i.pedestal.cover,
    a.product as PostInstalledProduct | null,
  );
  const ha = i.pedestal.height;
  const memberThicknessOk = isCastIn(a.kind)
    ? a.hef + 50 <= ha
    : a.hef <= Math.max((2 / 3) * ha, ha - 100);
  return {
    plateFits: i.plate.bx > dims.x && i.plate.by > dims.y,
    clashes,
    minHoleEdgeClear,
    holeEdgeRequired: 12.7,
    minPedestalEdge,
    minSpacing,
    limits,
    memberThicknessOk,
    memberThicknessDetail: isCastIn(a.kind)
      ? `hef ${a.hef.toFixed(0)} + 50 mm ≤ ha ${ha.toFixed(0)} mm (head below the bottom cover; engine check)`
      : `hef ${a.hef.toFixed(0)} ≤ max(2/3 ha, ha − 100) = ${Math.max((2 / 3) * ha, ha - 100).toFixed(0)} mm (17.9.4)`,
    rodCount: rods.length,
    table14_2Hole: tableHole,
  };
}

/** Full analysis of all included combinations. */
export function analyzeBasePlate(
  raw: BasePlateInput,
  tableHole: number | null = null,
): BasePlateResult {
  const i = basePlateInputSchema.parse(raw);
  const rods = basePlateRods(i);
  const cap = basePlateBearing(i);
  const notes: string[] = [];
  const nRods = rods.length;
  const sumX2 = rods.reduce((s, r) => s + r.x * r.x, 0),
    sumY2 = rods.reduce((s, r) => s + r.y * r.y, 0);
  const shearRodIds =
    i.anchors.weldedWashers || rods.length < 2
      ? rods.map((r) => r.id)
      : rods.filter((_, k) => k % 2 === 0).map((r) => r.id);
  const wg = weldGroup(i);
  // J2.4: φRn (LRFD) or Rn/Ω (ASD) per unit length, N/mm.
  const phiRw =
    designFactor(aiscFactors.weld, i.designMethod) *
    0.6 *
    i.weld.fexx *
    0.7071 *
    i.weld.size;
  // ACI 318 has no ASD: anchor checks use α × ASD demand vs φRn.
  const alpha = i.designMethod === "ASD" ? i.asdAlpha : 1;
  const seismicSdc = ["C", "D", "E", "F"].includes(i.seismic.sdc);
  const combos: ComboResult[] = [];
  for (const load of i.loads.filter((l) => l.included)) {
    const P = load.pu;
    const tension = rods.map(() => 0);
    let axes: AxisAnalysis[] = [];
    let kase: BearingCase;
    let method: string;
    let bearingDcr = 0,
      fp = 0,
      tp = 0;
    const lam = dg1LambdaNp(i, P, cap);
    const ex = P > 0 ? (load.my * 1e6) / (P * 1e3) : 0;
    const ey = P > 0 ? (load.mx * 1e6) / (P * 1e3) : 0;
    if (P <= 0) {
      kase = "uplift";
      method =
        "Net uplift: elastic rod group, plate inactive in bearing (conservative)";
      for (let k = 0; k < nRods; k++) {
        const r = rods[k]!;
        const t =
          (-P * 1e3) / nRods -
          (sumY2 > 0 ? (load.mx * 1e6 * r.y) / sumY2 : 0) -
          (sumX2 > 0 ? (load.my * 1e6 * r.x) / sumX2 : 0);
        tension[k] = Math.max(0, t);
      }
      // Plate bending from the rods of each outer line about the column face.
      for (const axis of ["x", "y"] as const) {
        const a = dg1Axis(
          i,
          rods,
          cap,
          axis,
          0,
          axis === "y" ? load.mx || 1e-9 : load.my || 1e-9,
          0,
        );
        for (const side of [1, -1]) {
          const coord = (r: Rod) => (axis === "y" ? r.y : r.x);
          const ext =
            side > 0
              ? Math.max(...rods.map(coord))
              : Math.min(...rods.map(coord));
          const idx = rods
            .map((r, k) => (Math.abs(coord(r) - ext) < 1e-6 ? k : -1))
            .filter((k) => k >= 0);
          const t = idx.reduce((s, k) => s + tension[k]!, 0);
          const beff = effectiveWidth(
            idx.map((k) => (axis === "y" ? rods[k]!.x : rods[k]!.y)),
            a.x,
            a.b,
          );
          if (a.x > 0 && t > 0)
            tp = Math.max(
              tp,
              tpFromMpl((t * a.x) / beff, i.plate.fy, plateFactor(i)),
            );
        }
        axes.push({
          ...a,
          case: "uplift",
          tu: 0,
          fp: 0,
          bearingDcr: 0,
          tpBearing: 0,
          tpTension: tp,
        });
      }
    } else {
      const hasX = Math.abs(load.my) > 1e-9,
        hasY = Math.abs(load.mx) > 1e-9;
      if (hasX && hasY) {
        // Biaxial small eccentricity: effective (Meyerhof) bearing area, rods inactive.
        const yx = i.plate.bx - 2 * Math.abs(ex),
          yy = i.plate.by - 2 * Math.abs(ey);
        const fpe = yx > 0 && yy > 0 ? (P * 1e3) / (yx * yy) : Infinity;
        if (fpe <= cap.fpMax) {
          kase = "biaxial-small";
          method =
            "Biaxial, small eccentricity: uniform bearing on Bx−2ex by By−2ey (DG1)";
          fp = fpe;
          bearingDcr = fpe / cap.fpMax;
          const ax = dg1Axis(i, rods, cap, "x", P, load.my, 0),
            ay = dg1Axis(i, rods, cap, "y", P, load.mx, 0);
          const bend = (a: AxisAnalysis, y: number) =>
            tpFromMpl(
              bearingMpl(fpe, y, Math.max(a.m, a.nCant)),
              i.plate.fy,
              plateFactor(i),
            );
          axes = [
            {
              ...ax,
              case: "biaxial-small",
              y: yx,
              fp: fpe,
              tu: 0,
              bearingDcr,
              tpBearing: bend(ax, yx),
              tpTension: 0,
              tensionRods: [],
            },
            {
              ...ay,
              case: "biaxial-small",
              y: yy,
              fp: fpe,
              tu: 0,
              bearingDcr,
              tpBearing: bend(ay, yy),
              tpTension: 0,
              tensionRods: [],
            },
          ];
          tp = Math.max(axes[0]!.tpBearing, axes[1]!.tpBearing);
        } else {
          kase = "large";
          method =
            "Biaxial, large eccentricity: DG1 per axis with full Pu, rod tensions superposed (conservative)";
          axes = [
            dg1Axis(i, rods, cap, "x", P, load.my, 0),
            dg1Axis(i, rods, cap, "y", P, load.mx, 0),
          ];
        }
      } else {
        const axis = hasX ? "x" : "y";
        const a = dg1Axis(
          i,
          rods,
          cap,
          axis,
          P,
          hasX ? load.my : load.mx,
          lam.lambdaNp,
        );
        axes = [a];
        kase = a.case;
        method =
          a.case === "axial"
            ? "Axial compression: DG1 cantilevers m, n, λn′"
            : a.case === "small"
              ? `Small moment (e ≤ ecrit) about ${axis === "y" ? "X" : "Y"}: uniform bearing Y = N − 2e`
              : `Large moment (e > ecrit) about ${axis === "y" ? "X" : "Y"}: uniform bearing at fp,max + rod tension`;
      }
      if (kase !== "biaxial-small") {
        for (const a of axes) {
          if (a.case === "large" || a.case === "no-solution") {
            const per = a.tu / Math.max(a.tensionRods.length, 1);
            for (const id of a.tensionRods) {
              const k = rods.findIndex((r) => r.id === id);
              tension[k] =
                tension[k]! + (Number.isFinite(per) ? per : Infinity);
            }
          }
        }
        bearingDcr = Math.max(...axes.map((a) => a.bearingDcr));
        fp = Math.max(...axes.map((a) => a.fp));
        tp = Math.max(...axes.map((a) => Math.max(a.tpBearing, a.tpTension)));
        if (axes.some((a) => a.case === "no-solution")) {
          kase = "no-solution";
          tp = Infinity;
        }
      }
    }
    const vRes = Math.hypot(load.vx, load.vy) * 1e3;
    const seismicApplies = seismicSdc && load.seismic;
    // Friction (DG1): φ = 0.75, μ Pu, compression only; not relied on for E combinations.
    let friction: ComboResult["friction"] = null;
    if (i.shear.method === "friction") {
      const capF =
        P > 0 && !seismicApplies
          ? designFactor(aiscFactors.friction, i.designMethod) *
            i.shear.mu *
            P *
            1e3
          : 0;
      friction = {
        capacity: capF,
        dcr: vRes === 0 ? 0 : capF > 0 ? vRes / capF : Infinity,
      };
    }
    let lug: LugCheck | null = null;
    if (i.shear.method === "lug") {
      const nT = tension.filter((t) => t > 0).length;
      const o = i.shear.lug.orientation;
      const cx =
        o !== "y"
          ? lugCheck(i, "x", Math.abs(load.vx) * 1e3, P * alpha, nT, alpha)
          : null;
      const cy =
        o !== "x"
          ? lugCheck(i, "y", Math.abs(load.vy) * 1e3, P * alpha, nT, alpha)
          : null;
      const dcr = (c: LugCheck | null) =>
        c ? Math.max(c.bearingDcr, c.breakoutDcr, c.flexureDcr) : -1;
      lug = dcr(cx) >= dcr(cy) ? cx : cy;
      // A single plate lug cannot resist the perpendicular component.
      if (o === "x" && Math.abs(load.vy) > 0)
        lug = { ...(lug as LugCheck), bearingDcr: Infinity };
      if (o === "y" && Math.abs(load.vx) > 0)
        lug = { ...(lug as LugCheck), bearingDcr: Infinity };
    }
    // ACI 318 anchor checks: strength-level demand (ASD × α).
    const anchor = anchorChecks(
      i,
      rods,
      tension.map((t) => t * alpha),
      vRes * alpha,
      load.vx * alpha,
      load.vy * alpha,
      P * alpha,
      shearRodIds,
      seismicApplies,
    );
    const rodShear = rods.map((r) =>
      i.shear.method === "anchors" && shearRodIds.includes(r.id)
        ? vRes / shearRodIds.length
        : 0,
    );
    // Column weld (J2.4): tension from uplift/moment and shear, elastic line weld group.
    const fN = Math.max(
      0,
      (-P * 1e3) / wg.L +
        (Math.abs(load.mx) * 1e6 * wg.ym) / wg.ix +
        (Math.abs(load.my) * 1e6 * wg.xm) / wg.iy,
    );
    const fV = vRes / wg.L;
    const fw = Math.hypot(fN, fV);
    combos.push({
      load,
      case: kase,
      method,
      ex,
      ey,
      axes,
      bearingDcr,
      fp,
      lambdaNp: lam.lambdaNp,
      tpRequired: tp,
      rodTension: tension,
      rodShear,
      shearRods: shearRodIds,
      vResultant: vRes,
      anchor,
      weld: { fN, fV, f: fw, capacity: phiRw, dcr: fw / phiRw, length: wg.L },
      friction,
      lug,
      seismicApplies,
    });
  }
  const gov = combos.reduce(
    (g, c) =>
      c.tpRequired > g.value ? { value: c.tpRequired, combo: c.load.id } : g,
    { value: 0, combo: combos[0]?.load.id ?? "" },
  );
  if (i.concreteCode === "NSCP 2015" || i.steelCode === "NSCP 2015")
    notes.push(
      "NSCP 2015 recorded as project standard; calculated per AISC 360-22 / DG1 3rd Ed. / ACI 318-19.",
    );
  if (rods.length < 4)
    notes.push(
      "Fewer than 4 anchor rods: OSHA 29 CFR 1926.755 requires at least 4 for erection.",
    );
  if (seismicSdc && i.seismic.option === "d")
    notes.push(
      "ACI 17.10.5.3(d) / 17.10.6.3(c): E combinations must include the overstrength factor Ω0 (designer-declared).",
    );
  if (seismicSdc)
    notes.push(
      "SDC C–F: AISC 341-22 D2.6 column-base required strengths are not calculated; enter base reactions that already satisfy AISC 341 (e.g. Ω0 or expected-strength demands). ACI 318-19 17.10 is applied to E combinations.",
    );
  if (i.shear.method === "friction" && combos.some((c) => c.seismicApplies))
    notes.push(
      "Friction is not relied on in earthquake combinations; use anchor rods or a shear lug.",
    );
  if (!i.anchors.weldedWashers)
    notes.push(
      "No welded plate washers: half of the rods assumed to resist shear and breakout checked from the front row (DG1; ACI R17.7.2.1).",
    );
  if (i.designMethod === "ASD")
    notes.push(
      `ASD (AISC 360-22 B3.2): loads are ASD combinations; steel checks use Rn/Ω (Ωc ${aiscFactors.bearing.omega}, Ωb ${aiscFactors.plateFlexure.omega}, Ωw ${aiscFactors.weld.omega}). ACI 318-19 anchor checks have no ASD: demand = ${alpha} × ASD demand vs φRn.`,
    );
  if (i.concreteCode !== i.steelCode.replace("AISC 360-22", "ACI 318-19"))
    notes.push(
      "Concrete and steel primary design codes differ (one is NSCP 2015); confirm the project's code basis.",
    );
  return {
    engine: BASE_PLATE_ENGINE,
    method: {
      name: i.designMethod,
      anchorDemandFactor: alpha,
      bearing: designFactor(aiscFactors.bearing, i.designMethod),
      plate: plateFactor(i),
      weld: designFactor(aiscFactors.weld, i.designMethod),
      friction: designFactor(aiscFactors.friction, i.designMethod),
    },
    rods,
    bearing: cap,
    combos,
    geometry: basePlateGeometry(i, rods, tableHole),
    governing: { tp: gov },
    notes,
  };
}

/* ------------------------------------------------------------------ */
/* Sizing assistant (suggestions only)                                 */
/* ------------------------------------------------------------------ */

export const standardPlateThicknesses = [
  10, 12, 16, 20, 22, 25, 28, 32, 36, 40, 45, 50, 56, 63, 70, 75, 80, 90, 100,
  110, 125, 150,
];
export function suggestPlateThickness(required: number) {
  return standardPlateThicknesses.find((t) => t >= required - 1e-9) ?? null;
}

/* ------------------------------------------------------------------ */
/* Design review checks                                                */
/* ------------------------------------------------------------------ */

const kN = (n: number) => (n / 1e3).toFixed(1);
function governing<T>(
  combos: ComboResult[],
  pick: (c: ComboResult) => T | null | undefined,
  dcr: (t: T) => number,
) {
  let best: { c: ComboResult; t: T; dcr: number } | null = null;
  for (const c of combos) {
    const t = pick(c);
    if (t === null || t === undefined) continue;
    const d = dcr(t);
    if (!best || d > best.dcr || (Number.isNaN(best.dcr) && !Number.isNaN(d)))
      best = { c, t, dcr: d };
  }
  return best;
}

/** One row per check (governing combination), with the clause basis. */
export function basePlateDesignChecks(
  i: BasePlateInput,
  r: BasePlateResult,
): DesignCheck[] {
  const out: DesignCheck[] = [];
  const cs = r.combos;
  const g = r.geometry;
  const push = (c: DesignCheck) => out.push(c);
  const b = governing(
    cs,
    (c) => c,
    (c) => c.bearingDcr,
  );
  if (b)
    push({
      id: "bearing",
      label: "Concrete Bearing",
      dcr: b.dcr,
      clause: basePlateClauses.bearing(),
      detail: `${b.c.load.id}: ${b.c.method}. fp ${b.c.fp.toFixed(2)} MPa vs ${i.designMethod === "LRFD" ? "φc fp,max" : "fp,max/Ωc"} ${r.bearing.fpMax.toFixed(2)} MPa (${i.designMethod}) (√(A2/A1) = ${r.bearing.ratio.toFixed(3)}).${b.c.case === "large" ? " Large moment: DCR = Y/(f + N/2) (bearing solution margin)." : ""}${b.c.case === "no-solution" ? " No real solution for Y: increase plate size or rod lever arm." : ""}`,
    });
  const t = governing(
    cs,
    (c) => c,
    (c) => c.tpRequired,
  );
  if (t)
    push({
      id: "plate",
      label: "Base Plate Thickness",
      dcr: t.dcr / i.plate.tp,
      clause: basePlateClauses.plate(),
      detail: `${t.c.load.id}: tp,req ${Number.isFinite(t.dcr) ? t.dcr.toFixed(1) : "—"} mm vs tp ${i.plate.tp.toFixed(1)} mm (Fy ${i.plate.fy} MPa, ${i.designMethod === "LRFD" ? "φb 0.90" : "Ωb 1.67"}). Suggested ${suggestPlateThickness(t.dcr) ?? "—"} mm.`,
    });
  const w = governing(
    cs,
    (c) => c.weld,
    (x) => x.dcr,
  );
  if (w)
    push({
      id: "weld",
      label: "Column-to-Plate Fillet Weld",
      dcr: w.dcr,
      clause: basePlateClauses.weld(),
      detail: `${w.c.load.id}: f = √(fN² + fV²) = ${w.t.f.toFixed(0)} N/mm vs ${i.designMethod === "LRFD" ? "φRn" : "Rn/Ω"} ${w.t.capacity.toFixed(0)} N/mm (${i.weld.size} mm E${(i.weld.fexx / 6.895).toFixed(0)}, all-around length ${w.t.length.toFixed(0)} mm, compression by bearing).`,
    });
  const st = governing(
    cs,
    (c) => c.anchor,
    (a) => a.steelTensionDcr,
  );
  if (st)
    push({
      id: "rod-tension",
      label: "Anchor Steel Tension",
      dcr: st.dcr,
      clause: basePlateClauses.steelTension(),
      detail: `${st.c.load.id}: Nua ${kN(st.t.nuaMax)} kN/rod vs φNsa ${kN(st.t.phiNsa)} kN.`,
    });
  if (i.shear.method === "anchors") {
    const ss = governing(
      cs,
      (c) => c.anchor,
      (a) => a.steelShearDcr,
    );
    if (ss)
      push({
        id: "rod-shear",
        label: "Anchor Steel Shear",
        dcr: ss.dcr,
        clause: basePlateClauses.steelShear(),
        detail: `${ss.c.load.id}: Vua ${kN(ss.t.vuaMax)} kN/rod over ${ss.c.shearRods.length} rods vs φVsa ${kN(ss.t.phiVsa)} kN.`,
      });
  }
  const bt = governing(
    cs,
    (c) => c.anchor.breakout,
    (x) => x.dcr,
  );
  push({
    id: "breakout-tension",
    label: "Concrete Breakout – Tension",
    dcr: bt ? bt.dcr : 0,
    clause: basePlateClauses.breakoutTension(),
    detail: bt
      ? `${bt.c.load.id}: Nua ${kN(bt.t.nua)} kN vs φNcbg ${kN(bt.t.phi * bt.t.seismicFactor * bt.t.ncbg)} kN (h′ef ${bt.t.hefUsed.toFixed(0)} mm, ANc/ANco ${(bt.t.anc / bt.t.anco).toFixed(2)}, ψec ${bt.t.psiEc.toFixed(3)}, ψed ${bt.t.psiEd.toFixed(3)}, ψc ${bt.t.psiC.toFixed(2)}, ψcp ${bt.t.psiCp.toFixed(2)}, φ ${bt.t.phi}${bt.t.seismicFactor < 1 ? ", ×0.75 seismic" : ""}).`
      : "No anchor tension in any combination.",
  });
  if (i.anchors.kind !== "adhesive") {
    const po = governing(
      cs,
      (c) => c.anchor.pullout,
      (x) => x.dcr,
    );
    push({
      id: "pullout",
      label: "Anchor Pullout",
      dcr: po ? po.dcr : 0,
      clause: basePlateClauses.pullout(),
      detail: po
        ? `${po.c.load.id}: Nua ${kN(po.t.nua)} kN/rod vs φNpn ${kN(po.t.phiNpn)} kN. ${po.t.basis}.`
        : "No anchor tension, or pullout does not govern (product report).",
    });
  }
  const sf = governing(
    cs,
    (c) =>
      c.anchor.sideFace.length
        ? c.anchor.sideFace.reduce((a, s) => (s.dcr > a.dcr ? s : a))
        : null,
    (x) => x.dcr,
  );
  if (sf)
    push({
      id: "side-face",
      label: "Side-Face Blowout",
      dcr: sf.dcr,
      clause: basePlateClauses.sideFace(),
      detail: `${sf.c.load.id}: ${sf.t.edge} edge, ca1 ${sf.t.ca1.toFixed(0)} mm, Nua ${kN(sf.t.nua)} kN vs φNsbg ${kN(sf.t.phiNsbg)} kN.`,
    });
  if (i.anchors.kind === "adhesive") {
    const bd = governing(
      cs,
      (c) => c.anchor.bond,
      (x) => x.dcr,
    );
    push({
      id: "bond",
      label: "Adhesive Bond",
      dcr: bd ? bd.dcr : 0,
      clause: basePlateClauses.bond(),
      detail: bd
        ? `${bd.c.load.id}: Nua ${kN(bd.t.nua)} kN vs φNag ${kN(bd.t.phi * bd.t.nag)} kN (τ ${bd.t.tau} MPa, cNa ${bd.t.cna.toFixed(0)} mm).`
        : "No anchor tension.",
    });
    const su = governing(
      cs,
      (c) => c.anchor.bond,
      (x) => x.sustainedDcr,
    );
    push({
      id: "sustained",
      label: "Adhesive Sustained Tension",
      dcr: su ? su.dcr : 0,
      clause: basePlateClauses.sustained(),
      detail: `Sustained share ${(i.anchors.sustained * 100).toFixed(0)} % of Nua.`,
    });
  }
  if (i.shear.method === "anchors") {
    for (const axis of ["X", "Y"] as const) {
      const edges = axis === "X" ? ["east", "west"] : ["north", "south"];
      const sb = governing(
        cs,
        (c) => {
          const l = c.anchor.shearBreakout.filter((s) =>
            edges.includes(s.edge),
          );
          return l.length ? l.reduce((a, s) => (s.dcr > a.dcr ? s : a)) : null;
        },
        (x) => x.dcr,
      );
      push({
        id: `breakout-shear-${axis.toLowerCase()}`,
        label: `Concrete Breakout – Shear ${axis}`,
        dcr: sb ? sb.dcr : 0,
        clause: basePlateClauses.breakoutShear(),
        detail: sb
          ? `${sb.c.load.id}: towards ${sb.t.edge} edge, ${sb.t.row === "back" ? "farthest" : "front"} row ca1 ${sb.t.ca1Used.toFixed(0)} mm, Vua ${kN(sb.t.vua)} kN vs φVcbg ${kN(sb.t.phi * sb.t.vcbg)} kN (AVc/AVco ${(sb.t.avc / sb.t.avco).toFixed(2)}, ψed ${sb.t.psiEd.toFixed(3)}, ψh ${sb.t.psiH.toFixed(3)}).`
          : `No shear in ${axis}.`,
      });
    }
    const pr = governing(
      cs,
      (c) => c.anchor.pryout,
      (x) => x.dcr,
    );
    push({
      id: "pryout",
      label: "Concrete Pryout",
      dcr: pr ? pr.dcr : 0,
      clause: basePlateClauses.pryout(),
      detail: pr
        ? `${pr.c.load.id}: Vua ${kN(pr.t.vua)} kN vs φVcpg ${kN(pr.t.phiVcpg)} kN (kcp ${pr.t.kcp}).`
        : "No shear.",
    });
  }
  const it = governing(
    cs,
    (c) => c.anchor.interaction,
    (x) => x.ratio,
  );
  if (it)
    push({
      id: "interaction",
      label: "Anchor Tension–Shear Interaction",
      dcr: it.dcr,
      clause: basePlateClauses.interaction(),
      detail: `${it.c.load.id}: ${it.t.rule}; tension ${it.c.anchor.tensionRatio.toFixed(3)}, shear ${it.c.anchor.shearRatio.toFixed(3)}.`,
    });
  if (i.shear.method === "friction") {
    const f = governing(
      cs,
      (c) => c.friction,
      (x) => x.dcr,
    );
    if (f)
      push({
        id: "friction",
        label: "Shear Transfer – Friction",
        dcr: f.dcr,
        clause: basePlateClauses.friction(),
        detail: `${f.c.load.id}: Vu ${kN(f.c.vResultant)} kN vs ${i.designMethod === "LRFD" ? "φμPu" : "μPa/Ω"} ${kN(f.t.capacity)} kN (μ ${i.shear.mu}; none for uplift or E combinations).`,
      });
  }
  if (i.shear.method === "lug") {
    const lb = governing(
      cs,
      (c) => c.lug,
      (x) => x.bearingDcr,
    );
    const lc = governing(
      cs,
      (c) => c.lug,
      (x) => x.breakoutDcr,
    );
    const lf = governing(
      cs,
      (c) => c.lug,
      (x) => x.flexureDcr,
    );
    if (lb)
      push({
        id: "lug-bearing",
        label: "Shear Lug Bearing",
        dcr: lb.dcr,
        clause: basePlateClauses.lugBearing(),
        detail: `${lb.c.load.id}: ${lb.t.direction.toUpperCase()} Vu ${kN(lb.t.vu)} kN vs φVbrg ${kN(lb.t.phiVbrg)} kN (ψbrg,sl ${lb.t.psiBrg.toFixed(2)}).${Number.isFinite(lb.dcr) ? "" : " Single-plate lug cannot resist the perpendicular shear."}`,
      });
    if (lc)
      push({
        id: "lug-breakout",
        label: "Shear Lug Concrete Breakout",
        dcr: lc.dcr,
        clause: basePlateClauses.lugBreakout(),
        detail: `${lc.c.load.id}: ca1 ${lc.t.ca1.toFixed(0)} mm, φVcb ${kN(lc.t.phiVcb)} kN.`,
      });
    if (lf)
      push({
        id: "lug-flexure",
        label: "Shear Lug Flexure",
        dcr: lf.dcr,
        clause: basePlateClauses.lugFlexure(),
        detail: `${lf.c.load.id}: Mu ${(lf.t.mu / 1e6).toFixed(2)} kN·m vs φMn ${(lf.t.phiMn / 1e6).toFixed(2)} kN·m.`,
      });
  }
  const du = governing(
    cs,
    (c) => c.anchor.ductility,
    (x) => x.ratio,
  );
  if (du)
    push({
      id: "seismic-ductility",
      label: "Seismic – Ductile Steel Governs",
      dcr: du.dcr,
      clause: basePlateClauses.seismic(),
      detail: du.t.detail,
    });
  // Geometry
  push({
    id: "geo-fit",
    label: "Plate Fits Column",
    dcr: g.plateFits ? 0 : Infinity,
    invalidLabel: "Plate smaller than column",
    clause: "Geometry",
    detail: `Plate ${i.plate.bx} × ${i.plate.by} mm.`,
  });
  push({
    id: "geo-clash",
    label: "Rod Holes Clear of Column and Weld",
    dcr: g.clashes.length ? Infinity : 0,
    invalidLabel: `Clash: ${g.clashes.join(", ")}`,
    clause: basePlateClauses.holes(),
    detail: g.clashes.length
      ? `Holes of ${g.clashes.join(", ")} overlap the column or its weld.`
      : "All holes clear.",
  });
  push({
    id: "geo-hole-edge",
    label: "Hole Clear to Plate Edge",
    dcr:
      g.minHoleEdgeClear > 0
        ? g.holeEdgeRequired / g.minHoleEdgeClear
        : Infinity,
    invalidLabel: "Hole outside plate",
    clause: basePlateClauses.holes(),
    detail: `Min clear ${g.minHoleEdgeClear.toFixed(1)} mm (≥ ${g.holeEdgeRequired} mm). Hole ${i.anchors.hole.toFixed(1)} mm${g.table14_2Hole !== null && i.anchors.hole > g.table14_2Hole + 0.5 ? ` exceeds Table 14-2 maximum ${g.table14_2Hole.toFixed(1)} mm` : ""}.`,
  });
  push({
    id: "geo-edge",
    label: "Anchor Edge Distance (Pedestal)",
    dcr: g.minPedestalEdge > 0 ? g.limits.cmin / g.minPedestalEdge : Infinity,
    clause: basePlateClauses.geometry(),
    detail: `Min ${g.minPedestalEdge.toFixed(0)} mm vs ${g.limits.cmin.toFixed(0)} mm (${g.limits.basis}).`,
  });
  push({
    id: "geo-spacing",
    label: "Anchor Spacing",
    dcr: g.limits.smin / g.minSpacing,
    clause: basePlateClauses.geometry(),
    detail: `Min ${g.minSpacing.toFixed(0)} mm vs ${g.limits.smin.toFixed(0)} mm.`,
  });
  push({
    id: "geo-thickness",
    label: "Embedment vs Member Thickness",
    dcr: g.memberThicknessOk ? 0 : Infinity,
    invalidLabel: "hef too deep for the pedestal",
    clause: basePlateClauses.memberThickness(),
    detail: g.memberThicknessDetail,
  });
  return out;
}

/* ------------------------------------------------------------------ */
/* Anchor sizing assistant                                             */
/* ------------------------------------------------------------------ */

const anchorIds = new Set([
  "rod-tension",
  "rod-shear",
  "breakout-tension",
  "pullout",
  "side-face",
  "bond",
  "sustained",
  "breakout-shear-x",
  "breakout-shear-y",
  "pryout",
  "interaction",
  "seismic-ductility",
  "geo-edge",
  "geo-spacing",
  "geo-thickness",
  "geo-hole-edge",
  "geo-clash",
]);
export interface AnchorSuggestion {
  found: boolean;
  sizeId: string;
  da: number;
  hef: number;
  hole: number;
  maxDcr: number;
  governing: string;
}
/**
 * Smallest rod size of the selected specification, then shallowest hef
 * (25 mm steps), that passes every anchor check. Inputs are never changed.
 * When nothing passes, returns the best trial (found = false) and the check
 * that still governs (e.g. shear breakout, which rod size cannot fix).
 */
export function suggestBasePlateAnchors(
  i: BasePlateInput,
  limit = 1,
): AnchorSuggestion | null {
  const spec = getRodSpec(i.anchors.specId);
  if (!spec || spec.userStrength) return null;
  const hefMax = i.pedestal.height - 50;
  let best: AnchorSuggestion | null = null;
  for (const size of sizesForSpec(spec)) {
    const strength = rodSpecStrength(spec, size.da);
    if (!strength) continue;
    const t = table14_2(size.da);
    const hole =
      i.anchors.holeSource === "table"
        ? t.hole
        : Math.max(i.anchors.hole, size.da + 1.6);
    for (
      let hef = Math.max(100, Math.ceil((8 * size.da) / 25) * 25);
      hef <= hefMax;
      hef += 25
    ) {
      const trial: BasePlateInput = {
        ...i,
        anchors: {
          ...i.anchors,
          sizeId: size.id,
          da: size.da,
          ase: size.ase,
          fy: strength.fy,
          fu: strength.fu,
          ductile: spec.ductile,
          hef,
          hole,
          washer: { size: t.washer, thickness: t.washerThickness },
          eh: Math.max(i.anchors.eh, 3 * size.da),
        },
      };
      if (!basePlateInputSchema.safeParse(trial).success) continue;
      const rows = basePlateDesignChecks(
        trial,
        analyzeBasePlate(trial, t.hole),
      ).filter((c) => anchorIds.has(c.id));
      const worst = rows.reduce(
        (a, c) => ((c.dcr ?? 0) > (a.dcr ?? 0) ? c : a),
        rows[0]!,
      );
      const maxDcr = worst?.dcr ?? 0;
      const s: AnchorSuggestion = {
        found: maxDcr <= limit,
        sizeId: size.id,
        da: size.da,
        hef,
        hole,
        maxDcr,
        governing: worst?.label ?? "",
      };
      if (s.found) return s;
      if (!best || maxDcr < best.maxDcr) best = s;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Excel paste of load combinations                                     */
/* ------------------------------------------------------------------ */

/**
 * Tab- or comma-separated rows with headers ID, Pu, Mx, My, Vx, Vy and an
 * optional Seismic (Y/N) column, in kN and kN·m. Rejects the whole paste on
 * any invalid row (atomic, as the Slab paste).
 */
export function parseBasePlateLoads(text: string): BasePlateLoad[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2)
    throw new Error("Paste a header row and at least one combination.");
  const split = (l: string) =>
    l.split(l.includes("\t") ? "\t" : ",").map((c) => c.trim());
  const head = split(lines[0]!).map((h) =>
    h.toLowerCase().replace(/[^a-z]/g, ""),
  );
  const col = (n: string) => head.indexOf(n);
  const need = ["id", "pu", "mx", "my", "vx", "vy"];
  const missing = need.filter((n) => col(n) < 0);
  if (missing.length)
    throw new Error(
      `Missing header(s): ${missing.map((m) => (m === "id" ? "ID" : m[0]!.toUpperCase() + m.slice(1))).join(", ")}.`,
    );
  const out = lines.slice(1).map((l, k) => {
    const c = split(l);
    const num = (n: string) => {
      const v = Number(c[col(n)]);
      if (!Number.isFinite(v))
        throw new Error(`Row ${k + 2}: ${n.toUpperCase()} is not a number.`);
      return v;
    };
    const e =
      col("seismic") >= 0
        ? /^(y|yes|true|1|e)$/i.test(c[col("seismic")] ?? "")
        : false;
    return basePlateLoadSchema.parse({
      id: c[col("id")],
      pu: num("pu"),
      mx: num("mx"),
      my: num("my"),
      vx: num("vx"),
      vy: num("vy"),
      seismic: e,
      included: true,
    });
  });
  if (new Set(out.map((o) => o.id)).size !== out.length)
    throw new Error("Combination IDs must be unique.");
  if (out.length > 100) throw new Error("Use at most 100 combinations.");
  return out;
}
