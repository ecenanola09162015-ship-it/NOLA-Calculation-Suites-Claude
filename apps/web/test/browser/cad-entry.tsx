import { createRoot } from "react-dom/client";
import { designColumnTransverse } from "@nola/calc-core";
import { ColumnSectionDrawingButton } from "../../src/components/column-section-drawing-button";
import { input, tie } from "./cad-fixture";
createRoot(document.getElementById("root")!).render(
  <ColumnSectionDrawingButton
    input={input}
    tie={tie}
    design={designColumnTransverse(input, tie)}
    hookBasis="aci135"
    title="C-01A"
    projectName="Ayala Tower"
  />,
);
