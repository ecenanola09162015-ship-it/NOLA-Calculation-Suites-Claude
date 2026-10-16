/**
 * ACI 318-19 Chapter 17 anchor limit states (SI: N, mm, MPa), one pure
 * function per clause so each can be hand-checked. Used by base-plate.ts.
 *
 * Geometry: anchors in the plane of the concrete surface, pedestal (or
 * member) is the rectangle |x| ≤ px/2, |y| ≤ py/2, depth ha.
 */
import { isCastIn, type AnchorKind } from "../anchor-rods";

export interface AnchorPoint {
  x: number;
  y: number;
}
export interface ConcreteBlock {
  px: number;
  py: number;
  ha: number;
  fc: number;
  lambdaA: number;
  cracked: boolean;
  /** Condition A = supplementary reinforcement present (Table 17.5.3). */
  condition: "A" | "B";
}
export interface PostInstalledProduct {
  name: string;
  /** ICC-ES ESR / ETA reference (mandatory for traceability). */
  report: string;
  category: 1 | 2 | 3;
  kcCr: number;
  kcUncr: number;
  /** Adhesive characteristic bond stresses, MPa. */
  tauCr: number;
  tauUncr: number;
  /** Mechanical pullout, N (null = does not govern per ESR). */
  npCr: number | null;
  npUncr: number | null;
  /** Critical edge distance cac, mm (null = ACI 17.9.5 default). */
  cac: number | null;
  /** Minimum edge distance and spacing from the ESR, mm (null = ACI 17.9). */
  cmin: number | null;
  smin: number | null;
}

/** √f′c limited to 8.3 MPa for anchors (17.3.1: f′c ≤ 70 MPa cast-in, 55 post-installed). */
export function anchorSqrtFc(fc: number, kind: AnchorKind) {
  return Math.sqrt(Math.min(fc, isCastIn(kind) ? 70 : 55));
}

/** Table 17.5.3 strength reduction factors. */
export function anchorPhi(
  kind: AnchorKind,
  ductile: boolean,
  condition: "A" | "B",
  category: 1 | 2 | 3,
) {
  const castIn = isCastIn(kind);
  const concreteTension = castIn
    ? condition === "A"
      ? 0.75
      : 0.7
    : condition === "A"
      ? [0.75, 0.65, 0.55][category - 1]!
      : [0.65, 0.55, 0.45][category - 1]!;
  // Pullout / bond / pryout: Condition B always applies (17.5.3 (c)(ii)).
  const pullout = castIn ? 0.7 : [0.65, 0.55, 0.45][category - 1]!;
  return {
    steelTension: ductile ? 0.75 : 0.65,
    steelShear: ductile ? 0.65 : 0.6,
    concreteTension,
    pullout,
    sideFace: castIn ? concreteTension : concreteTension,
    concreteShear: condition === "A" ? 0.75 : 0.7,
    pryout: castIn ? 0.7 : [0.65, 0.55, 0.45][category - 1]!,
  };
}

/** 17.6.1.2 Nsa = Ase,N futa. */
export const steelTension = (ase: number, futa: number) => ase * futa;
/** 17.7.1.2 Vsa = 0.6 Ase,V futa (headed stud 1.0), × 0.80 grout pad (17.7.1.2.1). */
export function steelShear(
  ase: number,
  futa: number,
  kind: AnchorKind,
  groutPad: boolean,
) {
  return (
    (kind === "cast-in-headed-stud" ? 1 : 0.6) *
    ase *
    futa *
    (groutPad ? 0.8 : 1)
  );
}

/** Edge distances of a point to the four member edges. */
export function edgeDistances(p: AnchorPoint, b: ConcreteBlock) {
  return {
    west: b.px / 2 + p.x,
    east: b.px / 2 - p.x,
    south: b.py / 2 + p.y,
    north: b.py / 2 - p.y,
  };
}
function bounds(points: AnchorPoint[]) {
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y);
  return {
    x0: Math.min(...xs),
    x1: Math.max(...xs),
    y0: Math.min(...ys),
    y1: Math.max(...ys),
  };
}

export interface TensionBreakout {
  hef: number;
  hefUsed: number;
  reducedForEdges: boolean;
  anc: number;
  anco: number;
  nb: number;
  psiEc: number;
  psiEd: number;
  psiC: number;
  psiCp: number;
  caMin: number;
  /** Nominal Ncb / Ncbg, N. */
  ncbg: number;
}

/**
 * 17.6.2 concrete breakout of an anchor group in tension.
 * forces: Nua per anchor (≥ 0) used for the eccentricity factor ψec,N;
 * pass equal values for a concentric group (pryout, 17.7.3).
 */
export function tensionBreakout(
  points: AnchorPoint[],
  forces: number[],
  hef: number,
  b: ConcreteBlock,
  kind: AnchorKind,
  product: PostInstalledProduct | null,
  cacDefault: number,
): TensionBreakout {
  const g = bounds(points);
  const edges = {
    west: b.px / 2 + g.x0,
    east: b.px / 2 - g.x1,
    south: b.py / 2 + g.y0,
    north: b.py / 2 - g.y1,
  };
  const all = Object.values(edges);
  const s = Math.max(g.x1 - g.x0, g.y1 - g.y0);
  // 17.6.2.1.2: three or more edges closer than 1.5 hef.
  const near = all.filter((c) => c < 1.5 * hef);
  let h = hef;
  if (near.length >= 3)
    h = Math.min(hef, Math.max(Math.max(...near) / 1.5, s / 3));
  const c15 = 1.5 * h;
  const anc =
    (Math.min(edges.west, c15) + (g.x1 - g.x0) + Math.min(edges.east, c15)) *
    (Math.min(edges.south, c15) + (g.y1 - g.y0) + Math.min(edges.north, c15));
  const anco = 9 * h * h;
  const castIn = isCastIn(kind);
  const sq = anchorSqrtFc(b.fc, kind);
  const kc = castIn ? 10 : (product?.kcCr ?? 7);
  // 17.6.2.2.1 and 17.6.2.2.3 (cast-in 280 ≤ hef ≤ 635 mm).
  const nb =
    castIn && h >= 280 && h <= 635
      ? 3.9 * b.lambdaA * sq * h ** (5 / 3)
      : kc * b.lambdaA * sq * h ** 1.5;
  // 17.6.2.3 eccentricity of the tension resultant.
  const total = forces.reduce((a, f) => a + f, 0);
  let psiEc = 1;
  if (total > 0) {
    const cx = (g.x0 + g.x1) / 2,
      cy = (g.y0 + g.y1) / 2;
    const ex = Math.abs(
      points.reduce((a, p, k) => a + forces[k]! * p.x, 0) / total - cx,
    );
    const ey = Math.abs(
      points.reduce((a, p, k) => a + forces[k]! * p.y, 0) / total - cy,
    );
    psiEc = (1 / (1 + ex / (1.5 * h))) * (1 / (1 + ey / (1.5 * h)));
  }
  const caMin = Math.min(...all);
  const psiEd = caMin >= c15 ? 1 : 0.7 + (0.3 * caMin) / c15;
  // 17.6.2.5: ψc,N = 1.25 cast-in / 1.4 post-installed (or kc,uncr/kc,cr) uncracked.
  const psiC = b.cracked
    ? 1
    : castIn
      ? 1.25
      : product
        ? product.kcUncr / product.kcCr
        : 1.4;
  // 17.6.2.6: splitting, post-installed in uncracked concrete.
  const cac = product?.cac ?? cacDefault;
  const psiCp =
    castIn || b.cracked || caMin >= cac
      ? 1
      : Math.min(1, Math.max(caMin / cac, c15 / cac));
  return {
    hef,
    hefUsed: h,
    reducedForEdges: h < hef - 1e-9,
    anc,
    anco,
    nb,
    psiEc,
    psiEd,
    psiC,
    psiCp,
    caMin,
    ncbg:
      (Math.min(anc, points.length * anco) / anco) *
      psiEc *
      psiEd *
      psiC *
      psiCp *
      nb,
  };
}

/** 17.6.3 pullout of one anchor, N. */
export function pullout(
  kind: AnchorKind,
  da: number,
  abrg: number,
  eh: number,
  b: ConcreteBlock,
  product: PostInstalledProduct | null,
) {
  if (kind === "cast-in-headed-bolt" || kind === "cast-in-headed-stud") {
    const np = 8 * abrg * b.fc; // 17.6.3.2.2(a)
    const psi = b.cracked ? 1 : 1.4; // 17.6.3.3
    return {
      np,
      psiCP: psi,
      npn: psi * np,
      basis: "Np = 8 Abrg f′c (17.6.3.2.2(a))",
    };
  }
  if (kind === "cast-in-hooked-bolt") {
    const e = Math.min(Math.max(eh, 3 * da), 4.5 * da); // 17.6.3.2.2(b)
    const np = 0.9 * b.fc * e * da;
    const psi = b.cracked ? 1 : 1.4;
    return {
      np,
      psiCP: psi,
      npn: psi * np,
      basis: "Np = 0.9 f′c eh da, 3da ≤ eh ≤ 4.5da (17.6.3.2.2(b))",
    };
  }
  if (kind === "adhesive") return null; // bond governs (17.6.5)
  const v = b.cracked ? product?.npCr : product?.npUncr;
  if (v === null || v === undefined) return null;
  return {
    np: v,
    psiCP: 1,
    npn: v,
    basis: "Np from product evaluation report (17.6.3.2.1)",
  };
}

/**
 * 17.6.4 side-face blowout for headed anchors with hef > 2.5 ca1, for the
 * anchors of one outer row along an edge. Returns nominal Nsbg (N) and the
 * row tension, or null when not applicable.
 */
export function sideFaceBlowout(
  row: AnchorPoint[],
  rowForces: number[],
  edge: "west" | "east" | "south" | "north",
  hef: number,
  abrg: number,
  b: ConcreteBlock,
  kind: AnchorKind,
) {
  if (kind !== "cast-in-headed-bolt" && kind !== "cast-in-headed-stud")
    return null;
  const d = (p: AnchorPoint) => edgeDistances(p, b)[edge];
  const ca1 = Math.min(...row.map(d));
  if (!(hef > 2.5 * ca1)) return null;
  const along = edge === "west" || edge === "east" ? "y" : "x";
  const coords = row.map((p) => p[along]);
  const half = along === "y" ? b.py / 2 : b.px / 2;
  const ca2 = Math.min(half + Math.min(...coords), half - Math.max(...coords));
  const sq = anchorSqrtFc(b.fc, kind);
  let nsb = 13 * ca1 * Math.sqrt(abrg) * b.lambdaA * sq; // 17.6.4.1
  const r = ca2 / ca1;
  if (ca2 < 3 * ca1) nsb *= (1 + Math.min(Math.max(r, 1), 3)) / 4; // 17.6.4.1.1
  const s = row.length > 1 ? Math.max(...coords) - Math.min(...coords) : 0;
  const nsbg =
    row.length > 1 && s < 6 * ca1
      ? (1 + s / (6 * ca1)) * nsb
      : nsb * row.length;
  return {
    edge,
    ca1,
    ca2,
    s,
    nsb,
    nsbg,
    nua: rowForces.reduce((a, f) => a + f, 0),
  };
}

/** 17.6.5 bond strength of adhesive anchors (group). */
export function bondStrength(
  points: AnchorPoint[],
  forces: number[],
  da: number,
  hef: number,
  b: ConcreteBlock,
  product: PostInstalledProduct,
) {
  const g = bounds(points);
  const tau = b.cracked ? product.tauCr : product.tauUncr;
  const cna = 10 * da * Math.sqrt(product.tauUncr / 7.6); // 17.6.5.1.2b (SI)
  const edges = [
    b.px / 2 + g.x0,
    b.px / 2 - g.x1,
    b.py / 2 + g.y0,
    b.py / 2 - g.y1,
  ];
  const ana =
    (Math.min(edges[0]!, cna) + (g.x1 - g.x0) + Math.min(edges[1]!, cna)) *
    (Math.min(edges[2]!, cna) + (g.y1 - g.y0) + Math.min(edges[3]!, cna));
  const anao = (2 * cna) ** 2;
  const total = forces.reduce((a, f) => a + f, 0);
  let psiEc = 1;
  if (total > 0) {
    const ex = Math.abs(
      points.reduce((a, p, k) => a + forces[k]! * p.x, 0) / total -
        (g.x0 + g.x1) / 2,
    );
    const ey = Math.abs(
      points.reduce((a, p, k) => a + forces[k]! * p.y, 0) / total -
        (g.y0 + g.y1) / 2,
    );
    psiEc = (1 / (1 + ex / cna)) * (1 / (1 + ey / cna));
  }
  const caMin = Math.min(...edges);
  const psiEd = caMin >= cna ? 1 : 0.7 + (0.3 * caMin) / cna;
  const cac = product.cac ?? 2 * hef;
  const psiCp =
    b.cracked || caMin >= cac
      ? 1
      : Math.min(1, Math.max(caMin / cac, cna / cac));
  const nba = b.lambdaA * tau * Math.PI * da * hef; // 17.6.5.2.1
  return {
    tau,
    cna,
    ana,
    anao,
    psiEc,
    psiEd,
    psiCp,
    nba,
    nag:
      (Math.min(ana, points.length * anao) / anao) *
      psiEc *
      psiEd *
      psiCp *
      nba,
    /** 17.5.2.2 sustained tension: 0.55 φ Nba ≥ Nua,s (per anchor). */
    sustainedNba: nba,
  };
}

export interface ShearBreakout {
  edge: "west" | "east" | "south" | "north";
  ca1: number;
  ca1Used: number;
  ca2: number;
  avc: number;
  avco: number;
  vb: number;
  psiEd: number;
  psiC: number;
  psiH: number;
  vcbg: number;
  row: "front" | "back";
}

/**
 * 17.7.2 concrete breakout in shear towards one edge, for the anchor row
 * that carries the shear (front or farthest row, 17.7.2.1(b)).
 */
export function shearBreakout(
  points: AnchorPoint[],
  edge: "west" | "east" | "south" | "north",
  row: "front" | "back",
  hef: number,
  da: number,
  b: ConcreteBlock,
  kind: AnchorKind,
): ShearBreakout {
  const dist = (p: AnchorPoint) => edgeDistances(p, b)[edge];
  const ds = points.map(dist);
  const ca1Row = row === "front" ? Math.min(...ds) : Math.max(...ds);
  const rowPts = points.filter((p) => Math.abs(dist(p) - ca1Row) < 1e-6);
  const along = edge === "west" || edge === "east" ? "y" : "x";
  const coords = rowPts.map((p) => p[along]);
  const half = along === "y" ? b.py / 2 : b.px / 2;
  const c2a = half + Math.min(...coords),
    c2b = half - Math.max(...coords),
    span = Math.max(...coords) - Math.min(...coords);
  let ca1 = ca1Row;
  // 17.7.2.1.2 narrow, thin members.
  if (c2a < 1.5 * ca1 && c2b < 1.5 * ca1 && b.ha < 1.5 * ca1)
    ca1 = Math.min(
      ca1,
      Math.max(Math.max(c2a, c2b) / 1.5, b.ha / 1.5, span / 3),
    );
  const c15 = 1.5 * ca1;
  const avc =
    (Math.min(c2a, c15) + span + Math.min(c2b, c15)) * Math.min(c15, b.ha);
  const avco = 4.5 * ca1 * ca1;
  const le = Math.min(hef, 8 * da);
  const sq = anchorSqrtFc(b.fc, kind);
  const vb = Math.min(
    0.6 * (le / da) ** 0.2 * Math.sqrt(da) * b.lambdaA * sq * ca1 ** 1.5,
    3.7 * b.lambdaA * sq * ca1 ** 1.5,
  ); // 17.7.2.2.1
  const ca2 = Math.min(c2a, c2b);
  const psiEd = ca2 >= c15 ? 1 : 0.7 + (0.3 * ca2) / c15;
  const psiC = b.cracked ? 1 : 1.4;
  const psiH = Math.max(1, Math.sqrt(c15 / b.ha));
  return {
    edge,
    ca1: ca1Row,
    ca1Used: ca1,
    ca2,
    avc,
    avco,
    vb,
    psiEd,
    psiC,
    psiH,
    vcbg:
      (Math.min(avc, rowPts.length * avco) / avco) * psiEd * psiC * psiH * vb,
    row,
  };
}

/** 17.7.3 pryout: Vcpg = kcp Ncpg (kcp = 1 for hef < 65 mm, else 2). */
export function pryout(ncpg: number, hef: number) {
  const kcp = hef < 65 ? 1 : 2;
  return { kcp, vcpg: kcp * ncpg };
}

/** 17.8 tension–shear interaction (linear 1.2 envelope). */
export function interaction(tensionRatio: number, shearRatio: number) {
  if (tensionRatio <= 0.2)
    return { ratio: shearRatio, rule: "Nua ≤ 0.2φNn: shear only (17.8.1)" };
  if (shearRatio <= 0.2)
    return { ratio: tensionRatio, rule: "Vua ≤ 0.2φVn: tension only (17.8.2)" };
  return {
    ratio: (tensionRatio + shearRatio) / 1.2,
    rule: "Nua/φNn + Vua/φVn ≤ 1.2 (17.8.3)",
  };
}

/** 17.9 minimum spacing / edge distance (cast-in non-torqued: cover; else 6da …). */
export function minimumGeometry(
  kind: AnchorKind,
  da: number,
  torqued: boolean,
  cover: number,
  product: PostInstalledProduct | null,
) {
  const castIn = isCastIn(kind);
  const smin = product?.smin ?? (castIn && !torqued ? 4 * da : 6 * da);
  const table: Record<string, number> = {
    adhesive: 6,
    "mech-torque-expansion": 8,
    "mech-displacement-expansion": 10,
    "mech-undercut": 6,
    "mech-screw": 6,
  };
  const cmin = castIn
    ? torqued
      ? 6 * da
      : cover
    : (product?.cmin ?? (table[kind] ?? 6) * da);
  return {
    smin,
    cmin,
    basis: castIn
      ? torqued
        ? "17.9.1, 17.9.2(b): torqued cast-in 6da"
        : "17.9.1 (4da), 17.9.2(a): cover per 20.5.1.3"
      : product?.cmin
        ? "17.9.2: product report cmin / smin"
        : "17.9.1 (6da), Table 17.9.2(a)",
  };
}

/** 17.9.5 default critical edge distance cac for post-installed anchors. */
export function defaultCac(kind: AnchorKind, hef: number) {
  switch (kind) {
    case "adhesive":
      return 2 * hef;
    case "mech-undercut":
      return 2.5 * hef;
    case "mech-torque-expansion":
      return 4 * hef;
    case "mech-displacement-expansion":
      return 4 * hef;
    case "mech-screw":
      return 4 * hef;
    default:
      return 1.5 * hef;
  }
}
