import { createRoot } from "react-dom/client";
import { SlabWorkspace } from "../../src/components/slab-workspace";

createRoot(document.getElementById("root")!).render(
  <SlabWorkspace cloudReady={false} onSaved={() => {}} />,
);
