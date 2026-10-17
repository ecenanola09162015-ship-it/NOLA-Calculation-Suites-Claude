/**
 * Pure geometry of the base-plate 3D view (metres; engineering axes x east,
 * y north, z up; z = 0 at the top of concrete). Display only.
 */
import {
  basePlateColumnDims,
  basePlateRods,
  basePlateStiffening,
  heavyHexAcrossFlats,
  isCastIn,
  type BasePlateInput,
  type ComboResult,
} from "@nola/calc-core";

export interface Box3 {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
}
export interface Rod3 {
  id: string;
  x: number;
  y: number;
  z0: number;
  z1: number;
  r: number;
  tension: number;
  head: "nut" | "hook" | "adhesive" | "expansion";
  hookDir: { x: number; y: number };
  hook: number;
}
export interface Arrow3 {
  label: string;
  tip: [number, number, number];
  dir: [number, number, number];
  length: number;
  color: string;
}
export interface Moment3 {
  label: string;
  axis: "x" | "y";
  sign: 1 | -1;
  centre: [number, number, number];
  radius: number;
}
export interface BasePlate3DModel {
  extent: number;
  pedestal: Box3;
  grout: Box3 | null;
  plate: Box3;
  holes: { x: number; y: number; r: number }[];
  /** Column outline (outer loop, optional inner loop for HSS), plan coords. */
  column: {
    outer: [number, number][];
    inner: [number, number][] | null;
    z0: number;
    z1: number;
  };
  washers: Box3[];
  nuts: { x: number; y: number; z0: number; z1: number; f: number }[];
  rods: Rod3[];
  lug: Box3[];
  /** Stiffener plates: profile (signed along u, height z) extruded by t. */
  stiffeners: {
    id: string;
    axis: "x" | "y";
    pos: number;
    t: number;
    profile: [number, number][];
  }[];
  cones: {
    x0: number;
    x1: number;
    y0: number;
    y1: number;
    z: number;
    hef: number;
    spread: number;
  }[];
  arrows: Arrow3[];
  moments: Moment3[];
}
const mm = (v: number) => v / 1000;

export function columnOutline(i: BasePlateInput) {
  const c = i.column;
  const rot = i.rotation === 90;
  const sw = (pts: [number, number][]) =>
    rot ? pts.map(([x, y]) => [y, x] as [number, number]) : pts;
  if (c.family === "HSS-ROUND") {
    const n = 40,
      circle = (r: number) =>
        Array.from(
          { length: n },
          (_, k) =>
            [
              mm(r * Math.cos((2 * Math.PI * k) / n)),
              mm(r * Math.sin((2 * Math.PI * k) / n)),
            ] as [number, number],
        );
    return { outer: circle(c.d / 2), inner: circle(c.d / 2 - c.tf) };
  }
  if (c.family === "HSS-RECT") {
    const dims = basePlateColumnDims(i);
    const rect = (w: number, h: number): [number, number][] => [
      [mm(-w / 2), mm(-h / 2)],
      [mm(w / 2), mm(-h / 2)],
      [mm(w / 2), mm(h / 2)],
      [mm(-w / 2), mm(h / 2)],
    ];
    return {
      outer: rect(dims.x, dims.y),
      // Solid bar (t = B/2): no inner loop.
      inner:
        Math.min(dims.x, dims.y) - 2 * c.tf > 0.5
          ? rect(dims.x - 2 * c.tf, dims.y - 2 * c.tf)
          : null,
    };
  }
  // I-shape with flanges facing ±Y at 0° (12-point outline).
  const b = c.bf / 2,
    d = c.d / 2,
    t = c.tw / 2,
    f = c.tf;
  const pts: [number, number][] = [
    [-b, -d],
    [b, -d],
    [b, -d + f],
    [t, -d + f],
    [t, d - f],
    [b, d - f],
    [b, d],
    [-b, d],
    [-b, d - f],
    [-t, d - f],
    [-t, -d + f],
    [-b, -d + f],
  ];
  return {
    outer: sw(pts.map(([x, y]) => [mm(x), mm(y)] as [number, number])),
    inner: null,
  };
}

export function buildBasePlate3DModel(
  i: BasePlateInput,
  combo?: ComboResult | null,
): BasePlate3DModel {
  const a = i.anchors,
    p = i.pedestal,
    g = i.grout.thickness;
  const rods = basePlateRods(i);
  const show = Math.min(p.height, a.hef + 250);
  const zPlate0 = mm(g),
    zPlate1 = mm(g + i.plate.tp);
  const dims = basePlateColumnDims(i);
  const st = basePlateStiffening(i);
  const stub = Math.max(
    Math.min(Math.max(1.2 * Math.max(dims.x, dims.y), 350), 700),
    st ? i.stiffeners.hc + 120 : 0,
  );
  const F = heavyHexAcrossFlats(a.da);
  const nutH = 0.9 * a.da;
  const head: Rod3["head"] =
    a.kind === "cast-in-hooked-bolt"
      ? "hook"
      : isCastIn(a.kind)
        ? "nut"
        : a.kind === "adhesive"
          ? "adhesive"
          : "expansion";
  const lug: Box3[] = [];
  if (i.shear.method === "lug") {
    const l = i.shear.lug;
    const plate = (along: "x" | "y") =>
      along === "x"
        ? {
            x0: mm(-l.thickness / 2),
            x1: mm(l.thickness / 2),
            y0: mm(-l.width / 2),
            y1: mm(l.width / 2),
            z0: mm(-l.depth),
            z1: zPlate0,
          }
        : {
            x0: mm(-l.width / 2),
            x1: mm(l.width / 2),
            y0: mm(-l.thickness / 2),
            y1: mm(l.thickness / 2),
            z0: mm(-l.depth),
            z1: zPlate0,
          };
    // A lug resisting Vx bears on a face normal to X.
    if (l.orientation !== "y") lug.push(plate("x"));
    if (l.orientation !== "x") lug.push(plate("y"));
  }
  const tensioned = rods
    .map((r, k) => ({ r, t: combo?.rodTension[k] ?? 0 }))
    .filter((x) => x.t > 0);
  const cones = tensioned.length
    ? [
        {
          x0: mm(Math.min(...tensioned.map((x) => x.r.x))),
          x1: mm(Math.max(...tensioned.map((x) => x.r.x))),
          y0: mm(Math.min(...tensioned.map((x) => x.r.y))),
          y1: mm(Math.max(...tensioned.map((x) => x.r.y))),
          z: 0,
          hef: mm(combo?.anchor.breakout?.hefUsed ?? a.hef),
          spread: mm(1.5 * (combo?.anchor.breakout?.hefUsed ?? a.hef)),
        },
      ]
    : [];
  const ext = Math.max(p.px, p.py, show + stub) / 1000;
  const arrows: Arrow3[] = [];
  const moments: Moment3[] = [];
  if (combo) {
    const L = combo.load;
    const top = zPlate1 + mm(stub);
    const len = ext * 0.35;
    if (L.pu !== 0)
      arrows.push({
        label: `Pu ${L.pu.toFixed(1)} kN`,
        tip: L.pu > 0 ? [0, 0, top] : [0, 0, top + len],
        dir: L.pu > 0 ? [0, 0, -1] : [0, 0, 1],
        length: len,
        color: "#0b6bcb",
      });
    const zv = zPlate1 + mm(30);
    const ex = mm(i.plate.bx / 2),
      ey = mm(i.plate.by / 2);
    if (L.vx !== 0)
      arrows.push({
        label: `Vx ${L.vx.toFixed(1)} kN`,
        tip: [L.vx > 0 ? -ex : ex, 0, zv],
        dir: [Math.sign(L.vx), 0, 0],
        length: len * 0.6,
        color: "#0f766e",
      });
    if (L.vy !== 0)
      arrows.push({
        label: `Vy ${L.vy.toFixed(1)} kN`,
        tip: [0, L.vy > 0 ? -ey : ey, zv],
        dir: [0, Math.sign(L.vy), 0],
        length: len * 0.6,
        color: "#0f766e",
      });
    if (L.mx !== 0)
      moments.push({
        label: `Mx ${L.mx.toFixed(1)} kN·m`,
        axis: "x",
        sign: L.mx > 0 ? 1 : -1,
        centre: [0, 0, top - mm(stub) * 0.3],
        radius: ext * 0.18,
      });
    if (L.my !== 0)
      moments.push({
        label: `My ${L.my.toFixed(1)} kN·m`,
        axis: "y",
        sign: L.my > 0 ? 1 : -1,
        centre: [0, 0, top - mm(stub) * 0.55],
        radius: ext * 0.18,
      });
  }
  const outline = columnOutline(i);
  const stiffeners = (st?.plates ?? []).map((pl) => {
    const s = i.stiffeners;
    const u = (v: number) => mm(pl.side * v);
    const pts: [number, number][] = [
      [u(pl.root + s.clip), zPlate1],
      [u(pl.tip), zPlate1],
      [u(pl.tip), zPlate1 + mm(s.he)],
      [u(pl.root), zPlate1 + mm(s.hc)],
      [u(pl.root), zPlate1 + mm(s.clip)],
    ];
    return {
      id: pl.id,
      axis: pl.axis,
      pos: mm(pl.pos),
      t: mm(s.t),
      profile: pts.filter(
        (q, k) =>
          k === 0 ||
          Math.hypot(q[0] - pts[k - 1]![0], q[1] - pts[k - 1]![1]) > 1e-6,
      ),
    };
  });
  return {
    extent: ext,
    pedestal: {
      x0: mm(-p.px / 2),
      x1: mm(p.px / 2),
      y0: mm(-p.py / 2),
      y1: mm(p.py / 2),
      z0: -mm(show),
      z1: 0,
    },
    grout:
      g > 0
        ? {
            x0: mm(-i.plate.bx / 2 - 25),
            x1: mm(i.plate.bx / 2 + 25),
            y0: mm(-i.plate.by / 2 - 25),
            y1: mm(i.plate.by / 2 + 25),
            z0: 0,
            z1: zPlate0,
          }
        : null,
    plate: {
      x0: mm(-i.plate.bx / 2),
      x1: mm(i.plate.bx / 2),
      y0: mm(-i.plate.by / 2),
      y1: mm(i.plate.by / 2),
      z0: zPlate0,
      z1: zPlate1,
    },
    holes: rods.map((r) => ({ x: mm(r.x), y: mm(r.y), r: mm(a.hole / 2) })),
    column: { ...outline, z0: zPlate1, z1: zPlate1 + mm(stub) },
    washers: rods.map((r) => ({
      x0: mm(r.x - a.washer.size / 2),
      x1: mm(r.x + a.washer.size / 2),
      y0: mm(r.y - a.washer.size / 2),
      y1: mm(r.y + a.washer.size / 2),
      z0: zPlate1,
      z1: zPlate1 + mm(a.washer.thickness),
    })),
    nuts: rods.flatMap((r) => [
      {
        x: mm(r.x),
        y: mm(r.y),
        z0: zPlate1 + mm(a.washer.thickness),
        z1: zPlate1 + mm(a.washer.thickness + nutH),
        f: mm(F),
      },
      ...(head === "nut"
        ? [
            {
              x: mm(r.x),
              y: mm(r.y),
              z0: -mm(a.hef + nutH),
              z1: -mm(a.hef),
              f: mm(F),
            },
          ]
        : []),
    ]),
    rods: rods.map((r, k) => ({
      id: r.id,
      x: mm(r.x),
      y: mm(r.y),
      z0: -mm(a.hef + (head === "nut" ? nutH : 0)),
      z1: zPlate1 + mm(a.washer.thickness + nutH + 0.5 * a.da),
      r: mm(a.da / 2),
      tension: combo?.rodTension[k] ?? 0,
      head,
      hookDir: {
        x: r.x === 0 ? 0 : -Math.sign(r.x),
        y: r.x === 0 ? -Math.sign(r.y || 1) : 0,
      },
      hook: mm(a.eh),
    })),
    lug,
    stiffeners,
    cones,
    arrows,
    moments,
  };
}
