import type { ColumnLoad } from "./rectangular-column";
function numeric(text: string, row: number, column: string) {
  const raw = text.trim().replace(/^\((.*)\)$/, "-$1");
  if (
    raw.includes(",") &&
    !/^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d*)?(?:e[+-]?\d+)?$/i.test(raw)
  )
    throw new Error(
      `Row ${row}, ${column}: use a decimal point and valid thousands grouping.`,
    );
  const clean = raw
    .trim()
    .replace(/,/g, "")
    .replace(/^\((.*)\)$/, "-$1");
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(clean))
    throw new Error(
      `Row ${row}, ${column}: “${text}” is not a number. No loads were replaced.`,
    );
  const value = Number(clean);
  if (!Number.isFinite(value))
    throw new Error(`Row ${row}, ${column}: value is not finite.`);
  return value;
}
/**
 * Excel clipboard: Pu/Mux/Muy; label/Pu/Mux/Muy; or LC No/Description/Pu/Mux/Muy/[Include].
 * With headers, optional Vux/Vuy (or ETABS V2/V3), M1x/M1y, and M2/M3 for
 * Mux/Muy are read (ETABS default column orientation, local 2 = global X).
 */
export function parseColumnLoads(text: string): ColumnLoad[] {
  const rows = text
    .replace(/\r/g, "")
    .split("\n")
    .filter((row) => row.trim())
    .map((row) => row.split("\t").map((cell) => cell.trim()));
  if (!rows.length) throw new Error("Paste cells copied from Excel first.");
  const normalize = (value: string) =>
    value.toLowerCase().replace(/[^a-z]/g, "");
  const header = rows[0]!.map(normalize);
  // Keeps digits so ETABS V2/V3/M2/M3 headers survive.
  const header2 = rows[0]!.map((v) =>
    v
      .toLowerCase()
      .replace(/\(.*\)/g, "")
      .replace(/[^a-z0-9]/g, ""),
  );
  const optional = (...names: string[]) =>
    header2.findIndex((v) => names.includes(v));
  const pi = header.findIndex(
    (value) => value === "pu" || value.startsWith("pukn"),
  );
  const m2 = optional("m2");
  const m3 = optional("m3");
  let xi = header.findIndex(
    (value) =>
      value === "mux" ||
      value === "mx" ||
      value.startsWith("muxkn") ||
      value.startsWith("mxkn"),
  );
  let yi = header.findIndex(
    (value) =>
      value === "muy" ||
      value === "my" ||
      value.startsWith("muykn") ||
      value.startsWith("mykn"),
  );
  // ETABS default column axes (local 2 = global X): M2 → Mux, M3 → Muy.
  if (xi < 0 && m2 >= 0) xi = m2;
  if (yi < 0 && m3 >= 0) yi = m3;
  const hasHeader = pi >= 0 && xi >= 0 && yi >= 0;
  // V2 acts along local 2 (X) and pairs with M3; V3 along Y pairs with M2.
  const vxi = hasHeader ? optional("vux", "vx", "v2", "vuxkn", "vxkn") : -1;
  const vyi = hasHeader ? optional("vuy", "vy", "v3", "vuykn", "vykn") : -1;
  const m1xi = hasHeader ? optional("m1x", "m1xkn", "m1xknm") : -1;
  const m1yi = hasHeader ? optional("m1y", "m1ykn", "m1yknm") : -1;
  const opt = (row: string[], i: number, label: string, n: number) =>
    i >= 0 && (row[i] ?? "").trim() !== ""
      ? numeric(row[i]!, n, label)
      : undefined;
  const data = hasHeader ? rows.slice(1) : rows;
  if (!data.length || data.length > 500)
    throw new Error("Paste 1–500 load combinations.");
  const idIndex = header.findIndex((value) =>
    ["lcno", "id", "combo", "combination", "lc"].includes(value),
  );
  const descIndex = header.findIndex((value) =>
    ["description", "name", "label"].includes(value),
  );
  const incIndex = header.findIndex((value) =>
    ["include", "included", "active"].includes(value),
  );
  const loads = data.map((row, index) => {
    const pu = hasHeader ? pi : row.length >= 5 ? 2 : row.length === 4 ? 1 : 0;
    const mx = hasHeader ? xi : pu + 1,
      my = hasHeader ? yi : pu + 2;
    if (row.length < 3 || Math.max(pu, mx, my) >= row.length)
      throw new Error(`Row ${index + 1}: expected Pu, Mux and Muy columns.`);
    const labelIndex = hasHeader ? idIndex : row.length >= 4 ? 0 : -1;
    const includeIndex = hasHeader ? incIndex : row.length >= 6 ? 5 : -1;
    const flag =
      includeIndex >= 0 ? (row[includeIndex] ?? "").toLowerCase() : "yes";
    if (flag && !["yes", "no", "true", "false", "1", "0"].includes(flag))
      throw new Error(`Row ${index + 1}: Include must be Yes or No.`);
    return {
      id:
        labelIndex >= 0
          ? row[labelIndex] || `LC${index + 1}`
          : `LC${index + 1}`,
      description: hasHeader
        ? descIndex >= 0
          ? (row[descIndex] ?? "")
          : ""
        : row.length >= 5
          ? (row[1] ?? "")
          : "",
      pu: numeric(row[pu]!, index + 1, "Pu"),
      mx: numeric(row[mx]!, index + 1, "Mux"),
      my: numeric(row[my]!, index + 1, "Muy"),
      included: !["no", "false", "0"].includes(flag),
      ...(vxi >= 0 ? { vx: opt(row, vxi, "Vux", index + 1) ?? null } : {}),
      ...(vyi >= 0 ? { vy: opt(row, vyi, "Vuy", index + 1) ?? null } : {}),
      ...(m1xi >= 0 ? { m1x: opt(row, m1xi, "M1x", index + 1) ?? null } : {}),
      ...(m1yi >= 0 ? { m1y: opt(row, m1yi, "M1y", index + 1) ?? null } : {}),
    };
  });
  if (new Set(loads.map((load) => load.id)).size !== loads.length)
    throw new Error(
      "Combination labels must be unique. Rename duplicate labels before importing.",
    );
  return loads;
}
