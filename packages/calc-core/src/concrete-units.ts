/**
 * Concrete strength entered in psi, calculated in MPa (ACI 318-19 SI).
 *
 * User decisions (14 Oct 2026, Panel 01 decision sheet):
 * - D7  psi dropdown: 2500 … 8000 psi + Custom.
 * - D8  Custom strength is typed in psi; MPa shows the conversion.
 * - D9/D10 the MPa value used in the calculation is the exact conversion
 *   rounded to 0.1 MPa (5000 psi → 34.47… → 34.5 MPa).
 * Exact factor: 1 psi = 6894.757 Pa (NIST SP 811, Appendix B).
 */
export const MPA_PER_PSI = 0.006894757;
export const CONCRETE_PSI_OPTIONS = [
  2500, 3000, 3500, 4000, 4500, 5000, 6000, 7000, 8000,
] as const;
/** Exact conversion, unrounded (printed for traceability). */
export const psiToMpaExact = (psi: number) => psi * MPA_PER_PSI;
/** Calculation value: exact conversion rounded to 0.1 MPa. */
export const fcFromPsi = (psi: number) =>
  Math.round(psiToMpaExact(psi) * 10) / 10;
/** psi shown for an MPa value typed before psi entry existed (whole psi). */
export const psiFromMpa = (mpa: number) => Math.round(mpa / MPA_PER_PSI);
/** Dropdown value for a strength: a listed option, else "custom". */
export function psiOption(psi: number | null | undefined): number | "custom" {
  return psi != null &&
    (CONCRETE_PSI_OPTIONS as readonly number[]).includes(psi)
    ? psi
    : "custom";
}
