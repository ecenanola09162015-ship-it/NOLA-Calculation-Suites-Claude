/**
 * Single source of truth for code-clause references printed beside each
 * design check (review panel + PDF). Keep every reference here so a checker
 * can audit the basis of the whole suite in one place.
 *
 * Basis: ACI 318-19 (SI). NSCP 2015 projects use the same ACI 318-14-derived
 * provisions by designer selection; see the slab warning text.
 */
export const ACI_318_19 = "ACI 318-19";
export type SlabSystem = "one-way" | "two-way" | "cantilever";
const ref = (...parts: string[]) => `${ACI_318_19} ${parts.join("; ")}`;
const bySystem = (system: SlabSystem, oneWay: string, twoWay: string) =>
  system === "two-way" ? twoWay : oneWay;

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
      s === "cantilever"
        ? "Table 7.3.1.1 (cantilever ℓ/10), 7.3.1.1.1"
        : bySystem(
            s,
            "Table 7.3.1.1, 7.3.1.1.1",
            "Table 8.3.1.2 (αfm > 2.0), 8.3.1.2.1",
          ),
    ),
  deflection: (s?: SlabSystem) =>
    ref(
      "Ec 19.2.2.1, fr 19.2.3.1",
      "Ie Table 24.2.3.5",
      s === "cantilever" ? "Ie at support 24.2.3.7" : "24.2.3.6 / 24.2.3.7",
      "limit Table 24.2.2",
    ),
  /** Cantilever top bars developed beyond the support face. */
  cantileverAnchorage: () =>
    ref("25.4.2.1, 25.4.2.4", "Table 25.4.2.5", "critical section 7.7.3.2"),
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
    ref("22.2, 22.4", "linear biaxial interaction screen (reference only)"),
  biaxial3d: () =>
    ref(
      "22.2.1, 22.2.2 rotated neutral axis",
      "22.4.2.1",
      "φ Table 21.2.2",
      "radial at constant Pu",
    ),
  bresler: () =>
    ref("R22.4 Bresler reciprocal load (reference)", "Pu/0.65 ≥ 0.10 f′c Ag"),
  slenderness: (sway: boolean) =>
    ref(
      "6.2.5.1",
      sway ? "6.6.4.6.2 δs" : "6.6.4.5 δns, Cm 6.6.4.5.3, M2,min 6.6.4.5.4",
      "EI 6.6.4.4.4",
      "Mc ≤ 1.4 M2 6.2.5.3",
    ),
} as const;

/**
 * Retaining wall (engine rwall-0.1.0). † = clause number to be confirmed
 * against the licensed ACI 318-19 / NSCP 2015 text before release.
 */
export const retainingWallClauses = {
  stemFlexure: () =>
    ref("13.3.7.1† stem as one-way slab", "7.5.1.1", "22.2, 22.3", "φ Table 21.2.2"),
  stemShear: () =>
    ref(
      "13.3.7.3† critical section at the stem–footing interface",
      "Table 22.5.5.1(c)",
      "λs 22.5.5.1.3",
      "√f′c ≤ 8.3 MPa 22.5.3.1",
      "φ Table 21.2.1",
    ),
  plateFlexure: () =>
    ref("13.3.7.2† stem as two-way slab (Ch. 8)", "8.5.1.1", "22.2, 22.3", "φ Table 21.2.2", "Wood–Armer design moments"),
  plateShear: () =>
    ref("13.3.7.2†", "8.5.3.1.1", "Table 22.5.5.1(c)", "λs 22.5.5.1.3", "√f′c ≤ 8.3 MPa 22.5.3.1", "φ Table 21.2.1"),
  footingFlexure: () =>
    ref("13.2.7.1† critical section at the stem face", "7.5.1.1", "22.2, 22.3", "φ Table 21.2.2"),
  footingShear: () =>
    ref(
      "13.2.7.2† critical section",
      "Table 22.5.5.1(c), λs = 1 (13.2.6.2†)",
      "√f′c ≤ 8.3 MPa 22.5.3.1",
      "φ Table 21.2.1",
    ),
  minFlexural: () => ref("Table 7.6.1.1", "24.4.3.2"),
  wallVertical: () => ref("Table 11.6.1 ρℓ"),
  wallHorizontal: () => ref("11.1.6† / Table 11.6.1 ρt (both faces)"),
  spacingVertical: () => ref("7.7.2.3 (≤ 3h, 450 mm)"),
  spacingHorizontal: () => ref("11.7.3.1 (≤ 3h, 450 mm)"),
  spacingFooting: () => ref("7.7.2.3", "24.4.3.3 (≤ 5h, 450 mm)"),
  crackControl: () => ref("24.3.2 Table 24.3.2", "fs = 2/3 fy 24.3.2.1"),
  hook: () => ref("25.4.3.1", "Table 25.4.3.2", "√f′c ≤ 8.3 MPa 25.4.1.4"),
  lap: () => ref("25.4.2.4", "Class B lap 25.5.2.1"),
  cutoff: () => ref("7.7.3.3 / 9.7.3.3 extension max(d, 12db)", "9.7.3.4"),
  overturning: () =>
    "NSCP 2015 Sec. 307† (IBC 1807.2.3): FS ≥ project value, service loads",
  sliding: () =>
    "NSCP 2015 Sec. 307† (IBC 1807.2.3): FS ≥ project value, service loads",
  bearing: () =>
    "Allowable bearing (service); e > B/6 triangular contact q = 2V/3a (Das Ch. 13)",
  eccentricity: () => "Resultant within B/3 of the centre (contact ≥ B/2)",
} as const;
