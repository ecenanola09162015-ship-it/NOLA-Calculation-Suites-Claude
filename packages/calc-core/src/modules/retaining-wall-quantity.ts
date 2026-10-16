/**
 * Retaining wall quantity estimate (Phase 1b): concrete, formwork and
 * reinforcement for a wall of length L built from the 1 m strip design.
 * Estimating only: no laps for stock lengths, no waste, no bend deductions.
 */
import { z } from "zod";

import type { RetainingWallBar, RetainingWallInput } from "./retaining-wall";
import { polygonProperties, retainingWallGeometry } from "./retaining-wall-geometry";

export const retainingWallQuantitySchema = z.object({
  enabled: z.boolean(),
  /** Wall length along the alignment, m. */
  length: z.number().min(1).max(1000),
  /** Count end formwork at both wall ends. */
  endForms: z.boolean(),
});
export type RetainingWallQuantityInput = z.infer<typeof retainingWallQuantitySchema>;
export const defaultRetainingWallQuantity = (): RetainingWallQuantityInput => ({
  enabled: false,
  length: 10,
  endForms: true,
});

export interface QuantityBarLine {
  mark: number;
  label: string;
  diameter: number;
  spacing: number;
  count: number;
  /** Length of one bar, m. */
  length: number;
  /** kg (7850 kg/m³). */
  weight: number;
}
export interface RetainingWallQuantity {
  length: number;
  concrete: { stem: number; footing: number; key: number; total: number };
  formwork: { stemFront: number; stemBack: number; footingEdges: number; ends: number; total: number };
  bars: QuantityBarLine[];
  steel: number;
  /** kg of reinforcement per m³ of concrete. */
  ratio: number;
}

export const retainingWallQuantityLimitations = [
  "Estimate excludes laps for stock lengths, couplers, chairs, waste and bend deductions.",
  "Bar lengths follow the 1 m strip design along the whole wall; end and corner details are not included.",
];

const kg = (d: number, lengthM: number) => ((Math.PI * d * d) / 4) * lengthM * 0.00785;
const countAlong = (spanM: number, spacing: number) => Math.floor((spanM * 1000) / spacing) + 1;

export function estimateRetainingWallQuantity(
  i: RetainingWallInput,
  q: RetainingWallQuantityInput,
): RetainingWallQuantity {
  const g = retainingWallGeometry(i),
    L = q.length,
    basement = i.wallType === "basement",
    tf = i.footing,
    H = i.height;
  const area = (p: { x: number; y: number }[] | null) => (p ? polygonProperties(p).area : 0);
  const stem = area(g.stem) * L,
    footing = basement ? 0 : area(g.footing) * L,
    key = basement ? 0 : area(g.key) * L;
  const backLen = Math.hypot(H, g.backTop - g.backBase),
    frontLen = Math.hypot(H, g.frontTop - g.frontBase);
  const sectionArea = area(g.stem) + (basement ? 0 : area(g.footing));
  const formwork = {
    stemFront: frontLen * L,
    stemBack: backLen * L,
    footingEdges: basement ? 0 : 2 * tf * L,
    ends: q.endForms ? 2 * sectionArea : 0,
    total: 0,
  };
  formwork.total = formwork.stemFront + formwork.stemBack + formwork.footingEdges + formwork.ends;
  const b = i.bars;
  const cv = i.cover;
  const embed = tf - cv.footingBottom / 1000 - (basement ? 0 : (b.toeBottom.diameter + b.footingDistribution.diameter) / 1000);
  const hook = (bar: RetainingWallBar) => (12 * bar.diameter) / 1000;
  const vertical = H - 0.05 + embed;
  const lines: QuantityBarLine[] = [];
  const add = (mark: number, label: string, bar: RetainingWallBar, count: number, length: number) =>
    lines.push({ mark, label, diameter: bar.diameter, spacing: bar.spacing, count, length, weight: count * kg(bar.diameter, length) });
  const nBack = countAlong(L - 0.1, b.stemBack.spacing);
  if (b.stemCut.enabled && b.stemCut.height < H) {
    const full = Math.ceil(nBack / 2),
      cut = nBack - full;
    add(1, "Stem back face, vertical (full height)", b.stemBack, full, vertical + hook(b.stemBack));
    add(1, "Stem back face, vertical (stopped)", b.stemBack, cut, b.stemCut.height + embed + hook(b.stemBack));
  } else add(1, "Stem back face, vertical", b.stemBack, nBack, vertical + hook(b.stemBack));
  add(2, "Stem front face, vertical", b.stemFront, countAlong(L - 0.1, b.stemFront.spacing), vertical + hook(b.stemFront));
  add(3, "Stem horizontal, both faces", b.stemHorizontal, 2 * countAlong(H - 0.1, b.stemHorizontal.spacing), L - 0.1);
  if (!basement) {
    const across = g.width - 2 * (cv.footingBottom / 1000);
    add(4, "Footing bottom (toe main)", b.toeBottom, countAlong(L - 0.1, b.toeBottom.spacing), across + 2 * hook(b.toeBottom));
    add(5, "Footing top (heel main)", b.heelTop, countAlong(L - 0.1, b.heelTop.spacing), across + 2 * hook(b.heelTop));
    add(6, "Footing distribution, both faces", b.footingDistribution, 2 * countAlong(across, b.footingDistribution.spacing), L - 0.1);
  }
  const steel = lines.reduce((s, l) => s + l.weight, 0),
    total = stem + footing + key;
  return {
    length: L,
    concrete: { stem, footing, key, total },
    formwork,
    bars: lines,
    steel,
    ratio: total > 0 ? steel / total : 0,
  };
}
