/**
 * LRFD / ASD selection shared by all steel design modules (Base Plate now;
 * Steel Column and Steel Beam reuse it). AISC 360-22 B3.1 (LRFD: Ru ≤ φRn)
 * and B3.2 (ASD: Ra ≤ Rn/Ω). Each limit state carries both factors so the
 * engine applies one design-strength factor and the report prints the one
 * used.
 */
export const steelDesignMethods = ["LRFD", "ASD"] as const;
export type SteelDesignMethod = (typeof steelDesignMethods)[number];

export interface ResistanceFactor {
  phi: number;
  omega: number;
  /** Clause the pair comes from. */
  source: string;
}
/** AISC 360-22 resistance factors used by the steel modules. */
export const aiscFactors = {
  /** J8: bearing on concrete. */
  bearing: { phi: 0.65, omega: 2.31, source: "AISC 360-22 J8" },
  /** Flexural yielding of plates (F11, DG1). */
  plateFlexure: { phi: 0.9, omega: 1.67, source: "AISC 360-22 F11 / J10" },
  /** J2.4 fillet welds. */
  weld: { phi: 0.75, omega: 2.0, source: "AISC 360-22 J2.4" },
  /** Friction between plate and grout (DG1 4.5). */
  friction: { phi: 0.75, omega: 2.0, source: "AISC DG1 3rd Ed. 4.5" },
  /** Shear yielding (G2.1) — for later modules. */
  shearYield: { phi: 1.0, omega: 1.5, source: "AISC 360-22 G2.1(a)" },
  /** Compression / flexure members (E1, F1) — for later modules. */
  compression: { phi: 0.9, omega: 1.67, source: "AISC 360-22 E1" },
  flexure: { phi: 0.9, omega: 1.67, source: "AISC 360-22 F1" },
} as const satisfies Record<string, ResistanceFactor>;

/** Multiplier on the nominal strength: φ (LRFD) or 1/Ω (ASD). */
export function designFactor(f: ResistanceFactor, method: SteelDesignMethod) {
  return method === "LRFD" ? f.phi : 1 / f.omega;
}
/** "φ = 0.65" or "Ω = 2.31" for reports. */
export function factorLabel(
  f: ResistanceFactor,
  method: SteelDesignMethod,
  symbol = "",
) {
  return method === "LRFD"
    ? `φ${symbol} = ${f.phi}`
    : `Ω${symbol} = ${f.omega}`;
}
/** Demand / capacity wording per method. */
export function strengthWords(method: SteelDesignMethod) {
  return method === "LRFD"
    ? {
        demand: "factored (LRFD)",
        available: "design strength φRn",
        loads: "Factored LRFD combinations",
      }
    : {
        demand: "service (ASD)",
        available: "allowable strength Rn/Ω",
        loads: "ASD service combinations",
      };
}
/**
 * ACI 318 has no ASD provisions. Under ASD the anchor (ACI 318-19 Ch. 17)
 * checks use the ASD demand × α (default 1.6, a conservative load factor;
 * AISC DG1 practice), compared with the strength-design φRn.
 */
export const ASD_TO_STRENGTH_DEFAULT = 1.6;
