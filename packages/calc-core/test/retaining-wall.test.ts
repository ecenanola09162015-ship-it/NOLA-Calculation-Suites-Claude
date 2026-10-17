/**
 * Retaining wall (rwall-0.1.0) hand-calculation benchmarks. Values are the
 * corrected figures from the audit of the user's workbook
 * (20260803_ACI_Retaining_Wall_DESIGN_MGDUETTO-RW1_00.xlsx) and closed-form
 * beam / earth-pressure solutions.
 */
import { describe, expect, it } from "vitest";

import {
  atRestK0,
  bearingPressure,
  coulombKa,
  defaultRetainingWallInput,
  designRetainingWall,
  mononobeOkabeKae,
  rankineKa,
  rankineKp,
  retainingWallCheckSections,
  retainingWallDesignChecks,
  retainingWallDraftSchema,
  retainingWallInputSchema,
  solveStem,
  retainingWallCombinationPreset,
  type RetainingWallInput,
} from "../src";

const close = (a: number, b: number, rel = 1e-3) =>
  expect(Math.abs(a - b)).toBeLessThanOrEqual(Math.abs(b) * rel + 1e-9);
const wall = (patch: (i: RetainingWallInput) => void) => {
  const i = defaultRetainingWallInput();
  patch(i);
  return retainingWallInputSchema.parse(i);
};

describe("earth pressure coefficients (Das Ch. 12)", () => {
  it("Rankine Ka and Kp", () => {
    close(rankineKa(30), 1 / 3, 1e-9);
    close(rankineKp(30), 3, 1e-9);
    // Sloping backfill β = 15°: cosβ(cosβ − √(cos²β − cos²φ))/(cosβ + √…) = 0.3730.
    close(rankineKa(30, 15), 0.37295, 1e-4);
  });
  it("Coulomb reduces to Rankine with δ = β = 0", () => {
    close(coulombKa(30, 0, 0), 1 / 3, 1e-9);
    expect(coulombKa(30, 20, 0)).toBeLessThan(1 / 3);
  });
  it("Mononobe-Okabe: kh = 0 equals Coulomb; φ 30°, kh 0.2 → 0.473", () => {
    close(mononobeOkabeKae(30, 20, 0, 0, 0), coulombKa(30, 20, 0), 1e-9);
    close(mononobeOkabeKae(30, 0, 0, 0.2, 0), 0.4733, 1e-3);
    expect(Number.isNaN(mononobeOkabeKae(30, 0, 25, 0.3, 0))).toBe(true);
  });
  it("Jaky K0 with OCR (Mayne & Kulhawy)", () => {
    close(atRestK0(30), 0.5, 1e-9);
    close(atRestK0(30, 4), 0.5 * 4 ** 0.5, 1e-9);
  });
});

describe("stem 1D solver closed forms", () => {
  const H = 3.2,
    w = 28.8,
    P = (w * H) / 2;
  const tri = { p: (y: number) => (w * (H - y)) / H, breaks: [] };
  const ei = () => 1e5;
  it("cantilever M = PH/3", () => {
    const s = solveStem(H, ei, { base: "fixed", top: "none", prop: null }, tri);
    close(s.baseMoment, (P * H) / 3, 1e-9);
    close(s.baseShear, P, 1e-9);
  });
  it("propped (rigid top): R = P/5, M = 2PH/15", () => {
    const s = solveStem(H, ei, { base: "fixed", top: "none", prop: { y: H, stiffness: null } }, tri);
    close(s.prop!, P / 5, 1e-6);
    close(s.baseMoment, (2 * P * H) / 15, 1e-6);
  });
  it("fixed–fixed: R = 3P/10 and 7P/10, M = PH/15 and PH/10, span −0.0214wH²", () => {
    const s = solveStem(H, ei, { base: "fixed", top: "fixed", prop: null }, tri);
    close(s.topForce!, (3 * P) / 10, 1e-6);
    close(s.baseShear, (7 * P) / 10, 1e-6);
    close(s.topMoment!, (P * H) / 15, 1e-6);
    close(s.baseMoment, (P * H) / 10, 1e-6);
    let span = 0;
    for (let k = 0; k <= 2000; k++) span = Math.min(span, s.moment((H * k) / 2000));
    close(span, -0.021439 * w * H * H, 1e-3);
  });
  it("pinned–pinned uniform: zero end moment, wL²/8 span", () => {
    const s = solveStem(H, ei, { base: "pinned", top: "pinned", prop: null }, { p: () => 10, breaks: [] });
    expect(Math.abs(s.baseMoment)).toBeLessThan(1e-6);
    close(s.moment(H / 2), -(10 * H * H) / 8, 1e-6);
  });
  it("spring prop tends to the rigid prop", () => {
    const rigid = solveStem(H, ei, { base: "fixed", top: "none", prop: { y: H, stiffness: null } }, tri);
    const stiff = solveStem(H, ei, { base: "fixed", top: "none", prop: { y: H, stiffness: 1e9 } }, tri);
    close(stiff.prop!, rigid.prop!, 1e-4);
    const soft = solveStem(H, ei, { base: "fixed", top: "none", prop: { y: H, stiffness: 1 } }, tri);
    expect(soft.prop!).toBeLessThan(0.01 * rigid.prop!);
  });
});

describe("RW-01 cantilever (audit A3–A5, corrected)", () => {
  const r = designRetainingWall(defaultRetainingWallInput());
  const s1 = r.stability!.find((s) => s.id.startsWith("S1"))!;
  it("active thrust acts on H + tf = 4.1 m: Pa = 50.43 kN/m", () => {
    close(r.lateral.find((l) => l.id === "soil")!.force, 0.5 * (1 / 3) * 18 * 4.1 ** 2, 1e-6);
  });
  it("vertical loads match the workbook (151.56 kN/m) and FS values", () => {
    close(s1.vertical, 151.56, 1e-6);
    close(s1.fsSliding, (0.5 * 151.56) / 50.43, 1e-4); // 1.503 without passive
    close(s1.fsOverturning, 3.6814, 1e-3);
  });
  it("toe pressure 72.4 kPa exceeds qa = 70 kPa (workbook showed PASS)", () => {
    close(s1.bearing.qToe, 72.43, 1e-3);
    close(s1.bearing.e, 0.1306, 2e-3);
    const bp = r.checks.find((c) => c.id === `bp:${s1.id}`)!;
    expect(bp.dcr!).toBeGreaterThan(1);
  });
  it("stem: Ms = 54.87, Mu = 1.6 × 54.87, Vu = 1.6 × 43.32 (gross active)", () => {
    const st = r.stem.stations[0]!;
    close(st.mService, 54.872, 1e-4);
    close(st.mBack, 1.6 * 54.872, 1e-4);
    close(st.v, 1.6 * 43.32, 1e-4);
  });
  it("minimum steel with fy = 280: horizontals 2 × 377 ≥ 0.0025 × 300 000 = 750", () => {
    const c = r.checks.find((c) => c.id === "min:stem-horizontal")!;
    close(c.demand, 750, 1e-9);
    expect(c.dcr!).toBeLessThanOrEqual(1);
    const bad = designRetainingWall(wall((i) => (i.bars.stemHorizontal = { diameter: 12, spacing: 200 })));
    // Workbook RW-01: Ø12@200 placed as one layer → 565 mm²/m < 750.
    const one = bad.checks.find((c) => c.id === "min:stem-horizontal")!;
    close(one.capacity, 2 * ((Math.PI * 144) / 4) * 5, 1e-9);
  });
  it("passive and live surcharge rules", () => {
    const withPassive = designRetainingWall(wall((i) => {
      i.toeSoil.passive = true;
      i.toeSoil.mobilization = 1;
    }));
    // Kp 3 over Hf + tf = 0.8 m: 0.5 × 3 × 18 × 0.64 = 17.28 kN/m.
    close(withPassive.passive.force, 17.28, 1e-6);
    const live = designRetainingWall(wall((i) => (i.surcharge.live = 10)));
    const dead = designRetainingWall(wall((i) => (i.surcharge.dead = 10)));
    const fsL = live.stability!.find((s) => s.id.startsWith("S1"))!.fsOverturning;
    const fsD = dead.stability!.find((s) => s.id.startsWith("S1"))!.fsOverturning;
    expect(fsL).toBeLessThan(fsD); // live surcharge is never stabilising
  });
  it("review rows carry clauses and group into sections", () => {
    const rows = retainingWallDesignChecks(r);
    expect(rows.every((c) => c.clause.length > 0)).toBe(true);
    expect(retainingWallCheckSections(r).map((s) => s.title)).toEqual([
      "Stability",
      "Stem",
      "Footing",
      "Detailing",
    ]);
  });
});

describe("RW-X propped cantilever (audit A1, corrected)", () => {
  // Prismatic 0.35 m stem so the closed form applies; q = 10 kPa taken as H.
  const i = wall((i) => {
    i.wallType = "propped";
    i.height = 4;
    i.stemTop = 0.35;
    i.stemBase = 0.35;
    i.toe = 1;
    i.heel = 2.2;
    i.footing = 0.5;
    i.surcharge.dead = 10;
    i.prop = { height: 4, rigid: true, stiffness: 1 };
    i.fc = 28;
    i.fy = 420;
    i.bars.stemBack = { diameter: 20, spacing: 150 };
    i.bars.stemFront = { diameter: 16, spacing: 200 };
  });
  const r = designRetainingWall(i);
  it("prop reaction Psoil/5 + 3Pq/8 = 14.60 kN/m (service)", () => {
    close(r.stem.serviceReactions.prop!, 14.6, 1e-5);
  });
  it("stem base Mu = 1.6 × 32.27 = 51.63 kN·m/m (workbook envelope gave 25.17)", () => {
    close(r.stem.stations[0]!.mBack, 1.6 * 32.2667, 1e-4);
  });
  it("span moment, front face: 15.09 kN·m/m service at 2.28 m", () => {
    const st = r.stem.stations.reduce((b, s) => (s.mService < b.mService ? s : b));
    close(st.mService, -15.093, 3e-3);
    close(st.y, 2.28, 0.05);
    expect(r.flexure.some((f) => f.id === "stem-front")).toBe(true);
  });
});

describe("BW-01 basement wall (audit A2, corrected)", () => {
  const base = (top: "fixed" | "pinned") =>
    designRetainingWall(wall((i) => {
      i.wallType = "basement";
      i.height = 3.2;
      i.stemTop = 0.2;
      i.stemBase = 0.2;
      i.footing = 0.1;
      i.soil.theory = "at-rest";
      i.surcharge.dead = 5;
      i.basement = { top, base: "fixed", levels: [], stage: false };
      i.service = [{ id: "S", d: 1, h: 1, l: 1, e: 0, w: 0, included: true }];
    }));
  it("fixed–fixed reactions 17.82 + 36.26 = 54.08 kN/m (workbook 10.91 + 20.13)", () => {
    const r = base("fixed");
    close(r.stem.serviceReactions.top!, 17.824, 1e-4);
    const st0 = r.stem.stations[0]!;
    close(st0.mService, 16.879, 1e-4);
    expect(r.stability).toBeNull();
  });
  it("span +M = 7.36 kN·m/m at 1.73 m below the top (workbook 0)", () => {
    const r = base("fixed");
    const st = r.stem.stations.reduce((b, s) => (s.mService < b.mService ? s : b));
    close(-st.mService, 7.364, 5e-3);
  });
  it("pinned top raises the base moment to 22.86 kN·m/m", () => {
    close(base("pinned").stem.stations[0]!.mService, 22.861, 1e-4);
  });
});

describe("bearing pressure with e > B/6 (Das Ch. 13)", () => {
  it("trapezoid inside the kern, triangle q = 2V/3a outside", () => {
    const t = bearingPressure(3, 300, 300 * 1.5);
    close(t.qToe, 100, 1e-9);
    expect(t.shape).toBe("trapezoid");
    const tri = bearingPressure(3, 300, 300 * 0.8); // xr = 0.8 m < B/3
    expect(tri.shape).toBe("triangle");
    close(tri.qMax, (2 * 300) / (3 * 0.8), 1e-9);
    close(tri.contact, 2.4, 1e-9);
    expect(bearingPressure(3, 300, -10).shape).toBe("unstable");
  });
});

describe("water and seismic", () => {
  it("full water behind adds γw h²/2 and uplift", () => {
    const r = designRetainingWall(wall((i) => {
      i.water = { enabled: true, back: 2, front: 0, gammaW: 9.81 };
    }));
    close(r.lateral.find((l) => l.id === "water")!.force, (9.81 * 4) / 2, 1e-6);
    close(r.uplift.force, (9.81 * 2 * 2.7) / 2, 1e-6);
  });
  it("Mononobe-Okabe increment acts at 0.6H with inertia added", () => {
    const r = designRetainingWall(wall((i) => {
      i.seismic = { method: "mononobe-okabe", kh: 0.2, kv: 0, inertia: true };
      Object.assign(i, (({ strength, service }) => ({ strength, service }))(
        // seismic presets
        { strength: [...i.strength, { id: "E", d: 0.9, h: 1.6, l: 0, e: 1, w: 0, included: true }], service: [...i.service, { id: "SE", d: 1, h: 1, l: 0, e: 0.7, w: 0, included: true }] },
      ));
    }));
    const dp = r.lateral.find((l) => l.id === "seismic")!;
    close(dp.arm, 0.6 * 4.1, 1e-6);
    close(dp.force, (0.4733 - 1 / 3) * 0.5 * 18 * 4.1 ** 2, 2e-3);
    expect(r.lateral.some((l) => l.id.startsWith("inertia"))).toBe(true);
    expect(r.stability!.find((s) => s.id === "SE")!.seismic).toBe(true);
  });
});

describe("schema", () => {
  it("default input and a draft parse", () => {
    const input = defaultRetainingWallInput();
    expect(retainingWallInputSchema.safeParse(input).success).toBe(true);
    expect(retainingWallDraftSchema.safeParse({ kind: "retaining-wall", version: 1, input }).success).toBe(true);
  });
  it("rejects a prop above the stem and a thinner base than top", () => {
    const i = defaultRetainingWallInput();
    i.wallType = "propped";
    i.prop.height = 9;
    expect(retainingWallInputSchema.safeParse(i).success).toBe(false);
    const j = defaultRetainingWallInput();
    j.stemBase = 0.2;
    expect(retainingWallInputSchema.safeParse(j).success).toBe(false);
  });
});

describe("virtual plane pressure", () => {
  it("plane soil pressure at the base = Ka γ (H + tf)", () => {
    const r = designRetainingWall(defaultRetainingWallInput());
    close(r.plane.pressure("soil", 0), (1 / 3) * 18 * 4.1, 1e-9);
    close(r.plane.pressure("soil", 4.1), 0, 1e-9);
  });
});

import { estimateRetainingWallQuantity } from "../src";
describe("quantity estimate (Phase 1b)", () => {
  it("RW-01 over 10 m: concrete, formwork and bar weights by hand", () => {
    const i = defaultRetainingWallInput();
    const q = estimateRetainingWallQuantity(i, { enabled: true, length: 10, endForms: true });
    // Stem 0.30 × 3.8 = 1.14 m², footing 2.7 × 0.3 = 0.81 m² → 19.5 m³.
    close(q.concrete.total, (1.14 + 0.81) * 10, 1e-9);
    close(q.formwork.stemFront, 38, 1e-9);
    close(q.formwork.total, 38 + 38 + 6 + 2 * 1.95, 1e-9);
    // Back bars D16 @ 100 over 9.9 m: 100 bars.
    const back = q.bars.find((b) => b.mark === 1)!;
    expect(back.count).toBe(100);
    // length = H − 0.05 + (tf − 0.075 − 0.016 − 0.012) + 12 db = 3.75 + 0.197 + 0.192
    close(back.length, 3.75 + 0.197 + 0.192, 1e-9);
    close(back.weight, 100 * ((Math.PI * 256) / 4) * back.length * 0.00785, 1e-9);
    expect(q.ratio).toBeGreaterThan(40);
    expect(q.ratio).toBeLessThan(200);
  });
});

import { coulombKp, stripPressure, keyOffset, integrate as integ } from "../src";
describe("new loads and geometry (UI polish batch)", () => {
  it("strip surcharge resultant matches Jarquio P = q/90·H(θ2 − θ1)", () => {
    const q = 20, a = 1, b = 2, H = 4;
    const P = integ((z) => stripPressure(q, a, b, z), 0, H, [], 64);
    const deg = (x: number) => (x * 180) / Math.PI;
    close(P, (q / 90) * H * (deg(Math.atan((a + b) / H)) - deg(Math.atan(a / H))), 2e-3);
  });
  it("strip on the stem adds a lateral component; part over the heel is vertical", () => {
    const r = designRetainingWall(wall((i) => (i.strip = { enabled: true, q: 20, distance: 1, width: 1, kind: "dead" })));
    expect(r.stem.components.some((c) => c.id === "strip" && c.force > 0)).toBe(true);
    // Heel run 1.4 m: strip 1.0–2.0 m → 0.4 m over the heel, 0.6 m beyond the plane.
    close(r.weights.find((w) => w.id === "stripV")!.weight, 20 * 0.4, 1e-9);
    expect(r.lateral.some((l) => l.id === "strip")).toBe(true);
  });
  it("eccentric stem-top load: base moment = P·e on a prismatic cantilever", () => {
    const base = designRetainingWall(defaultRetainingWallInput());
    const r = designRetainingWall(wall((i) => {
      i.axial = { enabled: true, dead: 50, live: 0, eccentricity: 0.1 };
      i.service = [{ id: "S", d: 1, h: 0, l: 0, e: 0, w: 0, included: true }];
    }));
    close(r.stem.stations[0]!.mService, 50 * 0.1, 1e-6);
    expect(r.weights.find((w) => w.id === "axialD")!.weight).toBe(50);
    expect(base.weights.some((w) => w.id === "axialD")).toBe(false);
  });
  it("wind on the exposed stem: Mbase = w h (H − h/2) and W combinations", () => {
    const i = wall((i) => {
      i.wind = { enabled: true, pressure: 1.5, height: 1 };
      Object.assign(i, retainingWallCombinationPreset("NSCP 2015", false, true));
      i.service = [{ id: "W", d: 1, h: 0, l: 0, e: 0, w: 1, included: true }];
    });
    const r = designRetainingWall(i);
    close(r.stem.stations[0]!.mService, 1.5 * 1 * (3.8 - 0.5), 1e-6);
    expect(i.strength.some((c) => c.w === 1)).toBe(true);
  });
  it("toe slope lowers Kp (Coulomb δ = 0), equals Rankine on level ground", () => {
    close(coulombKp(30, 0), 3, 1e-9);
    expect(coulombKp(30, -15)).toBeLessThan(3);
    const r = designRetainingWall(wall((i) => (i.toeSoil.slope = 15)));
    expect(r.coefficients.kp).toBeLessThan(3);
    expect(r.geometry.toeEdgeCover).toBeLessThan(0.5);
  });
  it("shear key positions and key design by hand", () => {
    const i = defaultRetainingWallInput();
    i.key = { ...i.key, enabled: true, position: "stem", width: 0.3, depth: 0.4 };
    close(keyOffset(i), 1.0, 1e-9);
    close(keyOffset({ ...i, key: { ...i.key, position: "heel" } }), 2.4, 1e-9);
    i.toeSoil.passive = true;
    i.toeSoil.mobilization = 1;
    const r = designRetainingWall(retainingWallInputSchema.parse(i));
    // d1 = 0.5 + 0.3 = 0.8, d2 = 1.2; k = 3 × 18 = 54 → P = 27(1.44 − 0.64) = 21.6 kN/m.
    const k = r.flexure.find((f) => f.id === "key")!;
    const m = 54 * ((1.2 ** 3 - 0.8 ** 3) / 3 - (0.8 * (1.44 - 0.64)) / 2);
    close(k.mu, 1.6 * m, 1e-9);
    close(r.shear.find((v) => v.id === "key-shear")!.vu, 1.6 * 21.6, 1e-9);
    close(r.passive.depth, 1.2, 1e-9);
  });
});
