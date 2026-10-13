import { z } from "zod";
import type { RectangularColumnInput } from "./rectangular-column";
import { storeyClearHeights } from "./column-storey";
const finite = z.number().finite();
export const columnQuantitySchema = z.object({
  enabled: z.boolean(),
  /**
   * aci135: ACI 318-19 seismic hooks, 135° both ends on hoops and crossties.
   * aci14x90: ACI 318-14 / NSCP 2015 crosstie (Ch. 2 definition, NSCP 402):
   *   135° seismic hook one end, 90° hook with 6db extension the other,
   *   90° ends alternated end for end (18.7.5.2(c) / 418.7.5.2(c)).
   *   Closed hoops keep 135° seismic hooks. D10–D20 (office practice).
   * allowance8db: designer allowance, 8db per end.
   */
  hookBasis: z.enum(["allowance8db", "aci135", "aci14x90"]).default("aci135"),
  height: finite.min(500).max(20000),
  beamDepth: finite.min(0).max(5000),
  /**
   * true: height / beamDepth typed in the estimate (designer override).
   * Otherwise they follow storey geometry: H and the deeper beam (18.8.3).
   */
  geometryOverride: z.boolean().optional(),
  members: finite.int().min(1).max(10000),
  firstOffset: finite.min(0).max(1000),
  lastOffset: finite.min(0).max(1000),
  zones: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        start: finite.min(0).max(20000),
        end: finite.min(0).max(20000),
        spacing: finite.min(20).max(2000),
        diameter: finite.min(6).max(40),
        fy: finite.min(200).max(700),
        gradeId: z.string().max(20).nullable().optional(),
        /** Zone keeps its own tie size/grade instead of following Materials. */
        override: z.boolean().optional(),
        hoops: finite.int().min(1).max(8),
        legsX: finite.int().min(2).max(16),
        legsY: finite.int().min(2).max(16),
        crossXPositions: z.array(finite).max(14).optional(),
        crossYPositions: z.array(finite).max(14).optional(),
        hoopLength: finite.positive().max(50000).nullable().optional(),
        crossXLength: finite.positive().max(50000).nullable().optional(),
        crossYLength: finite.positive().max(50000).nullable().optional(),
      }),
    )
    .min(1)
    .max(20),
});
export type ColumnQuantityInput = z.infer<typeof columnQuantitySchema>;
/** Drafts retain total legs for backward compatibility; UI edits physical interior cross-ties. */
export function editColumnTieArrangement(
  zone: ColumnQuantityInput["zones"][number],
  field: "hoops" | "interiorX" | "interiorY",
  value: number,
) {
  if (field === "hoops" && !Number.isFinite(value)) return zone;
  const x = zone.legsX - 2 * zone.hoops,
    y = zone.legsY - 2 * zone.hoops;
  return field === "hoops"
    ? { ...zone, hoops: value, legsX: 2 * value + x, legsY: 2 * value + y }
    : field === "interiorX"
      ? { ...zone, legsX: 2 * zone.hoops + value }
      : { ...zone, legsY: 2 * zone.hoops + value };
}
export function defaultColumnQuantity(diameter = 10): ColumnQuantityInput {
  return {
    enabled: false,
    hookBasis: "aci135",
    height: 3000,
    beamDepth: 500,
    members: 1,
    firstOffset: 50,
    lastOffset: 50,
    zones: defaultColumnTieZones(3000, 500, diameter),
  };
}
export function defaultColumnTieZones(
  height: number,
  beamDepth: number,
  diameter: number,
) {
  const joint = height - beamDepth,
    end = Math.min(600, joint / 3);
  return [
    { name: "Lower zone", start: 0, end, spacing: 100 },
    { name: "Middle zone", start: end, end: joint - end, spacing: 200 },
    { name: "Upper zone", start: joint - end, end: joint, spacing: 100 },
    ...(beamDepth > 0
      ? [{ name: "Beam-column joint", start: joint, end: height, spacing: 100 }]
      : []),
  ].map((z) => ({ ...z, diameter, fy: 420, hoops: 1, legsX: 4, legsY: 4 }));
}
export function columnHookGeometry(
  d: number,
  basis: ColumnQuantityInput["hookBasis"],
) {
  const seismic = basis === "aci135" || basis === "aci14x90";
  if (basis === "aci135" && (d < 9.5 || d > 25.4))
    throw Error(
      "Automatic ACI hook basis supports 9.5–25.4 mm transverse bars only; use an independently detailed arrangement outside this range.",
    );
  if (basis === "aci14x90" && (d < 9.5 || d > 20.1))
    throw Error(
      "The 135° + 90° crosstie basis is set up for D10–D20 ties; use the ACI 318-19 135° basis or an independently detailed arrangement for other sizes.",
    );
  // Seismic hook extension: max(6db, 75 mm) (ACI 318-19 25.3.4; ACI 318-14 /
  // NSCP 2015 25.3.4 / 425.3.4). Inside bend: 4db ≤ D16, 6db D20–D25
  // (Table 25.3.3).
  const seismicExt = Math.max(6 * d, 76.2);
  const allowance = 8 * d;
  return {
    angle: seismic ? 135 : null,
    /** Extension per hoop end. */
    extension: seismic ? seismicExt : allowance,
    insideBend: seismic ? (d <= 16 ? 4 : 6) * d : null,
    /** The two crosstie end extensions [first, second]. */
    crossTieEnds:
      basis === "aci14x90"
        ? ([seismicExt, 6 * d] as const)
        : seismic
          ? ([seismicExt, seismicExt] as const)
          : ([allowance, allowance] as const),
    /** Angle of the crosstie's second end (90° for the 318-14 basis). */
    crossTieSecondAngle: basis === "aci14x90" ? 90 : seismic ? 135 : null,
  };
}
export const columnHookBasisLabel: Record<
  ColumnQuantityInput["hookBasis"],
  string
> = {
  aci135: "ACI 318-19 · 135° both ends",
  aci14x90: "ACI 318-14 / NSCP 2015 · crossties 135° + 90° (alternated)",
  allowance8db: "Designer allowance · 8db each end",
};
export function rebarUnitWeight(diameter: number) {
  return (Math.PI / 4) * (diameter / 1000) ** 2 * 7850;
}
export type ColumnQuantityRow = {
  mark: string;
  zone: string;
  function: "Longitudinal — axial/flexural" | "Shear / ties";
  piece: string;
  diameter: number;
  fy: number;
  count: number;
  length: number;
  lengthBasis: string;
  totalLength: number;
  unitWeight: number;
  weight: number;
};
export const columnQuantityLimitations = [
  "Longitudinal bars measured over floor-to-floor height only. Splices, additional anchorage, couplers and procurement waste are excluded.",
  "Cut lengths are preliminary: straight centerline body plus the selected hook extensions. Bend arcs, closure geometry and fabrication tolerances are excluded. ACI 135-degree mode uses max(6db, 76.2 mm) at both ends and displays minimum inside bend diameter; it does not certify hook fit or longitudinal-bar engagement. ACI 318-14 / NSCP 2015 135° + 90° mode keeps 135° hoops and uses max(6db, 76.2 mm) + 6db on crossties, 90° ends alternated end for end.",
  "Concrete is gross section area times floor-to-floor height, including the upper beam-column joint. Do not count that joint again in beam/slab quantities. Reinforcement displacement is not deducted.",
  "Hoops are full-section rectangular hoops; additional legs are straight cross-ties. Inner or overlapping hoop geometries are not modeled. Tie zones and arrangements are quantity inputs, not verified shear or seismic confinement design.",
];
/** Estimate height and joint from storey geometry unless overridden. */
export function effectiveColumnQuantity<
  Q extends { height: number; beamDepth: number; geometryOverride?: boolean },
>(section: Pick<RectangularColumnInput, "storey">, q: Q): Q {
  if (!section.storey || q.geometryOverride) return q;
  const h = storeyClearHeights(section.storey);
  return { ...q, height: section.storey.height, beamDepth: h.joint };
}
export function estimateColumnQuantity(
  section: RectangularColumnInput,
  raw: ColumnQuantityInput,
) {
  if (!raw.enabled) return null;
  const q = effectiveColumnQuantity(section, columnQuantitySchema.parse(raw));
  if (
    ![section.width, section.depth, section.cover, section.fy].every(
      Number.isFinite,
    ) ||
    section.width <= 0 ||
    section.depth <= 0 ||
    section.cover < 0
  )
    throw Error("Complete valid column section dimensions and materials.");
  if (q.beamDepth >= q.height || q.firstOffset + q.lastOffset >= q.height)
    throw Error(
      "Beam depth and tie end offsets must fit within the floor-to-floor height.",
    );
  const zs = q.zones
    .map((z, index) => ({ ...z, index }))
    .sort((a, b) => a.start - b.start);
  let previous = 0;
  for (const z of zs) {
    if (
      Math.abs(z.start - previous) > 1e-6 ||
      z.end <= z.start ||
      z.end > q.height
    )
      throw Error(
        "Tie zones must cover the full height without gaps or overlaps.",
      );
    if (z.legsX < 2 * z.hoops || z.legsY < 2 * z.hoops)
      throw Error(
        "Each full-section hoop contributes two legs in each direction. Increase legs or reduce hoops.",
      );
    if (
      section.width - 2 * section.cover - z.diameter <= 0 ||
      section.depth - 2 * section.cover - z.diameter <= 0
    )
      throw Error("Tie diameter and cover do not fit the column section.");
    const joint = q.height - q.beamDepth;
    if (q.beamDepth > 0 && z.start < joint - 1e-6 && z.end > joint + 1e-6)
      throw Error(
        "Provide a separate zone boundary at the bottom of the upper beam-column joint.",
      );
    previous = z.end;
  }
  if (Math.abs(previous - q.height) > 1e-6)
    throw Error("Tie zones must end at the floor-to-floor height.");
  // Fit a maximum-spacing grid including each zone boundary. Shared boundaries belong to the upper zone.
  const levels = new Map<number, number>();
  for (const z of zs) {
    const a = Math.max(z.start, q.firstOffset),
      b = Math.min(z.end, q.height - q.lastOffset);
    if (b < a) continue;
    const intervals = Math.ceil((b - a) / z.spacing);
    for (let k = 0; k <= intervals; k++)
      levels.set(
        Math.round((intervals ? a + ((b - a) * k) / intervals : a) * 1e6) / 1e6,
        z.index,
      );
  }
  const rows: ColumnQuantityRow[] = [];
  function add(
    mark: string,
    zone: string,
    fn: ColumnQuantityRow["function"],
    piece: string,
    d: number,
    fy: number,
    n: number,
    len: number,
    lengthBasis = "Preliminary automatic",
  ) {
    if (!n) return;
    const count = n * q.members,
      length = len / 1000,
      unitWeight = rebarUnitWeight(d),
      totalLength = count * length;
    rows.push({
      mark,
      zone,
      function: fn,
      piece,
      diameter: d,
      fy,
      count,
      length,
      lengthBasis,
      totalLength,
      unitWeight,
      weight: unitWeight * totalLength,
    });
  }
  const bars = new Map<number, number>();
  for (const b of section.bars) {
    if (!Number.isFinite(b.diameter) || b.diameter <= 0)
      throw Error("Complete valid longitudinal bar diameters.");
    bars.set(b.diameter, (bars.get(b.diameter) || 0) + 1);
  }
  for (const [d, n] of bars)
    add(
      `L-${d}`,
      "Full height",
      "Longitudinal — axial/flexural",
      "Main bar",
      d,
      section.fy,
      n,
      q.height,
      "Floor-to-floor",
    );
  const zoneResults = q.zones.map((z, index) => {
    const elevations = [...levels]
        .filter(([, owner]) => owner === index)
        .map(([e]) => e)
        .sort((a, b) => a - b),
      sets = elevations.length;
    const x = section.width - 2 * section.cover - z.diameter,
      y = section.depth - 2 * section.cover - z.diameter;
    const hook = columnHookGeometry(z.diameter, q.hookBasis),
      ends = 2 * hook.extension,
      crossEnds = hook.crossTieEnds[0] + hook.crossTieEnds[1];
    add(
      `Z${index + 1}-H`,
      z.name,
      "Shear / ties",
      "Closed hoop",
      z.diameter,
      z.fy,
      sets * z.hoops,
      z.hoopLength ?? 2 * (x + y) + ends,
      z.hoopLength != null
        ? "Designer cutting length"
        : "Preliminary automatic",
    );
    add(
      `Z${index + 1}-X`,
      z.name,
      "Shear / ties",
      "Cross-tie parallel X",
      z.diameter,
      z.fy,
      sets * (z.legsX - 2 * z.hoops),
      z.crossXLength ?? x + crossEnds,
      z.crossXLength != null
        ? "Designer cutting length"
        : "Preliminary automatic",
    );
    add(
      `Z${index + 1}-Y`,
      z.name,
      "Shear / ties",
      "Cross-tie parallel Y",
      z.diameter,
      z.fy,
      sets * (z.legsY - 2 * z.hoops),
      z.crossYLength ?? y + crossEnds,
      z.crossYLength != null
        ? "Designer cutting length"
        : "Preliminary automatic",
    );
    return { ...z, index, sets, elevations, x, y, hook };
  });
  const longitudinal = rows
      .filter((r) => r.function.startsWith("Longitudinal"))
      .reduce((a, r) => a + r.weight, 0),
    shear = rows
      .filter((r) => r.function === "Shear / ties")
      .reduce((a, r) => a + r.weight, 0);
  const concrete =
    ((section.width * section.depth * q.height) / 1e9) * q.members;
  return {
    rows,
    zones: zoneResults,
    tieSets: levels.size,
    longitudinal,
    shear,
    total: longitudinal + shear,
    longitudinalPercent:
      longitudinal + shear > 0
        ? (100 * longitudinal) / (longitudinal + shear)
        : 0,
    shearPercent:
      longitudinal + shear > 0 ? (100 * shear) / (longitudinal + shear) : 0,
    concrete,
    ratio: (longitudinal + shear) / concrete,
  };
}

/**
 * Materials tie size/grade flow into every estimate zone that is not marked
 * as an override. A zone whose diameter changes loses its checked cut lengths.
 */
export function syncColumnQuantityTies(
  value: ColumnQuantityInput,
  tie: { diameter: number; fy: number; gradeId?: string | null },
): ColumnQuantityInput {
  let changed = false;
  const zones = value.zones.map((z) => {
    if (z.override) return z;
    const same =
      z.diameter === tie.diameter &&
      z.fy === tie.fy &&
      (z.gradeId ?? null) === (tie.gradeId ?? null);
    if (same) return z;
    changed = true;
    const resize = z.diameter !== tie.diameter;
    return {
      ...z,
      diameter: tie.diameter,
      fy: tie.fy,
      gradeId: tie.gradeId ?? null,
      ...(resize
        ? { hoopLength: null, crossXLength: null, crossYLength: null }
        : {}),
    };
  });
  return changed ? { ...value, zones } : value;
}
