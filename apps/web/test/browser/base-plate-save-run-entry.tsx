import { createRoot } from "react-dom/client";
import { BasePlateWorkspace } from "../../src/components/base-plate-workspace";
const w = window as unknown as { dirty: boolean[] };
w.dirty = [];
createRoot(document.getElementById("root")!).render(
  <BasePlateWorkspace
    cloudReady={false}
    onSaved={() => {}}
    onDirtyChange={(d) => w.dirty.push(d)}
  />,
);
