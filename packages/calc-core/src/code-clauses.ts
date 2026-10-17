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
  counterfortFlexure: () =>
    ref("13.3.7.2† counterfort as tapered T-beam", "flange 6.3.2.1", "22.2, 22.3", "φ Table 21.2.2"),
  counterfortShear: () =>
    ref("22.5.1.1", "Vc 22.5.5.1(a)", "Vs 22.5.8.5.3", "Vs ≤ 0.66√f′c bw d 22.5.1.2", "tapered member R9.4.3†", "φ Table 21.2.1"),
  counterfortTies: () => ref("13.3.7.2†", "direct tension φ = 0.90 Table 21.2.1", "anchorage Ch. 25"),
  counterfortMin: () => ref("9.6.1.2 / 9.6.1.3 (4/3 As,req)", "Av,min 9.6.3.4"),
  counterfortHeel: () => ref("13.3.7.2† heel as continuous slab", "7.5.1.1", "22.2, 22.3"),
  barSpacing: () => ref("25.2.1 (≥ 25 mm, db)"),
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

/**
 * Base plate & anchor rods (engine base-plate-0.2.0; LRFD φ / ASD Ω). Steel side per
 * AISC 360-22 + AISC Design Guide 1, 3rd Ed. (2024); anchors per ACI 318-19
 * Chapter 17. Clause numbers to be confirmed against the licensed texts.
 */
const aisc = (...parts: string[]) => `AISC 360-22 ${parts.join("; ")}`;
const dg1 = (...parts: string[]) => `AISC DG1 3rd Ed. ${parts.join("; ")}`;
export const basePlateClauses = {
  bearing: () =>
    `${aisc("J8, Eq. J8-2, φc = 0.65 / Ωc = 2.31")}; ${dg1("4.3 uniform bearing")}`,
  plate: () =>
    `${dg1("4.3.1, 4.3.7 cantilevers m, n, λn′ (I only); Eq. 4-62 tension interface; Ex. 4.7-3 web")}; ${aisc("φb = 0.90 / Ωb = 1.67")}`,
  weld: () =>
    `${aisc("J2.4, Table J2.5, kds Eq. J2-5, φ = 0.75 / Ω = 2.00")}; ${dg1("Ex. 4.7-3, 4.7-9")}`,
  steelTension: () =>
    ref("17.6.1.2, futa ≤ min(1.9fya, 860 MPa)", "φ Table 17.5.3"),
  steelShear: () =>
    ref("17.7.1.2(b)", "grout pad ×0.80 17.7.1.2.1", "φ Table 17.5.3"),
  breakoutTension: () =>
    ref(
      "17.6.2.1",
      "Nb 17.6.2.2",
      "ψec,N 17.6.2.3",
      "ψed,N 17.6.2.4",
      "ψc,N 17.6.2.5",
      "ψcp,N 17.6.2.6",
      "h′ef 17.6.2.1.2",
    ),
  pullout: () => ref("17.6.3.1, 17.6.3.2.2", "ψc,P 17.6.3.3"),
  sideFace: () => ref("17.6.4.1, 17.6.4.2"),
  bond: () =>
    ref(
      "17.6.5.1, 17.6.5.2",
      "cNa 17.6.5.1.2",
      "τ Table 17.6.5.2.5 or product report",
    ),
  sustained: () => ref("17.5.2.2: 0.55φNba ≥ Nua,s"),
  breakoutShear: () =>
    ref(
      "17.7.2.1(b)",
      "Vb 17.7.2.2.1",
      "ψed,V 17.7.2.4",
      "ψc,V 17.7.2.5",
      "ψh,V 17.7.2.6",
      "narrow member 17.7.2.1.2",
    ),
  pryout: () => ref("17.7.3.1, kcp"),
  interaction: () => ref("17.8"),
  geometry: () => `${ref("17.9.1, 17.9.2")}; AISC Manual 16th Ed. Table 14-2`,
  memberThickness: () => ref("17.9.4"),
  seismic: () => ref("17.10.5.3(a), 17.10.5.4 (0.75 concrete tension)"),
  friction: () =>
    `${dg1("Eq. 4-30, μ = 0.4, φ = 0.65")}; ACI 349-13 D.6.1.4; ${ref("22.9.4.4 cap, φ = 0.75")}`,
  lugBearing: () => ref("17.11.2.1, Aef depth ≤ 2tsl, ψbrg,sl, φ = 0.65"),
  lugBreakout: () => ref("17.11.3, φ = 0.65 (17.11.1.1.6)"),
  lugFlexure: () =>
    `${aisc("J4.5 Mn = Fy Z, J4.2 shear yielding")}; AISC Manual Eq. 9-1; ${dg1("Ex. 4.7-5")}`,
  lugRupture: () =>
    aisc("J4.2(b) shear rupture, J4.5 flexural rupture, φ = 0.75 / Ω = 2.00"),
  lugWeld: () => `${aisc("J2.4, kds Eq. J2-5")}; ${dg1("Ex. 4.7-5")}`,
  lugPlate: () => `${dg1("Ex. 4.7-5 local plate bending")}; ${aisc("J4.5")}`,
  lugHef: () => ref("17.11.1.1.8: hef ≥ 2.5hsl, hef ≥ 2.5csl"),
  rodAisc: () =>
    `${aisc("J3.6, J3.7, J3.8 (Eq. J3-3), φ = 0.75 / Ω = 2.00")}; ${dg1("Eq. 4-26 to 4-28")}`,
  biaxial: () => dg1("4.3.11 Eq. 4-69"),
  holeBearing: () =>
    `${aisc("J3.11 Eq. J3-6b / J3-6d, J3.3 standard hole, φ = 0.75 / Ω = 2.00")}; ${dg1("4.5.3, Ex. 4.7-6")}`,
  weakBase: () =>
    `AISC 341-22 D2.6c(b); ${dg1("6.4.2, Ex. 6.4-1")}; ${ref("17.10.5.3(a), 17.10.5.4")}`,
  holes: () =>
    "AISC Manual 16th Ed. Table 14-2; AISC FAQ 7.2.3 (½ in clear to plate edge)",
  stiffenedPlate: () =>
    `Yield-line / strip panels on the ${dg1("4.3 critical lines")} (stiffened bases outside DG1 scope, Sec. 3.1); ${dg1("Ex. 4.7-7 tension, 45°")}; ${aisc("φb = 0.90 / Ωb = 1.67")}`,
  stiffenerFlexure: () =>
    aisc("F11 rectangular bar (LTB, Cb 1.0) or F9 tee", "φb = 0.90 / Ωb = 1.67"),
  stiffenerShear: () => aisc("J4.2(a) shear yielding, φ = 1.00 / Ω = 1.50"),
  stiffenerSlenderness: () =>
    aisc("Table B4.1a case 1 limit 0.56√(E/Fy) applied to hc/ts (engine rule)"),
  stiffenerWeld: () =>
    `${aisc("J2.4, kds Eq. J2-5")}; ${dg1("Ex. 4.7-7")}`,
  stiffenerColumn: () =>
    aisc("J10.2 web local yielding, J10.3 web crippling (member end)"),
} as const;
