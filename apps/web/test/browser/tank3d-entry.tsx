import { createRoot } from "react-dom/client";
import { defaultTankInput, designTank } from "@nola/calc-core";
import Tank3DView from "../../src/components/tank-3d-view";

const input = defaultTankInput();
const result = designTank(input);
function App() {
  return (
    <div style={{ width: 1100, padding: 16 }}>
      <Tank3DView input={input} result={result} onSnapshot={(png) => ((window as unknown as { snap: string }).snap = png)} />
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
