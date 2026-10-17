import { describe, expect, it } from "vitest";
import {
  FrameInstabilityError,
  solveFrame,
  type FrameModel,
} from "../src/modules/stair-frame";

/** Straight member split into n elements from (0,0) to (lx, ly). */
function line(
  lx: number,
  ly: number,
  n: number,
  q: number,
  ei = 1e4,
  ea = 1e7,
) {
  const nodes = Array.from({ length: n + 1 }, (_, k) => ({
    x: (lx * k) / n,
    y: (ly * k) / n,
  }));
  const members = Array.from({ length: n }, (_, k) => ({
    i: k,
    j: k + 1,
    ei,
    ea,
    q,
  }));
  return { nodes, members };
}
const maxSag = (r: ReturnType<typeof solveFrame>[number]) =>
  Math.max(...r.members.flatMap((m) => [m.start.m, m.mid, m.end.m]));
const minHog = (r: ReturnType<typeof solveFrame>[number]) =>
  Math.min(...r.members.flatMap((m) => [m.start.m, m.mid, m.end.m]));

describe("stair frame solver (B1–B4 closed forms)", () => {
  it("B1 simply supported horizontal beam: wL²/8, wL/2, 5wL⁴/384EI", () => {
    const L = 3,
      w = 10,
      ei = 2e4;
    const g = line(L, 0, 10, w, ei);
    const [r] = solveFrame({
      ...g,
      restraints: [
        { node: 0, ux: true, uy: true, rz: false },
        { node: 10, ux: false, uy: true, rz: false },
      ],
    });
    expect(maxSag(r)).toBeCloseTo((w * L * L) / 8, 6);
    expect(r.reactions[0].ry).toBeCloseTo((w * L) / 2, 6);
    expect(-r.displacements[5].uy).toBeCloseTo(
      (5 * w * L ** 4) / (384 * ei),
      6,
    );
  });

  it("B1 inclined pinned–sliding flight: M = wLh²/8 on plan, V at end = R·cosθ", () => {
    const Lh = 2.625,
      H = Lh * (175 / 275),
      w = 16.84;
    const theta = Math.atan2(H, Lh);
    const g = line(Lh, H, 20, w);
    const [r] = solveFrame({
      ...g,
      restraints: [
        { node: 0, ux: true, uy: true, rz: false },
        { node: 20, ux: false, uy: true, rz: false },
      ],
    });
    expect(maxSag(r)).toBeCloseTo((w * Lh * Lh) / 8, 6);
    expect(r.reactions[0].ry).toBeCloseTo((w * Lh) / 2, 6);
    expect(r.reactions[0].rx).toBeCloseTo(0, 9);
    // shear normal to the member at the lower end; axial = −R·sinθ (compression)
    expect(r.members[0].start.v).toBeCloseTo(
      ((w * Lh) / 2) * Math.cos(theta),
      6,
    );
    expect(r.members[0].start.n).toBeCloseTo(
      -((w * Lh) / 2) * Math.sin(theta),
      6,
    );
  });

  it("B2 fixed–fixed: ends −wL²/12, midspan +wL²/24", () => {
    const L = 4,
      w = 12;
    const g = line(L, 0, 8, w);
    const [r] = solveFrame({
      ...g,
      restraints: [
        { node: 0, ux: true, uy: true, rz: true },
        { node: 8, ux: true, uy: true, rz: true },
      ],
    });
    expect(minHog(r)).toBeCloseTo((-w * L * L) / 12, 6);
    expect(r.members[3].end.m).toBeCloseTo((w * L * L) / 24, 6);
    expect(r.reactions[0].mz).toBeCloseTo((w * L * L) / 12, 6);
  });

  it("B3 landing + flight, pinned–sliding, unequal loads: statics", () => {
    // landing 1.2 m horizontal (w1), flight 2.4 m plan rising 1.5 m (w2)
    const w1 = 8,
      w2 = 12,
      a = 1.2,
      b = 2.4;
    const nodes = [
      ...Array.from({ length: 7 }, (_, k) => ({ x: (a * k) / 6, y: 0 })),
      ...Array.from({ length: 12 }, (_, k) => ({
        x: a + (b * (k + 1)) / 12,
        y: (1.5 * (k + 1)) / 12,
      })),
    ];
    const members = nodes.slice(1).map((_, k) => ({
      i: k,
      j: k + 1,
      ei: 1e4,
      ea: 1e7,
      q: k < 6 ? w1 : w2,
    }));
    const [r] = solveFrame({
      nodes,
      members,
      restraints: [
        { node: 0, ux: true, uy: true, rz: false },
        { node: 18, ux: false, uy: true, rz: false },
      ],
    });
    const L = a + b,
      W1 = w1 * a,
      W2 = w2 * b;
    const RB = (W1 * (a / 2) + W2 * (a + b / 2)) / L,
      RA = W1 + W2 - RB;
    expect(r.reactions[0].ry).toBeCloseTo(RA, 6);
    expect(r.reactions[1].ry).toBeCloseTo(RB, 6);
    // V = 0 within the flight: RA − W1 − w2(x − a) = 0
    const x0 = a + (RA - W1) / w2;
    const mMax = RA * x0 - W1 * (x0 - a / 2) - (w2 * (x0 - a) ** 2) / 2;
    expect(maxSag(r)).toBeLessThanOrEqual(mMax + 1e-6);
    expect(maxSag(r)).toBeGreaterThan(mMax * 0.995);
  });

  it("B3b published example (stair with quarter-space landing, IS 456 worked example): reactions and Mmax", () => {
    // Landing B 1.5 m at w = 7.401 kN/m (half load), flight 3.0 m plan rising
    // 1.5 m at w = 14.801 kN/m, span 4.5 m simply supported. Published:
    // Rb = 24,052 N, Rc = 31,452 N, V = 0 at 2.125 m from C, Mmax = 33,417,883 N·mm.
    const wB = 7.401,
      wF = 14.801,
      a = 1.5,
      b = 3.0;
    const nodes = [
      ...Array.from({ length: 16 }, (_, k) => ({ x: (a * k) / 15, y: 0 })),
      ...Array.from({ length: 24 }, (_, k) => ({
        x: a + (b * (k + 1)) / 24,
        y: (1.5 * (k + 1)) / 24,
      })),
    ];
    const members = nodes.slice(1).map((_, k) => ({
      i: k,
      j: k + 1,
      ei: 1e4,
      ea: 1e7,
      q: k < 15 ? wB : wF,
    }));
    const [r] = solveFrame({
      nodes,
      members,
      restraints: [
        { node: 0, ux: true, uy: true, rz: false },
        { node: nodes.length - 1, ux: false, uy: true, rz: false },
      ],
    });
    expect(r.reactions[0].ry).toBeCloseTo(24.052, 2);
    expect(r.reactions[1].ry).toBeCloseTo(31.452, 2);
    // 2.125 m from C is the node at x = 2.375 m (1.5 + 7 × 0.125)
    expect(maxSag(r)).toBeCloseTo(33.418, 2);
  });

  it("B4 cantilever: −wa²/2 at the support", () => {
    const g = line(1.5, 0, 6, 9);
    const [r] = solveFrame({
      ...g,
      restraints: [{ node: 0, ux: true, uy: true, rz: true }],
    });
    expect(r.members[0].start.m).toBeCloseTo((-9 * 1.5 ** 2) / 2, 6);
  });

  it("point load P at x on a pinned span: P·x(L−x)/L", () => {
    const g = line(3, 0, 6, 0);
    const [r] = solveFrame({
      ...g,
      restraints: [
        { node: 0, ux: true, uy: true, rz: false },
        { node: 6, ux: false, uy: true, rz: false },
      ],
      nodalLoads: [{ node: 2, fy: 20 }],
    });
    expect(r.members[1].end.m).toBeCloseTo((20 * 1 * 2) / 3, 6);
    expect(r.reactions[0].ry).toBeCloseTo((20 * 2) / 3, 6);
  });

  it("rejects an unstable layout", () => {
    const g = line(3, 0, 3, 5);
    const model: FrameModel = {
      ...g,
      restraints: [
        { node: 0, ux: false, uy: true, rz: false },
        { node: 3, ux: false, uy: true, rz: false },
      ],
    };
    expect(() => solveFrame(model)).toThrow(FrameInstabilityError);
  });
});
