import type { ConcreteDesignCode } from "../design-codes";
import { FC_ENGINE_MAX, FC_ENGINE_MIN } from "../concrete-units";
/** Development engine: rectangular tied sections, SI units, compression-positive. */
import {
  biaxialCapacityAt,
  biaxialSection,
  breslerReciprocal,
  type BiaxialCapacity,
  type BreslerResult,
} from "./column-biaxial";
import {
  columnSlendernessSchema,
  slenderDirection,
  type ColumnSlendernessInput,
  type SlenderDirectionResult,
} from "./column-slenderness";
import {
  storeyClearHeights,
  type ColumnStorey,
} from "./column-storey";
/** ℓu from storey geometry (with any override) replaces the typed ℓu. */
export function slendernessWithStorey(
  sl: ColumnSlendernessInput,
  storey: ColumnStorey | undefined,
): ColumnSlendernessInput {
  if (!storey) return sl;
  const h = storeyClearHeights(storey);
  return {
    ...sl,
    x: { ...sl.x, lu: h.luX },
    y: { ...sl.y, lu: h.luY },
  };
}
import type { RebarStandard } from "../rebar-catalogue";
export type ColumnCode = ConcreteDesignCode;
export interface ColumnBar {
  x: number;
  y: number;
  diameter: number;
  /** Bundle id (bars sharing it are bundled, ACI 318-19 25.6.1); absent = single. */
  bundle?: string | null;
}
export interface ColumnLoad {
  id: string;
  description: string;
  pu: number;
  mx: number;
  my: number;
  included: boolean;
  /** Smaller end moments for Cm (same diagram sign as Mu ⇒ single curvature). */
  m1x?: number | null;
  m1y?: number | null;
  /** Factored shears (kN): Vux along x, Vuy along y. */
  vx?: number | null;
  vy?: number | null;
}
export interface RectangularColumnInput {
  code: ColumnCode;
  width: number;
  depth: number;
  fc: number;
  fy: number;
  es: number;
  cover: number;
  tieDiameter: number;
  bars: ColumnBar[];
  loads: ColumnLoad[];
  slenderness?: ColumnSlendernessInput;
  /** Bar catalogue used by the UI and report (default PNS 49). */
  rebarStandard?: RebarStandard;
  /** Longitudinal bar grade id from the catalogue; null = custom fy. */
  gradeId?: string | null;
  /** Longitudinal bar diameter from Materials (generator default), mm. */
  barDiameter?: number;
  /** Tie steel from Materials, adopted by shear/confinement and the estimate. */
  tieFyt?: number;
  tieGradeId?: string | null;
  /** Storey geometry; when present it sets ℓu for slenderness (6.2.4). */
  storey?: ColumnStorey;
  /**
   * Other codes for documentation only (e.g. "NSCP 2015; ASCE 7-16"). They
   * never change the calculation basis, which `code` sets.
   */
  otherCodes?: string;
  /**
   * Concrete strength as entered, psi. When set, fc = fcFromPsi(fcPsi)
   * (exact conversion rounded to 0.1 MPa). Absent on drafts typed in MPa.
   */
  fcPsi?: number | null;
}
export interface ColumnState {
  c: number;
  pn: number;
  mn: number;
  phi: number;
  designP: number;
  designM: number;
  tensionStrain: number;
}
export interface ColumnCurve {
  axis: "x" | "y";
  direction: 1 | -1;
  points: ColumnState[];
}
export interface ColumnCheck {
  load: ColumnLoad;
  /** Design moments after slenderness magnification (kN·m). */
  mux: number;
  muy: number;
  slenderness: { x: SlenderDirectionResult; y: SlenderDirectionResult } | null;
  capacityX: number | null;
  capacityY: number | null;
  axialRatio: number;
  /** Linear screen |Mux|/φMnx + |Muy|/φMny at constant Pu (reference only). */
  interaction: number | null;
  /** Governing biaxial check: 3D strain compatibility, radial at constant Pu. */
  biaxial: BiaxialCapacity | null;
  biaxialRatio: number | null;
  /** Bresler reciprocal load cross-check. */
  bresler: BreslerResult;
  outcome:
    "within-screening-envelope" | "outside-screening-envelope" | "not-checked";
}
export interface RectangularColumnResult {
  status: "verification-required";
  calculationBasis: "ACI 318-19";
  beta1: number;
  steelArea: number;
  grossArea: number;
  steelRatio: number;
  p0: number;
  axialCap: number;
  tensionCap: number;
  curves: ColumnCurve[];
  checks: ColumnCheck[];
  governing: ColumnCheck | null;
  warnings: string[];
}
const area = (bar: ColumnBar) => (Math.PI * bar.diameter ** 2) / 4;
export function columnBeta1(fc: number) {
  return Math.max(
    0.65,
    Math.min(0.85, 0.85 - (0.05 * Math.max(0, fc - 28)) / 7),
  );
}
export function tiedColumnPhi(tensionStrain: number, fy: number, es: number) {
  const yieldStrain = fy / es;
  return (
    0.65 +
    0.25 * Math.max(0, Math.min(1, (tensionStrain - yieldStrain) / 0.003))
  );
}
export function validateRectangularColumn(input: RectangularColumnInput) {
  if (input.code !== "ACI 318-19")
    throw new Error(
      "Choose a supported project code. The calculation basis is ACI 318-19.",
    );
  for (const key of [
    "width",
    "depth",
    "fc",
    "fy",
    "es",
    "tieDiameter",
  ] as const)
    if (!Number.isFinite(input[key]) || input[key] <= 0)
      throw new Error(`${key} must be a finite positive number.`);
  if (!Number.isFinite(input.cover) || input.cover < 0)
    throw new Error("Cover must be a finite nonnegative number.");
  if (
    input.fc < FC_ENGINE_MIN ||
    input.fc > FC_ENGINE_MAX ||
    input.fy < 200 ||
    input.fy > 550 ||
    input.es < 100000 ||
    input.es > 250000
  )
    throw new Error(
      "This development build supports f′c 1000–15000 psi (6.9–103.4 MPa), fy 200–550 MPa, and Es 100,000–250,000 MPa.",
    );
  if (input.fy / input.es > 0.003)
    throw new Error(
      "This build requires fy/Es ≤ 0.003 for the assumed axial compression limit.",
    );
  if (input.width > 10000 || input.depth > 10000)
    throw new Error(
      "Section dimensions must not exceed 10,000 mm in this build.",
    );
  if (new Set(input.loads.map((load) => load.id)).size !== input.loads.length)
    throw new Error("Combination labels must be unique.");
  if (input.bars.length < 4 || input.bars.length > 80)
    throw new Error(
      "Use 4–80 longitudinal bars for this rectangular tied-column build.",
    );
  input.bars.forEach((bar, i) => {
    if (
      ![bar.x, bar.y, bar.diameter].every(Number.isFinite) ||
      bar.diameter <= 0
    )
      throw new Error(
        `Bar ${i + 1}: enter finite coordinates and a positive diameter.`,
      );
    if (
      Math.abs(bar.x) + bar.diameter / 2 > input.width / 2 ||
      Math.abs(bar.y) + bar.diameter / 2 > input.depth / 2
    )
      throw new Error(`Bar ${i + 1} extends outside the concrete section.`);
    input.bars.slice(0, i).forEach((other) => {
      if (
        Math.hypot(bar.x - other.x, bar.y - other.y) <
        (bar.diameter + other.diameter) / 2 - 1e-6
      )
        throw new Error(`Bar ${i + 1} overlaps another longitudinal bar.`);
    });
  });
  if (
    input.bars.some(
      (bar) =>
        !input.bars.some(
          (other) =>
            Math.abs(bar.x + other.x) < 1e-6 &&
            Math.abs(bar.y + other.y) < 1e-6 &&
            Math.abs(bar.diameter - other.diameter) < 1e-6,
        ),
    )
  )
    throw new Error(
      "This first build requires centrally symmetric reinforcement: matching bars at (x,y) and (-x,-y).",
    );
  if (
    input.bars.reduce((sum, bar) => sum + area(bar), 0) >=
    input.width * input.depth
  )
    throw new Error("Steel area must be smaller than gross concrete area.");
  if (input.loads.length > 500)
    throw new Error("This build supports at most 500 combinations.");
  if (!input.loads.some((load) => load.included))
    throw new Error("Include at least one factored load combination.");
  for (const load of input.loads)
    if (!load.id.trim() || ![load.pu, load.mx, load.my].every(Number.isFinite))
      throw new Error(
        "Each load needs a label and finite Pu, Mux and Muy values.",
      );
  for (const load of input.loads)
    if (
      [load.m1x, load.m1y, load.vx, load.vy].some(
        (v) => v !== null && v !== undefined && !Number.isFinite(v),
      )
    )
      throw new Error(`${load.id}: M1 and Vu values must be finite or blank.`);
  if (input.slenderness) {
    const parsed = columnSlendernessSchema.safeParse(input.slenderness);
    if (!parsed.success)
      throw new Error(
        "Slenderness inputs: ℓu 0–50,000 mm, k 0.5–5, βdns 0–1, Q 0–0.9.",
      );
  }
}
export function columnStrainState(
  input: RectangularColumnInput,
  axis: "x" | "y",
  direction: 1 | -1,
  c: number,
): ColumnState {
  if (c === 0) {
    const pn =
      (-input.fy * input.bars.reduce((sum, bar) => sum + area(bar), 0)) / 1000;
    const mn =
      (-input.fy *
        input.bars.reduce(
          (sum, bar) => sum + area(bar) * (axis === "x" ? bar.y : bar.x),
          0,
        )) /
      1e6;
    return {
      c: 0,
      pn,
      mn,
      phi: 0.9,
      designP: 0.9 * pn,
      designM: 0.9 * mn,
      tensionStrain: Infinity,
    };
  }
  if (!(c > 0) || !Number.isFinite(c))
    throw new Error("Neutral-axis depth must be positive and finite.");
  const depth = axis === "x" ? input.depth : input.width;
  const breadth = axis === "x" ? input.width : input.depth;
  const a = Math.min(columnBeta1(input.fc) * c, depth);
  const concreteForce = 0.85 * input.fc * breadth * a;
  let p = concreteForce,
    m = concreteForce * direction * (depth / 2 - a / 2),
    tensile = 0;
  for (const bar of input.bars) {
    const coordinate = axis === "x" ? bar.y : bar.x;
    const distance = depth / 2 - direction * coordinate;
    const strain = 0.003 * (1 - distance / c);
    tensile = Math.max(tensile, -strain);
    const stress = Math.max(-input.fy, Math.min(input.fy, input.es * strain));
    const force = area(bar) * (stress - (distance <= a ? 0.85 * input.fc : 0));
    p += force;
    m += force * coordinate;
  }
  const phi = tiedColumnPhi(tensile, input.fy, input.es);
  const ast = input.bars.reduce((sum, bar) => sum + area(bar), 0);
  const p0 =
    (0.85 * input.fc * (input.width * input.depth - ast) + input.fy * ast) /
    1000;
  return {
    c,
    pn: p / 1000,
    mn: m / 1e6,
    phi,
    designP: Math.min((phi * p) / 1000, 0.8 * 0.65 * p0),
    designM: (phi * m) / 1e6,
    tensionStrain: tensile,
  };
}
export function columnCurve(
  input: RectangularColumnInput,
  axis: "x" | "y",
  direction: 1 | -1,
): ColumnCurve {
  const d = axis === "x" ? input.depth : input.width;
  const values = new Set<number>([0]);
  for (let i = 0; i <= 300; i++) values.add(d * 10 ** (-5 + (i / 300) * 8));
  const dt = Math.max(
    ...input.bars.map(
      (bar) => d / 2 - direction * (axis === "x" ? bar.y : bar.x),
    ),
  );
  for (const strain of [
    0,
    input.fy / input.es / 2,
    input.fy / input.es,
    input.fy / input.es + 0.003,
  ])
    values.add((0.003 * dt) / (0.003 + strain));
  for (const bar of input.bars) {
    const boundary =
      (d / 2 - direction * (axis === "x" ? bar.y : bar.x)) /
      columnBeta1(input.fc);
    if (boundary > 0) {
      values.add(boundary * (1 - 1e-8));
      values.add(boundary);
    }
  }
  return {
    axis,
    direction,
    points: [...values]
      .sort((a, b) => a - b)
      .map((c) => columnStrainState(input, axis, direction, c)),
  };
}
export function columnCapacityAt(
  input: RectangularColumnInput,
  curve: ColumnCurve,
  pu: number,
): number | null {
  let maximum = -Infinity;
  const points = curve.points;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!,
      b = points[i + 1]!;
    if (Math.abs(a.designP - pu) < 1e-7)
      maximum = Math.max(maximum, curve.direction * a.designM);
    if (
      pu < Math.min(a.designP, b.designP) ||
      pu > Math.max(a.designP, b.designP)
    )
      continue;
    if (Math.abs(a.designP - b.designP) < 1e-8) {
      maximum = Math.max(
        maximum,
        curve.direction * a.designM,
        curve.direction * b.designM,
      );
      continue;
    }
    let lo = a.c,
      hi = b.c,
      left = a.designP - pu;
    for (let iteration = 0; iteration < 55; iteration++) {
      const middle = (lo + hi) / 2;
      const value =
        columnStrainState(input, curve.axis, curve.direction, middle).designP -
        pu;
      if (left * value <= 0) hi = middle;
      else {
        lo = middle;
        left = value;
      }
    }
    const state = columnStrainState(
      input,
      curve.axis,
      curve.direction,
      (lo + hi) / 2,
    );
    if (Math.abs(state.designP - pu) < Math.max(0.01, Math.abs(pu) * 1e-6))
      maximum = Math.max(maximum, curve.direction * state.designM);
  }
  return Number.isFinite(maximum) && maximum >= 0 ? maximum : null;
}
export function analyzeRectangularColumn(
  input: RectangularColumnInput,
): RectangularColumnResult {
  validateRectangularColumn(input);
  const steelArea = input.bars.reduce((sum, bar) => sum + area(bar), 0),
    grossArea = input.width * input.depth;
  const p0 =
      (0.85 * input.fc * (grossArea - steelArea) + input.fy * steelArea) / 1000,
    axialCap = 0.8 * 0.65 * p0,
    tensionCap = (-0.9 * input.fy * steelArea) / 1000;
  const curves = (["x", "y"] as const).flatMap((axis) =>
    ([1, -1] as const).map((direction) => columnCurve(input, axis, direction)),
  );
  const warnings = [
    "Development calculation: independent engineering review is pending.",
    input.slenderness?.enabled
      ? "Slenderness by moment magnification (ACI 318-19 6.6.4). Rectangular tied sections with centrally symmetric reinforcement only."
      : "Slenderness is not considered: valid only for short columns (ACI 318-19 6.2.5.1). Rectangular tied sections with centrally symmetric reinforcement only.",
    "Biaxial strength by 3D strain compatibility with a rotated neutral axis, radial at constant Pu (governing). Bresler reciprocal and the linear screen are shown for reference.",
    "Bars are represented by concentrated areas at their centers; displaced concrete is subtracted when a bar center is within the compression block.",
  ];
  if (steelArea / grossArea < 0.01 || steelArea / grossArea > 0.08)
    warnings.push(
      "Longitudinal steel ratio is outside the 1–8% general column range; this is not a compliant-column approval.",
    );
  if (
    input.bars.some(
      (bar) =>
        Math.min(
          input.width / 2 - Math.abs(bar.x),
          input.depth / 2 - Math.abs(bar.y),
        ) <
        input.cover + input.tieDiameter + bar.diameter / 2 - 1e-6,
    )
  )
    warnings.push(
      "One or more bar locations do not satisfy the declared clear cover and tie diameter. Review the reinforcement layout.",
    );
  const section = biaxialSection(input);
  const slender = input.slenderness?.enabled
    ? slendernessWithStorey(input.slenderness, input.storey)
    : null;
  const checks: ColumnCheck[] = input.loads.map((load) => {
    const sl = slender
      ? {
          x: slenderDirection(input, slender, "x", load.pu, load.mx, load.m1x),
          y: slenderDirection(input, slender, "y", load.pu, load.my, load.m1y),
        }
      : null;
    const mux = sl ? sl.x.mc : load.mx,
      muy = sl ? sl.y.mc : load.my;
    const empty: ColumnCheck = {
      load,
      mux,
      muy,
      slenderness: sl,
      capacityX: null,
      capacityY: null,
      axialRatio: 0,
      interaction: null,
      biaxial: null,
      biaxialRatio: null,
      bresler: {
        applicable: false,
        pnx: null,
        pny: null,
        po: 0,
        pni: null,
        ratio: null,
        note: "Not checked.",
      },
      outcome: "not-checked",
    };
    if (!load.included) return empty;
    const axialRatio = load.pu >= 0 ? load.pu / axialCap : load.pu / tensionCap;
    if (!Number.isFinite(mux) || !Number.isFinite(muy))
      return {
        ...empty,
        axialRatio,
        interaction: null,
        biaxialRatio: Infinity,
        outcome: "outside-screening-envelope",
      };
    const cx = columnCapacityAt(
      input,
      curves.find(
        (curve) =>
          curve.axis === "x" && curve.direction === (mux >= 0 ? 1 : -1),
      )!,
      load.pu,
    );
    const cy = columnCapacityAt(
      input,
      curves.find(
        (curve) =>
          curve.axis === "y" && curve.direction === (muy >= 0 ? 1 : -1),
      )!,
      load.pu,
    );
    const rx = mux === 0 ? 0 : cx && cx > 0 ? Math.abs(mux) / cx : Infinity;
    const ry = muy === 0 ? 0 : cy && cy > 0 ? Math.abs(muy) / cy : Infinity;
    const interaction = rx + ry;
    const biaxial = biaxialCapacityAt(section, load.pu, mux, muy);
    const biaxialRatio = biaxial ? biaxial.ratio : Infinity;
    const bresler = breslerReciprocal(section, load.pu, mux, muy);
    return {
      ...empty,
      capacityX: cx,
      capacityY: cy,
      axialRatio,
      interaction: Number.isFinite(interaction) ? interaction : null,
      biaxial,
      biaxialRatio,
      bresler,
      outcome:
        axialRatio <= 1 && biaxialRatio <= 1
          ? "within-screening-envelope"
          : "outside-screening-envelope",
    };
  });
  const included = checks.filter((check) => check.load.included);
  const score = (check: ColumnCheck) =>
    Math.max(check.axialRatio, check.biaxialRatio ?? Infinity);
  const governing = included.reduce<ColumnCheck | null>(
    (best, check) => (!best || score(check) > score(best) ? check : best),
    null,
  );
  return {
    status: "verification-required",
    calculationBasis: "ACI 318-19",
    beta1: columnBeta1(input.fc),
    steelArea,
    grossArea,
    steelRatio: steelArea / grossArea,
    p0,
    axialCap,
    tensionCap,
    curves,
    checks,
    governing,
    warnings,
  };
}
