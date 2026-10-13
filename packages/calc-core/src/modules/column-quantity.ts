import { z } from "zod";
import type { RectangularColumnInput } from "./rectangular-column";
const finite = z.number().finite();
export const columnQuantitySchema = z.object({
  enabled: z.boolean(),
  hookBasis: z.enum(["allowance8db", "aci135"]).default("aci135"),
  height: finite.min(500).max(20000),
  beamDepth: finite.min(0).max(5000),
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
  if (basis === "aci135" && (d < 9.5 || d > 25.4))
    throw Error(
      "Automatic ACI hook basis supports 9.5–25.4 mm transverse bars only; use an independently detailed arrangement outside this range.",
    );
  return {
    angle: basis === "aci135" ? 135 : null,
    extension: basis === "aci135" ? Math.max(6 * d, 76.2) : 8 * d,
    insideBend: basis === "aci135" ? (d <= 16 ? 4 : 6) * d : null,
  };
}
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
  "Cut lengths are preliminary: straight centerline body plus the selected hook extensions. Bend arcs, closure geometry and fabrication tolerances are excluded. ACI 135-degree mode uses max(6db, 76.2 mm) at both ends and displays minimum inside bend diameter; it does not certify hook fit or longitudinal-bar engagement.",
  "Concrete is gross section area times floor-to-floor height, including the upper beam-column joint. Do not count that joint again in beam/slab quantities. Reinforcement displacement is not deducted.",
  "Hoops are full-section rectangular hoops; additional legs are straight cross-ties. Inner or overlapping hoop geometries are not modeled. Tie zones and arrangements are quantity inputs, not verified shear or seismic confinement design.",
];
export function estimateColumnQuantity(
  section: RectangularColumnInput,
  raw: ColumnQuantityInput,
) {
  if (!raw.enabled) return null;
  const q = columnQuantitySchema.parse(raw);
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
      ends = 2 * hook.extension;
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
      z.crossXLength ?? x + ends,
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
      z.crossYLength ?? y + ends,
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
