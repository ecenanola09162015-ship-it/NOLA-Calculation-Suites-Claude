import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { defaultSlabInput, defaultSlabQuantity } from "@nola/calc-core";
import { SlabQuantityPanel } from "../src/components/slab-quantity-panel";
describe("slab quantity UI", () => {
  it("keeps quantities hidden when disabled", () => {
    const h = renderToStaticMarkup(
      <SlabQuantityPanel
        input={defaultSlabInput()}
        value={defaultSlabQuantity()}
        onChange={() => {}}
        onResetCutoffs={() => {}}
      />,
    );
    expect(h).toContain("Enable Quantity Estimate");
    expect(h).not.toContain("Total Steel");
  });
  it("renders four beams, end modes, filters, estimate diagrams and report assumptions", () => {
    const i = defaultSlabInput(),
      q = defaultSlabQuantity();
    q.enabled = true;
    q.beams.west.main.shape = "L-hook";
    const h = renderToStaticMarkup(
      <SlabQuantityPanel
        input={i}
        value={q}
        onChange={() => {}}
        onResetCutoffs={() => {}}
      />,
    );
    for (const text of [
      "West Beam",
      "East Beam",
      "South Beam",
      "North Beam",
      "Half Beam Width",
      "To Far-Side Clear Cover",
      "Custom Extension",
      "L-Hook Tail",
      "12db",
      "Slab Concrete Only",
      "Function",
      "Bar Group",
      "Filtered Subtotal",
      "Splices".toLowerCase(),
      "Slab estimate X section",
      "Slab estimate Y section",
    ])
      expect(h).toContain(text);
    expect(h).not.toContain("NaN");
    expect(h).not.toContain("Infinity");
  });
});
