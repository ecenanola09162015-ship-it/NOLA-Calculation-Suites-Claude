import { createRoot } from "react-dom/client";
import { defaultRetainingWallInput, designRetainingWall } from "@nola/calc-core";
import RetainingWall3DView from "../../src/components/retaining-wall-3d-view";
import { retainingWallSectionSvg } from "../../src/lib/retaining-wall-drawing";

const input = defaultRetainingWallInput();
input.water = { enabled: true, back: 1.5, front: 0, gammaW: 9.81 };
input.surcharge.live = 10;
const result = designRetainingWall(input);
function App() {
  return (
    <div style={{ width: 1100, padding: 16 }}>
      <RetainingWall3DView input={input} result={result} onSnapshot={(png) => ((window as unknown as { snap: string }).snap = png)} />
      <div id="section" dangerouslySetInnerHTML={{ __html: retainingWallSectionSvg(input, result) }} />
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
