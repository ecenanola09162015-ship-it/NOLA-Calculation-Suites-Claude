import { createRoot } from "react-dom/client";
import {
  analyzeRectangularColumn,
  defaultDesignCheckPolicy,
  type RectangularColumnInput,
} from "@nola/calc-core";
import { ColumnInteraction3D } from "../../src/components/column-interaction-3d";

const input: RectangularColumnInput = {
  code: "ACI 318-19",
  width: 600,
  depth: 800,
  fc: 28,
  fy: 420,
  es: 200000,
  cover: 40,
  tieDiameter: 10,
  bars: [-245, -82, 82, 245].flatMap((x) =>
    [-345, 345].map((y) => ({ x, y, diameter: 25 })),
  ),
  loads: [
    { id: "LC1", description: "", pu: 2400, mx: 150, my: 80, included: true },
    { id: "LC2", description: "", pu: 3200, mx: 600, my: 300, included: true },
    { id: "LC3", description: "", pu: 800, mx: -350, my: 200, included: true },
  ],
};
const result = analyzeRectangularColumn(input);
createRoot(document.getElementById("root")!).render(
  <ColumnInteraction3D
    input={input}
    result={result}
    policy={defaultDesignCheckPolicy}
  />,
);
