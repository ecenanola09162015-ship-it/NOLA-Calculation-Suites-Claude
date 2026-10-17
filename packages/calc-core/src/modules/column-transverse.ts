/**
 * Transverse reinforcement design for rectangular tied columns, ACI 318-19:
 * shear (22.5, 10.6.2, 10.7.6.5), general ties (25.7.2), seismic design shear
 * Ve (18.4.3.1, 18.7.6.1) and confinement (18.4.3, 18.7.2–18.7.5).
 *
 * Directions: "x" is shear acting along x (Vux), resisted by legs parallel to
 * x, with bw = depth and d measured along the width; it pairs with Muy.
 * "y" is shear along y (Vuy), legs parallel to y, bw = width; pairs with Mux.
 * Confinement: legs parallel to x are checked against bc = core dimension
 * along y, and legs parallel to y against bc along x (Ash ⟂ bc).
 */
import { z } from "zod";
import { biaxialRawStateAt, biaxialSection } from "./column-biaxial";
import { rebarGradeFor } from "../rebar-catalogue";
import { storeyClearHeights } from "./column-storey";
import type {
  ColumnBar,
  ColumnLoad,
  RectangularColumnInput,
} from "./rectangular-column";

const finite = z.number().finite();
const nullablePositive = finite.positive().max(1e7).nullable();
export const columnTieDesignSchema = z.object({
  shear: z.object({ enabled: z.boolean() }),
  confinement: z.object({
    enabled: z.boolean(),
    frame: z.enum(["OMF", "IMF", "SMF"]),
    /** Clear height ℓu between joint faces, mm (manual / legacy value). */
    clearHeight: finite.min(300).max(30000),
    /**
     * "storey": ℓu from storey geometry (lo with the larger ℓu, Ve per
     * direction). "manual": clearHeight above (legacy drafts / override).
     */
    clearHeightSource: z.enum(["storey", "manual"]).optional(),
    /** Supports a discontinued stiff member (18.7.5.6). */
    discontinuedSupport: z.boolean(),
    /** ΣMnb, kN·m: kept for older drafts; not used (SCWB check removed 18 Oct 2026). */
    sumMnbX: nullablePositive,
    sumMnbY: nullablePositive,
  }),
  tie: z.object({
    diameter: finite.min(6).max(40),
    fyt: finite.min(200).max(700),
    /** Interior cross-ties parallel to x / y (in addition to the hoop). */
    interiorX: finite.int().min(0).max(14),
    interiorY: finite.int().min(0).max(14),
    /**
     * Optional arrangement outside lo (seismic frames only). null / absent =
     * same as the lo zone. Inside lo, 18.7.5.2–18.7.5.4 govern; outside lo,
     * 18.7.5.5, 25.7.2 and shear (22.5) govern.
     */
    midInteriorX: finite.int().min(0).max(14).nullable().optional(),
    midInteriorY: finite.int().min(0).max(14).nullable().optional(),
    gradeId: z.string().max(20).nullable().optional(),
    /** Hook basis shared with the estimate (see columnHookGeometry). */
    hookBasis: z.enum(["allowance8db", "aci135", "aci14x90"]).optional(),
  }),
  override: z.object({
    lo: nullablePositive,
    sEnd: nullablePositive,
    sMid: nullablePositive,
    veX: nullablePositive,
    veY: nullablePositive,
  }),
});
export type ColumnTieDesignInput = z.infer<typeof columnTieDesignSchema>;

export function defaultColumnTieDesign(
  input?: Pick<RectangularColumnInput, "tieDiameter">,
  clearHeight = 2500,
): ColumnTieDesignInput {
  return {
    shear: { enabled: false },
    confinement: {
      enabled: false,
      frame: "SMF",
      clearHeight,
      discontinuedSupport: false,
      sumMnbX: null,
      sumMnbY: null,
    },
    tie: {
      diameter: input?.tieDiameter ?? 10,
      fyt: 420,
      interiorX: 0,
      interiorY: 0,
    },
    override: { lo: null, sEnd: null, sMid: null, veX: null, veY: null },
  };
}

const barArea = (d: number) => (Math.PI * d ** 2) / 4;
const tol = 0.1;

/** Opposing face bars sharing a coordinate; mirrors the estimate's rule. */
export function crossTieCandidatePositions(
  bars: ColumnBar[],
  axis: "X" | "Y",
): number[] {
  if (!bars.length) return [];
  const along = axis === "X" ? "x" : "y";
  const across = axis === "X" ? "y" : "x";
  const lo = Math.min(...bars.map((b) => b[along]));
  const hi = Math.max(...bars.map((b) => b[along]));
  const amin = Math.min(...bars.map((b) => b[across]));
  const amax = Math.max(...bars.map((b) => b[across]));
  if (hi - lo < 1) return [];
  return [
    ...new Set(
      bars
        .filter(
          (b) =>
            Math.abs(b[along] - lo) < tol &&
            b[across] > amin + tol &&
            b[across] < amax - tol &&
            bars.some(
              (c) =>
                Math.abs(c[along] - hi) < tol &&
                Math.abs(c[across] - b[across]) < tol,
            ),
        )
        .map((b) => b[across]),
    ),
  ].sort((a, b) => a - b);
}
/** Evenly distributed choice of `count` candidates (same as the estimate). */
export function pickCrossTies(candidates: number[], count: number) {
  const n = Math.min(count, candidates.length);
  return Array.from(
    { length: n },
    (_, i) => candidates[Math.floor(((i + 0.5) * candidates.length) / n)]!,
  );
}

export interface ConfinementLayout {
  /** y positions of cross-ties parallel to x; x positions of those ∥ y. */
  crossX: number[];
  crossY: number[];
  legsX: number;
  legsY: number;
  supported: boolean[];
  /** Laterally supported bars (hoop corners + cross-tie engagements). */
  nl: number;
  /** Max c/c spacing of laterally supported bars around the perimeter. */
  hx: number;
  /** Max clear distance from an unsupported bar to a supported one. */
  maxUnsupportedClear: number;
  /** Interior bar pairs that a cross-tie can engage, per direction. */
  availableX: number;
  availableY: number;
}
export function confinementLayout(
  bars: ColumnBar[],
  interiorX: number,
  interiorY: number,
): ConfinementLayout {
  const candX = crossTieCandidatePositions(bars, "X");
  const candY = crossTieCandidatePositions(bars, "Y");
  const crossX = pickCrossTies(candX, interiorX);
  const crossY = pickCrossTies(candY, interiorY);
  const xmin = Math.min(...bars.map((b) => b.x)),
    xmax = Math.max(...bars.map((b) => b.x)),
    ymin = Math.min(...bars.map((b) => b.y)),
    ymax = Math.max(...bars.map((b) => b.y));
  const near = (a: number, b: number) => Math.abs(a - b) < tol;
  const onV = (b: ColumnBar) => near(b.x, xmin) || near(b.x, xmax);
  const onH = (b: ColumnBar) => near(b.y, ymin) || near(b.y, ymax);
  const supported = bars.map(
    (b) =>
      (onV(b) && onH(b)) ||
      (onV(b) && crossX.some((p) => near(p, b.y))) ||
      (onH(b) && crossY.some((p) => near(p, b.x))),
  );
  let hx = 0,
    clear = 0;
  const faces: [ColumnBar[], "x" | "y"][] = [
    [bars.filter((b) => near(b.x, xmin)), "y"],
    [bars.filter((b) => near(b.x, xmax)), "y"],
    [bars.filter((b) => near(b.y, ymin)), "x"],
    [bars.filter((b) => near(b.y, ymax)), "x"],
  ];
  for (const [face, k] of faces) {
    const sorted = [...face].sort((a, b) => a[k] - b[k]);
    const sup = sorted.filter((b) => supported[bars.indexOf(b)]);
    for (let i = 1; i < sup.length; i++)
      hx = Math.max(hx, sup[i]![k] - sup[i - 1]![k]);
    for (const b of sorted)
      if (!supported[bars.indexOf(b)])
        clear = Math.max(
          clear,
          Math.min(
            ...sup.map(
              (s) => Math.abs(s[k] - b[k]) - (s.diameter + b.diameter) / 2,
            ),
          ),
        );
  }
  return {
    crossX,
    crossY,
    legsX: 2 + crossX.length,
    legsY: 2 + crossY.length,
    supported,
    nl: supported.filter(Boolean).length,
    hx,
    maxUnsupportedClear: clear,
    availableX: candX.length,
    availableY: candY.length,
  };
}

/**
 * Nominal moment (kN·m) about `axis` at axial force P (kN, compression +),
 * steel stress scaled by fyFactor (1.25 for Mpr), φ = 1.0.
 */
export function nominalMomentAtP(
  input: RectangularColumnInput,
  axis: "x" | "y",
  pu: number,
  fyFactor = 1,
) {
  const s = { ...biaxialSection(input), fy: input.fy * fyFactor };
  const theta = axis === "x" ? Math.PI / 2 : 0;
  const target = pu * 1000;
  const cMax = 20 * Math.hypot(s.width, s.depth);
  const bottom = biaxialRawStateAt(s, theta, 0).p;
  const top = biaxialRawStateAt(s, theta, cMax).p;
  if (target <= bottom || target >= top) return 0;
  let lo = 0,
    hi = cMax;
  for (let i = 0; i < 70; i++) {
    const mid = (lo + hi) / 2;
    if (biaxialRawStateAt(s, theta, mid).p < target) lo = mid;
    else hi = mid;
  }
  const st = biaxialRawStateAt(s, theta, (lo + hi) / 2);
  return Math.abs(axis === "x" ? st.mx : st.my) / 1e6;
}

export interface ShearDirection {
  dir: "x" | "y";
  bw: number;
  d: number;
  rhoW: number;
  legs: number;
  av: number;
}
/** Section properties for shear in one direction (22.5.2). */
export function shearSection(
  input: RectangularColumnInput,
  dir: "x" | "y",
  legs: number,
  tieDiameter: number,
): ShearDirection {
  const along = dir === "x" ? "x" : "y";
  const h = dir === "x" ? input.width : input.depth;
  const bw = dir === "x" ? input.depth : input.width;
  const tension = input.bars.filter((b) => b[along] < -tol);
  const as = tension.reduce((t, b) => t + barArea(b.diameter), 0);
  const d =
    as > 0
      ? h / 2 +
        tension.reduce((t, b) => t + barArea(b.diameter) * -b[along], 0) / as
      : 0.8 * h;
  return {
    dir,
    bw,
    d,
    rhoW: as / (bw * d),
    legs,
    av: legs * barArea(tieDiameter),
  };
}

/** √f′c limited to 8.3 MPa (22.5.3.1). */
const rootFc = (fc: number) => Math.min(Math.sqrt(fc), 8.3);
/** Av,min/s (10.6.2.2, Table 9.6.3.4 form). */
export function avMinPerS(fc: number, bw: number, fyt: number) {
  return (Math.max(0.062 * Math.sqrt(fc), 0.35) * bw) / Math.min(fyt, 420);
}
/**
 * Vc per Table 22.5.5.1 (kN), λ = 1.0. Nu in kN (compression +).
 * withMin: Av ≥ Av,min ⇒ larger of (a) and (b); otherwise (c) with λs.
 */
export function columnVc(
  fc: number,
  ag: number,
  sec: Pick<ShearDirection, "bw" | "d" | "rhoW">,
  nu: number,
  withMin: boolean,
) {
  const rf = rootFc(fc);
  const axial = Math.min((nu * 1000) / (6 * ag), 0.05 * fc); // 22.5.5.1.2
  const lambdaS = Math.min(1, Math.sqrt(2 / (1 + 0.004 * sec.d))); // 22.5.5.1.3
  const rho3 = Math.cbrt(sec.rhoW);
  const stress = withMin
    ? Math.max(0.17 * rf + axial, 0.66 * rho3 * rf + axial)
    : 0.66 * lambdaS * rho3 * rf + axial;
  const vc = Math.max(0, Math.min(stress, 0.42 * rf)) * sec.bw * sec.d;
  return { vc: vc / 1000, lambdaS, axial };
}

export interface ShearZoneCheck {
  zone: "end" | "mid";
  dir: "x" | "y";
  load: string;
  pu: number;
  vu: number;
  vc: number;
  vcZero: boolean;
  vs: number;
  phiVn: number;
  sectionLimit: number;
  avMinOk: boolean;
  dcr: number;
  sReq: number;
}
export interface TransverseResult {
  frame: "OMF" | "IMF" | "SMF" | null;
  seismic: boolean;
  /** Clear height used for lo and the elevation, mm (0 when not seismic). */
  clearHeight: number;
  /** Clear heights used for Ve along x and along y, mm. */
  clearHeightsVe: { x: number; y: number };
  /** Clear heights came from storey geometry. */
  clearFromStorey: boolean;
  /** lo zone (or full height when not seismic). */
  sections: { x: ShearDirection; y: ShearDirection };
  layout: ConfinementLayout;
  /** Outside lo; the same objects as above unless a mid arrangement is set. */
  sectionsMid: { x: ShearDirection; y: ShearDirection };
  layoutMid: ConfinementLayout;
  /** A separate arrangement outside lo is in use. */
  midSeparate: boolean;
  barDb: number;
  /** Seismic design shear per direction (kN): x = along x (from Mpr about y). */
  ve: { x: number; y: number; basis: string; mprX: number; mprY: number };
  lo: number;
  loBasis: string;
  fullHeight: boolean;
  limits: { label: string; end: number; mid: number; clause: string }[];
  ash: {
    dir: "x" | "y";
    bc: number;
    ratio: number;
    terms: { a: number; b: number; c: number | null };
    provided: number;
    sMax: number;
  }[];
  recommended: { lo: number; sEnd: number; sMid: number };
  adopted: {
    lo: number;
    sEnd: number;
    sMid: number;
    ve: { x: number; y: number };
  };
  shear: ShearZoneCheck[];
  biaxialShear: { load: string; zone: "end" | "mid"; sum: number }[];
  checks: {
    id: string;
    label: string;
    dcr: number | null;
    detail: string;
    clause: string;
    /** Shown instead of a number when dcr is not finite. */
    invalidLabel?: string;
  }[];
  notes: string[];
}

const floor25 = (s: number) =>
  Number.isFinite(s) ? Math.max(50, Math.floor(s / 25) * 25) : Infinity;

export function designColumnTransverse(
  input: RectangularColumnInput,
  raw: ColumnTieDesignInput,
): TransverseResult {
  const t = columnTieDesignSchema.parse(raw);
  const loads = input.loads.filter((l) => l.included);
  const conf = t.confinement.enabled ? t.confinement : null;
  const frame = conf ? conf.frame : null;
  const seismic = frame === "SMF" || frame === "IMF";
  const ag = input.width * input.depth;
  const fc = input.fc;
  const fytV = Math.min(t.tie.fyt, 420); // Table 20.2.2.4a, shear
  const fytC = Math.min(t.tie.fyt, 700); // Table 20.2.2.4a, confinement
  const layout = confinementLayout(
    input.bars,
    t.tie.interiorX,
    t.tie.interiorY,
  );
  const sx = shearSection(input, "x", layout.legsX, t.tie.diameter);
  const sy = shearSection(input, "y", layout.legsY, t.tie.diameter);
  const barDb = Math.min(...input.bars.map((b) => b.diameter));
  const maxDb = Math.max(...input.bars.map((b) => b.diameter));
  const hmin = Math.min(input.width, input.depth),
    hmax = Math.max(input.width, input.depth);
  // Clear heights: storey geometry (lo: larger ℓu, 18.7.5.1; Ve per
  // direction, 18.7.6.1.1) unless the manual value is selected.
  const fromStorey =
    !!input.storey && conf?.clearHeightSource !== "manual" && !!conf;
  const sh = input.storey ? storeyClearHeights(input.storey) : null;
  const lu = conf ? (fromStorey && sh ? sh.loClear : conf.clearHeight) : 0;
  // Ve along x comes from bending about y (ℓu,y); along y from about x.
  const luVeX = fromStorey && sh ? sh.luY : lu;
  const luVeY = fromStorey && sh ? sh.luX : lu;
  const puMax = Math.max(0, ...loads.map((l) => l.pu));
  const puMin = Math.min(...loads.map((l) => l.pu));
  const highAxial = puMax > (0.3 * ag * fc) / 1000 || fc > 70;
  const gr550 = input.fy > 420;
  const notes: string[] = [];
  const checks: TransverseResult["checks"] = [];

  // Seismic design shear.
  let mprX = 0,
    mprY = 0,
    basis = "Analysis shear only";
  if (seismic && lu > 0) {
    const factor = frame === "SMF" ? 1.25 : 1;
    // Range of factored axial forces (18.7.6.1.1); max moment governs Ve.
    const ps = [...new Set(loads.map((l) => l.pu))];
    mprX = Math.max(
      0,
      ...ps.map((p) => nominalMomentAtP(input, "x", p, factor)),
    );
    mprY = Math.max(
      0,
      ...ps.map((p) => nominalMomentAtP(input, "y", p, factor)),
    );
    basis =
      frame === "SMF"
        ? "Ve = 2Mpr/ℓu, Mpr at 1.25fy, φ = 1.0, max over factored Pu (18.7.6.1.1)"
        : "Ve = 2Mn/ℓu, Mn at fy, φ = 1.0, max over factored Pu (18.4.3.1a)";
    if (fromStorey && luVeX !== luVeY)
      basis += `; ℓu ${luVeX.toFixed(0)} (Ve x) / ${luVeY.toFixed(0)} (Ve y) mm from storey geometry`;
  }
  // Bending about y (Mpr about y) drives shear along x.
  const veCalc = {
    x: seismic && luVeX > 0 ? (2 * mprY * 1000) / luVeX : 0,
    y: seismic && luVeY > 0 ? (2 * mprX * 1000) / luVeY : 0,
  };
  const ve = {
    x: t.override.veX ?? veCalc.x,
    y: t.override.veY ?? veCalc.y,
  };

  // Confinement zone length.
  let lo = 0,
    loBasis = "No end zone (shear design only)";
  if (seismic) {
    lo = Math.max(hmax, lu / 6, 450); // 18.7.5.1 / 18.4.3.3
    loBasis = `lo = max(h ${hmax}, ℓu/6 ${(lu / 6).toFixed(0)}, 450) = ${lo.toFixed(0)} mm (${frame === "SMF" ? "18.7.5.1" : "18.4.3.3"})`;
  }
  let fullHeight = false;
  if (
    frame === "SMF" &&
    conf?.discontinuedSupport &&
    puMax > (ag * fc) / 10000
  ) {
    fullHeight = true;
    notes.push(
      "Supports a discontinued stiff member with Pu > Ag f′c/10: full-height confinement (18.7.5.6).",
    );
  }
  const loAdopted = t.override.lo ?? lo;
  if (seismic && 2 * loAdopted >= lu) fullHeight = true;

  // Arrangement outside lo (only meaningful when lo zones and a mid-height
  // zone both exist).
  const midSeparate =
    seismic &&
    !fullHeight &&
    (t.tie.midInteriorX != null || t.tie.midInteriorY != null);
  const layoutMid = midSeparate
    ? confinementLayout(
        input.bars,
        t.tie.midInteriorX ?? t.tie.interiorX,
        t.tie.midInteriorY ?? t.tie.interiorY,
      )
    : layout;
  const sxM = midSeparate
    ? shearSection(input, "x", layoutMid.legsX, t.tie.diameter)
    : sx;
  const syM = midSeparate
    ? shearSection(input, "y", layoutMid.legsY, t.tie.diameter)
    : sy;
  const secsFor = (zone: "end" | "mid") =>
    zone === "end" ? [sx, sy] : [sxM, syM];
  for (const [lay, where] of [
    [layout, seismic ? "in lo" : "full height"],
    ...(midSeparate ? [[layoutMid, "outside lo"] as const] : []),
  ] as const) {
    const req =
      where === "outside lo"
        ? [
            t.tie.midInteriorX ?? t.tie.interiorX,
            t.tie.midInteriorY ?? t.tie.interiorY,
          ]
        : [t.tie.interiorX, t.tie.interiorY];
    if (req[0]! > lay.availableX || req[1]! > lay.availableY)
      notes.push(
        `Cross-ties ${where}: requested ${req[0]} ∥ X / ${req[1]} ∥ Y; only ${lay.availableX} / ${lay.availableY} interior bar pairs can be engaged (25.7.2.3), so ${lay.crossX.length} / ${lay.crossY.length} are placed.`,
      );
  }

  // Spacing limits (mm): end zone and mid-height.
  const limits: TransverseResult["limits"] = [];
  const general = Math.min(16 * barDb, 48 * t.tie.diameter, hmin);
  limits.push({
    label: "General ties min(16db, 48dt, hmin)",
    end: general,
    mid: general,
    clause: "25.7.2.1",
  });
  let so: number | null = null;
  if (frame === "SMF") {
    so = Math.min(150, Math.max(100, 100 + (350 - layout.hx) / 3));
    const endLim = Math.min(hmin / 4, (gr550 ? 5 : 6) * barDb, so);
    const midLim = Math.min((gr550 ? 5 : 6) * barDb, 150);
    limits.push({
      label: `SMF lo: min(hmin/4, ${gr550 ? 5 : 6}db, so = ${so.toFixed(0)})`,
      end: endLim,
      mid: Infinity,
      clause: "18.7.5.3",
    });
    limits.push({
      label: `SMF outside lo: min(${gr550 ? 5 : 6}db, 150)`,
      end: Infinity,
      mid: midLim,
      clause: "18.7.5.5",
    });
  } else if (frame === "IMF") {
    const endLim = Math.min(
      gr550 ? Math.min(6 * barDb, 150) : Math.min(8 * barDb, 200),
      hmin / 2,
    );
    limits.push({
      label: `IMF lo: min(${gr550 ? "6db, 150" : "8db, 200"}, hmin/2)`,
      end: endLim,
      mid: Infinity,
      clause: "18.4.3.3",
    });
  }

  // Ash (SMF only).
  const ach = (input.width - 2 * input.cover) * (input.depth - 2 * input.cover);
  const ash: TransverseResult["ash"] = [];
  if (frame === "SMF") {
    const kf = Math.max(1, fc / 175 + 0.6);
    const kn = layout.nl > 2 ? layout.nl / (layout.nl - 2) : Infinity;
    for (const dir of ["x", "y"] as const) {
      const bc =
        dir === "x"
          ? input.depth - 2 * input.cover
          : input.width - 2 * input.cover;
      const legs = dir === "x" ? layout.legsX : layout.legsY;
      const a = 0.3 * (ag / ach - 1) * (fc / fytC);
      const b = 0.09 * (fc / fytC);
      const c = highAxial
        ? (0.2 * kf * kn * puMax * 1000) / (fytC * ach)
        : null;
      const ratio = Math.max(a, b, c ?? 0);
      const provided = legs * barArea(t.tie.diameter);
      const sMax = provided / (ratio * bc);
      ash.push({ dir, bc, ratio, terms: { a, b, c }, provided, sMax });
    }
    limits.push({
      label: "Ash/(s bc) ≥ Table 18.7.5.4 (both directions)",
      end: Math.min(...ash.map((r) => r.sMax)),
      mid: Infinity,
      clause: "18.7.5.4",
    });
  }

  // Shear per zone, direction and combination.
  const shearOn = t.shear.enabled || seismic;
  const zoneDemand = (l: ColumnLoad, dir: "x" | "y") =>
    Math.max(Math.abs((dir === "x" ? l.vx : l.vy) ?? 0), seismic ? ve[dir] : 0);
  const strengthSpacing = (zone: "end" | "mid") => {
    let sReq = Infinity,
      sMaxV = Infinity,
      sAvMin = Infinity;
    for (const sec of secsFor(zone))
      for (const l of loads) {
        const vu = zoneDemand(l, sec.dir);
        const vcZero =
          zone === "end" && frame === "SMF" && l.pu < (ag * fc) / 20000;
        const vc = vcZero ? 0 : columnVc(fc, ag, sec, l.pu, true).vc;
        const vsReq = vu / 0.75 - vc;
        if (vsReq > 0) {
          sReq = Math.min(sReq, (sec.av * fytV * sec.d) / (vsReq * 1000));
          const big = vsReq * 1000 > 0.33 * Math.sqrt(fc) * sec.bw * sec.d;
          sMaxV = Math.min(
            sMaxV,
            big ? Math.min(sec.d / 4, 300) : Math.min(sec.d / 2, 600),
          );
        } else sMaxV = Math.min(sMaxV, Math.min(sec.d / 2, 600));
        if (vu > 0.5 * 0.75 * vc)
          sAvMin = Math.min(sAvMin, sec.av / avMinPerS(fc, sec.bw, t.tie.fyt));
      }
    return { sReq, sMaxV, sAvMin };
  };
  if (shearOn) {
    const e = strengthSpacing("end"),
      m = strengthSpacing("mid");
    limits.push({
      label: "Shear strength Vu ≤ φ(Vc + Vs)",
      end: seismic ? e.sReq : m.sReq,
      mid: m.sReq,
      clause: "22.5.1.1, 22.5.8.5.3",
    });
    limits.push({
      label: "Shear max spacing",
      end: seismic ? e.sMaxV : m.sMaxV,
      mid: m.sMaxV,
      clause: "10.7.6.5.2",
    });
    limits.push({
      label: "Av ≥ Av,min where Vu > 0.5φVc",
      end: seismic ? e.sAvMin : m.sAvMin,
      mid: m.sAvMin,
      clause: "10.6.2.1, 10.6.2.2",
    });
  }
  const sEndRec = floor25(Math.min(...limits.map((l) => l.end)));
  const sMidRec = floor25(Math.min(...limits.map((l) => l.mid)));
  const recommended = {
    lo: seismic ? Math.ceil(lo / 25) * 25 : 0,
    sEnd: seismic ? Math.min(sEndRec, sMidRec) : sMidRec,
    sMid: fullHeight ? Math.min(sEndRec, sMidRec) : sMidRec,
  };
  const adopted = {
    lo: seismic ? (t.override.lo ?? recommended.lo) : 0,
    sEnd: t.override.sEnd ?? recommended.sEnd,
    sMid: t.override.sMid ?? recommended.sMid,
    ve,
  };

  // Shear checks at the adopted spacing.
  const shear: ShearZoneCheck[] = [];
  const biaxialShear: TransverseResult["biaxialShear"] = [];
  if (shearOn) {
    const zones: ("end" | "mid")[] = seismic ? ["end", "mid"] : ["mid"];
    for (const zone of zones) {
      const s = zone === "end" ? adopted.sEnd : adopted.sMid;
      for (const l of loads) {
        const pair: Record<string, ShearZoneCheck> = {};
        for (const sec of secsFor(zone)) {
          const vu = zoneDemand(l, sec.dir);
          const avMin = avMinPerS(fc, sec.bw, t.tie.fyt) * s;
          const avMinOk = sec.av >= avMin - 1e-9;
          const vcZero =
            zone === "end" && frame === "SMF" && l.pu < (ag * fc) / 20000;
          const vc = vcZero ? 0 : columnVc(fc, ag, sec, l.pu, avMinOk).vc;
          const vs = (sec.av * fytV * sec.d) / s / 1000;
          const vsCap = (0.66 * Math.sqrt(fc) * sec.bw * sec.d) / 1000; // 22.5.1.2
          const phiVn = 0.75 * (vc + Math.min(vs, vsCap));
          const vsReq = vu / 0.75 - vc;
          const c: ShearZoneCheck = {
            zone,
            dir: sec.dir,
            load: l.id,
            pu: l.pu,
            vu,
            vc,
            vcZero,
            vs,
            phiVn,
            sectionLimit: 0.75 * (vc + vsCap),
            avMinOk,
            dcr: phiVn > 0 ? vu / phiVn : vu > 0 ? Infinity : 0,
            sReq:
              vsReq > 0 ? (sec.av * fytV * sec.d) / (vsReq * 1000) : Infinity,
          };
          shear.push(c);
          pair[sec.dir] = c;
        }
        const rx = pair.x!.dcr,
          ry = pair.y!.dcr;
        if (rx > 0.5 && ry > 0.5)
          biaxialShear.push({ load: l.id, zone, sum: rx + ry }); // 22.5.1.10–11
      }
    }
    const zoneLabel = (z: "end" | "mid") =>
      seismic ? (z === "end" ? "lo zone" : "mid-height") : "full height";
    for (const zone of zones)
      for (const dir of ["x", "y"] as const) {
        const rows = shear.filter((c) => c.zone === zone && c.dir === dir);
        const g = rows.reduce((a, b) => (b.dcr > a.dcr ? b : a), rows[0]!);
        if (!g) continue;
        checks.push({
          id: `shear:${zone}:${dir}`,
          label: `Shear V${dir === "x" ? "ux" : "uy"} · ${zoneLabel(zone)} (${g.load})`,
          dcr: g.dcr,
          detail: `Vu ${g.vu.toFixed(1)} kN; φVn ${g.phiVn.toFixed(1)} kN\nVc ${g.vc.toFixed(1)}${g.vcZero ? " (Vc = 0, 18.7.6.2.1)" : ""}; Vs ${g.vs.toFixed(1)} kN\n${secsFor(zone).find((x) => x.dir === dir)!.legs} legs at s = ${zone === "end" ? adopted.sEnd : adopted.sMid} mm`,
          clause:
            "ACI 318-19 22.5.1.1; Vc Table 22.5.5.1; Vs 22.5.8.5.3; φ 0.75",
        });
        const sl = rows.reduce((a, b) => Math.max(a, b.vu / b.sectionLimit), 0);
        checks.push({
          id: `shear-section:${zone}:${dir}`,
          label: `Shear section limit V${dir === "x" ? "ux" : "uy"} · ${zoneLabel(zone)}`,
          dcr: sl,
          detail: "Vu ≤ φ(Vc + 0.66√f′c bw d)",
          clause: "ACI 318-19 22.5.1.2",
        });
      }
    const bx = biaxialShear.reduce((a, b) => Math.max(a, b.sum), 0);
    checks.push({
      id: "shear:biaxial",
      label: biaxialShear.length
        ? `Biaxial shear Σ = ${bx.toFixed(3)} vs limit 1.5`
        : "Biaxial shear (interaction not required)",
      dcr: biaxialShear.length ? bx / 1.5 : 0,
      detail: biaxialShear.length
        ? `vux/φvnx + vuy/φvny = ${bx.toFixed(3)} ${bx <= 1.5 ? "≤" : ">"} 1.5\nDCR = Σ/1.5 = ${(bx / 1.5).toFixed(3)}\n${bx <= 1.5 ? "Satisfied." : "Reduce tie spacing or add legs."}`
        : "Ratios do not both exceed 0.5:\ninteraction may be neglected (22.5.1.10).",
      clause: "ACI 318-19 22.5.1.10, 22.5.1.11",
    });
  }

  // Spacing checks at the adopted values.
  const endLimit = Math.min(
    ...limits
      .filter((l) => !l.label.startsWith("Shear strength"))
      .map((l) => l.end),
  );
  const midLimit = Math.min(
    ...limits
      .filter((l) => !l.label.startsWith("Shear strength"))
      .map((l) => l.mid),
  );
  if (seismic)
    checks.push({
      id: "ties:spacing-end",
      label: `Tie spacing in lo (${adopted.sEnd} mm)`,
      dcr: adopted.sEnd / endLimit,
      detail: `Limit ${endLimit.toFixed(0)} mm`,
      clause:
        frame === "SMF"
          ? "ACI 318-19 18.7.5.3, 18.7.5.4, 10.7.6.5.2"
          : "ACI 318-19 18.4.3.3, 10.7.6.5.2",
    });
  checks.push({
    id: "ties:spacing-mid",
    label: `Tie spacing ${seismic ? "outside lo" : "full height"} (${adopted.sMid} mm)`,
    dcr: adopted.sMid / Math.min(midLimit, fullHeight ? endLimit : Infinity),
    detail: `Limit ${Math.min(midLimit, fullHeight ? endLimit : Infinity).toFixed(0)} mm`,
    clause:
      frame === "SMF"
        ? "ACI 318-19 18.7.5.5, 25.7.2.1, 10.7.6.5.2"
        : "ACI 318-19 25.7.2.1, 10.7.6.5.2",
  });
  if (seismic)
    checks.push({
      id: "ties:lo",
      label: `Confinement length lo (${adopted.lo} mm)`,
      dcr: adopted.lo > 0 ? lo / adopted.lo : Infinity,
      detail: loBasis,
      clause: frame === "SMF" ? "ACI 318-19 18.7.5.1" : "ACI 318-19 18.4.3.3",
    });
  const minTie = maxDb > 32 ? 13 : 10;
  checks.push({
    id: "ties:diameter",
    label: `Tie diameter D${t.tie.diameter}`,
    dcr: minTie / t.tie.diameter,
    detail: `≥ D${minTie} for longitudinal bars ${maxDb > 32 ? "> D32" : "≤ D32"}`,
    clause: "ACI 318-19 25.7.2.2",
  });
  checks.push({
    id: "ties:support",
    label: "Lateral support of bars (≤ 150 mm clear)",
    dcr: layout.maxUnsupportedClear / 150,
    detail: `Max clear distance from an unsupported bar\nto a supported bar ${layout.maxUnsupportedClear.toFixed(0)} mm${midSeparate ? " (lo zone)" : ""}`,
    clause: "ACI 318-19 25.7.2.3",
  });
  if (midSeparate)
    checks.push({
      id: "ties:support-mid",
      label: "Lateral support of bars outside lo (≤ 150 mm clear)",
      dcr: layoutMid.maxUnsupportedClear / 150,
      detail: `Outside lo: ${layoutMid.legsX} legs ∥ X, ${layoutMid.legsY} legs ∥ Y\nMax clear distance from an unsupported bar ${layoutMid.maxUnsupportedClear.toFixed(0)} mm`,
      clause: "ACI 318-19 25.7.2.3, 18.7.5.5",
    });
  if (frame === "SMF") {
    for (const r of ash)
      checks.push({
        id: `ash:${r.dir}`,
        label: `Ash legs ∥ ${r.dir} (bc ${r.bc.toFixed(0)} mm)`,
        dcr: (r.ratio * adopted.sEnd * r.bc) / r.provided,
        detail: `Required Ash/(s bc) = ${r.ratio.toFixed(5)}\n= max(a ${r.terms.a.toFixed(5)}, b ${r.terms.b.toFixed(5)}${r.terms.c !== null ? `, c ${r.terms.c.toFixed(5)}` : ""})\nProvided Ash ${r.provided.toFixed(0)} mm² at s = ${adopted.sEnd} mm`,
        clause: "ACI 318-19 18.7.5.4, Table 18.7.5.4",
      });
    checks.push({
      id: "smf:hx",
      label: `hx = ${layout.hx.toFixed(0)} mm`,
      dcr: layout.hx / (highAxial ? 200 : 350),
      detail: highAxial
        ? "Pu > 0.3Ag f′c or f′c > 70 MPa:\nhx ≤ 200 mm and every bar supported"
        : "hx ≤ 350 mm",
      clause: "ACI 318-19 18.7.5.2",
    });
    if (highAxial)
      checks.push({
        id: "smf:all-supported",
        label: "Every longitudinal bar laterally supported",
        dcr: layout.supported.every(Boolean) ? 0 : Infinity,
        detail: `${layout.nl} of ${input.bars.length} bars supported`,
        clause: "ACI 318-19 18.7.5.2(f)",
        invalidLabel: "Not Satisfied",
      });
    // ACI 318-19 18.7.5.2(f): with high axial load every perimeter bar is
    // supported by a hoop corner or a seismic hook, so crossties need 135°
    // hooks at both ends. ACI 318-14 / NSCP 2015 has no such clause.
    if (highAxial && t.tie.hookBasis === "aci14x90")
      checks.push({
        id: "smf:crosstie-hooks",
        label: "135° + 90° crossties not permitted",
        dcr: Infinity,
        invalidLabel: "Not Permitted",
        detail:
          "Pu > 0.3Ag f′c or f′c > 70 MPa:\nACI 318-19 18.7.5.2(f) requires seismic (135°) hooks at both ends of every crosstie.\nSelect the ACI 318-19 · 135° both ends hook basis in the estimate.",
        clause: "ACI 318-19 18.7.5.2(f)",
      });
    else if (t.tie.hookBasis === "aci14x90")
      notes.push(
        "Crossties 135° + 90° per ACI 318-14 / NSCP 2015 crosstie definition (Ch. 2 / 402); 90° ends alternate end for end on consecutive crossties (18.7.5.2(c) / 418.7.5.2(c)). Consistent with the ACI 318-19 crosstie definition; 18.7.5.2(f) does not apply (Pu ≤ 0.3Ag f′c, f′c ≤ 70 MPa).",
      );
    checks.push({
      id: "smf:geometry",
      label: "SMF section geometry",
      dcr: Math.max(300 / hmin, 0.4 / (hmin / hmax)),
      detail: `hmin ${hmin} ≥ 300 mm; hmin/hmax ${(hmin / hmax).toFixed(2)} ≥ 0.4`,
      clause: "ACI 318-19 18.7.2.1",
    });
    const rho = input.bars.reduce((s, b) => s + barArea(b.diameter), 0) / ag;
    checks.push({
      id: "smf:rho",
      label: `ρg = ${(rho * 100).toFixed(2)}%`,
      dcr: Math.max(0.01 / rho, rho / 0.06),
      detail: "0.01 ≤ ρg ≤ 0.06",
      clause: "ACI 318-19 18.7.4.1",
    });
    // 20.2.2.5: SMF longitudinal bars must be weldable/low-alloy (A706-type)
    // unless A615-type bars meet the 20.2.2.5(b) mill-test conditions.
    const grade = rebarGradeFor(
      input.rebarStandard ?? "PNS49",
      input.fy,
      input.gradeId,
    );
    if (!grade)
      checks.push({
        id: "smf:grade",
        label: `Longitudinal bar grade (custom fy ${input.fy} MPa)`,
        dcr: null,
        detail:
          "Custom steel grade.\nConfirm it is ASTM A706 / PNS W grade, or A615-type meeting 20.2.2.5(b).",
        clause: "ACI 318-19 20.2.2.5",
      });
    else if (!grade.weldable)
      checks.push({
        id: "smf:grade",
        label: `Longitudinal bar ${grade.label} is not weldable / low-alloy`,
        dcr: 1.05,
        detail:
          "SMF longitudinal bars: ASTM A706 / PNS W grade required (20.2.2.5).\nA615-type permitted only if mill certificates show actual fy ≤ fy + 125 MPa and actual tensile / actual yield ≥ 1.25 (20.2.2.5(b)).\nRecord the basis in remarks, or select a weldable grade.",
        clause: "ACI 318-19 20.2.2.5",
      });
    else
      notes.push(
        `Longitudinal bars ${grade.label} are weldable / low-alloy: 20.2.2.5 satisfied.`,
      );
    // Strong column–weak beam (18.7.3.2) is removed for now (user decision
    // 18 Oct 2026); a dedicated SCWB analysis will follow. Stored ΣMnb values
    // in older drafts are kept but not used.
    notes.push(
      "Strong column–weak beam (ACI 318-19 18.7.3.2: ΣMnc ≥ 6/5 ΣMnb) is not checked in this build — verify separately.",
    );
    if (puMin < (ag * fc) / 20000)
      notes.push(
        "At least one combination has Pu < Ag f′c/20: Vc = 0 within lo for that combination (18.7.6.2.1).",
      );
    notes.push(
      "Ve is not capped by beam Mpr (18.7.6.1.1 permits it); this is conservative. Override Ve if a beam-governed value is justified.",
    );
  }
  if (seismic && fullHeight)
    notes.push("Confinement extends over the full clear height.");
  if (t.tie.fyt > 420)
    notes.push("fyt is limited to 420 MPa for shear (Table 20.2.2.4a).");
  return {
    frame,
    seismic,
    clearHeight: lu,
    clearHeightsVe: { x: luVeX, y: luVeY },
    clearFromStorey: fromStorey,
    sections: { x: sx, y: sy },
    layout,
    sectionsMid: { x: sxM, y: syM },
    layoutMid,
    midSeparate,
    barDb,
    ve: { ...ve, basis, mprX, mprY },
    lo,
    loBasis,
    fullHeight,
    limits,
    ash,
    recommended,
    adopted,
    shear,
    biaxialShear,
    checks,
    notes,
  };
}

/**
 * Writes the adopted transverse design into the estimate as zones over the
 * estimate's own clear height (height − beam depth) and joint. Checked cut
 * lengths are cleared because the arrangement changes.
 */
export function adoptTieDesignToQuantity<
  Q extends {
    height: number;
    beamDepth: number;
    zones: {
      name: string;
      start: number;
      end: number;
      spacing: number;
      diameter: number;
      fy: number;
      hoops: number;
      legsX: number;
      legsY: number;
      crossXPositions?: number[];
      crossYPositions?: number[];
      hoopLength?: number | null;
      crossXLength?: number | null;
      crossYLength?: number | null;
    }[];
  },
>(quantity: Q, tie: ColumnTieDesignInput["tie"], design: TransverseResult): Q {
  const joint = quantity.height - quantity.beamDepth;
  const arrangement = (l: ConfinementLayout) => ({
    legsX: l.legsX,
    legsY: l.legsY,
    crossXPositions: l.crossX,
    crossYPositions: l.crossY,
  });
  const base = {
    diameter: tie.diameter,
    fy: tie.fyt,
    gradeId: tie.gradeId ?? null,
    hoops: 1,
    hoopLength: null,
    crossXLength: null,
    crossYLength: null,
  };
  const { lo, sEnd, sMid } = design.adopted;
  const confined = design.seismic && lo > 0;
  const full = confined && (design.fullHeight || 2 * lo >= joint);
  const zones = !confined
    ? [{ name: "Full height", start: 0, end: joint, spacing: sMid }]
    : full
      ? [{ name: "Confined full height", start: 0, end: joint, spacing: sEnd }]
      : [
          { name: "Lower lo zone", start: 0, end: lo, spacing: sEnd },
          { name: "Middle zone", start: lo, end: joint - lo, spacing: sMid },
          {
            name: "Upper lo zone",
            start: joint - lo,
            end: joint,
            spacing: sEnd,
          },
        ];
  if (quantity.beamDepth > 0)
    zones.push({
      name: "Beam-column joint",
      start: joint,
      end: quantity.height,
      spacing: confined ? sEnd : sMid,
    });
  // Middle zone takes the arrangement outside lo; lo zones and the joint
  // (18.7.5.1 continues lo reinforcement through it) take the lo layout.
  return {
    ...quantity,
    zones: zones.map((z) => ({
      ...z,
      ...base,
      ...arrangement(
        z.name === "Middle zone" || !confined
          ? (design.layoutMid ?? design.layout)
          : design.layout,
      ),
    })),
  } as Q;
}
