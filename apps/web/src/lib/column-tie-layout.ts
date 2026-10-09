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
  const bars = section.bars;
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
