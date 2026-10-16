/**
 * Design-review rows for the Stairs module (decision C9): the engine's
 * checks in the shared DesignCheck shape, graded by design-check-policy.json
 * through designCheckStatus like Slab and RC Column.
 */
import type { DesignCheck } from "../design-review";
import type { StairsResult } from "./stair-design";

export function stairsDesignChecks(r: StairsResult): DesignCheck[] {
  return r.checks.map(({ group, ...c }) => ({
    ...c,
    label: c.label,
    detail: c.detail ? `${group}: ${c.detail}` : group,
  }));
}
