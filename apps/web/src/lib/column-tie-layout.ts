import { tieBars } from "@nola/calc-core";
import type {
  ColumnQuantityInput,
  RectangularColumnInput,
} from "@nola/calc-core";

export const tieZoneColors = [
  "#b45309",
  "#007f86",
  "#7044b5",
  "#c13f69",
  "#3868a0",
];
export const zoneColor = (i: number) => tieZoneColors[i % tieZoneColors.length];
type Zone = ColumnQuantityInput["zones"][number];

/** Opposing peripheral bars must share an axis coordinate; no invented engagement. */
export function crossTieCandidates(
  section: RectangularColumnInput,
  axis: "X" | "Y",
) {
  // A bundle is one bar for the ties (anchor only), as in calc-core.
  const bars = tieBars(section.bars);
  if (!bars.length) return [];
  const along = axis === "X" ? "x" : "y";
  const across = axis === "X" ? "y" : "x";
  const lo = Math.min(...bars.map((b) => b[along]));
  const hi = Math.max(...bars.map((b) => b[along]));
  const amin = Math.min(...bars.map((b) => b[across]));
  const amax = Math.max(...bars.map((b) => b[across]));
  if (hi - lo < 1) return [];
  return [
    ...new Set(
      bars
        .filter(
          (b) =>
            Math.abs(b[along] - lo) < 0.1 &&
            b[across] > amin + 0.1 &&
            b[across] < amax - 0.1 &&
            bars.some(
              (c) =>
                Math.abs(c[along] - hi) < 0.1 &&
                Math.abs(c[across] - b[across]) < 0.1,
            ),
        )
        .map((b) => b[across]),
    ),
  ].sort((a, b) => a - b);
}

export function crossTiePositions(
  section: RectangularColumnInput,
  zone: Zone,
  axis: "X" | "Y",
) {
  const count = Math.max(
    0,
    (axis === "X" ? zone.legsX : zone.legsY) - 2 * zone.hoops,
  );
  const candidates = crossTieCandidates(section, axis);
  const explicit = axis === "X" ? zone.crossXPositions : zone.crossYPositions;
  const positions =
    explicit ??
    Array.from(
      { length: Math.min(count, candidates.length) },
      (_, i) =>
        candidates[
          Math.floor(
            ((i + 0.5) * candidates.length) /
              Math.min(count, candidates.length),
          )
        ],
    );
  const extent =
    (axis === "X" ? section.depth : section.width) / 2 -
    section.cover -
    zone.diameter;
  const drawable = positions.filter(
    (p) => Number.isFinite(p) && Math.abs(p) < extent,
  );
  const valid =
    positions.length === count &&
    drawable.length === count &&
    new Set(positions).size === count &&
    positions.every((p) => candidates.some((c) => Math.abs(c - p) < 0.1));
  return { count, candidates, positions, drawable, valid };
}

/** Adoption is explicit, retains spacing/counts/fy and invalidates old checked lengths. */
export function adoptSectionTieDiameter(
  value: ColumnQuantityInput,
  diameter: number,
): ColumnQuantityInput {
  return {
    ...value,
    zones: value.zones.map((z) => ({
      ...z,
      diameter,
      hoopLength: null,
      crossXLength: null,
      crossYLength: null,
    })),
  };
}

/**
 * Cross-tie leg with a 135° hook around each end bar (SVG, y down).
 * Leg runs tangent to the bars on the +transverse side; each tail leaves the
 * bar after a 135° wrap and turns away from the leg into the core at 45°
 * (ACI 318-19 25.3.2, 25.7.1.6). `ext` is the tail length divided by √2.
 */
export function crossTieHookPath(
  a: number,
  b: number,
  transverse: number,
  r: number,
  ext: number,
  /**
   * 90° end (ACI 318-14 / NSCP 2015 crosstie): full extension length, and
   * which end carries it. Consecutive crossties alternate (18.7.5.2(c)).
   */
  ninety?: { ext: number; at: "a" | "b" },
) {
  const q = r / Math.SQRT2;
  const t = transverse;
  const startA =
    ninety?.at === "a"
      ? `M ${a - r} ${t - ninety.ext} L ${a - r} ${t} A ${r} ${r} 0 0 0 ${a} ${t + r}`
      : `M ${a - q + ext} ${t - q - ext} L ${a - q} ${t - q} A ${r} ${r} 0 0 0 ${a} ${t + r}`;
  const endB =
    ninety?.at === "b"
      ? `A ${r} ${r} 0 0 0 ${b + r} ${t} L ${b + r} ${t - ninety.ext}`
      : `A ${r} ${r} 0 0 0 ${b + q} ${t - q} L ${b + q - ext} ${t - q - ext}`;
  return `${startA} L ${b} ${t + r} ${endB}`;
}
