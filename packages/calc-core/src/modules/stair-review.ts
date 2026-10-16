/**
 * Design-review rows for the Stairs module (decision C9): the engine's
 * checks in the shared DesignCheck shape, graded by design-check-policy.json
 * through designCheckStatus like Slab and RC Column, and grouped under one
 * heading per flight, then reinforcement, detailing and foundation.
 */
import type { DesignCheck } from "../design-review";
import type { StairCheck, StairsResult } from "./stair-design";

const toDesignCheck = ({ group, section, ...c }: StairCheck): DesignCheck => {
  void section;
  return { ...c, detail: c.detail ? `${group}: ${c.detail}` : group };
};

export function stairsDesignChecks(r: StairsResult): DesignCheck[] {
  return r.checks.map(toDesignCheck);
}

export interface StairCheckSection {
  title: string;
  checks: DesignCheck[];
  /** Governing (largest) DCR in the section; null when none evaluated. */
  governing: number | null;
}
/** Checks grouped by review heading, in engine order (flights first). */
export function stairsDesignCheckSections(
  r: StairsResult,
): StairCheckSection[] {
  const order: string[] = [];
  const map = new Map<string, DesignCheck[]>();
  for (const c of r.checks) {
    if (!map.has(c.section)) {
      map.set(c.section, []);
      order.push(c.section);
    }
    map.get(c.section)!.push(toDesignCheck(c));
  }
  return order.map((title) => {
    const checks = map.get(title)!;
    const dcrs = checks
      .map((c) => c.dcr)
      .filter((d): d is number => d !== null && !Number.isNaN(d));
    return { title, checks, governing: dcrs.length ? Math.max(...dcrs) : null };
  });
}
