/**
 * Anchor rod catalogue for the Base Plate module (shared, static).
 *
 * Sources (values are specified minimums; verify against the current edition
 * of each standard before release):
 * - ASTM F1554 Gr 36 / 55 / 105, ASTM A36, A193 B7 / B8, A449, ISO 898-1.
 * - Ductility per ACI 318-19 2.3 "ductile steel element": elongation ≥ 14 %
 *   and reduction of area ≥ 30 %.
 * - Thread stress area: ASME B1.1 (UNC) As = π/4 (d − 0.9743/n)²;
 *   ISO 898-1 (metric coarse) As = π/4 (d − 0.9382 P)².
 * - Holes and washers: AISC Manual 16th Ed. Table 14-2 (3/4 in to ≥ 2-1/2 in).
 */
export const MM_PER_IN = 25.4;
export const MPA_PER_KSI = 6.894757;

export type AnchorKind =
  | "cast-in-headed-bolt"
  | "cast-in-hooked-bolt"
  | "cast-in-headed-stud"
  | "adhesive"
  | "mech-torque-expansion"
  | "mech-displacement-expansion"
  | "mech-undercut"
  | "mech-screw";

export const anchorKinds: readonly {
  id: AnchorKind;
  label: string;
  castIn: boolean;
}[] = [
  { id: "cast-in-headed-bolt", label: "Cast-in headed bolt", castIn: true },
  {
    id: "cast-in-hooked-bolt",
    label: "Cast-in hooked bolt (J/L)",
    castIn: true,
  },
  { id: "cast-in-headed-stud", label: "Cast-in headed stud", castIn: true },
  { id: "adhesive", label: "Chemical (adhesive)", castIn: false },
  {
    id: "mech-torque-expansion",
    label: "Mechanical – torque-controlled expansion",
    castIn: false,
  },
  {
    id: "mech-displacement-expansion",
    label: "Mechanical – displacement-controlled expansion",
    castIn: false,
  },
  { id: "mech-undercut", label: "Mechanical – undercut", castIn: false },
  { id: "mech-screw", label: "Mechanical – screw anchor", castIn: false },
];
export const isCastIn = (k: AnchorKind) => k.startsWith("cast-in");
export const isMechanical = (k: AnchorKind) => k.startsWith("mech-");

export type ThreadSystem = "UNC" | "metric";
export interface RodSize {
  id: string;
  label: string;
  system: ThreadSystem;
  /** Nominal diameter, mm. */
  da: number;
  /** Threads per inch (UNC) or pitch mm (metric). */
  thread: number;
  /** Effective (stress) area Ase, mm². */
  ase: number;
}
const unc: [string, number, number][] = [
  ["1/2", 0.5, 13],
  ["5/8", 0.625, 11],
  ["3/4", 0.75, 10],
  ["7/8", 0.875, 9],
  ["1", 1, 8],
  ["1-1/8", 1.125, 7],
  ["1-1/4", 1.25, 7],
  ["1-3/8", 1.375, 6],
  ["1-1/2", 1.5, 6],
  ["1-3/4", 1.75, 5],
  ["2", 2, 4.5],
  ["2-1/4", 2.25, 4.5],
  ["2-1/2", 2.5, 4],
  ["2-3/4", 2.75, 4],
  ["3", 3, 4],
  ["3-1/4", 3.25, 4],
  ["3-1/2", 3.5, 4],
  ["3-3/4", 3.75, 4],
  ["4", 4, 4],
];
const metric: [number, number][] = [
  [10, 1.5],
  [12, 1.75],
  [16, 2],
  [20, 2.5],
  [24, 3],
  [27, 3],
  [30, 3.5],
  [36, 4],
  [42, 4.5],
  [48, 5],
  [56, 5.5],
  [64, 6],
];
export const rodSizes: readonly RodSize[] = [
  ...unc.map(([label, d, n]) => ({
    id: `${label} in`,
    label: `${label} in`,
    system: "UNC" as const,
    da: d * MM_PER_IN,
    thread: n,
    ase: (Math.PI / 4) * (d - 0.9743 / n) ** 2 * MM_PER_IN ** 2,
  })),
  ...metric.map(([d, p]) => ({
    id: `M${d}`,
    label: `M${d}`,
    system: "metric" as const,
    da: d,
    thread: p,
    ase: (Math.PI / 4) * (d - 0.9382 * p) ** 2,
  })),
];
export function getRodSize(id: string): RodSize | undefined {
  return rodSizes.find((s) => s.id === id);
}

export interface RodSpec {
  id: string;
  label: string;
  /** Sizes the specification covers. */
  system: ThreadSystem | "any";
  /** Diameter range (mm) for which fy/fu apply. */
  grades: { maxDa: number; fy: number; fu: number }[];
  elongation: number | null;
  reductionOfArea: number | null;
  ductile: boolean;
  use: string;
  /** Cast-in, post-installed rod or both. */
  kinds: "cast-in" | "post-installed" | "both";
  weldable?: boolean;
  userStrength?: boolean;
}
const ksi = (v: number) => Math.round(v * MPA_PER_KSI * 10) / 10;
const inch = (v: number) => v * MM_PER_IN + 1e-6;
export const rodSpecs: readonly RodSpec[] = [
  {
    id: "F1554-36",
    label: "ASTM F1554 Gr 36",
    system: "UNC",
    grades: [{ maxDa: inch(4), fy: ksi(36), fu: ksi(58) }],
    elongation: 23,
    reductionOfArea: 40,
    ductile: true,
    use: "Cast-in default (DG1)",
    kinds: "both",
  },
  {
    id: "F1554-55",
    label: "ASTM F1554 Gr 55",
    system: "UNC",
    grades: [{ maxDa: inch(4), fy: ksi(55), fu: ksi(75) }],
    elongation: 21,
    reductionOfArea: 30,
    ductile: true,
    use: "Cast-in",
    kinds: "both",
  },
  {
    id: "F1554-55S1",
    label: "ASTM F1554 Gr 55 S1 (weldable)",
    system: "UNC",
    grades: [{ maxDa: inch(4), fy: ksi(55), fu: ksi(75) }],
    elongation: 21,
    reductionOfArea: 30,
    ductile: true,
    use: "Cast-in, welded",
    kinds: "both",
    weldable: true,
  },
  {
    id: "F1554-105",
    label: "ASTM F1554 Gr 105",
    system: "UNC",
    grades: [{ maxDa: inch(3), fy: ksi(105), fu: ksi(125) }],
    elongation: 15,
    reductionOfArea: 45,
    ductile: true,
    use: "High strength",
    kinds: "both",
  },
  {
    id: "A36",
    label: "ASTM A36 threaded rod",
    system: "UNC",
    grades: [{ maxDa: inch(4), fy: ksi(36), fu: ksi(58) }],
    elongation: 20,
    reductionOfArea: null,
    ductile: true,
    use: "Cast-in / adhesive rod",
    kinds: "both",
  },
  {
    id: "A193-B7",
    label: "ASTM A193 B7",
    system: "UNC",
    grades: [
      { maxDa: inch(2.5), fy: ksi(105), fu: ksi(125) },
      { maxDa: inch(4), fy: ksi(95), fu: ksi(115) },
    ],
    elongation: 16,
    reductionOfArea: 50,
    ductile: true,
    use: "Adhesive rod",
    kinds: "both",
  },
  {
    id: "A449",
    label: "ASTM A449",
    system: "UNC",
    grades: [
      { maxDa: inch(1), fy: ksi(92), fu: ksi(120) },
      { maxDa: inch(1.5), fy: ksi(81), fu: ksi(105) },
      { maxDa: inch(3), fy: ksi(58), fu: ksi(90) },
    ],
    elongation: 14,
    reductionOfArea: 35,
    ductile: true,
    use: "Cast-in / adhesive rod",
    kinds: "both",
  },
  {
    id: "A193-B8-1",
    label: "ASTM A193 B8 Cl. 1 (stainless 304)",
    system: "UNC",
    grades: [{ maxDa: inch(4), fy: ksi(30), fu: ksi(75) }],
    elongation: 30,
    reductionOfArea: 50,
    ductile: true,
    use: "Corrosive exposure",
    kinds: "both",
  },
  {
    id: "ISO-4.6",
    label: "ISO 898-1 class 4.6",
    system: "metric",
    grades: [{ maxDa: 64, fy: 240, fu: 400 }],
    elongation: 22,
    reductionOfArea: null,
    ductile: true,
    use: "Metric rod",
    kinds: "both",
  },
  {
    id: "ISO-5.6",
    label: "ISO 898-1 class 5.6",
    system: "metric",
    grades: [{ maxDa: 64, fy: 300, fu: 500 }],
    elongation: 20,
    reductionOfArea: null,
    ductile: true,
    use: "Metric rod",
    kinds: "both",
  },
  {
    id: "ISO-8.8",
    label: "ISO 898-1 class 8.8",
    system: "metric",
    grades: [
      { maxDa: 16, fy: 640, fu: 800 },
      { maxDa: 64, fy: 660, fu: 830 },
    ],
    elongation: 12,
    reductionOfArea: 52,
    ductile: false,
    use: "Metric rod (not ductile: elongation 12 %)",
    kinds: "both",
  },
  {
    id: "ISO-10.9",
    label: "ISO 898-1 class 10.9",
    system: "metric",
    grades: [{ maxDa: 64, fy: 940, fu: 1040 }],
    elongation: 9,
    reductionOfArea: 48,
    ductile: false,
    use: "Metric rod (not ductile)",
    kinds: "both",
  },
  {
    id: "PRODUCT",
    label: "Product-specified (from ESR/ETA)",
    system: "any",
    grades: [],
    elongation: null,
    reductionOfArea: null,
    ductile: false,
    use: "Mechanical anchors",
    kinds: "post-installed",
    userStrength: true,
  },
  {
    id: "CUSTOM",
    label: "Custom (user Fy, Fu; flagged)",
    system: "any",
    grades: [],
    elongation: null,
    reductionOfArea: null,
    ductile: false,
    use: "Any",
    kinds: "both",
    userStrength: true,
  },
];
export function getRodSpec(id: string): RodSpec | undefined {
  return rodSpecs.find((s) => s.id === id);
}
/** Specified minimum Fy, Fu (MPa) of a specification at diameter da (mm). */
export function rodSpecStrength(spec: RodSpec, da: number) {
  const g = spec.grades.find((x) => da <= x.maxDa);
  return g ? { fy: g.fy, fu: g.fu } : null;
}
/** Sizes a specification can be supplied in. */
export function sizesForSpec(spec: RodSpec): RodSize[] {
  const maxDa = spec.grades.length
    ? Math.max(...spec.grades.map((g) => g.maxDa))
    : Infinity;
  return rodSizes.filter(
    (s) => (spec.system === "any" || s.system === spec.system) && s.da <= maxDa,
  );
}
/** ACI 318-19 17.6.1.2: futa ≤ min(1.9 fya, 860 MPa). */
export function futaUsed(fy: number, fu: number) {
  return Math.min(fu, 1.9 * fy, 860);
}

/**
 * AISC Manual 16th Ed. Table 14-2. Rows 3/4 to 2-1/2 in tabulated; ≥ 2-1/2:
 * hole d + 1-1/4, washer 2d + 1/2, thickness d/3. Sizes between rows use the
 * next larger row's oversize (flagged "derived"); below 3/4 in uses the 3/4 row.
 */
const t142: [number, number, number, number][] = [
  // rod d, hole dia, washer size, washer thickness (in)
  [0.75, 1.3125, 2, 0.25],
  [0.875, 1.5625, 2.5, 0.3125],
  [1, 1.8125, 3, 0.375],
  [1.25, 2.0625, 3, 0.5],
  [1.5, 2.3125, 3.5, 0.5],
  [1.75, 2.75, 4, 0.625],
  [2, 3.25, 5, 0.75],
  [2.5, 3.75, 5.5, 0.875],
];
export interface HoleWasher {
  hole: number;
  washer: number;
  washerThickness: number;
  source: "Table 14-2" | "Table 14-2 (≥ 2-1/2 in rule)" | "derived";
}
export function table14_2(da: number): HoleWasher {
  const d = da / MM_PER_IN;
  const exact = t142.find((r) => Math.abs(r[0] - d) < 1e-3);
  if (exact)
    return {
      hole: exact[1] * MM_PER_IN,
      washer: exact[2] * MM_PER_IN,
      washerThickness: exact[3] * MM_PER_IN,
      source: "Table 14-2",
    };
  if (d > 2.5 - 1e-3)
    return {
      hole: (d + 1.25) * MM_PER_IN,
      washer: (2 * d + 0.5) * MM_PER_IN,
      washerThickness: (d / 3) * MM_PER_IN,
      source: "Table 14-2 (≥ 2-1/2 in rule)",
    };
  const next = t142.find((r) => r[0] > d) ?? t142[0]!;
  return {
    hole: (d + (next[1] - next[0])) * MM_PER_IN,
    washer: Math.max(next[2], 2 * d + 0.5) * MM_PER_IN,
    washerThickness: Math.max(next[3], d / 3) * MM_PER_IN,
    source: "derived",
  };
}
/**
 * Bearing area of a heavy hex nut (ASME B18.2.2: F = 1.5d + 1/8 in), used as
 * Abrg for headed cast-in rods (ACI 318-19 17.6.3.2.2): hexagon area minus
 * the rod area.
 */
export function heavyHexBearingArea(da: number) {
  const f = 1.5 * da + 3.175;
  return (Math.sqrt(3) / 2) * f * f - (Math.PI / 4) * da * da;
}
export function heavyHexAcrossFlats(da: number) {
  return 1.5 * da + 3.175;
}
