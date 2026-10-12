import { describe, expect, it } from "vitest";
import {
  defaultDesignCheckPolicy,
  designCheckStatus,
  designCheckPolicySchema,
  missingJudgmentRemarks,
  slabDesignChecks,
} from "../src/design-review";
import {
  analyzeSlab,
  defaultSlabInput,
  slabDraftSchema,
} from "../src/modules/slab-design";
describe("shared design review policy", () => {
  it.each([
    [0.79999, "optimize"],
    [0.8, "pass"],
    [1, "pass"],
    [1.00001, "judgment"],
    [1.05, "judgment"],
    [1.05001, "improve"],
  ] as const)("classifies boundary %s", (dcr, id) =>
    expect(designCheckStatus(dcr).id).toBe(id),
  );
  it("does not pass unavailable results or zero capacity", () => {
    for (const value of [null, undefined, NaN, -1])
      expect(designCheckStatus(value).id).toBe("unavailable");
    expect(designCheckStatus(Infinity).id).toBe("improve");
  });
  it("validates configurable policies and applies changed labels", () => {
    const policy = structuredClone(defaultDesignCheckPolicy);
    policy.optimizeBelow = 0.7;
    policy.bands.pass.label = "Reviewed Pass";
    expect(
      designCheckStatus(0.75, designCheckPolicySchema.parse(policy)).label,
    ).toBe("Reviewed Pass");
    policy.passThrough = 0.6;
    expect(designCheckPolicySchema.safeParse(policy).success).toBe(false);
  });
  it("requires nonblank remarks only for amber checks", () => {
    const checks = [
      { id: "a", label: "A", dcr: 1.02 },
      { id: "b", label: "B", dcr: 0.9 },
    ];
    expect(
      missingJudgmentRemarks(checks, defaultDesignCheckPolicy, { a: "  " }).map(
        (c) => c.id,
      ),
    ).toEqual(["a"]);
    expect(
      missingJudgmentRemarks(checks, defaultDesignCheckPolicy, {
        a: "Reviewed capacity and load assumptions.",
      }),
    ).toEqual([]);
  });
  it("covers slab checks and round-trips policy and engineering remarks", () => {
    const input = defaultSlabInput();
    input.extra["short-bottom"].enabled = true;
    const result = analyzeSlab(input, false);
    const checks = slabDesignChecks(input, result);
    for (const suffix of ["flexure", "minimum", "spacing", "strain"])
      expect(checks.some((c) => c.id.endsWith(":" + suffix))).toBe(true);
    expect(checks.some((c) => c.id === "deflection")).toBe(true);
    expect(checks.some((c) => c.id.startsWith("shear:"))).toBe(true);
    expect(checks.some((c) => c.id.startsWith("development:"))).toBe(true);
    const draft = slabDraftSchema.parse(
      JSON.parse(
        JSON.stringify({
          kind: "slab",
          version: 1,
          input,
          designPolicy: defaultDesignCheckPolicy,
          remarks: { deflection: "Reviewed" },
          reviewCompleted: true,
        }),
      ),
    );
    expect(draft.remarks).toEqual({ deflection: "Reviewed" });
    expect(draft.designPolicy).toEqual(defaultDesignCheckPolicy);
    expect(
      slabDraftSchema.safeParse({ kind: "slab", version: 1, input }).success,
    ).toBe(true);
  });
});
