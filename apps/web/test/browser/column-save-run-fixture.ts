import type { RectangularColumnInput } from "@nola/calc-core";

/** 600 × 600, 8-D25, one combination (same as report-unsaved.test.tsx). */
export const columnSaveRunFixture: RectangularColumnInput = {
  code: "ACI 318-19",
  width: 600,
  depth: 600,
  fc: 34.5,
  fy: 420,
  es: 200000,
  cover: 40,
  tieDiameter: 12,
  bars: [-245, -82, 82, 245].flatMap((x) =>
    [-245, 245].map((y) => ({ x, y, diameter: 25 })),
  ),
  loads: [
    {
      id: "U1",
      description: "",
      pu: 2000,
      mx: 150,
      my: 80,
      vx: 300,
      vy: 300,
      included: true,
    },
  ],
};
