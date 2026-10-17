/**
 * Steel column base plate & anchor rod design (engine base-plate-0.5.0).
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
import {
  basePlateStiffenerSchema,
  buildStiffening,
  defaultStiffenerInput,
  memberCheck,
  panelBearing,
  stiffenerBearingLoad,
  stiffenerLayoutInfo,
  stiffenerRodClearance,
  stiffenerSlenderness,
  tensionLine,
  type PanelResult,
  type PlateRect,
  type StiffenerContext,
  type StiffenerMemberResult,
  type Stiffening,
  type SupportPlate,
  type TensionGroup,
} from "./base-plate-stiffeners";

export const BASE_PLATE_ENGINE = "base-plate-0.5.0";

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
  /** Plastic moduli from the shapes database (mm³); null = from dimensions. */
  zx: z.number().finite().positive().nullable().default(null),
  zy: z.number().finite().positive().nullable().default(null),
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
  const r0 = raw as Record<string, unknown>;
  // Engine 0.5.0: seismic design needs activation; SDC C–F drafts open active.
  const sz = r0.seismic as Record<string, unknown> | undefined;
  const r =
    sz && typeof sz === "object" && !("active" in sz)
      ? {
          ...r0,
          seismic: {
            ...sz,
            active: ["C", "D", "E", "F"].includes(String(sz.sdc)),
          },
        }
      : r0;
  if (!("code" in r) || "concreteCode" in r) return r;
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
    /**
     * ASD only — demand for the ACI 318 checks (anchors, friction, lug
     * concrete): "lrfd" uses a separate LRFD combination table (DG1, ACI
     * strength design); "alpha" uses α × ASD demand.
     */
    asdAnchorBasis: z.enum(["alpha", "lrfd"]).default("alpha"),
    lrfdLoads: z.array(basePlateLoadSchema).max(100).default([]),
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
      /**
       * anchors | friction (DG1 Eq. 4-30) | friction-anchors (friction
       * added to the rods, ACI 349 D.6.1.4) | lug (ACI 17.11).
       */
      method: z.enum(["anchors", "friction", "friction-anchors", "lug"]),
      mu: z.number().finite().min(0.2).max(1),
      lug: z.object({
        orientation: z.enum(["x", "y", "cross"]),
        width: pos,
        thickness: pos,
        /** Embedment into the concrete below the grout, hsl. */
        depth: pos,
        fy: pos,
        fu: pos.default(400),
        /** Fillet size each side of the lug to the plate. */
        weld: pos.default(8),
      }),
    }),
    weld: z.object({ size: pos, fexx: pos }),
    /** Plate stiffeners (engine 0.3.0); older drafts open unstiffened. */
    stiffeners: basePlateStiffenerSchema.default(defaultStiffenerInput),
    seismic: z.object({
      /**
       * Seismic design must be activated (engine 0.5.0). Off: no SDC, E
       * flags, ACI 17.10 or AISC 341 checks. Older drafts with SDC C–F open
       * active.
       */
      active: z.boolean().default(false),
      sdc: z.enum(["A", "B", "C", "D", "E", "F"]),
      /** ACI 17.10.5.3 option: (a) ductile steel, (c) nonyielding attachment, (d) Ω0. */
      option: z.enum(["a", "c", "d"]),
      stretchLength: nonneg,
      /**
       * AISC 341 D2.6 / DG1 Ch. 6 base type: general (ACI 17.10 only),
       * braced frame, moment-frame strong base (D2.6c(a)) or weak base
       * (D2.6c(b), DG1 6.4.2).
       */
      baseType: z.enum(["general", "braced", "strong", "weak"]).default("general"),
      /** Column Ry (AISC 341 Table A3.2) and grade label. */
      ry: z.number().finite().min(1).max(2).default(1.1),
      columnGrade: z.string().max(40).default("ASTM A992"),
      /** ACI 17.10.3: E ≤ 20 % of the anchor force — 17.10 not applied. */
      exempt20: z.boolean().default(false),
      /** Weak base: upset-thread (UT) rods (DG1 Fig. 6-1). */
      ut: z
        .object({
          dReduced: pos,
          lStretch: pos,
          rt: z.number().finite().min(1).max(1.5),
        })
        .default({ dReduced: 19.05, lStretch: 203.2, rt: 1.2 }),
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
    const lay = i.stiffeners.layout;
    if (!stiffenerLayoutInfo[lay].families.includes(c.family))
      ctx.addIssue({
        code: "custom",
        path: ["stiffeners", "layout"],
        message: `Stiffener layout "${stiffenerLayoutInfo[lay].label}" does not suit a ${c.family} column.`,
      });
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
  )
  .refine(
    (i) =>
      i.designMethod !== "ASD" ||
      i.asdAnchorBasis !== "lrfd" ||
      i.lrfdLoads.some((l) => l.included),
    "ASD with LRFD anchor demands: enter the LRFD combinations for the ACI 318 checks, or choose α × ASD.",
  )
  .refine(
    (i) => new Set(i.lrfdLoads.map((l) => l.id)).size === i.lrfdLoads.length,
    "LRFD combination labels must be unique.",
  )
  .refine(
    (i) =>
      !i.seismic.active ||
      i.designMethod !== "ASD" ||
      i.asdAnchorBasis === "lrfd",
    "Seismic design with ASD: the seismic and ACI 318 checks need the LRFD combinations (DG1 Ch. 6 is LRFD only).",
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
    zx: null,
    zy: null,
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
    zx: Number.isFinite(n("Zx")) && n("Zx") > 0 ? n("Zx") : null,
    zy: Number.isFinite(n("Zy")) && n("Zy") > 0 ? n("Zy") : null,
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
    asdAnchorBasis: "alpha",
    lrfdLoads: [],
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
      zx: 934062.648,
      zy: 275302.6752,
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
      mu: 0.4,
      lug: {
        orientation: "cross",
        width: 150,
        thickness: 25,
        depth: 100,
        fy: 248,
        fu: 400,
        weld: 8,
      },
    },
    weld: { size: 8, fexx: 482 },
    stiffeners: defaultStiffenerInput(),
    seismic: {
      active: false,
      sdc: "D",
      option: "d",
      stretchLength: 0,
      baseType: "general",
      ry: 1.1,
      columnGrade: "ASTM A992",
      exempt20: false,
      ut: { dReduced: 19.05, lStretch: 203.2, rt: 1.2 },
    },
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

/** Geometry and materials passed to the stiffener engine. */
export function basePlateStiffenerContext(i: BasePlateInput): StiffenerContext {
  const dims = basePlateColumnDims(i);
  const c = i.column;
  return {
    bx: i.plate.bx,
    by: i.plate.by,
    tp: i.plate.tp,
    plateFy: i.plate.fy,
    family: c.family,
    d: c.d,
    bf: c.bf,
    tf: c.tf,
    tw: c.tw,
    columnFy: c.fy,
    flangesFaceY: dims.flangesFaceY,
    colX: dims.x,
    colY: dims.y,
    kx: dims.kx,
    ky: dims.ky,
    method: i.designMethod,
    fexx: i.weld.fexx,
    washer: i.anchors.washer.size,
  };
}
/** Stiffener plates, zones and panels (null when unstiffened). */
export function basePlateStiffening(i: BasePlateInput): Stiffening | null {
  if (i.stiffeners.layout === "none") return null;
  return buildStiffening(basePlateStiffenerContext(i), i.stiffeners);
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
  const e = P !== 0 ? M / Math.abs(P) : Infinity;
  const ecrit = n / 2 - P / (2 * qmax);
  const fy = i.plate.fy;
  // Tension interface lever (DG1 Eq. 4-61): I strong axis to the flange
  // centre, x = f − d/2 + tf/2; I weak axis to the 0.80bf line (Ex. 4.7-14,
  // y = n − edge); HSS to the wall centre.
  const flangeAlong =
    i.column.family === "I" ? (axis === "y") === dims.flangesFaceY : true;
  const x =
    i.column.family === "I" && !flangeAlong
      ? f - (kAlong * colAlong) / 2
      : f - colAlong / 2 + i.column.tf / 2;
  // DG1 Eq. 4-60/4-62: full plate width B at the tension interface.
  const beff = b;
  void across;
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
  if (P > 0 && e <= ecrit) {
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
  // Large moment: DG1 Eq. 4-58 (P > 0), 4-32 (P = 0) and 4-65 (P < 0,
  // e > f) are one quadratic with signed P: Y² − 2(f + N/2)Y + 2(M + P f)/qmax = 0.
  const k = f + n / 2;
  const disc = k * k - (2 * (M + P * f)) / qmax;
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
  // DG1 4.3.1: λn′ (n′ = √(d bf)/4) is not used for HSS and pipe.
  const np = c.family === "I" ? Math.sqrt(d * bf) / 4 : 0;
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
    /** Governing weld limit state and its basis (DG1 / J2.4). */
    detail: string;
  };
  /**
   * Friction (DG1 Eq. 4-30): φ0.65 μP ≤ 0.75 min(0.2f′c, 5.5 MPa) Ac,
   * strength-level (ASD: α × demand). `share` = shear taken by friction.
   */
  friction: {
    capacity: number;
    cap: number;
    ac: number;
    share: number;
    dcr: number;
  } | null;
  lug: LugCheck | null;
  seismicApplies: boolean;
  /** E combination with seismic design active (ACI 17.10 may be exempt). */
  earthquake: boolean;
  /** Weak-base anchor-yielding checks (DG1 6.4.2, Ex. 6.4-1). */
  weakBase: WeakBaseResult | null;
  /** Moment from the shear-lug eccentricity added to the base (DG1 Ex. 4.7-5). */
  lugMoment: { mx: number; my: number; e: number } | null;
  /** AISC 360-22 J3.8 rod check with bending (DG1 Eq. 4-26 to 4-28). */
  rodAisc: {
    t: number;
    v: number;
    mRod: number;
    lever: number;
    ft: number;
    fv: number;
    ftAllow: number;
    fvAllow: number;
    dcr: number;
  };
  /** Tension-side plate bending by support (column face, web, stiffener). */
  plateTension: TensionGroup[];
  /** DG1 Eq. 4-69 when it applies (compression, biaxial, large moment). */
  biaxial: { mcx: number; mcy: number; ratio: number; basis: string } | null;
  /** Stiffened plate: panels, tension supports and stiffener members. */
  stiffener: ComboStiffener | null;
}
export interface ComboStiffener {
  panels: PanelResult[];
  tension: TensionGroup[];
  members: StiffenerMemberResult[];
  /** DG1 cantilever requirement of the unstiffened zones (and λn′), mm. */
  unstiffenedTp: number;
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
  /** Lug eccentricity e = tgrout + hsl/2 and moment at the plate, N·mm. */
  e: number;
  psiBrg: number;
  /** Effective bearing area (depth ≤ 2tsl, ACI 17.11.2.1.1), mm². */
  aef: number;
  phiVbrg: number;
  bearingDcr: number;
  ca1: number;
  phiVcb: number;
  breakoutDcr: number;
  phiMn: number;
  mu: number;
  flexureDcr: number;
  /** J4.2 shear yielding / rupture, J4.5 flexural rupture, Manual Eq. 9-1. */
  phiVy: number;
  phiVr: number;
  phiMr: number;
  steelDcr: number;
  interaction: number;
  /** Lug-to-plate fillets (DG1 Ex. 4.7-5, kds 1.5). */
  weldF: number;
  weldCap: number;
  weldDcr: number;
  /** Local plate bending at the lug (DG1 Ex. 4.7-5, column neglected). */
  plateM: number;
  plateMn: number;
  plateDcr: number;
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
  const vuaMax = nShear > 0 && rodsCarryShear(i) ? shear / nShear : 0;
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
  if (rodsCarryShear(i) && shearPts.length) {
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
  if (rodsCarryShear(i) && shearPts.length && shear > 0) {
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
  if (
    seismic &&
    seismicAciOption(i) === "a" &&
    i.seismic.baseType !== "weak" &&
    tensioned.length &&
    breakout
  ) {
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

/** True when the anchor rods carry (part of) the shear. */
export const rodsCarryShear = (i: Pick<BasePlateInput, "shear">) =>
  i.shear.method === "anchors" || i.shear.method === "friction-anchors";

/**
 * Shear lug, ACI 318-19 17.11 and AISC DG1 3rd Ed. Ex. 4.7-5. Concrete limit
 * states at strength level (`alpha` × demand under ASD-α); steel per AISC.
 */
function lugCheck(
  i: BasePlateInput,
  dir: "x" | "y",
  v: number,
  pu: number,
  nTension: number,
  alpha: number,
  rods: Rod[],
  cap: BearingCapacity,
): LugCheck {
  const l = i.shear.lug,
    p = i.pedestal;
  // 17.11.2.1.1: bearing depth ≤ 2 tsl below the concrete surface.
  const aef = l.width * Math.min(l.depth, 2 * l.thickness);
  const nsa = steelTension(i.anchors.ase, futaUsed(i.anchors.fy, i.anchors.fu));
  // 17.11.2.2: ψbrg,sl (strength-level axial load).
  const pa = pu * alpha;
  const psiBrg =
    pa >= 0
      ? Math.min(2, 1 + (4 * pa * 1e3) / (i.plate.bx * i.plate.by * p.fc))
      : Math.min(
          1,
          Math.max(0, 1 + (pa * 1e3) / (Math.max(nTension, 1) * nsa)),
        );
  const phiVbrg = 0.65 * 1.7 * p.fc * aef * psiBrg;
  // 17.11.3: breakout from the bearing face, φ = 0.65 (17.11.1.1.6).
  const half = dir === "x" ? p.px / 2 : p.py / 2;
  const across = dir === "x" ? p.py : p.px;
  const ca1 = half - l.thickness / 2;
  const c2 = (across - l.width) / 2;
  const c15 = 1.5 * ca1;
  const avc =
    (l.width + 2 * Math.min(c2, c15)) * Math.min(p.height, l.depth + c15) -
    l.width * l.depth;
  const avco = 4.5 * ca1 * ca1;
  const psiEd = c2 >= c15 ? 1 : 0.7 + (0.3 * c2) / c15;
  const vb = 3.7 * p.lambdaA * Math.sqrt(Math.min(p.fc, 70)) * ca1 ** 1.5;
  const phiVcb = 0.65 * (avc / avco) * psiEd * (p.cracked ? 1 : 1.4) * vb;
  // Lug steel (AISC J4.2, J4.5, Manual Eq. 9-1): V and M = V·e at the plate.
  const e = i.grout.thickness + l.depth / 2;
  const mu = v * e;
  const area = l.width * l.thickness,
    z = (l.width * l.thickness ** 2) / 4;
  const fbp = plateFactor(i);
  const phiMn = fbp * l.fy * z;
  const phiMr =
    designFactor(aiscFactors.elementRupture, i.designMethod) * l.fu * z;
  const phiVy =
    designFactor(aiscFactors.elementShear, i.designMethod) * 0.6 * l.fy * area;
  const phiVr =
    designFactor(aiscFactors.elementRupture, i.designMethod) *
    0.6 *
    l.fu *
    area;
  const interaction9 = mu / phiMn + (v / phiVy) ** 4;
  // Lug welds: two fillets of length b; couple at a = tsl + 2w/3, kds 1.5.
  const aw = l.thickness + (2 * l.weld) / 3;
  const weldF = Math.hypot(v / (2 * l.width), mu / (aw * l.width));
  const weldCap =
    designFactor(aiscFactors.weld, i.designMethod) *
    0.6 *
    i.weld.fexx *
    0.7071 *
    l.weld *
    1.5;
  // Local plate bending at the lug from the lug moment alone (P = 0):
  // DG1 Eq. 4-31/4-32, M = max(T f, qmax Y (N/2 − Y/2)), width = b_sl.
  const N = dir === "x" ? i.plate.bx : i.plate.by;
  const B = dir === "x" ? i.plate.by : i.plate.bx;
  const f = Math.max(...rods.map((r) => Math.abs(dir === "x" ? r.x : r.y)));
  const q = cap.fpMax * B;
  const k = f + N / 2;
  const disc = k * k - (2 * mu) / q;
  const Y = disc >= 0 ? k - Math.sqrt(disc) : NaN;
  const plateM = Number.isFinite(Y)
    ? Math.max(q * Y * f, q * Y * (N / 2 - Y / 2))
    : Infinity;
  const plateMn = fbp * i.plate.fy * ((l.width * i.plate.tp ** 2) / 4);
  return {
    direction: dir,
    vu: v,
    e,
    psiBrg,
    aef,
    phiVbrg,
    bearingDcr: (alpha * v) / phiVbrg,
    ca1,
    phiVcb,
    breakoutDcr: (alpha * v) / phiVcb,
    phiMn,
    mu,
    flexureDcr: mu / phiMn,
    phiVy,
    phiVr,
    phiMr,
    steelDcr: Math.max(v / phiVr, mu / phiMr, v / phiVy),
    interaction: interaction9,
    weldF,
    weldCap,
    weldDcr: weldF / weldCap,
    plateM,
    plateMn,
    plateDcr: plateM / plateMn,
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
  /**
   * ASD with LRFD anchor demands: the LRFD run on `lrfdLoads` used for the
   * ACI 318 checks (null otherwise).
   */
  anchorRun: BasePlateResult | null;
  /** Stiffener geometry (null when unstiffened). */
  stiffening: Stiffening | null;
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

/** Uniform bearing block of one DG1 axis analysis (plate coordinates). */
function bearingRegion(i: BasePlateInput, a: AxisAnalysis): PlateRect {
  const hx = i.plate.bx / 2,
    hy = i.plate.by / 2;
  const full = { x0: -hx, x1: hx, y0: -hy, y1: hy };
  if (a.case === "axial" || !(a.y > 0)) return full;
  const y = Math.min(a.y, a.n);
  if (a.axis === "y")
    return a.sign > 0 ? { ...full, y0: hy - y } : { ...full, y1: -hy + y };
  return a.sign > 0 ? { ...full, x0: hx - y } : { ...full, x1: -hx + y };
}
/** Biaxial small eccentricity: (Bx − 2|ex|)(By − 2|ey|) at the resultant. */
function meyerhofRect(i: BasePlateInput, ex: number, ey: number): PlateRect {
  const hx = i.plate.bx / 2,
    hy = i.plate.by / 2;
  return {
    x0: ex >= 0 ? 2 * ex - hx : -hx,
    x1: ex >= 0 ? hx : hx + 2 * ex,
    y0: ey >= 0 ? 2 * ey - hy : -hy,
    y1: ey >= 0 ? hy : hy + 2 * ey,
  };
}

/** Column web and flanges as plate supports for rods between the flanges. */
export function columnSupportPlates(
  i: Pick<BasePlateInput, "column" | "rotation">,
): SupportPlate[] {
  const c = i.column;
  if (c.family !== "I") return [];
  const dAxis: "x" | "y" = i.rotation === 90 ? "x" : "y";
  const oAxis: "x" | "y" = dAxis === "y" ? "x" : "y";
  const inner = c.d / 2 - c.tf;
  // Inside the column outline: |along d| < d/2 − tf and |across| < bf/2.
  const insideOnly =
    dAxis === "y" ? { hx: c.bf / 2, hy: inner } : { hx: inner, hy: c.bf / 2 };
  const out: SupportPlate[] = [];
  for (const side of [1, -1] as const)
    out.push({
      id: `web${side > 0 ? "+" : "−"}`,
      axis: dAxis,
      side,
      pos: 0,
      root: 0,
      tip: inner,
      t: c.tw,
      insideOnly,
    });
  for (const fl of [1, -1] as const)
    for (const side of [1, -1] as const)
      out.push({
        id: `flange${fl > 0 ? "+" : "−"}${side > 0 ? "+" : "−"}`,
        axis: oAxis,
        side,
        pos: fl * (c.d / 2 - c.tf / 2),
        root: 0,
        tip: c.bf / 2,
        t: c.tf,
        insideOnly,
      });
  return out;
}

interface Env {
  i: BasePlateInput;
  rods: Rod[];
  cap: BearingCapacity;
  st: Stiffening | null;
  supports: SupportPlate[];
  fb: number;
  sumX2: number;
  sumY2: number;
}
interface PlateState {
  axes: AxisAnalysis[];
  kase: BearingCase;
  method: string;
  /** Rod tension, N. */
  tension: number[];
  /** Per-axis rod tensions (large-moment axes), N. */
  axisTension: number[][];
  tp: number;
  fp: number;
  bearingDcr: number;
  ex: number;
  ey: number;
  lambdaNp: number;
  groups: TensionGroup[];
  panels: PanelResult[];
  bearingCases: { region: PlateRect; fp: number }[];
  unstiffenedTp: number;
}

/** Bearing, rod tension and plate thickness for one set of actions. */
function plateState(env: Env, pu: number, mx: number, my: number): PlateState {
  const { i, rods, cap, st, supports, fb } = env;
  const P = pu;
  const n = rods.length;
  const tension = rods.map(() => 0);
  const axisTension: number[][] = [];
  const groups: TensionGroup[] = [];
  let axes: AxisAnalysis[] = [];
  let kase: BearingCase;
  let method: string;
  let tp = 0;
  const lam = dg1LambdaNp(i, P, cap);
  const ex = P > 0 ? (my * 1e6) / (P * 1e3) : 0;
  const ey = P > 0 ? (mx * 1e6) / (P * 1e3) : 0;
  const hasX = Math.abs(my) > 1e-9,
    hasY = Math.abs(mx) > 1e-9;
  const coord = (axis: "x" | "y") => (r: Rod) => (axis === "y" ? r.y : r.x);
  const box = supports.find((p) => p.insideOnly)?.insideOnly;
  const insideColumn = (r: Rod) =>
    !!box && Math.abs(r.x) < box.hx && Math.abs(r.y) < box.hy;
  /** Tension-side plate for rods of `idx` on one axis (nearest support). */
  const tensionSide = (
    axis: "x" | "y",
    idx: number[],
    t: number[],
    lever: number,
    width: number,
  ) => {
    const res = tensionLine(
      supports,
      axis,
      idx.map((k) => ({ ...rods[k]!, t: t[k]! })),
      lever,
      width,
      i.plate.fy,
      fb,
    );
    groups.push(...res.groups);
    return res.tp;
  };
  const elastic = rods.map(
    (r) =>
      (-P * 1e3) / n -
      (env.sumY2 > 0 ? (mx * 1e6 * r.y) / env.sumY2 : 0) -
      (env.sumX2 > 0 ? (my * 1e6 * r.x) / env.sumX2 : 0),
  );
  const largeAxis = (axis: "x" | "y", M: number) => {
    const a = dg1Axis(i, rods, cap, axis, P, M, 0);
    const t = rods.map(() => 0);
    if (a.case === "large" || a.case === "no-solution") {
      const per = a.tu / Math.max(a.tensionRods.length, 1);
      for (const id of a.tensionRods) {
        const k = rods.findIndex((r) => r.id === id);
        t[k] = Number.isFinite(per) ? per : Infinity;
      }
    }
    return { a, t };
  };
  if (
    P <= 0 &&
    Math.min(...elastic) >= -1e-6 * Math.max(1, Math.abs(P) * 1e3)
  ) {
    // DG1 4.3.2 / Eq. 4-67: tension (and moment with e ≤ f) in the rods only.
    kase = "uplift";
    method =
      hasX || hasY
        ? "Tension with moment, e ≤ f: elastic rod group, no bearing (DG1 Eq. 4-67)"
        : "Concentric tension: equal rod tension (DG1 4.3.2)";
    elastic.forEach((t, k) => (tension[k] = Math.max(0, t)));
    for (const axis of ["x", "y"] as const) {
      const a = dg1Axis(
        i,
        rods,
        cap,
        axis,
        0,
        axis === "y" ? mx || 1e-9 : my || 1e-9,
        0,
      );
      let tpa = 0;
      for (const side of [1, -1]) {
        const c = coord(axis);
        const ext =
          side > 0 ? Math.max(...rods.map(c)) : Math.min(...rods.map(c));
        const idx = rods
          .map((r, k) => (Math.abs(c(r) - ext) < 1e-6 ? k : -1))
          .filter((k) => k >= 0);
        // Column-face lever of this line (DG1 Eq. 4-61 on its own side).
        const f = Math.abs(ext);
        const lever = a.x - a.f + f;
        tpa = Math.max(tpa, tensionSide(axis, idx, tension, lever, a.b));
      }
      // Rods between the flanges bend the plate about the web / flange.
      const inner = rods
        .map((_, k) => k)
        .filter((k) => tension[k]! > 0 && insideColumn(rods[k]!));
      tpa = Math.max(tpa, tensionSide(axis, inner, tension, 0, a.b));
      tp = Math.max(tp, tpa);
      axes.push({
        ...a,
        case: "uplift",
        tu: 0,
        fp: 0,
        bearingDcr: 0,
        tpBearing: 0,
        tpTension: tpa,
        tensionRods: [],
      });
    }
  } else if (P <= 0) {
    // Bearing needed: DG1 Eq. 4-31/4-32 (P = 0) or 4-63 to 4-66 (tension).
    const list: ("x" | "y")[] = [
      ...(hasX ? (["x"] as const) : []),
      ...(hasY ? (["y"] as const) : []),
    ];
    for (const axis of list) {
      const M = axis === "y" ? mx : my;
      const { a, t } = largeAxis(axis, M);
      let ax = a;
      if (a.case === "large" && !(a.y > 0)) {
        // This axis alone needs no bearing: its elastic share (P counted again).
        const c = coord(axis);
        const s2 = axis === "y" ? env.sumY2 : env.sumX2;
        rods.forEach(
          (r, k) =>
            (t[k] = Math.max(
              0,
              (-P * 1e3) / n - (s2 > 0 ? (M * 1e6 * c(r)) / s2 : 0),
            )),
        );
        const idx = rods.map((_, k) => k).filter((k) => t[k]! > 0);
        ax = {
          ...a,
          case: "uplift",
          y: 0,
          fp: 0,
          tu: 0,
          bearingDcr: 0,
          tpBearing: 0,
          tpTension: tensionSide(axis, idx, t, a.x, a.b),
          tensionRods: [],
        };
      }
      axes.push(ax);
      axisTension.push(t);
      t.forEach((v, k) => (tension[k] = tension[k]! + v));
    }
    kase = axes.some((a) => a.case === "no-solution")
      ? "no-solution"
      : axes.some((a) => a.case === "large")
        ? "large"
        : "uplift";
    method =
      list.length > 1
        ? "Tension or zero axial load with biaxial moment: per-axis DG1 large-moment analyses with full P, rod tensions superposed (conservative; outside DG1)"
        : P === 0
          ? `Pure moment about ${list[0] === "y" ? "X" : "Y"}: DG1 Eq. 4-31/4-32, T = C = qmax·Y`
          : `Tension with large moment (e > f) about ${list[0] === "y" ? "X" : "Y"}: DG1 Eq. 4-63 to 4-66, Tr = Pr + qmax·Y`;
  } else if (hasX && hasY) {
    const yx = i.plate.bx - 2 * Math.abs(ex),
      yy = i.plate.by - 2 * Math.abs(ey);
    const fpe = yx > 0 && yy > 0 ? (P * 1e3) / (yx * yy) : Infinity;
    if (fpe <= cap.fpMax) {
      kase = "biaxial-small";
      method =
        "Biaxial, small eccentricity: uniform bearing on Bx−2ex by By−2ey (DG1)";
      const ax = dg1Axis(i, rods, cap, "x", P, my, 0),
        ay = dg1Axis(i, rods, cap, "y", P, mx, 0);
      const bend = (a: AxisAnalysis, y: number) =>
        tpFromMpl(bearingMpl(fpe, y, Math.max(a.m, a.nCant)), i.plate.fy, fb);
      const dcr = fpe / cap.fpMax;
      axes = [
        {
          ...ax,
          case: "biaxial-small",
          y: yx,
          fp: fpe,
          tu: 0,
          bearingDcr: dcr,
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
          bearingDcr: dcr,
          tpBearing: bend(ay, yy),
          tpTension: 0,
          tensionRods: [],
        },
      ];
    } else {
      kase = "large";
      method =
        "Biaxial, large eccentricity: DG1 per-axis analyses with full Pu";
      for (const [axis, M] of [
        ["x", my],
        ["y", mx],
      ] as const) {
        const { a, t } = largeAxis(axis, M);
        axes.push(a);
        axisTension.push(t);
      }
      if (axes.some((a) => a.case === "no-solution")) kase = "no-solution";
    }
  } else {
    const axis = hasX ? "x" : "y";
    const a = dg1Axis(i, rods, cap, axis, P, hasX ? my : mx, lam.lambdaNp);
    axes = [a];
    kase = a.case;
    if (a.case === "large" || a.case === "no-solution") {
      const { t } = largeAxis(axis, hasX ? my : mx);
      axisTension.push(t);
    }
    method =
      a.case === "axial"
        ? "Axial compression: DG1 cantilevers m, n, λn′"
        : a.case === "small"
          ? `Small moment (e ≤ ecrit) about ${axis === "y" ? "X" : "Y"}: uniform bearing Y = N − 2e`
          : `Large moment (e > ecrit) about ${axis === "y" ? "X" : "Y"}: uniform bearing at fp,max + rod tension`;
  }
  // Rod tension of large-moment axes (biaxial: superposed here; DG1 Eq.
  // 4-69 may replace it in the caller).
  if (P > 0)
    for (const t of axisTension)
      t.forEach((v, k) => (tension[k] = tension[k]! + v));
  // Tension interface: each rod to its nearest support (column face with
  // full width B, web / flange / stiffener face with 45°).
  axes.forEach((a) => {
    if (
      (a.case === "large" || a.case === "no-solution") &&
      a.tensionRods.length
    ) {
      const per = a.tu / a.tensionRods.length;
      const idx = a.tensionRods.map((id) => rods.findIndex((r) => r.id === id));
      const t = rods.map((_, k) => (idx.includes(k) ? per : 0));
      a.tpTension = Number.isFinite(per)
        ? tensionSide(a.axis, idx, t, a.x, a.b)
        : NaN;
    }
  });
  // Stiffened zones replace the DG1 cantilever at the bearing interface.
  const panels = new Map<string, PanelResult>();
  const bearingCases: PlateState["bearingCases"] = [];
  let unstiffenedTp = 0;
  if (kase !== "uplift" && kase !== "no-solution") {
    const lU = st
      ? Math.max(0, ...st.zones.filter((z) => !z.stiffened).map((z) => z.depth))
      : 0;
    for (const a of axes) {
      if (!(a.fp > 0) || !(a.y > 0)) continue;
      const region =
        a.case === "biaxial-small"
          ? meyerhofRect(i, ex, ey)
          : bearingRegion(i, a);
      bearingCases.push({ region, fp: a.fp });
      if (!st) continue;
      const l = a.case === "axial" ? Math.max(lU, lam.lambdaNp) : lU;
      const yA = a.case === "axial" ? a.n : a.y;
      const tpU =
        l > 0 ? tpFromMpl(bearingMpl(a.fp, yA, l), i.plate.fy, fb) : 0;
      unstiffenedTp = Math.max(unstiffenedTp, tpU);
      const pr = panelBearing(st, region, a.fp, i.plate.fy, fb);
      for (const p of pr)
        if ((panels.get(p.id)?.tpReq ?? -1) < p.tpReq) panels.set(p.id, p);
      a.tpBearing = Math.max(tpU, ...pr.map((p) => p.tpReq));
    }
  }
  tp = Math.max(
    tp,
    ...axes.map((a) => Math.max(a.tpBearing || 0, a.tpTension || 0)),
  );
  if (kase === "no-solution") tp = Infinity;
  return {
    axes,
    kase,
    method,
    tension,
    axisTension,
    tp,
    fp: kase === "uplift" ? 0 : Math.max(0, ...axes.map((a) => a.fp)),
    bearingDcr:
      kase === "uplift" ? 0 : Math.max(0, ...axes.map((a) => a.bearingDcr)),
    ex,
    ey,
    lambdaNp: lam.lambdaNp,
    groups,
    panels: [...panels.values()],
    bearingCases,
    unstiffenedTp,
  };
}

/** Anchor rod as a bolt: AISC 360-22 J3.8 with bending (DG1 Eq. 4-26–4-28). */
function rodAiscCheck(i: BasePlateInput, t: number, v: number) {
  const a = i.anchors;
  const ab = (Math.PI * a.da * a.da) / 4,
    z = a.da ** 3 / 6;
  // Reverse curvature over half the distance from the bearing centre
  // (welded plate washer: tp + tw/2; else mid-plate) to the grout top.
  const lever =
    ((a.weldedWashers ? i.plate.tp + a.washer.thickness / 2 : i.plate.tp / 2) /
      2) *
    (v > 0 ? 1 : 0);
  const mRod = v * lever;
  const fnt = 0.75 * a.fu,
    fnv = 0.45 * a.fu;
  const ft = t / ab + mRod / z,
    fv = v / ab;
  const lrfd = i.designMethod === "LRFD";
  const f = aiscFactors.rod;
  // J3-3a/b: F′nt = 1.3Fnt − (Fnt/φFnv) frv ≤ Fnt (LRFD); ΩFnt/Fnv (ASD).
  const fntP = Math.min(
    fnt,
    1.3 * fnt - (lrfd ? fnt / (f.phi * fnv) : (f.omega * fnt) / fnv) * fv,
  );
  const k = designFactor(f, i.designMethod);
  const ftAllow = Math.max(k * fntP, 0),
    fvAllow = k * fnv;
  return {
    t,
    v,
    mRod,
    lever,
    ft,
    fv,
    ftAllow,
    fvAllow,
    dcr: Math.max(
      ftAllow > 0 ? ft / ftAllow : ft > 0 ? Infinity : 0,
      fv / fvAllow,
    ),
  };
}

/**
 * DG1 4.3.11: moment strength about one axis at the applied Pu, considering
 * the bearing solution, plate thickness, rod steel (AISC and ACI) and ACI
 * concrete tension limit states (bisection on M, kN·m).
 */
function momentStrength(
  env: Env,
  axis: "x" | "y",
  P: number,
  applied: number,
  alpha: number,
  seismic: boolean,
) {
  const sgn = applied >= 0 ? 1 : -1;
  const a0 = dg1Axis(env.i, env.rods, env.cap, axis, P, sgn, 0);
  const q = env.cap.fpMax * a0.b;
  const k = a0.f + a0.n / 2;
  const mNoSolution = ((k * k * q) / 2 - P * 1e3 * a0.f) / 1e6;
  const ratio = (M: number) => {
    const ps = plateState(
      env,
      P,
      axis === "y" ? sgn * M : 0,
      axis === "x" ? sgn * M : 0,
    );
    if (ps.kase === "no-solution") return Infinity;
    const an = anchorChecks(
      env.i,
      env.rods,
      ps.tension.map((t) => t * alpha),
      0,
      0,
      0,
      P * alpha,
      [],
      seismic,
    );
    const aisc = rodAiscCheck(env.i, Math.max(0, ...ps.tension), 0).dcr;
    return Math.max(
      ps.tp / env.i.plate.tp,
      an.tensionRatio,
      aisc,
      ps.bearingDcr,
    );
  };
  let lo = 0,
    hi = mNoSolution * (1 - 1e-9);
  if (!(hi > 0) || ratio(0) > 1) return 0;
  if (ratio(hi) <= 1) return hi;
  for (let n = 0; n < 60; n++) {
    const mid = (lo + hi) / 2;
    if (ratio(mid) <= 1) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * Column-to-plate weld. I-shapes per DG1: flange force (M/d − P/2) on the
 * outside flange weld with kds 1.5 (Ex. 4.7-9); rods between the flanges on
 * the web weld over beff with kds 1.5 and the web stress (Ex. 4.7-3); weak-
 * axis moment and shear on the elastic weld group. HSS: elastic weld group.
 */
function columnWeld(
  i: BasePlateInput,
  wg: ReturnType<typeof weldGroup>,
  phiRw: number,
  P: number,
  mx: number,
  my: number,
  vRes: number,
  groups: TensionGroup[],
): ComboResult["weld"] {
  const c = i.column;
  const fV = vRes / wg.L;
  if (c.family !== "I") {
    const fN = Math.max(
      0,
      (-P * 1e3) / wg.L +
        (Math.abs(mx) * 1e6 * wg.ym) / wg.ix +
        (Math.abs(my) * 1e6 * wg.xm) / wg.iy,
    );
    const f = Math.hypot(fN, fV);
    return {
      fN,
      fV,
      f,
      capacity: phiRw,
      dcr: f / phiRw,
      length: wg.L,
      detail: `elastic weld group: fN = −P/Lw + M·c/I = ${fN.toFixed(0)} N/mm, fV = ${fV.toFixed(0)} N/mm`,
    };
  }
  const rot = i.rotation === 90;
  const strong = rot ? my : mx,
    weak = rot ? mx : my;
  const rf = Math.max(0, (Math.abs(strong) * 1e6) / c.d - (P * 1e3) / 2);
  const fFl = rf / c.bf;
  const capK = phiRw * 1.5;
  const fW =
    (Math.abs(weak) * 1e6 * (rot ? wg.ym : wg.xm)) / (rot ? wg.ix : wg.iy) +
    Math.max(0, (-P * 1e3) / wg.L) * (Math.abs(strong) > 0 ? 0 : 1);
  const fGroup = Math.hypot(fW, fV);
  let fR = 0;
  for (const g of groups)
    if (/^(web|flange)/.test(g.support) && g.beff > 0)
      fR = Math.max(fR, g.tensions.reduce((a, b) => a + b, 0) / g.beff);
  const webStress = c.tw > 0 ? (2 * fR) / c.tw : 0;
  const webAllow = plateFactor(i) * c.fy;
  const cands = [
    {
      dcr: fFl / capK,
      f: fFl,
      cap: capK,
      d: `flange force Rf = M/d − P/2 = ${(rf / 1e3).toFixed(1)} kN on the outside flange weld (bf ${c.bf.toFixed(0)} mm, kds 1.5): ${fFl.toFixed(0)} N/mm`,
    },
    {
      dcr: fGroup / phiRw,
      f: fGroup,
      cap: phiRw,
      d: `weak-axis moment and shear on the weld group: √(fN² + fV²) = ${fGroup.toFixed(0)} N/mm`,
    },
    {
      dcr: fR / capK,
      f: fR,
      cap: capK,
      d: `rods between the flanges: ΣT/beff = ${fR.toFixed(0)} N/mm on the web weld (kds 1.5, DG1 Ex. 4.7-3)`,
    },
    {
      dcr: webStress / webAllow,
      f: fR,
      cap: (webAllow * c.tw) / 2,
      d: `web stress 2r/tw = ${webStress.toFixed(0)} MPa vs ${webAllow.toFixed(0)} MPa`,
    },
  ];
  const g = cands.reduce((a, b) => (b.dcr > a.dcr ? b : a));
  return {
    fN: Math.max(fFl, fW),
    fV,
    f: g.f,
    capacity: g.cap,
    dcr: g.dcr,
    length: wg.L,
    detail: g.d,
  };
}

/* ------------------------------------------------------------------ */
/* Seismic design (engine 0.5.0): AISC 341-22 D2.6, DG1 3rd Ed. Ch. 6   */
/* ------------------------------------------------------------------ */

/** AISC 341-22 Table A3.2 Ry values offered in the workspace. */
export const columnRyGrades = [
  { label: "ASTM A992", ry: 1.1 },
  { label: "ASTM A572 Gr 50", ry: 1.1 },
  { label: "ASTM A36", ry: 1.5 },
  { label: "ASTM A500 Gr C", ry: 1.3 },
  { label: "ASTM A500 Gr B", ry: 1.4 },
  { label: "ASTM A1085", ry: 1.25 },
  { label: "ASTM A53", ry: 1.6 },
] as const;

/** ACI 17.10.5.3 option used: weak base (a) with UT rods, strong base (c). */
export function seismicAciOption(i: Pick<BasePlateInput, "seismic">) {
  return i.seismic.baseType === "weak"
    ? "a"
    : i.seismic.baseType === "strong"
      ? "c"
      : i.seismic.option;
}

/**
 * Column plastic modulus for bending about plate axis X (moment Mx) or Y,
 * mm³: shapes-database Zx / Zy when stored, else from the dimensions.
 */
export function basePlateColumnZ(
  i: Pick<BasePlateInput, "column" | "rotation">,
  about: "x" | "y",
) {
  const c = i.column;
  // Section strong axis is bending about plate X at 0° (d along Y).
  const strong = (about === "x") === (i.rotation !== 90);
  if (c.family === "I") {
    if (strong && c.zx) return c.zx;
    if (!strong && c.zy) return c.zy;
    const hw = c.d - 2 * c.tf;
    return strong
      ? c.bf * c.tf * (c.d - c.tf) + (c.tw * hw * hw) / 4
      : (c.tf * c.bf * c.bf) / 2 + (hw * c.tw * c.tw) / 4;
  }
  if (c.family === "HSS-RECT") {
    if (strong && c.zx) return c.zx;
    if (!strong && c.zy) return c.zy;
    const [h, b] = strong ? [c.d, c.bf] : [c.bf, c.d];
    const t = c.tf;
    const hi = Math.max(0, h - 2 * t),
      bi = Math.max(0, b - 2 * t);
    return (b * h * h) / 4 - (bi * hi * hi) / 4;
  }
  if (c.zx) return c.zx;
  return (c.d ** 3 - Math.max(0, c.d - 2 * c.tf) ** 3) / 6;
}

/**
 * Included combinations, plus — for a moment-frame strong base — one
 * capacity combination per E combination with M = 1.1 Ry Fy Z / αs about
 * the axis of its larger moment (AISC 341-22 D2.6c(a); αs = 1.0 LRFD,
 * 1.5 ASD).
 */
export function seismicLoads(i: BasePlateInput): BasePlateLoad[] {
  const base = i.loads.filter((l) => l.included);
  const on = i.seismic.active && ["C", "D", "E", "F"].includes(i.seismic.sdc);
  if (!on || i.seismic.baseType !== "strong") return base;
  const as = i.designMethod === "LRFD" ? 1 : 1.5;
  const extra: BasePlateLoad[] = [];
  for (const l of base) {
    if (!l.seismic) continue;
    const about: "x" | "y" = Math.abs(l.my) > Math.abs(l.mx) ? "y" : "x";
    const mp =
      (1.1 * i.seismic.ry * i.column.fy * basePlateColumnZ(i, about)) /
      as /
      1e6;
    const m0 = about === "x" ? l.mx : l.my;
    const sgn = m0 < 0 ? -1 : 1;
    extra.push({
      ...l,
      id: `${l.id}·Mp`.slice(0, 30),
      mx: about === "x" ? sgn * mp : l.mx,
      my: about === "y" ? sgn * mp : l.my,
    });
  }
  return [...base, ...extra];
}

export interface WeakBaseResult {
  /** Large-moment, uniaxial combination: the DG1 6.4.2 method applies. */
  applies: boolean;
  scope: string;
  n: number;
  f: number;
  tu: number;
  aReduced: number;
  /** n φt Fy Ared, φt = 0.90 (DG1 Ex. 6.4-1), N. */
  yieldCap: number;
  yieldDcr: number;
  /** Minimum reduced diameter for Tu, mm. */
  dReq: number;
  /** Treduced = Fu Ared vs threaded 0.75 Fu Ase, N. */
  tReduced: number;
  threadCap: number;
  threadDcr: number;
  stretchDcr: number;
  /** Rt Treduced per rod, N; concrete limit states with ACI 17.10.5.4. */
  rtT: number;
  concreteDcr: number;
  concreteDetail: string;
  /** Plate: tension side for n Rt Treduced (Eq. 4-62); bearing reported. */
  tpTension: number;
  tpBearing: number;
}

/** DG1 6.4.2 / Ex. 6.4-1 checks for one E combination. */
function weakBaseCheck(env: Env, ps: PlateState, alpha: number): WeakBaseResult {
  const { i, rods } = env;
  const a = i.anchors,
    u = i.seismic.ut;
  const large = ps.axes.filter((x) => x.case === "large");
  const applies = ps.kase === "large" && large.length === 1 && ps.axes.length === 1;
  const ax = large[0];
  const n = ax ? ax.tensionRods.length : 0;
  const f = ax ? ax.f : 0;
  const tu = ax ? ax.tu : 0;
  const ared = (Math.PI * u.dReduced ** 2) / 4;
  const yieldCap = n * 0.9 * a.fy * ared;
  const tReduced = a.fu * ared;
  const threadCap = 0.75 * a.fu * a.ase;
  const rtT = u.rt * tReduced;
  // Concrete limit states with every tension rod at Rt Treduced (0.75 factor).
  let concreteDcr = 0,
    concreteDetail = "No tension line.";
  let tpTension = 0;
  if (ax && n > 0) {
    const t = rods.map((r) => (ax.tensionRods.includes(r.id) ? rtT : 0));
    const an = anchorChecks(i, rods, t, 0, 0, 0, 0, [], true);
    concreteDcr = Math.max(
      an.breakout?.dcr ?? 0,
      an.pullout?.dcr ?? 0,
      an.bond?.dcr ?? 0,
      ...an.sideFace.map((x) => x.dcr),
    );
    concreteDetail = `breakout ${an.breakout ? `${(an.breakout.nua / 1e3).toFixed(1)} vs ${((an.breakout.phi * 0.75 * an.breakout.ncbg) / 1e3).toFixed(1)} kN` : "—"}; pullout ${an.pullout ? `${(an.pullout.nua / 1e3).toFixed(1)} vs ${(an.pullout.phiNpn / 1e3).toFixed(1)} kN` : "—"}`;
    const idx = ax.tensionRods.map((id) => rods.findIndex((r) => r.id === id));
    tpTension = tensionLine(
      env.supports,
      ax.axis,
      idx.map((k) => ({ ...rods[k]!, t: rtT })),
      ax.x,
      ax.b,
      i.plate.fy,
      env.fb,
    ).tp;
  }
  void alpha;
  return {
    applies,
    scope: applies
      ? "large moment, uniaxial"
      : ps.axes.length > 1
        ? "biaxial: outside DG1 Ch. 6 (uniaxial only)"
        : "no large moment: no inelastic action in the base (DG1 6.4.2 item 3)",
    n,
    f,
    tu,
    aReduced: ared,
    yieldCap,
    yieldDcr: yieldCap > 0 ? tu / yieldCap : Infinity,
    dReq: n > 0 ? Math.sqrt((4 * tu) / (n * 0.9 * a.fy * Math.PI)) : NaN,
    tReduced,
    threadCap,
    threadDcr: tReduced / threadCap,
    stretchDcr: f / u.lStretch,
    rtT,
    concreteDcr,
    concreteDetail,
    tpTension,
    tpBearing: Math.max(0, ...ps.axes.map((x) => x.tpBearing)),
  };
}

function seismicNotes(i: BasePlateInput, on: boolean): string[] {
  if (!i.seismic.active)
    return [
      "Seismic design is not activated: SDC, earthquake flags, ACI 318-19 17.10 and AISC 341-22 are not applied.",
    ];
  if (!on)
    return [
      `Seismic design activated with SDC ${i.seismic.sdc}: ACI 17.10 and AISC 341 base provisions apply to SDC C–F only.`,
    ];
  const out: string[] = [];
  const t = i.seismic.baseType;
  out.push(
    t === "strong"
      ? `Moment-frame strong base (AISC 341-22 D2.6c(a)): each E combination also checked with M = 1.1 Ry Fy Z / αs (Ry ${i.seismic.ry}, ${i.seismic.columnGrade}); anchors per ACI 17.10.5.3(c). Column-to-plate welds are demand critical (CJP at the flanges).`
      : t === "weak"
        ? `Moment-frame weak base (AISC 341-22 D2.6c(b), DG1 6.4.2): E combinations must include Ω0. Upset-thread rods (dreduced ${i.seismic.ut.dReduced.toFixed(1)} mm, Lstretch ${i.seismic.ut.lStretch.toFixed(0)} mm, Rt ${i.seismic.ut.rt}) yield; concrete and the tension-side plate are designed for Rt Treduced; a shear lug is required; leveling nut and polyethylene tape on the stretch length; welds demand critical. Rotation capacity ≈ 0.04 rad expected (DG1 6.2).`
        : t === "braced"
          ? "Braced-frame base (DG1 6.5): strong base, Chapter 4 force-based design with the E combinations (enter AISC 341 required strengths)."
          : "Seismic: ACI 318-19 17.10 applied to E combinations; AISC 341-22 D2.6 required strengths are not calculated — enter base reactions that already satisfy AISC 341.",
  );
  if (seismicAciOption(i) === "d")
    out.push(
      "ACI 17.10.5.3(d) / 17.10.6.3(c): E combinations must include the overstrength factor Ω0 (designer-declared).",
    );
  if (i.seismic.exempt20)
    out.push(
      "ACI 17.10.3 exemption declared: earthquake share ≤ 20 % of the factored anchor forces, so 17.10.5 / 17.10.6 are not applied (designer to confirm).",
    );
  return out;
}

/** Full analysis of all included combinations. */
export function analyzeBasePlate(
  raw: BasePlateInput,
  tableHole: number | null = null,
): BasePlateResult {
  const i = basePlateInputSchema.parse(raw);
  const rods = basePlateRods(i);
  const cap = basePlateBearing(i);
  const st = basePlateStiffening(i);
  const notes: string[] = [];
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
  // ACI 318 has no ASD: anchor checks use α × ASD demand vs φRn (with the
  // LRFD-table option the ACI checks come from `anchorRun` instead).
  const alpha = i.designMethod === "ASD" ? i.asdAlpha : 1;
  // Seismic design only when activated (engine 0.5.0) and SDC C–F.
  const seismicSdc =
    i.seismic.active && ["C", "D", "E", "F"].includes(i.seismic.sdc);
  const env: Env = {
    i,
    rods,
    cap,
    st,
    supports: [...columnSupportPlates(i), ...(st?.plates ?? [])],
    fb: plateFactor(i),
    sumX2,
    sumY2,
  };
  const sctx = basePlateStiffenerContext(i);
  const combos: ComboResult[] = [];
  for (const load of seismicLoads(i)) {
    const P = load.pu;
    const vRes = Math.hypot(load.vx, load.vy) * 1e3;
    // E combination with seismic design active; ACI 17.10 unless exempt (17.10.3).
    const earthquake = seismicSdc && load.seismic;
    const seismicApplies = earthquake && !i.seismic.exempt20;
    // Shear lug: V·e (e = tgrout + hsl/2) adds to the base moment (DG1
    // Ex. 4.7-5; +Vx compresses the +X edge → +My).
    let lugMoment: ComboResult["lugMoment"] = null;
    let mx = load.mx,
      my = load.my;
    if (i.shear.method === "lug") {
      const o = i.shear.lug.orientation;
      const e = i.grout.thickness + i.shear.lug.depth / 2;
      const dmy = o !== "y" ? (load.vx * e) / 1e3 : 0,
        dmx = o !== "x" ? (load.vy * e) / 1e3 : 0;
      lugMoment = { mx: dmx, my: dmy, e };
      mx += dmx;
      my += dmy;
    }
    const ps = plateState(env, P, mx, my);
    let tension = ps.tension;
    let method = ps.method;
    // DG1 4.3.11 Eq. 4-69: biaxial large moment with compression, shear not
    // on the rods → moment strengths per axis at Pu, interaction ≤ 1.
    let biaxial: ComboResult["biaxial"] = null;
    if (
      P > 0 &&
      ps.kase === "large" &&
      ps.axes.length === 2 &&
      !rodsCarryShear(i)
    ) {
      const mcx = momentStrength(env, "y", P, mx, alpha, seismicApplies),
        mcy = momentStrength(env, "x", P, my, alpha, seismicApplies);
      biaxial = {
        mcx,
        mcy,
        ratio: (mx / mcx) ** 2 + (my / mcy) ** 2,
        basis:
          "DG1 Eq. 4-69 with Mc per axis at Pu from all limit states (bearing solution, plate, rod steel, ACI tension)",
      };
      // Rod forces shown per axis (largest), not superposed.
      tension = rods.map((_, k) =>
        Math.max(...ps.axisTension.map((t) => t[k] ?? 0)),
      );
      method =
        "Biaxial, large eccentricity: DG1 Eq. 4-69 interaction (per-axis Mc at Pu)";
    } else if (P > 0 && ps.kase === "large" && ps.axes.length === 2)
      method =
        "Biaxial, large eccentricity: per-axis DG1 analyses with full Pu, rod tensions superposed (rods carry shear, so DG1 Eq. 4-69 does not apply)";
    // Friction (DG1 Eq. 4-30), strength level: φ0.65 μP ≤ 0.75 min(0.2f′c, 5.5 MPa)·Ac.
    let friction: ComboResult["friction"] = null;
    let vRods = rodsCarryShear(i) ? vRes : 0;
    if (
      i.shear.method === "friction" ||
      i.shear.method === "friction-anchors"
    ) {
      const ac =
        ps.kase === "uplift" || ps.kase === "no-solution"
          ? 0
          : ps.kase === "biaxial-small"
            ? (i.plate.bx - 2 * Math.abs(ps.ex)) *
              (i.plate.by - 2 * Math.abs(ps.ey))
            : Math.min(
                ...ps.axes.map((a) =>
                  a.case === "axial" ? a.n * a.b : Math.min(a.y, a.n) * a.b,
                ),
              );
      const capLimit = 0.75 * Math.min(0.2 * i.pedestal.fc, 5.5) * ac;
      const capF =
        P > 0 && !earthquake
          ? Math.min(
              aiscFactors.friction.phi * i.shear.mu * alpha * P * 1e3,
              capLimit,
            )
          : 0;
      const demand = alpha * vRes;
      const share = Math.min(capF, demand);
      friction = {
        capacity: capF,
        cap: capLimit,
        ac,
        share,
        dcr: demand === 0 ? 0 : capF > 0 ? demand / capF : Infinity,
      };
      // Friction added to the rods (ACI 349 D.6.1.4): rods take the rest.
      if (i.shear.method === "friction-anchors")
        vRods = Math.max(0, demand - share) / alpha;
    }
    let lug: LugCheck | null = null;
    if (i.shear.method === "lug") {
      const nT = tension.filter((t) => t > 0).length;
      const o = i.shear.lug.orientation;
      const cx =
        o !== "y"
          ? lugCheck(i, "x", Math.abs(load.vx) * 1e3, P, nT, alpha, rods, cap)
          : null;
      const cy =
        o !== "x"
          ? lugCheck(i, "y", Math.abs(load.vy) * 1e3, P, nT, alpha, rods, cap)
          : null;
      const dcr = (c: LugCheck | null) =>
        c
          ? Math.max(
              c.bearingDcr,
              c.breakoutDcr,
              c.interaction,
              c.steelDcr,
              c.weldDcr,
              c.plateDcr,
            )
          : -1;
      lug = dcr(cx) >= dcr(cy) ? cx : cy;
      // A single plate lug cannot resist the perpendicular component.
      if (o === "x" && Math.abs(load.vy) > 0)
        lug = { ...(lug as LugCheck), bearingDcr: Infinity };
      if (o === "y" && Math.abs(load.vx) > 0)
        lug = { ...(lug as LugCheck), bearingDcr: Infinity };
    }
    // ACI 318 anchor checks: strength-level demand (ASD × α).
    const vScale = vRes > 0 ? vRods / vRes : 0;
    const anchor = anchorChecks(
      i,
      rods,
      tension.map((t) => t * alpha),
      vRods * alpha,
      load.vx * vScale * alpha,
      load.vy * vScale * alpha,
      P * alpha,
      shearRodIds,
      seismicApplies,
    );
    const rodShear = rods.map((r) =>
      vRods > 0 && shearRodIds.includes(r.id) ? vRods / shearRodIds.length : 0,
    );
    const rodAisc = rodAiscCheck(
      i,
      Math.max(0, ...tension),
      Math.max(0, ...rodShear),
    );
    const weld = columnWeld(i, wg, phiRw, P, mx, my, vRes, ps.groups);
    // Stiffener members.
    let stiffener: ComboStiffener | null = null;
    if (st)
      stiffener = {
        panels: ps.panels,
        tension: ps.groups,
        members: st.plates.map((p) =>
          memberCheck(
            sctx,
            st,
            p,
            ps.bearingCases
              .map((b) => stiffenerBearingLoad(p, st.input.t, b.region, b.fp))
              .filter((b) => b !== null),
            ps.groups
              .filter((g) => g.support === p.id)
              .map((g) => ({ t: g.tensions, xi: g.xi, beff: g.beff })),
          ),
        ),
        unstiffenedTp: ps.unstiffenedTp,
      };
    // Weak base (AISC 341 D2.6c(b), DG1 6.4.2): ductile UT anchor rods.
    const weakBase =
      earthquake && i.seismic.baseType === "weak"
        ? weakBaseCheck(env, ps, alpha)
        : null;
    combos.push({
      load,
      case: ps.kase,
      method,
      ex: ps.ex,
      ey: ps.ey,
      axes: ps.axes,
      bearingDcr: ps.bearingDcr,
      fp: ps.fp,
      lambdaNp: ps.lambdaNp,
      // DG1 6.4.2: weak-base E combinations check the plate on the tension
      // side for the fully yielded rods; the bearing side is reported.
      tpRequired: weakBase?.applies ? weakBase.tpTension : ps.tp,
      rodTension: tension,
      rodShear,
      shearRods: shearRodIds,
      vResultant: vRes,
      anchor,
      weld,
      friction,
      lug,
      seismicApplies,
      earthquake,
      weakBase,
      lugMoment,
      rodAisc,
      biaxial,
      plateTension: ps.groups,
      stiffener,
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
  for (const n of seismicNotes(i, seismicSdc)) notes.push(n);
  if (
    (i.shear.method === "friction" || i.shear.method === "friction-anchors") &&
    combos.some((c) => c.earthquake)
  )
    notes.push(
      "Friction is not relied on in earthquake combinations (DG1 4.3.5, ASCE 7 Ch. 13/15); use anchor rods or a shear lug.",
    );
  if (i.shear.method === "friction" || i.shear.method === "friction-anchors")
    notes.push(
      `Friction per DG1 Eq. 4-30 (ACI 349-13 D.6.1.4): φ 0.65 × μ ${i.shear.mu} × P ≤ 0.75 min(0.2f′c, 5.5 MPa) × Ac, Ac = bearing area of the combination (engine choice); zero for uplift and E combinations.${i.shear.method === "friction-anchors" ? " The rods resist the shear not taken by friction." : ""}`,
    );
  if (combos.some((c) => c.biaxial))
    notes.push(
      "Biaxial bending with large eccentricity checked by DG1 Eq. 4-69 (valid with compression and shear by lug or friction); rod forces are shown per axis.",
    );
  if (i.shear.method === "lug")
    notes.push(
      "Shear lug (DG1 Ex. 4.7-5): V·(tgrout + hsl/2) is added to the base moment for bearing, plate and rods; lug bearing depth ≤ 2tsl; breakout φ 0.65; local plate bending at the lug neglects the column.",
    );
  if (!i.anchors.weldedWashers)
    notes.push(
      "No welded plate washers: half of the rods assumed to resist shear and breakout checked from the front row (DG1; ACI R17.7.2.1).",
    );
  if (i.designMethod === "ASD")
    notes.push(
      `ASD (AISC 360-22 B3.2): loads are ASD combinations; steel checks use Rn/Ω (Ωc ${aiscFactors.bearing.omega}, Ωb ${aiscFactors.plateFlexure.omega}, Ωw ${aiscFactors.weld.omega}, rods ${aiscFactors.rod.omega}). ACI 318-19 has no ASD: ${i.asdAnchorBasis === "lrfd" ? "anchor, friction and lug-concrete checks use the separate LRFD combinations (DG1 practice)." : `anchor, friction and lug-concrete checks use ${alpha} × ASD demand vs φRn (engine option; DG1 checks ACI with LRFD loads).`}`,
    );
  if (i.concreteCode !== i.steelCode.replace("AISC 360-22", "ACI 318-19"))
    notes.push(
      "Concrete and steel primary design codes differ (one is NSCP 2015); confirm the project's code basis.",
    );
  if (st) {
    notes.push(
      `Stiffened base (${stiffenerLayoutInfo[st.input.layout].label}): outside the AISC DG1 3rd Ed. scope (Sec. 3.1). Stiffened zones: ${st.input.plateMethod === "strip" ? "Hillerborg strip method (lower bound)" : "yield-line panels (upper bound, ×1.10 corner allowance, not above the unstiffened cantilever)"} with the DG1 critical lines as supported back edges; unstiffened zones and λn′ per DG1. Tension side per DG1 Ex. 4.7-7 (nearest support, 45° width). The column-to-plate weld is checked without stiffener relief (conservative).`,
    );
    if (st.plates.some((p) => p.group !== "web-line"))
      notes.push(
        st.plates.some((p) => p.group === "mid-side" || p.group === "radial")
          ? "HSS wall local strength at the stiffeners (AISC 360-22 Ch. K plate-to-HSS) is not calculated: verify separately."
          : "Column flange-tip / web out-of-plane strength at flange-tip or web-side stiffeners is not calculated: verify separately.",
      );
    notes.push(
      "Stiffener free-edge slenderness uses hc/ts ≤ 0.56√(E/Fy) (engine rule; AISC 360-22 Table B4.1a case 1 limit); web local yielding uses k = tf (no fillet).",
    );
  }
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
    anchorRun:
      i.designMethod === "ASD" && i.asdAnchorBasis === "lrfd"
        ? analyzeBasePlate(
            {
              ...i,
              designMethod: "LRFD",
              asdAnchorBasis: "alpha",
              loads: i.lrfdLoads,
              lrfdLoads: [],
            },
            tableHole,
          )
        : null,
    stiffening: st,
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

/** Checks evaluated with ACI 318 (strength design; LRFD table under ASD). */
export const basePlateAciCheckIds = new Set([
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
  "friction",
  "lug-bearing",
  "lug-breakout",
  "seismic-weak-scope",
  "seismic-weak-yield",
  "seismic-weak-thread",
  "seismic-weak-stretch",
  "seismic-weak-concrete",
]);
/**
 * One row per check (governing combination), with the clause basis. Under
 * ASD with LRFD anchor demands, the ACI 318 rows come from the LRFD run.
 */
export function basePlateDesignChecks(
  i: BasePlateInput,
  r: BasePlateResult,
): DesignCheck[] {
  const own = designChecksOf(i, r);
  if (!r.anchorRun) return own;
  const li: BasePlateInput = {
    ...i,
    designMethod: "LRFD",
    asdAnchorBasis: "alpha",
    loads: i.lrfdLoads,
    lrfdLoads: [],
  };
  const lr = new Map(
    designChecksOf(li, r.anchorRun)
      .filter((c) => basePlateAciCheckIds.has(c.id))
      .map((c) => [c.id, { ...c, label: `${c.label} (LRFD Combinations)` }]),
  );
  const out = own
    .filter((c) => !basePlateAciCheckIds.has(c.id) || lr.has(c.id))
    .map((c) => lr.get(c.id) ?? c);
  for (const [id, c] of lr) if (!out.some((x) => x.id === id)) out.push(c);
  return out;
}
function designChecksOf(i: BasePlateInput, r: BasePlateResult): DesignCheck[] {
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
      clause: r.stiffening
        ? basePlateClauses.stiffenedPlate()
        : basePlateClauses.plate(),
      detail: `${t.c.load.id}: tp,req ${Number.isFinite(t.dcr) ? t.dcr.toFixed(1) : "—"} mm vs tp ${i.plate.tp.toFixed(1)} mm (Fy ${i.plate.fy} MPa, ${i.designMethod === "LRFD" ? "φb 0.90" : "Ωb 1.67"}). Suggested ${suggestPlateThickness(t.dcr) ?? "—"} mm.${t.c.stiffener ? ` Stiffened (${i.stiffeners.plateMethod}): unstiffened zones ${t.c.stiffener.unstiffenedTp.toFixed(1)} mm, panels ${Math.max(0, ...t.c.stiffener.panels.map((p) => p.tpReq)).toFixed(1)} mm, tension ${Math.max(0, ...t.c.stiffener.tension.map((g) => g.tpReq)).toFixed(1)} mm.` : ""}`,
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
      detail: `${w.c.load.id}: ${w.t.detail} vs ${i.designMethod === "LRFD" ? "φRn" : "Rn/Ω"} ${w.t.capacity.toFixed(0)} N/mm (${i.weld.size} mm E${(i.weld.fexx / 6.895).toFixed(0)} all around, compression by bearing).`,
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
  if (rodsCarryShear(i)) {
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
  if (rodsCarryShear(i)) {
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
        detail: `${f.c.load.id}: V ${kN(r.method.anchorDemandFactor * f.c.vResultant)} kN vs φ0.65 μP = ${kN(f.t.capacity)} kN (μ ${i.shear.mu}; cap 0.75 min(0.2f′c, 5.5 MPa) Ac = ${kN(f.t.cap)} kN, Ac ${(f.t.ac / 1e6).toFixed(3)} m²; none for uplift or E combinations).`,
      });
  }
  if (i.shear.method === "lug") {
    const L = <K extends keyof LugCheck>(k: K) =>
      governing(
        cs,
        (c) => c.lug,
        (x) => x[k] as number,
      );
    const lb = L("bearingDcr"),
      lc = L("breakoutDcr"),
      li = L("interaction"),
      ls = L("steelDcr"),
      lw = L("weldDcr"),
      lp = L("plateDcr");
    if (lb)
      push({
        id: "lug-bearing",
        label: "Shear Lug Bearing",
        dcr: lb.dcr,
        clause: basePlateClauses.lugBearing(),
        detail: `${lb.c.load.id}: ${lb.t.direction.toUpperCase()} V ${kN(lb.t.vu * r.method.anchorDemandFactor)} kN vs φVbrg ${kN(lb.t.phiVbrg)} kN (Aef ${lb.t.aef.toFixed(0)} mm², depth ≤ 2tsl; ψbrg,sl ${lb.t.psiBrg.toFixed(2)}).${Number.isFinite(lb.dcr) ? "" : " Single-plate lug cannot resist the perpendicular shear."}`,
      });
    if (lc)
      push({
        id: "lug-breakout",
        label: "Shear Lug Concrete Breakout",
        dcr: lc.dcr,
        clause: basePlateClauses.lugBreakout(),
        detail: `${lc.c.load.id}: ca1 ${lc.t.ca1.toFixed(0)} mm, φVcb ${kN(lc.t.phiVcb)} kN (φ 0.65).`,
      });
    if (li)
      push({
        id: "lug-flexure",
        label: "Shear Lug Flexure + Shear (Eq. 9-1)",
        dcr: li.dcr,
        clause: basePlateClauses.lugFlexure(),
        detail: `${li.c.load.id}: M/Mc + (V/Vc)⁴ = ${(li.t.mu / 1e6).toFixed(2)}/${(li.t.phiMn / 1e6).toFixed(2)} + (${kN(li.t.vu)}/${kN(li.t.phiVy)})⁴; M = V(tgrout + hsl/2), e ${li.t.e.toFixed(0)} mm.`,
      });
    if (ls)
      push({
        id: "lug-rupture",
        label: "Shear Lug Shear / Flexural Rupture",
        dcr: ls.dcr,
        clause: basePlateClauses.lugRupture(),
        detail: `${ls.c.load.id}: shear rupture ${kN(ls.t.phiVr)} kN, flexural rupture ${(ls.t.phiMr / 1e6).toFixed(2)} kN·m (Fu ${i.shear.lug.fu} MPa).`,
      });
    if (lw)
      push({
        id: "lug-weld",
        label: "Shear Lug Weld",
        dcr: lw.dcr,
        clause: basePlateClauses.lugWeld(),
        detail: `${lw.c.load.id}: √((V/2b)² + (M/(a b))²) = ${lw.t.weldF.toFixed(0)} vs ${lw.t.weldCap.toFixed(0)} N/mm (2 × ${i.shear.lug.weld} mm fillets, kds 1.5).`,
      });
    if (lp)
      push({
        id: "lug-plate",
        label: "Base Plate Bending at Lug",
        dcr: lp.dcr,
        clause: basePlateClauses.lugPlate(),
        detail: `${lp.c.load.id}: M = max(T f, qmax Y (N/2 − Y/2)) = ${(lp.t.plateM / 1e6).toFixed(2)} kN·m vs ${(lp.t.plateMn / 1e6).toFixed(2)} kN·m over b_sl (column neglected).`,
      });
    // ACI 17.11.1.1.8: hef ≥ 2.5 hsl and ≥ 2.5 csl.
    const o = i.shear.lug.orientation;
    const a = i.anchors;
    const csl = Math.max(
      o !== "y" ? ((a.nx - 1) * a.sx) / 2 : 0,
      o !== "x" ? ((a.ny - 1) * a.sy) / 2 : 0,
    );
    const need = 2.5 * Math.max(i.shear.lug.depth, csl);
    push({
      id: "geo-lug-hef",
      label: "Anchor Embedment with Shear Lug",
      dcr: need / a.hef,
      clause: basePlateClauses.lugHef(),
      detail: `hef ${a.hef.toFixed(0)} mm vs 2.5 max(hsl ${i.shear.lug.depth.toFixed(0)}, csl ${csl.toFixed(0)}) = ${need.toFixed(0)} mm.`,
    });
  }
  const ra = governing(
    cs,
    (c) => c.rodAisc,
    (x) => x.dcr,
  );
  if (ra)
    push({
      id: "rod-aisc",
      label: "Anchor Rod (AISC J3.8, With Bending)",
      dcr: ra.dcr,
      clause: basePlateClauses.rodAisc(),
      detail: `${ra.c.load.id}: ft = T/Ab + M/Z = ${ra.t.ft.toFixed(1)} vs ${ra.t.ftAllow.toFixed(1)} MPa; fv = ${ra.t.fv.toFixed(1)} vs ${ra.t.fvAllow.toFixed(1)} MPa (T ${kN(ra.t.t)} kN, V ${kN(ra.t.v)} kN, M = V × ${ra.t.lever.toFixed(1)} mm; Fnt 0.75Fu, Fnv 0.45Fu).`,
    });
  const bx = governing(
    cs,
    (c) => c.biaxial,
    (x) => x.ratio,
  );
  if (bx)
    push({
      id: "biaxial",
      label: "Biaxial Interaction (DG1 Eq. 4-69)",
      dcr: bx.dcr,
      clause: basePlateClauses.biaxial(),
      detail: `${bx.c.load.id}: (Mx/Mcx)² + (My/Mcy)² with Mcx ${bx.t.mcx.toFixed(1)} kN·m, Mcy ${bx.t.mcy.toFixed(1)} kN·m at Pu ${bx.c.load.pu.toFixed(1)} kN.`,
    });
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
  // Stiffeners (engine 0.3.0)
  const stf = r.stiffening;
  if (stf) {
    const worst = <T>(
      pick: (m: StiffenerMemberResult) => T | null,
      dcr: (t: T) => number,
    ) => {
      let best: {
        c: ComboResult;
        m: StiffenerMemberResult;
        t: T;
        dcr: number;
      } | null = null;
      for (const c of cs)
        for (const m of c.stiffener?.members ?? []) {
          const t = pick(m);
          if (t === null) continue;
          const d = dcr(t);
          if (!best || d > best.dcr) best = { c, m, t, dcr: d };
        }
      return best;
    };
    const s = stf.input;
    const fl = worst(
      (m) => m.flexure,
      (x) => x.dcr,
    );
    if (fl)
      push({
        id: "stiffener-flexure",
        label: "Stiffener Flexure",
        dcr: fl.dcr,
        clause: basePlateClauses.stiffenerFlexure(),
        detail: `${fl.c.load.id}, ${fl.m.id}: Mu ${(fl.t.mu / 1e6).toFixed(2)} kN·m at ${fl.t.xi.toFixed(0)} mm from the column face (h ${fl.t.h.toFixed(0)} mm) vs ${i.designMethod === "LRFD" ? "φbMn" : "Mn/Ωb"} ${(fl.t.phiMn / 1e6).toFixed(2)} kN·m — ${fl.t.basis || "no demand"}.`,
      });
    const sh = worst(
      (m) => m.shear,
      (x) => x.dcr,
    );
    if (sh)
      push({
        id: "stiffener-shear",
        label: "Stiffener Shear Yielding",
        dcr: sh.dcr,
        clause: basePlateClauses.stiffenerShear(),
        detail: `${sh.c.load.id}, ${sh.m.id}: Vu ${kN(sh.t.vu)} kN vs ${i.designMethod === "LRFD" ? "φVn" : "Vn/Ω"} ${kN(sh.t.phiVn)} kN (0.6Fy ts h).`,
      });
    const sl = stiffenerSlenderness(s);
    push({
      id: "stiffener-slenderness",
      label: "Stiffener Free-Edge Slenderness",
      dcr: sl.dcr,
      clause: basePlateClauses.stiffenerSlenderness(),
      detail: `hc/ts = ${s.hc}/${s.t} = ${sl.ratio.toFixed(1)} vs 0.56√(E/Fy) = ${sl.limit.toFixed(1)} (Fy ${s.fy} MPa).`,
    });
    const wc = worst(
      (m) => m.weldColumn,
      (x) => x.dcr,
    );
    if (wc)
      push({
        id: "stiffener-weld-column",
        label: "Stiffener-to-Column Weld",
        dcr: wc.dcr,
        clause: basePlateClauses.stiffenerWeld(),
        detail: `${wc.c.load.id}, ${wc.m.id}: f = √((V/2Lw)² + (M/(2Lw²/6))²) = ${wc.t.f.toFixed(0)} N/mm vs ${wc.t.capacity.toFixed(0)} N/mm (2 × ${s.weldColumn} mm fillets, Lw ${wc.t.length.toFixed(0)} mm).`,
      });
    const wp = worst(
      (m) => m.weldPlate,
      (x) => x.dcr,
    );
    if (wp)
      push({
        id: "stiffener-weld-plate",
        label: "Stiffener-to-Plate Weld",
        dcr: wp.dcr,
        clause: basePlateClauses.stiffenerWeld(),
        detail:
          wp.t.f > 0
            ? `${wp.c.load.id}, ${wp.m.id}: ${wp.t.f.toFixed(0)} N/mm vs ${wp.t.capacity.toFixed(0)} N/mm over ${wp.t.length.toFixed(0)} mm (${s.section === "tee" ? "rod tension + shear flow VQ/I" : "rod tension on one fillet, kds 1.5 (DG1 Ex. 4.7-7)"}).`
            : "No rod tension on the stiffeners; bearing transfers by contact.",
      });
    const co = worst(
      (m) => m.column,
      (x) => x.dcr,
    );
    if (co)
      push({
        id: "stiffener-column",
        label: "Column Web at Stiffener",
        dcr: co.dcr,
        clause: basePlateClauses.stiffenerColumn(),
        detail: `${co.c.load.id}, ${co.m.id}: H = 1.5M/Lw = ${kN(co.t.h)} kN over lb ${co.t.lb.toFixed(0)} mm vs web yielding ${kN(co.t.phiRnWly)} kN, crippling ${kN(co.t.phiRnWcr)} kN (member end, k = tf).`,
      });
    const short = stf.plates.filter((p) => p.length <= 1);
    push({
      id: "geo-stiffener-fit",
      label: "Stiffeners Fit the Plate",
      dcr: short.length ? Infinity : 0,
      invalidLabel: "Plate does not extend past the column",
      clause: "Geometry",
      detail: short.length
        ? `No length for ${short.map((p) => p.id).join(", ")}.`
        : `${stf.plates.length} stiffeners, length ${[...new Set(stf.plates.map((p) => p.length.toFixed(0)))].join(" / ")} mm, ts ${s.t} mm, hc ${s.hc} mm, he ${s.he} mm.`,
    });
    const cl = stiffenerRodClearance(stf, r.rods, i.anchors.washer.size);
    if (Number.isFinite(cl.min))
      push({
        id: "geo-stiffener-clear",
        label: "Rod Washer Clear of Stiffener",
        dcr: cl.min > 0 ? cl.required / cl.min : Infinity,
        invalidLabel: "Rod clashes with a stiffener",
        clause: "Geometry (engine rule: washer/2 + weld size)",
        detail: `${cl.rod}: ${cl.min.toFixed(1)} mm from the stiffener face vs ${cl.required.toFixed(1)} mm (washer ${i.anchors.washer.size.toFixed(0)}/2 + weld ${s.weldPlate} mm). Check wrench clearance.`,
      });
  }
  // Weak base (AISC 341 D2.6c(b), DG1 6.4.2 / Ex. 6.4-1).
  if (r.combos.some((c) => c.weakBase)) {
    const wb = <T>(pick: (w: WeakBaseResult) => T, dcr: (t: T) => number) =>
      governing(
        cs,
        (c) => (c.weakBase ? pick(c.weakBase) : null),
        dcr,
      );
    const u = i.seismic.ut;
    const sc = wb(
      (w) => w,
      (w) => (w.applies ? 0 : Infinity),
    );
    if (sc)
      push({
        id: "seismic-weak-scope",
        label: "Weak Base – Method Applies",
        dcr: sc.dcr,
        invalidLabel: "Outside DG1 6.4.2",
        clause: basePlateClauses.weakBase(),
        detail: `${sc.c.load.id}: ${sc.t.scope}.`,
      });
    const y = wb(
      (w) => w,
      (w) => w.yieldDcr,
    );
    if (y)
      push({
        id: "seismic-weak-yield",
        label: "Weak Base – Rod Reduced Section Yields",
        dcr: y.dcr,
        clause: basePlateClauses.weakBase(),
        detail: `${y.c.load.id}: Tu ${kN(y.t.tu)} kN ≤ n φt Fy Ared = ${y.t.n} × 0.90 × ${i.anchors.fy.toFixed(0)} × ${y.t.aReduced.toFixed(0)} = ${kN(y.t.yieldCap)} kN; dreduced ≥ ${y.t.dReq.toFixed(1)} mm (${u.dReduced.toFixed(1)} mm provided).`,
      });
    const th = wb(
      (w) => w,
      (w) => w.threadDcr,
    );
    if (th)
      push({
        id: "seismic-weak-thread",
        label: "Weak Base – Threads Stronger Than Reduced Section",
        dcr: th.dcr,
        clause: basePlateClauses.weakBase(),
        detail: `Treduced = Fu Ared = ${kN(th.t.tReduced)} kN ≤ 0.75 Fu Ase = ${kN(th.t.threadCap)} kN (threaded rod design strength).`,
      });
    const sl = wb(
      (w) => w,
      (w) => w.stretchDcr,
    );
    if (sl)
      push({
        id: "seismic-weak-stretch",
        label: "Weak Base – Stretch Length ≥ f",
        dcr: sl.dcr,
        clause: basePlateClauses.weakBase(),
        detail: `Lstretch ${u.lStretch.toFixed(0)} mm vs f ${sl.t.f.toFixed(0)} mm.`,
      });
    const co = wb(
      (w) => w,
      (w) => w.concreteDcr,
    );
    if (co)
      push({
        id: "seismic-weak-concrete",
        label: "Weak Base – Concrete for Yielded Rods",
        dcr: co.dcr,
        clause: basePlateClauses.weakBase(),
        detail: `${co.c.load.id}: each tension rod at Rt Treduced = ${u.rt} × ${kN(co.t.tReduced)} = ${kN(co.t.rtT)} kN with the 0.75 factor (17.10.5.4): ${co.t.concreteDetail}.`,
      });
    push({
      id: "seismic-weak-lug",
      label: "Weak Base – Shear Lug Provided",
      dcr: i.shear.method === "lug" ? 0 : Infinity,
      invalidLabel: "Shear lug required",
      clause: basePlateClauses.weakBase(),
      detail:
        i.shear.method === "lug"
          ? "Shear by the lug; the rods are not used for shear (DG1 6.4.2)."
          : "A weak base needs a shear lug: shear through the rods or friction may strain the yielding rods (DG1 6.4.2).",
    });
  }
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
  "rod-aisc",
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
