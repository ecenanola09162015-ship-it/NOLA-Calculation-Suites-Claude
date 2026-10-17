import { createRoot } from "react-dom/client";
import { RetainingWallWorkspace } from "../../src/components/retaining-wall-workspace";
const w = window as unknown as { dirty: boolean[] };
w.dirty = [];
createRoot(document.getElementById("root")!).render(
  <RetainingWallWorkspace
    cloudReady={false}
    onSaved={() => {}}
    onDirtyChange={(d) => w.dirty.push(d)}
  />,
);
