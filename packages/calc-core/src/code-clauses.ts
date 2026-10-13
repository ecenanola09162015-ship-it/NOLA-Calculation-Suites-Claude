/**
 * Single source of truth for code-clause references printed beside each
 * design check (review panel + PDF). Keep every reference here so a checker
 * can audit the basis of the whole suite in one place.
 *
 * Basis: ACI 318-19 (SI). NSCP 2015 projects use the same ACI 318-14-derived
 * provisions by designer selection; see the slab warning text.
 */
export const ACI_318_19 = "ACI 318-19";
export type SlabSystem = "one-way" | "two-way";
const ref = (...parts: string[]) => `${ACI_318_19} ${parts.join("; ")}`;
const bySystem = (system: SlabSystem, oneWay: string, twoWay: string) =>
  system === "one-way" ? oneWay : twoWay;

export const slabClauses = {
  flexure: (s: SlabSystem) =>
    ref(bySystem(s, "7.5.1.1", "8.5.1.1"), "22.2, 22.3", "φ Table 21.2.2"),
  minimumSteel: (s: SlabSystem) =>
    ref(bySystem(s, "Table 7.6.1.1", "Table 8.6.1.1"), "24.4.3.2"),
  spacing: (s: SlabSystem, distribution: boolean) =>
    ref(
      s === "two-way" ? "8.7.2.2" : distribution ? "24.4.3.3" : "7.7.2.3",
      "clear spacing 25.2.1",
    ),
  strain: () =>
    ref(
      "tension-controlled limit Table 21.2.2 (in-house; stricter than 7.3.3.1 / 8.3.3.1 εt ≥ 0.004)",
    ),
  shear: (s: SlabSystem) =>
    ref(
      bySystem(s, "7.5.3.1", "8.5.3.1.1"),
      "Table 22.5.5.1",
      "√f′c ≤ 8.3 MPa 22.5.3.1",
      "φ Table 21.2.1",
    ),
  /** One-way shear with a point load within d of the support (critical section at the support). */
  shearAtSupport: (s: SlabSystem) =>
    ref(
      bySystem(s, "7.5.3.1", "8.5.3.1.1"),
      "7.4.3.2(c)",
      "Table 22.5.5.1",
      "√f′c ≤ 8.3 MPa 22.5.3.1",
      "φ Table 21.2.1",
    ),
  punching: () =>
    ref(
      "22.6.1.2, critical section 22.6.4.1",
      "d 22.6.2.1",
      "vc Table 22.6.5.2, λs 22.5.5.1.3",
      "√f′c ≤ 8.3 MPa 22.6.3.1",
      "φ Table 21.2.1",
    ),
  minimumThickness: (s: SlabSystem) =>
    ref(
      bySystem(
        s,
        "Table 7.3.1.1, 7.3.1.1.1",
        "Table 8.3.1.2 (αfm > 2.0), 8.3.1.2.1",
      ),
    ),
  deflection: () =>
    ref(
      "Ec 19.2.2.1, fr 19.2.3.1",
      "Ie Table 24.2.3.5",
      "24.2.3.6 / 24.2.3.7",
      "limit Table 24.2.2",
    ),
  development: (s: SlabSystem) =>
    ref(
      "25.4.2.1, 25.4.2.4",
      "√f′c ≤ 8.3 MPa 25.4.1.4",
      "Table 25.4.2.5",
      bySystem(s, "cutoff 7.7.3.3", "cutoff 8.7.4"),
    ),
} as const;

export const columnClauses = {
  axial: () => ref("22.4.2", "φ Table 21.2.2"),
  flexure: () => ref("22.2, 22.4", "φ Table 21.2.2"),
  interaction: () =>
    ref("22.2, 22.4", "linear biaxial interaction screen (designer method)"),
} as const;
