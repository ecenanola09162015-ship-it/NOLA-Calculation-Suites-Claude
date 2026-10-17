/**
 * Bundled longitudinal bars (user decisions 17 Oct 2026).
 *
 * The designer picks bars; each picked bar becomes a bundle of 2, 3 or 4
 * touching bars of the same diameter. The picked bar stays where it is (it
 * keeps its cover to the ties) and the added bars go along the face and
 * inward, so strength uses the true position of every bar (22.2).
 *
 *   n = 2: one bar along the face           (corner: along the h face)
 *   n = 3: L — along the face and inward
 *   n = 4: square
 *
 * Checks (ACI 318-19; NSCP 2015 Ch. 4 has the same provisions):
 * - 25.6.1.1  at most four bars in a bundle                         (error)
 * - same diameter in a bundle (practice; 25.6.1.6 equivalent area)  (error)
 * - bars overlapping                                                (error)
 * - 25.6.1.6 + 25.2.3  clear spacing between units, each bundle taken as one
 *   bar of equivalent diameter db,eq = db·√n, ≥ max(40 mm, 1.5·db,eq);
 *   4/3·dagg is not checked (aggregate size is not a column input) (error)
 * - 20.5.1.3.4  cover to the bundle ≥ lesser of db,eq and 50 mm      (error)
 * - 25.7.2.2  tie ≥ 12 mm (PNS 49; NSCP 425.7.2.2) / 12.7 mm No. 4 (ASTM)
 *   when bars are bundled                                            (warning)
 * - 25.7.2.3  each bundle laterally supported as a unit; 25.6.1.5 ld +20 % /
 *   +33 %; 25.6.1.7 splice bars individually, staggered               (notes)
 */
import type { ColumnBar, RectangularColumnInput } from "./rectangular-column";

export const MAX_BUNDLE = 4;
export type BundleSize = 2 | 3 | 4;
export type BundleLevel = "error" | "warning" | "note";
export interface BundleIssue {
  level: BundleLevel;
  text: string;
  clause: string;
  /** Bar indices the issue refers to (for highlighting). */
  bars: number[];
}

const sgn = (v: number) => (v > 0 ? 1 : v < 0 ? -1 : 0);
/** Equivalent diameter of n bars of diameter db (same total area), 25.6.1.6. */
export const bundleEquivalentDiameter = (db: number, n: number) =>
  db * Math.sqrt(n);

/** Offsets of the added bars for a bundle anchored at bar b. */
export function bundleOffsets(
  b: ColumnBar,
  n: BundleSize,
  section: Pick<RectangularColumnInput, "width" | "depth">,
): [number, number][] {
  const db = b.diameter;
  // Which faces the bar sits on: the nearer face in each direction, when the
  // bar is within 1.5 db of the outermost bar line on that side.
  const halfW = section.width / 2,
    halfH = section.depth / 2;
  const nearX = halfW - Math.abs(b.x),
    nearY = halfH - Math.abs(b.y);
  const onX = nearX <= nearY + 1.5 * db; // on a left/right face
  const onY = nearY <= nearX + 1.5 * db; // on a top/bottom face
  const ix = onX ? -sgn(b.x) || -1 : 0; // inward along x
  const iy = onY ? -sgn(b.y) || -1 : 0; // inward along y
  let along: [number, number], inward: [number, number];
  if (ix && iy) {
    // Corner: second bar along the h face (vertical), third along the b face.
    along = [0, iy * db];
    inward = [ix * db, 0];
  } else if (ix) {
    const t = -sgn(b.y) || 1;
    along = [0, t * db];
    inward = [ix * db, 0];
  } else {
    const t = -sgn(b.x) || 1;
    along = [t * db, 0];
    inward = [0, (iy || -1) * db];
  }
  const diag: [number, number] = [along[0] + inward[0], along[1] + inward[1]];
  return [along, inward, diag].slice(0, n - 1);
}

/** Next unused bundle id: B1, B2, … */
function nextIds(bars: ColumnBar[]) {
  const used = new Set(bars.map((b) => b.bundle).filter(Boolean));
  let k = 1;
  return () => {
    while (used.has(`B${k}`)) k++;
    used.add(`B${k}`);
    return `B${k}`;
  };
}

/**
 * Bundle the selected single bars. Bars already in a bundle are re-sized
 * from their anchor (first bar of the bundle). Returns the new bars and the
 * issues; when there is any error the original bars are returned unchanged.
 */
export function bundleBars(
  input: RectangularColumnInput,
  selected: number[],
  n: BundleSize,
): { bars: ColumnBar[]; issues: BundleIssue[]; applied: boolean } {
  if (!([2, 3, 4] as number[]).includes(n))
    return {
      bars: input.bars,
      applied: false,
      issues: [
        {
          level: "error",
          text: `A bundle may have at most ${MAX_BUNDLE} bars.`,
          clause: "ACI 318-19 25.6.1.1",
          bars: selected,
        },
      ],
    };
  // Work from anchors: unbundle the selection first.
  const anchors = new Set<number>();
  for (const i of selected) {
    const b = input.bars[i];
    if (!b) continue;
    anchors.add(b.bundle ? input.bars.findIndex((c) => c.bundle === b.bundle) : i);
  }
  const base = unbundleBars(input, [...anchors]);
  // Map old anchor indices to indices in the unbundled list.
  const anchorBars = [...anchors].map((i) => input.bars[i]!);
  const id = nextIds(base);
  const out: ColumnBar[] = [];
  for (const b of base) {
    const isAnchor = anchorBars.some(
      (a) => a.x === b.x && a.y === b.y && a.diameter === b.diameter,
    );
    if (!isAnchor) {
      out.push(b);
      continue;
    }
    const tag = id();
    out.push({ ...b, bundle: tag });
    for (const [dx, dy] of bundleOffsets(b, n, input))
      out.push({ x: round(b.x + dx), y: round(b.y + dy), diameter: b.diameter, bundle: tag });
  }
  const issues = bundleIssues({ ...input, bars: out });
  return issues.some((i) => i.level === "error")
    ? { bars: input.bars, issues, applied: false }
    : { bars: out, issues, applied: true };
}
const round = (v: number) => Math.round(v * 10) / 10;

/** Turn the bundles containing the selected bars back into single bars (anchor kept). */
export function unbundleBars(
  input: Pick<RectangularColumnInput, "bars">,
  selected: number[],
): ColumnBar[] {
  const ids = new Set(
    selected.map((i) => input.bars[i]?.bundle).filter(Boolean) as string[],
  );
  const seen = new Set<string>();
  const out: ColumnBar[] = [];
  for (const b of input.bars) {
    if (!b.bundle || !ids.has(b.bundle)) {
      out.push(b);
      continue;
    }
    if (seen.has(b.bundle)) continue; // drop the added bars
    seen.add(b.bundle);
    const { bundle: _drop, ...single } = b;
    void _drop;
    out.push(single);
  }
  return out;
}

interface Unit {
  bars: number[];
  x: number;
  y: number;
  deq: number;
  bundle: string | null;
}
/** Bundles and single bars as spacing units (centroid, equivalent diameter). */
export function bundleUnits(bars: ColumnBar[]): Unit[] {
  const units: Unit[] = [];
  const byId = new Map<string, number[]>();
  bars.forEach((b, i) => {
    if (b.bundle) byId.set(b.bundle, [...(byId.get(b.bundle) ?? []), i]);
    else units.push({ bars: [i], x: b.x, y: b.y, deq: b.diameter, bundle: null });
  });
  for (const [id, idx] of byId) {
    const bs = idx.map((i) => bars[i]!);
    const area = bs.reduce((s, b) => s + b.diameter ** 2, 0);
    units.push({
      bars: idx,
      x: bs.reduce((s, b) => s + b.x * b.diameter ** 2, 0) / area,
      y: bs.reduce((s, b) => s + b.y * b.diameter ** 2, 0) / area,
      deq: Math.sqrt(area),
      bundle: id,
    });
  }
  return units;
}

export function bundleIssues(input: RectangularColumnInput): BundleIssue[] {
  const bars = input.bars;
  const issues: BundleIssue[] = [];
  const units = bundleUnits(bars);
  const bundles = units.filter((u) => u.bundle);
  for (const u of bundles) {
    if (u.bars.length > MAX_BUNDLE)
      issues.push({
        level: "error",
        text: `Bundle ${u.bundle} has ${u.bars.length} bars; at most ${MAX_BUNDLE} bars may be bundled.`,
        clause: "ACI 318-19 25.6.1.1",
        bars: u.bars,
      });
    if (u.bars.length < 2)
      issues.push({
        level: "warning",
        text: `Bundle ${u.bundle} has a single bar; it is treated as a single bar.`,
        clause: "ACI 318-19 25.6.1",
        bars: u.bars,
      });
    if (new Set(u.bars.map((i) => bars[i]!.diameter)).size > 1)
      issues.push({
        level: "error",
        text: `Bundle ${u.bundle} mixes bar diameters; use one diameter per bundle.`,
        clause: "Detailing practice (25.6.1.6 equivalent area)",
        bars: u.bars,
      });
  }
  // Overlaps between any two bars (touching is allowed inside a bundle).
  for (let i = 0; i < bars.length; i++)
    for (let j = i + 1; j < bars.length; j++) {
      const a = bars[i]!,
        b = bars[j]!;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < (a.diameter + b.diameter) / 2 - 0.5)
        issues.push({
          level: "error",
          text: `Bars ${i + 1} and ${j + 1} overlap (centre distance ${d.toFixed(1)} mm).`,
          clause: "Geometry",
          bars: [i, j],
        });
    }
  if (!bundles.length) return issues;
  // Clear spacing between units with at least one bundle (25.6.1.6, 25.2.3).
  for (let i = 0; i < units.length; i++)
    for (let j = i + 1; j < units.length; j++) {
      const a = units[i]!,
        b = units[j]!;
      if (!a.bundle && !b.bundle) continue;
      // Clear distance between the closest bars of the two units.
      let clear = Infinity;
      for (const p of a.bars)
        for (const q of b.bars) {
          const bp = bars[p]!,
            bq = bars[q]!;
          clear = Math.min(
            clear,
            Math.hypot(bp.x - bq.x, bp.y - bq.y) - (bp.diameter + bq.diameter) / 2,
          );
        }
      const need = Math.max(40, 1.5 * Math.max(a.deq, b.deq));
      if (clear < need - 0.5)
        issues.push({
          level: "error",
          text: `Clear spacing ${a.bundle ?? `bar ${a.bars[0]! + 1}`} – ${b.bundle ?? `bar ${b.bars[0]! + 1}`} = ${clear.toFixed(0)} mm < ${need.toFixed(0)} mm = max(40, 1.5·db,eq ${Math.max(a.deq, b.deq).toFixed(1)}).`,
          clause: "ACI 318-19 25.6.1.6, 25.2.3",
          bars: [...a.bars, ...b.bars],
        });
    }
  for (const u of bundles) {
    // Cover to the bundle: concrete face to the nearest bar of the bundle.
    const cover = Math.min(
      ...u.bars.map((i) => {
        const b = bars[i]!;
        return Math.min(
          input.width / 2 - Math.abs(b.x),
          input.depth / 2 - Math.abs(b.y),
        ) - b.diameter / 2;
      }),
    );
    const need = Math.min(u.deq, 50);
    if (cover < need - 0.5)
      issues.push({
        level: "error",
        text: `Cover to bundle ${u.bundle} = ${cover.toFixed(0)} mm < ${need.toFixed(1)} mm (lesser of db,eq ${u.deq.toFixed(1)} and 50 mm).`,
        clause: "ACI 318-19 20.5.1.3.4",
        bars: u.bars,
      });
  }
  const minTie = (input.rebarStandard ?? "PNS49") === "ASTM" ? 12.7 : 12;
  if (input.tieDiameter < minTie - 1e-9)
    issues.push({
      level: "warning",
      text: `Tie Ø${input.tieDiameter} with bundled bars: use at least Ø${minTie === 12 ? "12" : "13 (No. 4)"}.`,
      clause: "ACI 318-19 25.7.2.2; NSCP 2015 425.7.2.2",
      bars: bundles.flatMap((u) => u.bars),
    });
  issues.push(
    {
      level: "note",
      text: "Each bundle must be enclosed and laterally supported as a unit by a tie corner or crosstie hook; confirm in the tie layout.",
      clause: "ACI 318-19 25.6.1.2, 25.7.2.3",
      bars: [],
    },
    {
      level: "note",
      text: "Splice bars of a bundle individually and stagger the splices; development length of individual bars +20 % (3-bar bundle) / +33 % (4-bar bundle).",
      clause: "ACI 318-19 25.6.1.5, 25.6.1.7",
      bars: [],
    },
  );
  return issues;
}

/** "4 × 2-bar bundles, 2 × 3-bar bundles" (empty when none). */
export function bundleSummary(bars: ColumnBar[]) {
  const counts = new Map<number, number>();
  for (const u of bundleUnits(bars))
    if (u.bundle) counts.set(u.bars.length, (counts.get(u.bars.length) ?? 0) + 1);
  return [...counts]
    .sort((a, b) => a[0] - b[0])
    .map(([n, c]) => `${c} × ${n}-bar bundle${c > 1 ? "s" : ""}`)
    .join(", ");
}

/**
 * Bars as the TIES see them (user decision 18 Oct 2026): a bundle is one
 * longitudinal bar for anchorage / lateral support — only its anchor (the
 * picked bar, on the bar line at the hoop) is kept; the added bars of the
 * bundle never create cross-tie positions, legs or supported-bar counts.
 * ACI 318-19 25.6.1.2 (bundles enclosed by ties), 25.7.2.3, 18.7.5.2.
 */
export function tieBars(bars: ColumnBar[]): ColumnBar[] {
  const seen = new Set<string>();
  return bars.filter((b) => {
    if (!b.bundle) return true;
    if (seen.has(b.bundle)) return false;
    seen.add(b.bundle);
    return true;
  });
}
