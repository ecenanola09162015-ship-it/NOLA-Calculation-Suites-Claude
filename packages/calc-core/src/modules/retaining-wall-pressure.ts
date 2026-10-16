/**
 * Lateral earth pressure for retaining walls (per metre, kPa, kN/m).
 *
 * Rankine with sloping backfill, Coulomb (vertical back, wall friction δ),
 * at-rest K0 = (1 − sinφ)·OCR^sinφ (Jaky; Mayne & Kulhawy 1982), or a user K.
 * Seismic increment by Mononobe-Okabe (yielding walls) or Wood (1973,
 * non-yielding walls), applied as an inverted trapezoid with its resultant at
 * 0.6 of the height above the base (Seed & Whitman 1970).
 * Effective stress: γ above the water table, γsat − γw below it; water acts
 * at full hydrostatic head over the submerged height.
 * References: Das, Principles of Foundation Engineering, Ch. 12–13.
 */
import type { RetainingWallInput } from "./retaining-wall";

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Rankine active coefficient with backfill slope β (along the slope). */
export function rankineKa(phiDeg: number, betaDeg = 0) {
  const p = rad(phiDeg),
    b = rad(betaDeg);
  if (betaDeg > phiDeg) return NaN;
  const cb = Math.cos(b),
    root = Math.sqrt(Math.max(0, cb * cb - Math.cos(p) ** 2));
  return (cb * (cb - root)) / (cb + root);
}
/** Rankine passive coefficient, horizontal ground. */
export function rankineKp(phiDeg: number) {
  const s = Math.sin(rad(phiDeg));
  return (1 + s) / (1 - s);
}
/** Coulomb active coefficient, vertical back (α = 0), wall friction δ, slope β. */
export function coulombKa(phiDeg: number, deltaDeg: number, betaDeg = 0) {
  const p = rad(phiDeg),
    d = rad(deltaDeg),
    b = rad(betaDeg);
  if (betaDeg > phiDeg) return NaN;
  const root = Math.sqrt(
    (Math.sin(p + d) * Math.sin(p - b)) / (Math.cos(d) * Math.cos(b)),
  );
  return Math.cos(p) ** 2 / (Math.cos(d) * (1 + root) ** 2);
}
/** Mononobe-Okabe K_AE, vertical back (α = 0). NaN when φ − θ − β < 0. */
export function mononobeOkabeKae(
  phiDeg: number,
  deltaDeg: number,
  betaDeg: number,
  kh: number,
  kv: number,
) {
  const p = rad(phiDeg),
    d = rad(deltaDeg),
    b = rad(betaDeg),
    t = Math.atan(kh / (1 - kv));
  if (p - t - b < 0) return NaN;
  const root = Math.sqrt(
    (Math.sin(p + d) * Math.sin(p - t - b)) / (Math.cos(d + t) * Math.cos(b)),
  );
  return (
    Math.cos(p - t) ** 2 /
    (Math.cos(t) * Math.cos(d + t) * (1 + root) ** 2)
  );
}
/**
 * Coulomb passive coefficient, vertical face, δ = 0, ground slope β (negative
 * = falling away from the wall). Equals Rankine Kp for β = 0.
 */
export function coulombKp(phiDeg: number, betaDeg = 0) {
  const p = rad(phiDeg),
    b = rad(betaDeg);
  if (p + b <= 0) return 1;
  const root = Math.sqrt((Math.sin(p) * Math.sin(p + b)) / Math.cos(b));
  return Math.cos(p) ** 2 / (1 - root) ** 2;
}
/**
 * Lateral pressure on a rigid wall from a strip load q (Das, Principles of
 * Foundation Engineering, Ch. 13): σ = (2q/π)(β − sinβ cos2α), with the strip
 * from a to a + b behind the wall and z the depth below the strip level.
 * Resultant check (Jarquio 1981): P = q/90 · H(θ2 − θ1), θ in degrees.
 */
export function stripPressure(q: number, a: number, b: number, z: number) {
  if (z <= 1e-9 || b <= 0) return 0;
  const t1 = Math.atan(Math.max(a, 0) / z),
    t2 = Math.atan((Math.max(a, 0) + b) / z),
    beta = t2 - t1,
    alpha = t1 + beta / 2;
  return ((2 * q) / Math.PI) * (beta - Math.sin(beta) * Math.cos(2 * alpha));
}

/** At-rest coefficient (Jaky; Mayne & Kulhawy 1982 for OCR > 1). */
export function atRestK0(phiDeg: number, ocr = 1) {
  const s = Math.sin(rad(phiDeg));
  return (1 - s) * ocr ** s;
}

export interface EarthCoefficients {
  theory: RetainingWallInput["soil"]["theory"];
  /** Coefficient along the thrust direction. */
  k: number;
  /** Thrust inclination from horizontal, deg. */
  inclination: number;
  /** Horizontal and vertical components (k cos i, k sin i). */
  kh: number;
  kv: number;
  /** Active coefficient used as the seismic reference (Rankine or Coulomb). */
  ka: number;
  kp: number;
  kae: number | null;
  /** Seismic angle θ = atan(kh / (1 − kv)), deg. */
  theta: number | null;
}

export function earthCoefficients(i: RetainingWallInput): EarthCoefficients {
  const s = i.soil;
  const coulomb = s.theory === "coulomb";
  const ka = coulomb ? coulombKa(s.phi, s.delta, s.beta) : rankineKa(s.phi, s.beta);
  const activeIncl = coulomb ? s.delta : s.beta;
  let k: number, inclination: number;
  switch (s.theory) {
    case "rankine":
    case "coulomb":
      k = ka;
      inclination = activeIncl;
      break;
    case "at-rest":
      k = atRestK0(s.phi, s.ocr);
      inclination = 0;
      break;
    default:
      k = s.userK;
      inclination = 0;
  }
  const mo = i.seismic.method === "mononobe-okabe";
  const kae = mo
    ? mononobeOkabeKae(s.phi, activeIncl, s.beta, i.seismic.kh, i.seismic.kv)
    : null;
  return {
    theory: s.theory,
    k,
    inclination,
    kh: k * Math.cos(rad(inclination)),
    kv: k * Math.sin(rad(inclination)),
    ka,
    kp: coulombKp(i.toeSoil.phi, -(i.toeSoil.slope ?? 0)),
    kae,
    theta:
      i.seismic.method === "none"
        ? null
        : (Math.atan(i.seismic.kh / (1 - i.seismic.kv)) * 180) / Math.PI,
  };
}

export type PressureKind = "D" | "H" | "L" | "E" | "W";
export type PressureId =
  | "soil"
  | "surchargeDead"
  | "surchargeLive"
  | "water"
  | "seismic"
  | "inertia"
  | "strip"
  | "wind"
  | "axialD"
  | "axialL";
export interface PressureComponent {
  id: PressureId;
  label: string;
  kind: PressureKind;
  /** Horizontal pressure at depth z below the top of the plane, kPa. */
  p: (z: number) => number;
  /** Depths where p has a kink (water table). */
  breaks: number[];
  /** Vertical / horizontal ratio of the thrust (stabilising, at the plane). */
  verticalRatio: number;
  /** Stem only: couple applied at the stem top (tension on the back face > 0), kN·m/m. */
  couple?: number;
  /** Stem only: extra determinate moment at height y (tension back > 0), kN·m/m. */
  extraMoment?: (y: number) => number;
}
export interface PressurePlane {
  /** Plane height, m. */
  height: number;
  /** Water height above the bottom of the plane, m (0 = dry). */
  water: number;
  /**
   * Strip surcharge: near edge distance from this plane and loaded width
   * beyond it (m); the strip level is the plane top. Omit for none.
   */
  strip?: { distance: number; width: number };
}

export function pressureComponents(
  i: RetainingWallInput,
  c: EarthCoefficients,
  plane: PressurePlane,
): PressureComponent[] {
  const H = plane.height,
    gw = i.water.gammaW,
    hw = i.water.enabled ? Math.min(Math.max(plane.water, 0), H) : 0,
    zw = H - hw,
    gEff = i.soil.gammaSat - gw,
    tanI = Math.tan(rad(c.inclination));
  const sigma = (z: number) =>
    i.soil.gamma * Math.min(z, zw) + gEff * Math.max(0, z - zw);
  const breaks = hw > 0 && hw < H ? [zw] : [];
  const out: PressureComponent[] = [
    {
      id: "soil",
      label: "Earth pressure",
      kind: "H",
      p: (z) => c.kh * sigma(Math.min(Math.max(z, 0), H)),
      breaks,
      verticalRatio: tanI,
    },
  ];
  if (i.surcharge.dead > 0)
    out.push({
      id: "surchargeDead",
      label: "Dead surcharge",
      kind: "H",
      p: () => c.kh * i.surcharge.dead,
      breaks: [],
      verticalRatio: tanI,
    });
  if (i.surcharge.live > 0)
    out.push({
      id: "surchargeLive",
      label: "Live surcharge",
      kind: "L",
      p: () => c.kh * i.surcharge.live,
      breaks: [],
      verticalRatio: tanI,
    });
  if (hw > 0)
    out.push({
      id: "water",
      label: "Groundwater",
      kind: "H",
      p: (z) => gw * Math.max(0, Math.min(z, H) - zw),
      breaks,
      verticalRatio: 0,
    });
  if (i.strip?.enabled && plane.strip && plane.strip.width > 0 && i.strip.q > 0) {
    const { distance, width } = plane.strip,
      q = i.strip.q;
    out.push({
      id: "strip",
      label: `Strip surcharge (${i.strip.kind})`,
      kind: i.strip.kind === "dead" ? "H" : "L",
      p: (z) => stripPressure(q, distance, width, Math.min(Math.max(z, 0), H)),
      breaks: [],
      verticalRatio: 0,
    });
  }
  const dp = seismicIncrement(i, c, H);
  if (dp > 0) {
    // Inverted trapezoid: top 8F/5H, bottom 2F/5H → resultant at 0.6H above base.
    const pt = (8 * dp) / (5 * H),
      pb = (2 * dp) / (5 * H);
    out.push({
      id: "seismic",
      label:
        i.seismic.method === "wood"
          ? "Seismic increment (Wood)"
          : "Seismic increment (M-O)",
      kind: "E",
      p: (z) => pt + ((pb - pt) * Math.min(Math.max(z, 0), H)) / H,
      breaks: [],
      verticalRatio: 0,
    });
  }
  return out;
}

/** Horizontal seismic earth-pressure increment ΔP over a height H, kN/m. */
export function seismicIncrement(
  i: RetainingWallInput,
  c: EarthCoefficients,
  H: number,
) {
  const q = i.surcharge.dead + i.surcharge.live;
  if (i.seismic.method === "wood")
    return i.seismic.kh * (i.soil.gamma * H * H + q * H);
  if (i.seismic.method !== "mononobe-okabe" || c.kae === null) return 0;
  if (!Number.isFinite(c.kae)) return NaN;
  const dk = (1 - i.seismic.kv) * c.kae - c.ka,
    cosI = Math.cos(rad(i.soil.theory === "coulomb" ? i.soil.delta : i.soil.beta));
  return Math.max(0, dk * cosI * (0.5 * i.soil.gamma * H * H + q * H));
}

const G4: [number, number][] = (() => {
  const a = Math.sqrt(3 / 7 - (2 / 7) * Math.sqrt(6 / 5)),
    b = Math.sqrt(3 / 7 + (2 / 7) * Math.sqrt(6 / 5)),
    wa = (18 + Math.sqrt(30)) / 36,
    wb = (18 - Math.sqrt(30)) / 36;
  return [
    [-b, wb],
    [-a, wa],
    [a, wa],
    [b, wb],
  ];
})();
/** ∫ f over [a, b], 4-point Gauss on sub-intervals split at the breaks. */
export function integrate(
  f: (x: number) => number,
  a: number,
  b: number,
  breaks: number[] = [],
  parts = 4,
) {
  if (b <= a) return 0;
  const pts = [a, ...breaks.filter((x) => x > a && x < b), b];
  let s = 0;
  for (let k = 0; k + 1 < pts.length; k++) {
    const lo = pts.at(k)!,
      hi = pts.at(k + 1)!,
      h = (hi - lo) / parts;
    for (let j = 0; j < parts; j++) {
      const m = lo + (j + 0.5) * h;
      for (const [x, w] of G4) s += (w * h * f(m + (x * h) / 2)) / 2;
    }
  }
  return s;
}

/** Resultant force (kN/m) and its height above the plane bottom (m). */
export function componentResultant(c: PressureComponent, height: number) {
  const force = integrate(c.p, 0, height, c.breaks);
  if (Math.abs(force) < 1e-12) return { force: 0, arm: 0 };
  const moment = integrate((z) => c.p(z) * (height - z), 0, height, c.breaks);
  return { force, arm: moment / force };
}
