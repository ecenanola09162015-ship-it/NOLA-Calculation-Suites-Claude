/**
 * Concrete strength entered in psi, calculated in MPa (ACI 318-19 SI).
 * Shared by the Column and Slab Section & Materials panels.
 *
 * User decisions (14 Oct 2026, fc_psi_Range_Decisions F1–F11):
 * - F2  psi dropdown: 1000–15000 psi in 500 psi steps (+ Custom, typed psi).
 * - F3  calculation value = psi × 0.006894757 rounded to 0.1 MPa
 *       (5000 psi → 34.47… → 34.5 MPa). NIST SP 811, Appendix B.
 * - F4  engine limit 103.4 MPa (15000 psi) for Column and Slab.
 * - F5/F6 below 17 MPa, or below 21 MPa in a special moment frame, is
 *       allowed with a warning ("assessment only"); nothing is blocked
 *       unless the engine cannot evaluate it.
 * - F7–F9 notes: β1 = 0.65 from 55 MPa; high-strength above 68.89 MPa.
 */
export const MPA_PER_PSI = 0.006894757;
export const PSI_MIN = 1000;
export const PSI_MAX = 15000;
export const CONCRETE_PSI_OPTIONS: readonly number[] = Array.from(
  { length: (PSI_MAX - PSI_MIN) / 500 + 1 },
  (_, k) => PSI_MIN + 500 * k,
);
/** ACI 318-19 Table 19.2.1.1: structural concrete. */
export const FC_MIN_STRUCTURAL = 17;
/** ACI 318-19 Table 19.2.1.1 / 18.2.5.1: special moment frames. */
export const FC_MIN_SMF = 21;
/** ACI 318-19 Table 22.2.2.4.3: β1 = 0.65 for f′c ≥ 55 MPa. */
export const FC_BETA1_MIN = 55;
/** √f′c ≤ 8.3 MPa (22.5.3.1, 22.6.3.1, 25.4.1.4) ⇒ f′c > 8.3² = 68.89 MPa. */
export const FC_SQRT_CAP = 8.3 * 8.3;
/** Engine range (F4): 1000–15000 psi after 0.1 MPa rounding. */
export const FC_ENGINE_MIN = 6.8;
export const FC_ENGINE_MAX = 103.5;

/** Exact conversion, unrounded (printed for traceability). */
export const psiToMpaExact = (psi: number) => psi * MPA_PER_PSI;
/** Calculation value: exact conversion rounded to 0.1 MPa. */
export const fcFromPsi = (psi: number) =>
  Math.round(psiToMpaExact(psi) * 10) / 10;
/** psi shown for an MPa value typed before psi entry existed (whole psi). */
export const psiFromMpa = (mpa: number) => Math.round(mpa / MPA_PER_PSI);
/** Dropdown value for a strength: a listed option, else "custom". */
export function psiOption(psi: number | null | undefined): number | "custom" {
  return psi != null && CONCRETE_PSI_OPTIONS.includes(psi) ? psi : "custom";
}

export type ConcreteNoteLevel = "warning" | "caution" | "info";
export interface ConcreteNote {
  level: ConcreteNoteLevel;
  /** Short tag for the dropdown option. */
  tag: string;
  text: string;
}
export const HIGH_STRENGTH_NOTE =
  "High-strength concrete: confirm mix qualification and stress-block assumption against the project specification (ACI 363R).";

/**
 * Notes for a concrete strength. Nothing here blocks the calculation (F5,
 * F6); warnings are printed in Assumptions / Limitations (F11).
 * smf: column with special-moment-frame confinement.
 */
export function concreteStrengthNotes(
  fc: number,
  opts: { smf?: boolean } = {},
): ConcreteNote[] {
  if (!Number.isFinite(fc)) return [];
  const v = fc.toFixed(1);
  const notes: ConcreteNote[] = [];
  if (fc < FC_MIN_STRUCTURAL)
    notes.push({
      level: "warning",
      tag: "below ACI minimum",
      text: `f′c = ${v} MPa is below the 17 MPa minimum for structural concrete (ACI 318-19 Table 19.2.1.1) — assessment only.`,
    });
  else if (opts.smf && fc < FC_MIN_SMF)
    notes.push({
      level: "warning",
      tag: "below SMF minimum",
      text: `f′c = ${v} MPa is below the 21 MPa minimum for special moment frames (ACI 318-19 Table 19.2.1.1, 18.2.5.1) — assessment only.`,
    });
  if (fc > FC_SQRT_CAP) {
    notes.push({
      level: "caution",
      tag: "high strength",
      text: `f′c = ${v} MPa: √f′c is limited to 8.3 MPa for shear and development (ACI 318-19 22.5.3.1, 22.6.3.1, 25.4.1.4); β1 = 0.65 (Table 22.2.2.4.3).${opts.smf && fc > 70 ? " f′c > 70 MPa in a special moment frame: every longitudinal bar is supported by a seismic hook (18.7.5.2(f)) and Ash includes kf·kn (Table 18.7.5.4)." : ""}`,
    });
    notes.push({ level: "caution", tag: "high strength", text: HIGH_STRENGTH_NOTE });
  } else if (fc >= FC_BETA1_MIN)
    notes.push({
      level: "info",
      tag: "β1 = 0.65",
      text: `f′c = ${v} MPa ≥ 55 MPa: β1 = 0.65 (ACI 318-19 Table 22.2.2.4.3).`,
    });
  return notes;
}
