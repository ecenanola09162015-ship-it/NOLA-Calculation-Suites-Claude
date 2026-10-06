import { describe, expect, it } from "vitest";

import { calculateRcColumn } from "../src";

describe("pilot safety gate", () => {
  it("returns a blocking warning while equations await verification", () => {
    const result = calculateRcColumn(
      {
        widthMm: 400,
        depthMm: 400,
        concreteStrengthMpa: 28,
        steelYieldStrengthMpa: 420,
        axialDemandKn: 1000,
        momentXKnM: 80,
        momentYKnM: 40,
      },
      {
        family: "American / International",
        standard: "ACI 318",
        edition: "TBD",
      },
    );

    expect(result.status).toBe("interface-only");
    expect(result.output).toBeNull();
    expect(result.warnings[0]?.severity).toBe("blocking");
  });
});
