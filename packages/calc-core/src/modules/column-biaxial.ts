/**
 * Biaxial strength of rectangular tied sections by strain compatibility with
 * a rotated neutral axis (ACI 318-19 22.2.1–22.2.2, 22.4.2, Table 21.2.2),
 * plus the Bresler reciprocal-load cross-check.
 *
 * Coordinates: x along width, y along depth, origin at the section centroid.
 * Compression positive. Mx = Σ F·y, My = Σ F·x (same as the uniaxial engine).
 * The compression side is the direction of the unit normal n = (cos θ, sin θ):
 * θ = 90° puts the +y face in compression (positive Mx).
 */
import {
  columnBeta1,
  tiedColumnPhi,
  type ColumnBar,
  type RectangularColumnInput,
} from "./rectangular-column";

export interface BiaxialSection {
  width: number;
  depth: number;
  fc: number;
  fy: number;
  es: number;
  beta1: number;
  bars: ColumnBar[];
}
/** Raw nominal resultants in input units (force, force × length). */
export interface BiaxialRawState {
  theta: number;
  c: number;
  p: number;
  mx: number;
  my: number;
  /** Largest tensile strain in the reinforcement (positive = tension). */
  tensionStrain: number;
  concreteArea: number;
}
export interface BiaxialDesignState extends BiaxialRawState {
  phi: number;
  /** φPn capped at 0.80·0.65·Po (Table 22.4.2.1), kN. */
  designP: number;
  designMx: number;
  designMy: number;
}

const barArea = (b: ColumnBar) => (Math.PI * b.diameter ** 2) / 4;

export function biaxialSection(input: RectangularColumnInput): BiaxialSection {
  return {
    width: input.width,
    depth: input.depth,
    fc: input.fc,
    fy: input.fy,
    es: input.es,
    beta1: columnBeta1(input.fc),
    bars: input.bars,
  };
}

type Pt = [number, number];
/** Sutherland–Hodgman clip of a convex polygon to { p : p·n ≥ limit }. */
function clip(poly: Pt[], n: Pt, limit: number): Pt[] {
  const out: Pt[] = [];
  const f = (p: Pt) => p[0] * n[0] + p[1] * n[1] - limit;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!,
      b = poly[(i + 1) % poly.length]!;
    const fa = f(a),
      fb = f(b);
    if (fa >= 0) out.push(a);
    if (fa * fb < 0) {
      const t = fa / (fa - fb);
      out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  return out;
}
function polygonProps(poly: Pt[]) {
  let a = 0,
    cx = 0,
    cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i]!,
      [x1, y1] = poly[(i + 1) % poly.length]!;
    const cr = x0 * y1 - x1 * y0;
    a += cr;
    cx += (x0 + x1) * cr;
    cy += (y0 + y1) * cr;
  }
  a /= 2;
  return Math.abs(a) < 1e-12
    ? { area: 0, x: 0, y: 0 }
    : { area: Math.abs(a), x: cx / (6 * a), y: cy / (6 * a) };
}

/**
 * Nominal resultants for neutral-axis depth c (measured from the extreme
 * compression corner along n). c = 0 is pure tension (all bars at −fy).
 */
export function biaxialRawStateAt(
  s: BiaxialSection,
  theta: number,
  c: number,
): BiaxialRawState {
  const n: Pt = [Math.cos(theta), Math.sin(theta)];
  if (c <= 0) {
    let p = 0,
      mx = 0,
      my = 0;
    for (const b of s.bars) {
      const f = -s.fy * barArea(b);
      p += f;
      mx += f * b.y;
      my += f * b.x;
    }
    return { theta, c: 0, p, mx, my, tensionStrain: Infinity, concreteArea: 0 };
  }
  const hw = s.width / 2,
    hd = s.depth / 2;
  const rect: Pt[] = [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ];
  const smax = Math.max(...rect.map((p) => p[0] * n[0] + p[1] * n[1]));
  const a = s.beta1 * c;
  const block = polygonProps(clip(rect, n, smax - a));
  const cc = 0.85 * s.fc * block.area;
  let p = cc,
    mx = cc * block.y,
    my = cc * block.x,
    tension = -Infinity;
  for (const b of s.bars) {
    const dist = smax - (b.x * n[0] + b.y * n[1]);
    const strain = 0.003 * (1 - dist / c);
    tension = Math.max(tension, -strain);
    const stress = Math.max(-s.fy, Math.min(s.fy, s.es * strain));
    const f = barArea(b) * (stress - (dist <= a ? 0.85 * s.fc : 0));
    p += f;
    mx += f * b.y;
    my += f * b.x;
  }
  return {
    theta,
    c,
    p,
    mx,
    my,
    tensionStrain: tension,
    concreteArea: block.area,
  };
}

const squashCache = new WeakMap<BiaxialSection, number>();
export function squashLoad(s: BiaxialSection) {
  const hit = squashCache.get(s);
  if (hit !== undefined) return hit;
  const ast = s.bars.reduce((t, b) => t + barArea(b), 0);
  const p0 = 0.85 * s.fc * (s.width * s.depth - ast) + s.fy * ast;
  squashCache.set(s, p0);
  return p0;
}

/** Design state in kN / kN·m from SI inputs (N, mm). */
export function biaxialDesignStateAt(
  s: BiaxialSection,
  theta: number,
  c: number,
  capped = true,
): BiaxialDesignState {
  const raw = biaxialRawStateAt(s, theta, c);
  const phi = c <= 0 ? 0.9 : tiedColumnPhi(raw.tensionStrain, s.fy, s.es);
  const cap = (0.8 * 0.65 * squashLoad(s)) / 1000;
  const designP = (phi * raw.p) / 1000;
  return {
    ...raw,
    phi,
    designP: capped ? Math.min(designP, cap) : designP,
    designMx: (phi * raw.mx) / 1e6,
    designMy: (phi * raw.my) / 1e6,
  };
}

/** Neutral-axis depth upper bound: beyond this the whole section is in compression. */
const cMax = (s: BiaxialSection) =>
  (20 * Math.hypot(s.width, s.depth)) / Math.max(s.beta1, 0.5);

/**
 * Design moments at constant Pu (kN) for a neutral-axis direction θ.
 * Returns null when Pu is outside [φPnt, φPn,max].
 */
export function biaxialMomentAt(
  s: BiaxialSection,
  theta: number,
  pu: number,
): BiaxialDesignState | null {
  const hi0 = cMax(s);
  const top = biaxialDesignStateAt(s, theta, hi0);
  const bottom = biaxialDesignStateAt(s, theta, 0);
  if (pu > top.designP + 1e-9 || pu < bottom.designP - 1e-9) return null;
  let lo = 0,
    hi = hi0;
  for (let i = 0; i < 64; i++) {
    const mid = (lo + hi) / 2;
    if (biaxialDesignStateAt(s, theta, mid).designP < pu) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-7 * hi0) break;
  }
  // Smallest c reaching Pu: on the 0.80Po plateau this is the largest moment.
  return biaxialDesignStateAt(s, theta, hi);
}

export interface BiaxialContourPoint {
  theta: number;
  mx: number;
  my: number;
  c: number;
  phi: number;
}
/** φMnx–φMny load contour at constant Pu (kN, kN·m). */
export function biaxialContour(
  s: BiaxialSection,
  pu: number,
  steps = 72,
): BiaxialContourPoint[] {
  const out: BiaxialContourPoint[] = [];
  for (let i = 0; i < steps; i++) {
    const theta = (2 * Math.PI * i) / steps;
    const st = biaxialMomentAt(s, theta, pu);
    if (st)
      out.push({
        theta,
        mx: st.designMx,
        my: st.designMy,
        c: st.c,
        phi: st.phi,
      });
  }
  return out;
}

const wrap = (a: number) => {
  let v = a % (2 * Math.PI);
  if (v > Math.PI) v -= 2 * Math.PI;
  if (v <= -Math.PI) v += 2 * Math.PI;
  return v;
};

export interface BiaxialCapacity {
  /** φMn on the load ray at Pu (kN·m); 0 when Pu is beyond the axial limits. */
  capacity: number;
  mx: number;
  my: number;
  theta: number;
  c: number;
  phi: number;
  /** |Mu| / φMn on the load ray at constant Pu. */
  ratio: number;
}
/**
 * Radial capacity on the moment ray of (Mux, Muy) at constant Pu.
 * The neutral-axis angle generally differs from the moment angle, so θ is
 * found by bracketing then bisection on the moment angle.
 */
export function biaxialCapacityAt(
  s: BiaxialSection,
  pu: number,
  mux: number,
  muy: number,
): BiaxialCapacity | null {
  const demand = Math.hypot(mux, muy);
  const target = Math.atan2(muy, mux);
  // Moment vector angle in the (Mx, My) plane for NA direction θ.
  const angleOf = (st: BiaxialDesignState) =>
    Math.atan2(st.designMy, st.designMx);
  const steps = 24;
  const samples: { theta: number; st: BiaxialDesignState }[] = [];
  for (let i = 0; i <= steps; i++) {
    const theta = (2 * Math.PI * i) / steps;
    const st = biaxialMomentAt(s, theta, pu);
    if (!st) return null;
    samples.push({ theta, st });
  }
  if (demand === 0) {
    const best = samples.reduce((m, x) =>
      Math.hypot(x.st.designMx, x.st.designMy) <
      Math.hypot(m.st.designMx, m.st.designMy)
        ? x
        : m,
    );
    const cap = Math.hypot(best.st.designMx, best.st.designMy);
    return {
      capacity: cap,
      mx: best.st.designMx,
      my: best.st.designMy,
      theta: best.theta,
      c: best.st.c,
      phi: best.st.phi,
      ratio: 0,
    };
  }
  for (let i = 0; i < steps; i++) {
    const a = samples[i]!,
      b = samples[i + 1]!;
    const da = wrap(angleOf(a.st) - target),
      db = wrap(angleOf(b.st) - target);
    // A genuine sign change, not the ±π branch cut. The moment angle turns
    // opposite to θ (θ = 0 gives +My, θ = 90° gives +Mx), so either order.
    if (da === 0 || (da * db <= 0 && Math.abs(db - da) < Math.PI)) {
      let lo = a.theta,
        hi = b.theta,
        st = a.st;
      for (let k = 0; k < 50 && da !== 0; k++) {
        const mid = (lo + hi) / 2;
        const m = biaxialMomentAt(s, mid, pu);
        if (!m) return null;
        st = m;
        if (Math.sign(wrap(angleOf(m) - target)) === Math.sign(da)) lo = mid;
        else hi = mid;
        if (hi - lo < 1e-7) break;
      }
      const cap = Math.hypot(st.designMx, st.designMy);
      return {
        capacity: cap,
        mx: st.designMx,
        my: st.designMy,
        theta: st.theta,
        c: st.c,
        phi: st.phi,
        ratio: cap > 0 ? demand / cap : Infinity,
      };
    }
  }
  return null;
}

/**
 * Point on the uniaxial design curve with eccentricity e = M/P (mm), φ applied,
 * axial cap NOT applied (Bresler uses φPo). axis "x" ⇒ bending about x.
 */
export function uniaxialAxialAtEccentricity(
  s: BiaxialSection,
  axis: "x" | "y",
  sign: 1 | -1,
  e: number,
) {
  const theta =
    axis === "x"
      ? sign > 0
        ? Math.PI / 2
        : -Math.PI / 2
      : sign > 0
        ? 0
        : Math.PI;
  const m = (st: BiaxialDesignState) =>
    Math.abs(axis === "x" ? st.designMx : st.designMy);
  const hi0 = cMax(s);
  // f(c) = M − e·P falls from > 0 (P ≈ 0) to < 0 (P large, M → 0).
  let lo = 0,
    hi = hi0;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const st = biaxialDesignStateAt(s, theta, mid, false);
    // designM in kN·m, designP in kN, e in mm.
    if (st.designP <= 0 || m(st) - (e / 1000) * st.designP > 0) lo = mid;
    else hi = mid;
  }
  return biaxialDesignStateAt(s, theta, (lo + hi) / 2, false).designP;
}

export interface BreslerResult {
  applicable: boolean;
  pnx: number | null;
  pny: number | null;
  po: number;
  pni: number | null;
  ratio: number | null;
  note: string;
}
/**
 * Bresler reciprocal load: 1/φPni = 1/φPnx + 1/φPny − 1/φPo, φPo = 0.65·Po,
 * φPni then limited to 0.80·0.65·Po. Applicable for Pu/0.65 ≥ 0.10 f′c Ag.
 */
export function breslerReciprocal(
  s: BiaxialSection,
  pu: number,
  mux: number,
  muy: number,
): BreslerResult {
  const po0 = (0.65 * squashLoad(s)) / 1000;
  const ag = s.width * s.depth;
  if (pu / 0.65 < (0.1 * s.fc * ag) / 1000)
    return {
      applicable: false,
      pnx: null,
      pny: null,
      po: po0,
      pni: null,
      ratio: null,
      note: "Not applicable: Pu/0.65 < 0.10 f′c Ag (flexure governs).",
    };
  const ex = (Math.abs(mux) * 1000) / pu; // mm
  const ey = (Math.abs(muy) * 1000) / pu;
  const pnx =
    mux === 0 ? po0 : uniaxialAxialAtEccentricity(s, "x", mux > 0 ? 1 : -1, ex);
  const pny =
    muy === 0 ? po0 : uniaxialAxialAtEccentricity(s, "y", muy > 0 ? 1 : -1, ey);
  const inv = 1 / pnx + 1 / pny - 1 / po0;
  const pni = Math.min(1 / inv, 0.8 * po0);
  return {
    applicable: true,
    pnx,
    pny,
    po: po0,
    pni,
    ratio: pu / pni,
    note: "1/φPni = 1/φPnx + 1/φPny − 1/φPo",
  };
}
