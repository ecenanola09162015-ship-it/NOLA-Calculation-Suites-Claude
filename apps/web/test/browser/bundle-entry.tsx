import { createRoot } from "react-dom/client";
import { RectangularColumnWorkspace } from "../../src/components/rectangular-column-workspace";
createRoot(document.getElementById("root")!).render(
  <RectangularColumnWorkspace cloudReady={false} onSaved={() => {}} />,
);
