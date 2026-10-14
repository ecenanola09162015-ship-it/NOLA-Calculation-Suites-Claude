import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { defaultSlabInput, defaultSlabQuantity } from "@nola/calc-core";
import {
  ConcreteStrengthSelect,
  matchPsi,
  psiOptions,
  psiToMpa,
} from "../src/components/concrete-strength-select";
import { SlabQuantityPanel } from "../src/components/slab-quantity-panel";

describe("concrete f′c psi dropdown", () => {
  it("lists 1000–15000 psi in 500 psi steps with exact MPa", () => {
    expect(psiOptions[0]).toBe(1000);
    expect(psiOptions.at(-1)).toBe(15000);
    expect(psiOptions).toHaveLength(29);
    expect(psiToMpa(4000)).toBeCloseTo(27.579, 3);
    expect(matchPsi(psiToMpa(4000))).toBe(4000);
    expect(matchPsi(28)).toBeNull();
  });
  it("selects a catalogue value, shows custom MPa otherwise, warns below 17 MPa", () => {
    const preset = renderToStaticMarkup(
      <ConcreteStrengthSelect value={psiToMpa(4000)} onChange={() => {}} />,
    );
    expect(preset).toContain('<option value="4000" selected="">');
    expect(preset).not.toContain("Custom f′c");
    const custom = renderToStaticMarkup(
      <ConcreteStrengthSelect value={28} onChange={() => {}} />,
    );
    expect(custom).toContain("Custom f′c");
    expect(custom).toContain("= 4061 psi");
    const low = renderToStaticMarkup(
      <ConcreteStrengthSelect value={psiToMpa(2000)} onChange={() => {}} />,
    );
    expect(low).toContain("19.2.1.1");
  });
  it("column variant offers only the engine range (17–80 MPa)", () => {
    const h = renderToStaticMarkup(
      <ConcreteStrengthSelect
        layout="rc"
        value={35}
        minMpa={17}
        maxMpa={80}
        onChange={() => {}}
      />,
    );
    expect(h).not.toContain("2,000 psi");
    expect(h).toContain("2,500 psi = 17.24 MPa");
    expect(h).toContain("11,500 psi = 79.29 MPa");
    expect(h).not.toContain("12,000 psi");
    expect(h).toContain("rcUnit");
  });
});

describe("estimate beam override marker", () => {
  it("shows adopted size, override marker and reset", () => {
    const q = defaultSlabQuantity();
    q.enabled = true;
    q.beams.west = { ...q.beams.west, width: 350, override: true };
    const h = renderToStaticMarkup(
      <SlabQuantityPanel
        input={defaultSlabInput()}
        value={q}
        onChange={() => {}}
        onResetCutoffs={() => {}}
      />,
    );
    expect(h).toContain("Estimate override");
    expect(h).toContain("Reset to slab size");
    expect(h).toContain("Adopted from slab inputs (250 × 500");
  });
});
