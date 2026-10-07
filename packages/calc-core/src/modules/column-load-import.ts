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
/** Excel clipboard: Pu/Mux/Muy; label/Pu/Mux/Muy; or LC No/Description/Pu/Mux/Muy/[Include]. */
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
  const pi = header.findIndex(
    (value) => value === "pu" || value.startsWith("pukn"),
  );
  const xi = header.findIndex(
    (value) =>
      value === "mux" ||
      value === "mx" ||
      value.startsWith("muxkn") ||
      value.startsWith("mxkn"),
  );
  const yi = header.findIndex(
    (value) =>
      value === "muy" ||
      value === "my" ||
      value.startsWith("muykn") ||
      value.startsWith("mykn"),
  );
  const hasHeader = pi >= 0 && xi >= 0 && yi >= 0;
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
    };
  });
  if (new Set(loads.map((load) => load.id)).size !== loads.length)
    throw new Error(
      "Combination labels must be unique. Rename duplicate labels before importing.",
    );
  return loads;
}
