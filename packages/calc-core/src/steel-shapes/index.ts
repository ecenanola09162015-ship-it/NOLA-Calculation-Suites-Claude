/**
 * Shared steel shapes database (AISC Shapes Database v16.0, SI units).
 * Built by tools/shapes/import_aisc_shapes.py; see data/provenance.json.
 * Data are loaded lazily: the compact index (~130 kB) on first search, and a
 * family file only when a shape of that family is selected. Reusable by the
 * Steel Column and Steel Beam modules.
 */
export type ShapeGroup = "I" | "C" | "L" | "T" | "HSS-RECT" | "HSS-ROUND";
export interface ShapeIndexRow {
  name: string;
  metric: string | null;
  type: string;
  group: ShapeGroup;
  /** I/C/T: d, bf, tf, tw · HSS rect: Ht, B, t, t · round: OD, OD, t, t · L: d, b, t, t (mm). */
  d: number;
  b: number;
  tf: number;
  tw: number;
  area: number;
  weight: number;
}
/** Full property record of one shape (mm, mm², mm³, mm⁴, mm⁶, kg/m). */
export interface ShapeRecord {
  name: string;
  metric: string | null;
  type: string;
  group: ShapeGroup;
  A: number;
  W: number;
  [property: string]: number | string | null;
}

export const shapeFamilies = [
  { id: "w", type: "W", label: "W", group: "I" },
  { id: "hp", type: "HP", label: "HP", group: "I" },
  { id: "m", type: "M", label: "M", group: "I" },
  { id: "s", type: "S", label: "S", group: "I" },
  { id: "hss", type: "HSS", label: "HSS rect/square", group: "HSS-RECT" },
  { id: "hss-r", type: "HSS", label: "HSS round", group: "HSS-ROUND" },
  { id: "pipe", type: "PIPE", label: "PIPE", group: "HSS-ROUND" },
  { id: "c", type: "C", label: "C", group: "C" },
  { id: "mc", type: "MC", label: "MC", group: "C" },
  { id: "l", type: "L", label: "L", group: "L" },
  { id: "wt", type: "WT", label: "WT", group: "T" },
  { id: "mt", type: "MT", label: "MT", group: "T" },
  { id: "st", type: "ST", label: "ST", group: "T" },
] as const;
export type ShapeFamilyId = (typeof shapeFamilies)[number]["id"];

const familyLoaders: Record<
  ShapeFamilyId,
  () => Promise<{ default: unknown }>
> = {
  w: () => import("./data/w.json"),
  hp: () => import("./data/hp.json"),
  m: () => import("./data/m.json"),
  s: () => import("./data/s.json"),
  hss: () => import("./data/hss.json"),
  "hss-r": () => import("./data/hss-r.json"),
  pipe: () => import("./data/pipe.json"),
  c: () => import("./data/c.json"),
  mc: () => import("./data/mc.json"),
  l: () => import("./data/l.json"),
  wt: () => import("./data/wt.json"),
  mt: () => import("./data/mt.json"),
  st: () => import("./data/st.json"),
};

let indexCache: Promise<ShapeIndexRow[]> | null = null;
export function loadShapeIndex(): Promise<ShapeIndexRow[]> {
  indexCache ??= import("./data/index.json").then((m) =>
    (m.default as unknown as (string | number | null)[][]).map((r) => ({
      name: r[0] as string,
      metric: (r[1] as string | null) ?? null,
      type: r[2] as string,
      group: r[3] as ShapeGroup,
      d: r[4] as number,
      b: r[5] as number,
      tf: r[6] as number,
      tw: r[7] as number,
      area: r[8] as number,
      weight: r[9] as number,
    })),
  );
  return indexCache;
}

/** Family file holding a shape (HSS round and rect share the AISC type "HSS"). */
export function shapeFamilyOf(
  row: Pick<ShapeIndexRow, "type" | "group">,
): ShapeFamilyId {
  const f = shapeFamilies.find(
    (x) => x.type === row.type && x.group === row.group,
  );
  return (f?.id ?? "w") as ShapeFamilyId;
}
const familyCache = new Map<ShapeFamilyId, Promise<ShapeRecord[]>>();
export function loadShapeFamily(id: ShapeFamilyId): Promise<ShapeRecord[]> {
  let p = familyCache.get(id);
  if (!p) {
    p = familyLoaders[id]().then((m) => m.default as ShapeRecord[]);
    familyCache.set(id, p);
  }
  return p;
}
export async function getShape(name: string): Promise<ShapeRecord | null> {
  const n = normalizeShapeName(name);
  const row = (await loadShapeIndex()).find(
    (r) =>
      normalizeShapeName(r.name) === n ||
      (r.metric && normalizeShapeName(r.metric) === n),
  );
  if (!row) return null;
  return (
    (await loadShapeFamily(shapeFamilyOf(row))).find(
      (s) => s.name === row.name,
    ) ?? null
  );
}

/** Upper-case, no spaces, "x"/"×" → "X" so "w12 x 40" matches "W12X40". */
export function normalizeShapeName(s: string) {
  return s.toUpperCase().replace(/[×*]/g, "X").replace(/\s+/g, "");
}
/**
 * Type-ahead search: prefix matches first (imperial, then metric alias), then
 * substring matches; each in database order (heaviest first within a family).
 */
export function searchShapes(
  rows: readonly ShapeIndexRow[],
  query: string,
  groups?: readonly ShapeGroup[],
  limit = 200,
) {
  const q = normalizeShapeName(query);
  const pool = groups?.length
    ? rows.filter((r) => groups.includes(r.group))
    : rows;
  if (!q) return pool.slice(0, limit);
  const prefix: ShapeIndexRow[] = [],
    alias: ShapeIndexRow[] = [],
    contains: ShapeIndexRow[] = [];
  for (const r of pool) {
    const n = normalizeShapeName(r.name),
      m = r.metric ? normalizeShapeName(r.metric) : "";
    if (n.startsWith(q)) prefix.push(r);
    else if (m.startsWith(q)) alias.push(r);
    else if (n.includes(q) || m.includes(q)) contains.push(r);
  }
  return [...prefix, ...alias, ...contains].slice(0, limit);
}
/** Key dimensions for display, mm. */
export function shapeDimensionLabel(r: ShapeIndexRow) {
  const f = (v: number) => (v >= 100 ? v.toFixed(0) : v.toFixed(1));
  if (r.group === "HSS-ROUND") return `OD ${f(r.d)} × t ${f(r.tf)}`;
  if (r.group === "HSS-RECT") return `${f(r.d)} × ${f(r.b)} × t ${f(r.tf)}`;
  if (r.group === "L") return `${f(r.d)} × ${f(r.b)} × ${f(r.tf)}`;
  return `d ${f(r.d)} · bf ${f(r.b)} · tf ${f(r.tf)} · tw ${f(r.tw)}`;
}
