import { createRoot } from "react-dom/client";
import { RectangularColumnWorkspace } from "../../src/components/rectangular-column-workspace";
const w = window as unknown as { dirty: boolean[] };
w.dirty = [];
createRoot(document.getElementById("root")!).render(
  <RectangularColumnWorkspace
    cloudReady={false}
    onSaved={() => {}}
    onDirtyChange={(d) => w.dirty.push(d)}
  />,
);
