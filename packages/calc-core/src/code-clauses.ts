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
 * Base plate & anchor rods (engine base-plate-0.1.0). Steel side per
 * AISC 360-22 + AISC Design Guide 1, 3rd Ed. (2024); anchors per ACI 318-19
 * Chapter 17. Clause numbers to be confirmed against the licensed texts.
 */
const aisc = (...parts: string[]) => `AISC 360-22 ${parts.join("; ")}`;
const dg1 = (...parts: string[]) => `AISC DG1 3rd Ed. ${parts.join("; ")}`;
export const basePlateClauses = {
  bearing: () =>
    `${aisc("J8, Eq. J8-2, φc = 0.65")}; ${dg1("4.3 uniform bearing")}`,
  plate: () =>
    `${dg1("4.3–4.4 cantilever m, n, λn′; tension interface")}; ${aisc("φb = 0.90")}`,
  weld: () => aisc("J2.4, Table J2.5, φ = 0.75"),
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
  friction: () => dg1("4.5 friction, φ = 0.75"),
  lugBearing: () => ref("17.11.2.1, ψbrg,sl, φ = 0.65"),
  lugBreakout: () => ref("17.11.3 (Vb upper-bound expression; verify)"),
  lugFlexure: () =>
    `${aisc("F11 plastic moment of plate, φb = 0.90")}; ${dg1("4.5 shear lug")}`,
  holes: () =>
    "AISC Manual 16th Ed. Table 14-2; AISC FAQ 7.2.3 (½ in clear to plate edge)",
} as const;
