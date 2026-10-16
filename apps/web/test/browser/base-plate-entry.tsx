import { createRoot } from "react-dom/client";
import { BasePlateWorkspace } from "../../src/components/base-plate-workspace";

createRoot(document.getElementById("root")!).render(
  <BasePlateWorkspace cloudReady={false} onSaved={() => {}} />,
);
