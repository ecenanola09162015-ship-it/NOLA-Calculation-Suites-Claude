/**
 * Design-review rows for the Retaining Wall module: engine checks in the
 * shared DesignCheck shape (graded by design-check-policy.json through
 * designCheckStatus, like Slab, RC Column and Stairs), grouped by
 * Stability, Stem, Footing and Detailing.
 */
import type { DesignCheck } from "../design-review";
import type { RetainingWallResult, RwCheck } from "./retaining-wall-design";

const toDesignCheck = ({ group, demand, capacity, unit, ...c }: RwCheck): DesignCheck => {
  void group;
  void demand;
  void capacity;
  void unit;
  return {
    ...c,
    detail: c.detail,
    ...(c.dcr === null ? { invalidLabel: "Not evaluated" } : {}),
  };
};

export function retainingWallDesignChecks(r: RetainingWallResult): DesignCheck[] {
  return r.checks.map(toDesignCheck);
}

export interface RetainingWallCheckSection {
  title: RwCheck["group"];
  checks: DesignCheck[];
  governing: number | null;
}
export function retainingWallCheckSections(
  r: RetainingWallResult,
): RetainingWallCheckSection[] {
  const order: RwCheck["group"][] = ["Stability", "Stem", "Footing", "Detailing"];
  return order
    .map((title) => {
      const checks = r.checks.filter((c) => c.group === title).map(toDesignCheck);
      const dcrs = checks
        .map((c) => c.dcr)
        .filter((d): d is number => d !== null && !Number.isNaN(d));
      return { title, checks, governing: dcrs.length ? Math.max(...dcrs) : null };
    })
    .filter((s) => s.checks.length > 0);
}

/** Review headings, shared by the workspace and the PDF check table. */
export const retainingWallSectionTitles: Record<RwCheck["group"], string> = {
  Stability: "Stability Checks (Service, FS)",
  Stem: "Reinforcement Checks — Stem",
  Footing: "Reinforcement Checks — Footing",
  Detailing: "Reinforcement Checks — Detailing",
};
