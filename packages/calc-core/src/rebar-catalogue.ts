/**
 * Reinforcing-bar catalogue shared by every concrete module.
 *
 * PNS 49 (Philippine National Standard, metric) and ASTM A615 / A706
 * (inch-pound sizes, nominal SI dimensions). Engines work with a single bar
 * diameter and compute A = πd²/4, so each size carries a `calcDiameter`
 * chosen so that πd²/4 equals the size's nominal area exactly:
 * PNS bars use d itself; ASTM bars use √(4A/π) from the ASTM table
 * (e.g. #8: A = 510 mm² → 25.48 mm vs nominal 25.4 mm).
 */
export type RebarStandard = "PNS49" | "ASTM";
export const rebarStandards: { id: RebarStandard; label: string }[] = [
  { id: "PNS49", label: "PNS 49 (metric)" },
  { id: "ASTM", label: "ASTM A615 / A706 (inch sizes)" },
];

export interface RebarSize {
  standard: RebarStandard;
  /** Designation shown to users and in reports, e.g. "D25" or "#8". */
  label: string;
  /** Nominal diameter, mm. */
  nominal: number;
  /** Nominal area, mm². */
  area: number;
  /** Diameter passed to the engines; π·calcDiameter²/4 = area. */
  calcDiameter: number;
}
const pns = (d: number): RebarSize => ({
  standard: "PNS49",
  label: `D${d}`,
  nominal: d,
  area: (Math.PI * d * d) / 4,
  calcDiameter: d,
});
const astm = (no: number, d: number, area: number): RebarSize => ({
  standard: "ASTM",
  label: `#${no}`,
  nominal: d,
  area,
  calcDiameter: Math.sqrt((4 * area) / Math.PI),
});
export const rebarSizes: Record<RebarStandard, RebarSize[]> = {
  PNS49: [6, 8, 10, 12, 16, 20, 25, 28, 32, 36, 40, 50].map(pns),
  // ASTM A615/A615M Table 1 nominal dimensions (SI).
  ASTM: [
    astm(3, 9.5, 71),
    astm(4, 12.7, 129),
    astm(5, 15.9, 199),
    astm(6, 19.1, 284),
    astm(7, 22.2, 387),
    astm(8, 25.4, 510),
    astm(9, 28.7, 645),
    astm(10, 32.3, 819),
    astm(11, 35.8, 1006),
    astm(14, 43.0, 1452),
    astm(18, 57.3, 2581),
  ],
};

export interface RebarGrade {
  id: string;
  standard: RebarStandard;
  label: string;
  /** Specified yield strength, MPa. */
  fy: number;
  /** Maximum actual yield strength, MPa (weldable / low-alloy grades). */
  fyMax?: number;
  /** Weldable / low-alloy steel (PNS "W" grades, ASTM A706). */
  weldable: boolean;
}
export const rebarGrades: Record<RebarStandard, RebarGrade[]> = {
  PNS49: [
    {
      id: "PNS-230",
      standard: "PNS49",
      label: "Grade 230",
      fy: 230,
      weldable: false,
    },
    {
      id: "PNS-280",
      standard: "PNS49",
      label: "Grade 280",
      fy: 280,
      weldable: false,
    },
    {
      id: "PNS-420",
      standard: "PNS49",
      label: "Grade 420",
      fy: 420,
      weldable: false,
    },
    {
      id: "PNS-520",
      standard: "PNS49",
      label: "Grade 520",
      fy: 520,
      weldable: false,
    },
    {
      id: "PNS-550",
      standard: "PNS49",
      label: "Grade 550",
      fy: 550,
      weldable: false,
    },
    {
      id: "PNS-280W",
      standard: "PNS49",
      label: "Grade 280W",
      fy: 280,
      weldable: true,
    },
    {
      id: "PNS-420W",
      standard: "PNS49",
      label: "Grade 420W",
      fy: 420,
      fyMax: 540,
      weldable: true,
    },
    {
      id: "PNS-550W",
      standard: "PNS49",
      label: "Grade 550W",
      fy: 550,
      fyMax: 675,
      weldable: true,
    },
  ],
  ASTM: [
    {
      id: "A615-40",
      standard: "ASTM",
      label: "A615 Gr 40",
      fy: 280,
      weldable: false,
    },
    {
      id: "A615-60",
      standard: "ASTM",
      label: "A615 Gr 60",
      fy: 420,
      weldable: false,
    },
    {
      id: "A615-75",
      standard: "ASTM",
      label: "A615 Gr 75",
      fy: 520,
      weldable: false,
    },
    {
      id: "A615-80",
      standard: "ASTM",
      label: "A615 Gr 80",
      fy: 550,
      weldable: false,
    },
    {
      id: "A706-60",
      standard: "ASTM",
      label: "A706 Gr 60",
      fy: 420,
      fyMax: 540,
      weldable: true,
    },
    {
      id: "A706-80",
      standard: "ASTM",
      label: "A706 Gr 80",
      fy: 550,
      fyMax: 675,
      weldable: true,
    },
  ],
};
export const allRebarGrades = [...rebarGrades.PNS49, ...rebarGrades.ASTM];

const close = (a: number, b: number) => Math.abs(a - b) < 0.01;

/** Catalogue size for an engine diameter, or null when it is a custom value. */
export function rebarSizeFor(standard: RebarStandard, diameter: number) {
  return (
    rebarSizes[standard].find((s) => close(s.calcDiameter, diameter)) ?? null
  );
}
/** Report designation: "D25", "#8", or "Ø23.5 (custom)". */
export function rebarDesignation(standard: RebarStandard, diameter: number) {
  const s = rebarSizeFor(standard, diameter);
  return s ? s.label : `Ø${+diameter.toFixed(2)} (custom)`;
}
export function rebarGradeById(id: string | null | undefined) {
  return allRebarGrades.find((g) => g.id === id) ?? null;
}
/**
 * The grade a saved (id, fy) pair refers to. An id whose fy no longer matches
 * is treated as custom; without an id, the first non-weldable grade of the
 * standard with that fy is assumed (drafts saved before the catalogue).
 */
export function rebarGradeFor(
  standard: RebarStandard,
  fy: number,
  id?: string | null,
) {
  const byId = rebarGradeById(id);
  if (byId) return byId.fy === fy ? byId : null;
  return rebarGrades[standard].find((g) => g.fy === fy && !g.weldable) ?? null;
}
export function rebarGradeLabel(
  standard: RebarStandard,
  fy: number,
  id?: string | null,
) {
  const g = rebarGradeFor(standard, fy, id);
  return g ? g.label : `fy ${fy} MPa (custom)`;
}
