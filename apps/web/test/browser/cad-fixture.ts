import {
  defaultColumnTieDesign,
  type ColumnTieDesignInput,
  type RectangularColumnInput,
} from "@nola/calc-core";

// 400 × 700 (b × h), 12-Ø20 (4 per long face … as in the C-01A sheet), cover 40, Ø16 ties.
const xs = [-140, -46.67, 46.67, 140];
const ys = [-290, -96.67, 96.67, 290];
const bars = [
  ...xs.flatMap((x) => [-290, 290].map((y) => ({ x, y, diameter: 20 }))),
  ...[-96.67, 96.67].flatMap((y) => [-140, 140].map((x) => ({ x, y, diameter: 20 }))),
];
export const input: RectangularColumnInput = {
  code: "ACI 318-19",
  width: 400,
  depth: 700,
  fc: 28,
  fy: 420,
  es: 200000,
  cover: 40,
  tieDiameter: 16,
  bars,
  loads: [{ id: "U1", description: "", pu: 1500, mx: 200, my: 80, vx: 400, vy: 400, included: true }],
};
const base = defaultColumnTieDesign(input, 2500);
export const tie: ColumnTieDesignInput = {
  ...base,
  shear: { enabled: true },
  confinement: { ...base.confinement, enabled: true, frame: "SMF" },
  tie: { ...base.tie, diameter: 16, fyt: 420, interiorX: 2, interiorY: 1, midInteriorX: 0, midInteriorY: 0 },
};
