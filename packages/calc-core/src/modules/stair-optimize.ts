/**
 * "Optimize spacing" for one stair bar set (review 16 Oct 2026): keep the
 * bar size, try 300 → 75 mm in 25 mm steps and return the largest spacing at
 * which every check governed by that set is below 1.0 and at or below the
 * target DCR (default 0.95).
 *
 * Governed checks: top sets — their own −M zone, strain, area, spacing,
 * crack control (T3 also knee top-bar development); main bottom bars —
 * +M, strain, shear, calculated deflection (As changes Icr), area,
 * spacing, crack control (not the minimum-thickness screen, which depends
 * on h only); distribution — area and spacing.
 */
import type { DesignCheck } from "../design-review";
import {
  analyzeStairs,
  stairBarMarks,
  type StairBarSetId,
  type StairsInput,
} from "./stair-design";
import { stairsDesignChecks } from "./stair-review";

export const STAIR_OPTIMIZE_SPACINGS = [
  300, 275, 250, 225, 200, 175, 150, 125, 100, 75,
] as const;
export const STAIR_OPTIMIZE_TARGET = 0.95;

export const stairOptimizeGoverns: Record<
  StairBarSetId,
  (id: string) => boolean
> = {
  mainBottom: (id) =>
    /flexure-pos|strain-pos|:shear|:deflection$/.test(id) ||
    id.startsWith("bars:mainBottom"),
  topBottom: (id) =>
    /(flexure|strain)-neg:topBottom$/.test(id) ||
    id.startsWith("bars:topBottom"),
  topTop: (id) =>
    /(flexure|strain)-neg:topTop$/.test(id) || id.startsWith("bars:topTop"),
  topKnee: (id) =>
    /(flexure|strain)-neg:topKnee$/.test(id) ||
    id === "detail:knee-top" ||
    id.startsWith("bars:topKnee"),
  distribution: (id) => id.startsWith("bars:distribution"),
};

export interface StairOptimizeResult {
  set: StairBarSetId;
  /** "full": all governed checks; "strength": B1 without deflection; "none". */
  mode: "full" | "strength" | "none";
  spacing: number | null;
  governing: DesignCheck | null;
  /** Checks outside this set still above DCR 1.0 with the chosen spacing. */
  othersFailing: DesignCheck[];
  target: number;
  message: string;
}

const fmt = (n: number | null | undefined, p = 3) =>
  n === null || n === undefined || !Number.isFinite(n) ? "—" : n.toFixed(p);

function search(
  i: StairsInput,
  set: StairBarSetId,
  target: number,
  accept: (id: string) => boolean,
) {
  const limit = Math.min(target, 1 - 1e-9);
  for (const spacing of STAIR_OPTIMIZE_SPACINGS) {
    const trial: StairsInput = {
      ...i,
      bars: { ...i.bars, [set]: { ...i.bars[set], spacing } },
    };
    const res = analyzeStairs(trial);
    if (res.error) continue;
    const all = stairsDesignChecks(res);
    const own = all.filter((c) => accept(c.id));
    if (!own.length) continue;
    if (
      own.every((c) => c.dcr !== null && c.dcr < 1 && c.dcr <= limit + 1e-12)
    ) {
      const governing = own.reduce((a, b) =>
        (b.dcr ?? 0) > (a.dcr ?? 0) ? b : a,
      );
      return {
        spacing,
        governing,
        othersFailing: all.filter(
          (c) => !accept(c.id) && (c.dcr ?? Infinity) > 1,
        ),
      };
    }
  }
  return null;
}

export function stairOptimizeSpacing(
  i: StairsInput,
  set: StairBarSetId,
  target = STAIR_OPTIMIZE_TARGET,
): StairOptimizeResult {
  const mark = stairBarMarks[set];
  const t = Math.min(1, Math.max(0.5, target));
  const describe = (x: NonNullable<ReturnType<typeof search>>) =>
    `${mark} → ${x.spacing} mm · governing: ${x.governing.label} DCR ${fmt(x.governing.dcr)} ≤ ${t.toFixed(2)}.` +
    (x.othersFailing.length
      ? ` Still failing outside ${mark}: ${x.othersFailing.map((c) => c.label).join("; ")}.`
      : "");
  const full = search(i, set, t, stairOptimizeGoverns[set]);
  if (full)
    return {
      set,
      mode: "full",
      ...full,
      target: t,
      message: `Optimized: ${describe(full)}`,
    };
  if (set === "mainBottom") {
    const strength = search(
      i,
      set,
      t,
      (id) => stairOptimizeGoverns.mainBottom(id) && !/:deflection$/.test(id),
    );
    if (strength)
      return {
        set,
        mode: "strength",
        ...strength,
        target: t,
        message: `Optimized for strength and detailing: ${describe(strength)} Calculated deflection cannot reach DCR ≤ ${t.toFixed(2)} with any spacing from 75 to 300 mm — increase the waist or landing thickness.`,
      };
  }
  return {
    set,
    mode: "none",
    spacing: null,
    governing: null,
    othersFailing: [],
    target: t,
    message: `No spacing from 75 to 300 mm keeps ${mark} (Ø${i.bars[set].diameter}) at DCR ≤ ${t.toFixed(2)} — increase the bar size or thickness.`,
  };
}
