/**
 * Slenderness by the moment magnification method, ACI 318-19 6.2.5 and 6.6.4.
 *
 * Direction "x" is bending about x (Mux): h = section depth, I = b·h³/12.
 * End-moment sign convention for the optional smaller end moment M1:
 * enter it with the same moment-diagram sign convention as Mu. Same sign as
 * Mu ⇒ single curvature. Internally the ACI 318-19 ratio M1/M2 is negative
 * for single curvature and positive for double curvature (6.2.5.1, 6.6.4.5.3).
 */
import { z } from "zod";
import type { ColumnBar } from "./rectangular-column";

const finite = z.number().finite();
const direction = z.object({
  /** Unsupported length ℓu, mm (6.2.5, 6.6.4.4.2). */
  lu: finite.min(0).max(50000),
  /** Effective length factor k (6.6.4.4.3). */
  k: finite.min(0.5).max(5),
  /** Sway (unbraced) about this axis. */
  sway: z.boolean(),
  /** Stability index Q (6.6.4.4.1) when swayMethod = "stability-index". */
  q: finite.min(0).max(0.9),
});
export const columnSlendernessSchema = z.object({
  enabled: z.boolean(),
  x: direction,
  y: direction,
  /** βdns, sustained-to-total factored axial ratio (6.6.4.4.4). */
  betaDns: finite.min(0).max(1),
  /** Sway handling: ETABS P-Δ moments (δs = 1) or δs = 1/(1 − Q). */
  swayMethod: z.enum(["second-order", "stability-index"]),
  /** Transverse loads between supports ⇒ Cm = 1.0 (6.6.4.5.3b). */
  transverseLoad: z.boolean(),
});
export type ColumnSlendernessInput = z.infer<typeof columnSlendernessSchema>;

export function defaultColumnSlenderness(lu = 3000): ColumnSlendernessInput {
  const d = { lu, k: 1, sway: false, q: 0 };
  return {
    enabled: false,
    x: { ...d },
    y: { ...d },
    betaDns: 0.6,
    swayMethod: "second-order",
    transverseLoad: false,
  };
}

export interface SlenderDirectionResult {
  axis: "x" | "y";
  h: number;
  r: number;
  klur: number;
  limit: number;
  slender: boolean;
  sway: boolean;
  /** ACI 318-19 M1/M2 (negative = single curvature); null if unknown. */
  m1m2: number | null;
  ei: number | null;
  pc: number | null;
  cm: number | null;
  /** Magnifier applied to M2 (δns or δs). */
  delta: number;
  m2: number;
  m2min: number | null;
  mc: number;
  /** Mc / first-order M2 for the 1.4 limit (6.2.5.3). */
  secondOrderRatio: number;
  unstable: boolean;
  note: string;
}

const barArea = (b: ColumnBar) => (Math.PI * b.diameter ** 2) / 4;
/** Ec = 4700√f′c, normalweight (19.2.2.1b). */
export const concreteModulus = (fc: number) => 4700 * Math.sqrt(fc);

export interface SlenderSection {
  width: number;
  depth: number;
  fc: number;
  es: number;
  bars: ColumnBar[];
}

/**
 * One direction, one load. pu kN, m2 = Mu (kN·m, signed), m1 = smaller end
 * moment (kN·m, same diagram sign convention) or null.
 */
export function slenderDirection(
  sec: SlenderSection,
  sl: ColumnSlendernessInput,
  axis: "x" | "y",
  pu: number,
  mu: number,
  m1: number | null | undefined,
): SlenderDirectionResult {
  const d = sl[axis];
  const h = axis === "x" ? sec.depth : sec.width;
  const b = axis === "x" ? sec.width : sec.depth;
  const r = 0.3 * h; // 6.2.5.2
  const klur = d.lu > 0 ? (d.k * d.lu) / r : 0;
  // Larger end moment is M2.
  let m2 = mu,
    mSmall = m1 ?? null;
  if (mSmall !== null && Math.abs(mSmall) > Math.abs(m2))
    [m2, mSmall] = [mSmall, m2];
  const m1m2 =
    mSmall === null || m2 === 0
      ? null
      : -Math.sign(mSmall * m2) * Math.min(1, Math.abs(mSmall / m2));
  // 6.2.5.1: sway (a) 22; nonsway (b) 34 + 12(M1/M2), (c) 40. Unknown M1 ⇒
  // single curvature with equal end moments (M1/M2 = −1), conservative.
  const limit = d.sway ? 22 : Math.min(34 + 12 * (m1m2 ?? -1), 40);
  const base = {
    axis,
    h,
    r,
    klur,
    limit,
    sway: d.sway,
    m1m2,
    m2,
  };
  const short = (note: string): SlenderDirectionResult => ({
    ...base,
    slender: false,
    ei: null,
    pc: null,
    cm: null,
    delta: 1,
    m2min: null,
    mc: m2,
    secondOrderRatio: 1,
    unstable: false,
    note,
  });
  if (!sl.enabled) return short("Slenderness not considered.");
  if (klur <= limit)
    return short(
      `kℓu/r = ${klur.toFixed(1)} ≤ ${limit.toFixed(1)}: slenderness may be neglected (6.2.5.1).`,
    );
  if (pu <= 0)
    return short("Pu ≤ 0: no moment magnification under axial tension.");
  const ec = concreteModulus(sec.fc);
  const ig = (b * h ** 3) / 12;
  const ise = sec.bars.reduce(
    (t, bar) => t + barArea(bar) * (axis === "x" ? bar.y : bar.x) ** 2,
    0,
  );
  // 6.6.4.4.4 (a) and (b) are both permitted; the larger is used.
  const eiA = (0.4 * ec * ig) / (1 + sl.betaDns);
  const eiB = (0.2 * ec * ig + sec.es * ise) / (1 + sl.betaDns);
  const ei = Math.max(eiA, eiB); // N·mm²
  const pc = (Math.PI ** 2 * ei) / (d.k * d.lu) ** 2 / 1000; // kN, 6.6.4.4.2
  if (d.sway) {
    if (sl.swayMethod === "second-order")
      return {
        ...base,
        slender: true,
        ei,
        pc,
        cm: null,
        delta: 1,
        m2min: null,
        mc: m2,
        secondOrderRatio: 1,
        unstable: false,
        note: "Sway: Mu from second-order (P-Δ) elastic analysis, δs = 1 (6.6.4.6.2, 6.7). Confirm ETABS P-Δ was active.",
      };
    const ds = 1 / (1 - d.q); // 6.6.4.6.2(a)
    return {
      ...base,
      slender: true,
      ei,
      pc,
      cm: null,
      delta: ds,
      m2min: null,
      mc: ds * m2,
      secondOrderRatio: ds,
      unstable: ds > 1.5,
      note:
        ds > 1.5
          ? `δs = 1/(1 − Q) = ${ds.toFixed(3)} > 1.5: not permitted by 6.6.4.6.2(a); use second-order analysis.`
          : `Sway: δs = 1/(1 − Q) = ${ds.toFixed(3)} applied to the total Mu (conservative; 6.6.4.6.2a).`,
    };
  }
  // Nonsway, 6.6.4.5.
  const m2min = (pu * (15 + 0.03 * h)) / 1000; // kN·m, 6.6.4.5.4
  let cm = sl.transverseLoad || m1m2 === null ? 1 : 0.6 - 0.4 * m1m2;
  let mDesign = m2;
  if (Math.abs(m2) < m2min) {
    mDesign = (Math.sign(m2) || 1) * m2min;
    cm = 1;
  }
  const denom = 1 - pu / (0.75 * pc);
  if (denom <= 0)
    return {
      ...base,
      slender: true,
      ei,
      pc,
      cm,
      delta: Infinity,
      m2min,
      mc: Infinity * (Math.sign(mDesign) || 1),
      secondOrderRatio: Infinity,
      unstable: true,
      note: `Pu ≥ 0.75Pc (${(0.75 * pc).toFixed(0)} kN): member is unstable.`,
    };
  const delta = Math.max(1, cm / denom); // 6.6.4.5.2
  const mc = delta * mDesign;
  return {
    ...base,
    slender: true,
    ei,
    pc,
    cm,
    delta,
    m2min,
    mc,
    secondOrderRatio: delta,
    unstable: false,
    note: `Nonsway: Cm = ${cm.toFixed(3)}, δns = ${delta.toFixed(3)}${Math.abs(m2) < m2min ? "; M2,min governs" : ""} (6.6.4.5).`,
  };
}
