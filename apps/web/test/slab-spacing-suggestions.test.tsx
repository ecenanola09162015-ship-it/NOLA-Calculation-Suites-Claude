import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { analyzeSlab, defaultSlabInput } from "@nola/calc-core";
import { SlabSpacingSuggestions } from "../src/components/slab-spacing-suggestions";

const props = {
  onSuggest: () => {},
  onAdopt: () => {},
  onUndo: () => {},
};
describe("Suggested Design: adopt buttons", () => {
  it("shows only Suggest spacing and the unchanged note before suggesting", () => {
    const h = renderToStaticMarkup(
      <SlabSpacingSuggestions
        input={defaultSlabInput()}
        recommendations={[]}
        canUndo={false}
        adoptedNote=""
        {...props}
      />,
    );
    expect(h).toContain("Suggest spacing");
    expect(h).not.toContain("Adopt Spacing to Main Bars");
    expect(h).toContain("Your inputs remain unchanged");
  });
  it("after suggesting: modes, main + extra lines, per-layer and all-layer adopt, confirmation box", () => {
    const i = { ...defaultSlabInput(), lx: 6, ly: 6, live: 4.8 };
    const h = renderToStaticMarkup(
      <SlabSpacingSuggestions
        input={i}
        recommendations={analyzeSlab(i).recommendations}
        canUndo={false}
        adoptedNote=""
        {...props}
      />,
    );
    for (const text of [
      "Main only",
      "Extra only",
      "Main + Extra",
      "Main: ",
      "Extra: ",
      "Adopt main",
      "Adopt extra",
      "Not required",
      "Adopt Spacing to Main Bars",
      "Adopt Spacing to Extra Bars",
      "Allow larger bar diameters",
    ])
      expect(h).toContain(text);
    expect(h).not.toContain("Undo adopt");
  });
  it("after adopting: Undo and the recheck note", () => {
    const h = renderToStaticMarkup(
      <SlabSpacingSuggestions
        input={defaultSlabInput()}
        recommendations={analyzeSlab(defaultSlabInput()).recommendations}
        canUndo
        adoptedNote="Main bars adopted (Main + Extra): short · bottom."
        {...props}
      />,
    );
    expect(h).toContain("Undo adopt");
    expect(h).toContain(
      "Adopted — recheck shear, anchorage and serviceability.",
    );
  });
});
