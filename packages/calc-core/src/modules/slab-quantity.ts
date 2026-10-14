import {
  resolveSlabBars,
  slabBarPositions,
  slabInputSchema,
  slabPrimaryAxisX,
  slabSupportLayout,
  SLAB_DEFAULT_BEAM,
  type SlabInput,
  type SlabEdge,
  type SlabResolvedBar,
} from "./slab-design";
import { rebarUnitWeight } from "./column-quantity";
import {
  slabQuantitySchema,
  type SlabQuantityInput,
} from "./slab-quantity-schema";
export * from "./slab-quantity-schema";

const beamEdges = ["west", "east", "south", "north"] as const;
/** Slab bounding-beam size per edge (mm), including Free edges (stored size). */
export function slabInputBeamSize(i: Pick<SlabInput, "beams">, e: SlabEdge) {
  return !i.beams || i.beams.source === "default"
    ? { ...SLAB_DEFAULT_BEAM }
    : { ...i.beams.sizes[e] };
}
/**
 * The Estimate adopts the slab beam width x depth on every edge that is not
 * overridden; overridden edges keep their own size (quantities only).
 */
export function slabAdoptBeams(
  i: Pick<SlabInput, "beams">,
  q: SlabQuantityInput,
): SlabQuantityInput {
  const beams = { ...q.beams };
  let changed = false;
  for (const e of beamEdges) {
    if (q.beams[e].override) continue;
    const s = slabInputBeamSize(i, e);
    if (q.beams[e].width === s.width && q.beams[e].depth === s.depth) continue;
    beams[e] = { ...q.beams[e], ...s };
    changed = true;
  }
  return changed ? { ...q, beams } : q;
}
/**
 * Drafts saved before slab-0.7 (no per-edge override flag):
 * - slab beams "From Estimate" become custom slab sizes taken from the
 *   Estimate (identical drawings and design), no Estimate overrides;
 * - otherwise Estimate edges whose size differs from the slab size are
 *   marked overridden so the saved quantities are unchanged.
 */
export function migrateSlabBeams(
  input: SlabInput,
  quantity: SlabQuantityInput,
  rawQuantity: unknown,
): { input: SlabInput; quantity: SlabQuantityInput } {
  const raw = (
    rawQuantity as { beams?: Record<string, { override?: unknown }> }
  )?.beams;
  const legacy =
    !!raw && beamEdges.every((e) => raw[e]?.override === undefined);
  if (input.beams?.source === "estimate") {
    const sizes = Object.fromEntries(
      beamEdges.map((e) => [
        e,
        { width: quantity.beams[e].width, depth: quantity.beams[e].depth },
      ]),
    ) as SlabInput["beams"]["sizes"];
    return {
      input: { ...input, beams: { source: "custom", sizes } },
      quantity: legacy
        ? {
            ...quantity,
            beams: Object.fromEntries(
              beamEdges.map((e) => [
                e,
                { ...quantity.beams[e], override: false },
              ]),
            ) as SlabQuantityInput["beams"],
          }
        : quantity,
    };
  }
  if (!legacy) return { input, quantity };
  return {
    input,
    quantity: {
      ...quantity,
      beams: Object.fromEntries(
        beamEdges.map((e) => {
          const s = slabInputBeamSize(input, e),
            b = quantity.beams[e];
          return [
            e,
            { ...b, override: b.width !== s.width || b.depth !== s.depth },
          ];
        }),
      ) as SlabQuantityInput["beams"],
    },
  };
}
export interface SlabQuantityRow {
  mark: string;
  group: "MAIN BARS" | "EXTRA BARS";
  function: "Flexural" | "Distribution";
  layer: string;
  axis: "X" | "Y";
  diameter: number;
  fy: number;
  count: number;
  body: number;
  nearExtension: number;
  farExtension: number;
  nearTail: number;
  farTail: number;
  length: number;
  totalLength: number;
  unitWeight: number;
  weight: number;
  start: number;
  end: number;
  near: SlabEdge;
  far: SlabEdge;
  nearTailSign: number;
  farTailSign: number;
  nearShape: "straight" | "L-hook";
  farShape: "straight" | "L-hook";
  z: number;
  positions: number[];
}
/** Quantity allowance, not an ACI anchorage/development verification. */
export function slabEstimateEnd(
  beam: SlabQuantityInput["beams"]["west"],
  group: "main" | "extra",
  diameter: number,
) {
  const e = beam[group],
    available = beam.width - beam.cover - diameter / 2;
  const extension =
    e.extensionMode === "half"
      ? beam.width / 2
      : e.extensionMode === "cover"
        ? available
        : e.extension;
  if (extension < 0 || extension > available + 1e-6)
    throw Error(
      "Bar extension exceeds the bounding beam's far-side clear-cover limit.",
    );
  return {
    extension,
    tail: e.shape === "L-hook" ? (e.hookTail ?? 12 * diameter) : 0,
    shape: e.shape,
    direction: e.hookDirection,
  };
}
function quantityPositions(i: SlabInput, b: SlabResolvedBar, width: number) {
  const d = Math.max(
    i.main[b.layer].diameter,
    i.extra[b.layer].enabled ? i.extra[b.layer].diameter : 0,
  );
  const main = slabBarPositions(width, i.sideCover, d, i.main[b.layer].spacing);
  if (b.group === "main") return main;
  const pitch = main.length > 1 ? main[1] - main[0] : i.main[b.layer].spacing;
  const extra =
    b.spacing >= pitch
      ? pitch * Math.max(1, Math.floor((b.spacing + 1e-8) / pitch))
      : pitch / Math.ceil(pitch / b.spacing);
  return slabBarPositions(width, i.sideCover, d, extra, extra / 2);
}
export function estimateSlabQuantity(raw: SlabInput, value: SlabQuantityInput) {
  if (!value.enabled) return null;
  const i = slabInputSchema.parse(raw),
    q = slabQuantitySchema.parse(value);
  const x = q.clearX ?? i.lx * 1000,
    y = q.clearY ?? i.ly * 1000;
  const shortX = slabPrimaryAxisX(i),
    oneWay =
      slabSupportLayout(i).kind === "cantilever" ||
      Math.max(i.lx, i.ly) / Math.min(i.lx, i.ly) >= 2;
  const rows: SlabQuantityRow[] = [],
    warnings = new Set<string>();
  if (
    (["west", "east", "south", "north"] as const).some(
      (e) => i.supports[e] === "Free",
    )
  )
    warnings.add(
      "Free edges: bars stop at the side cover; edge U-bars, trimmer bars and back-span anchorage of cantilever top bars are not included.",
    );
  if (q.clearX === null || q.clearY === null)
    warnings.add(
      "Analysis span is being used as the clear panel dimension. Confirm beam-face dimensions before issuing quantities.",
    );
  if (slabSupportLayout(i).kind !== "cantilever" && x <= y !== shortX)
    warnings.add(
      "Clear-panel short direction differs from the analysis span: bar direction labels continue to follow the design axes.",
    );
  for (const b of resolveSlabBars(i)) {
    const axis = (b.direction === "short" ? shortX : !shortX) ? "X" : "Y";
    const span = axis === "X" ? x : y,
      width = axis === "X" ? y : x;
    const near: SlabEdge = axis === "X" ? "west" : "south",
      far: SlabEdge = axis === "X" ? "east" : "north";
    const positions = quantityPositions(i, b, width);
    const count = positions.length * q.members;
    if (!count)
      throw Error("No bars fit the clear panel dimensions and side cover.");
    const ranges =
      b.group === "main"
        ? [{ start: 0, end: span, near: true, far: true, label: "Continuous" }]
        : b.face === "bottom"
          ? [
              {
                start: i.cutoffs.bottomStart * span,
                end: i.cutoffs.bottomEnd * span,
                near: i.cutoffs.bottomStart === 0,
                far: i.cutoffs.bottomEnd === 1,
                label: "Midspan",
              },
            ]
          : ([near, far] as const)
              .filter((e) => i.supports[e] === "Fixed")
              .map((e) => ({
                start: e === near ? 0 : span * (1 - i.cutoffs[e]),
                end: e === near ? span * i.cutoffs[e] : span,
                near: e === near,
                far: e === far,
                label: e,
              }));
    for (const a of ranges) {
      // Free edge: no bounding beam; bar ends at the side cover.
      const freeEnd = {
        extension: -i.sideCover,
        tail: 0,
        shape: "straight" as const,
        direction: "down" as const,
      };
      const n = a.near
        ? i.supports[near] === "Free"
          ? freeEnd
          : slabEstimateEnd(q.beams[near], b.group, b.diameter)
        : {
            extension: 0,
            tail: 0,
            shape: "straight" as const,
            direction: "down" as const,
          };
      const f = a.far
        ? i.supports[far] === "Free"
          ? freeEnd
          : slabEstimateEnd(q.beams[far], b.group, b.diameter)
        : {
            extension: 0,
            tail: 0,
            shape: "straight" as const,
            direction: "down" as const,
          };
      for (const [edge, detail] of [
        [near, n],
        [far, f],
      ] as const) {
        if (detail.tail) {
          const beam = q.beams[edge];
          const room =
            detail.direction === "down"
              ? beam.depth - i.h + b.z - beam.cover - b.diameter / 2
              : i.h - b.z - beam.cover - b.diameter / 2;
          if (detail.tail > room)
            warnings.add(
              `${b.group.toUpperCase()} ${b.layer} at ${edge}: hook tail may not fit the beam depth/cover. Review hook direction and detailing.`,
            );
        }
      }
      const body = a.end - a.start,
        length = (body + n.extension + f.extension + n.tail + f.tail) / 1000;
      const totalLength = length * count,
        unitWeight = rebarUnitWeight(b.diameter);
      rows.push({
        mark: `${b.group === "main" ? "M" : "E"}-${b.layer}-${a.label}`,
        group: b.group === "main" ? "MAIN BARS" : "EXTRA BARS",
        function:
          oneWay && b.direction === "long" ? "Distribution" : "Flexural",
        layer: `${b.layer} · ${a.label}`,
        axis,
        diameter: b.diameter,
        fy: i.fy,
        count,
        body: body / 1000,
        nearExtension: n.extension / 1000,
        farExtension: f.extension / 1000,
        nearTail: n.tail / 1000,
        farTail: f.tail / 1000,
        length,
        totalLength,
        unitWeight,
        weight: totalLength * unitWeight,
        start: a.start,
        end: a.end,
        near,
        far,
        nearTailSign: n.direction === "down" ? 1 : -1,
        farTailSign: f.direction === "down" ? 1 : -1,
        nearShape: n.shape,
        farShape: f.shape,
        z: b.z,
        positions,
      });
    }
  }
  const total = rows.reduce((s, r) => s + r.weight, 0),
    main = rows
      .filter((r) => r.group === "MAIN BARS")
      .reduce((s, r) => s + r.weight, 0),
    extra = total - main;
  const flexural = rows
      .filter((b) => b.function === "Flexural")
      .reduce((s, b) => s + b.weight, 0),
    distribution = total - flexural;
  const concrete = ((x * y * i.h) / 1e9) * q.members;
  return {
    rows,
    total,
    main,
    extra,
    flexural,
    distribution,
    flexuralPercent: total ? (100 * flexural) / total : 0,
    distributionPercent: total ? (100 * distribution) / total : 0,
    mainPercent: total ? (100 * main) / total : 0,
    extraPercent: total ? (100 * extra) / total : 0,
    concrete,
    ratio: total / concrete,
    x,
    y,
    warnings: [...warnings],
  };
}
export const slabQuantityLimitations = [
  "Slab concrete volume uses clear beam-face panel area × slab thickness; all bounding beam volumes are excluded. Steel volume is not deducted.",
  "Bar lengths use straight portions plus selected L-hook tail allowances. Bend arcs/deductions, splices, couplers, fabrication tolerances and waste are excluded.",
  "Half-beam extensions and 12db tails are designer estimating defaults, not verified development lengths or ACI anchorage compliance.",
  "Top extra bars are counted at fixed supports only, using the design cutoff settings. One-way slabs exclude long-direction extras; their long-direction main steel is classified as distribution.",
];
