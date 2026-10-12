/** Shared field helpers for the RC column panels. */
export const fmt = (n: number | null | undefined, places = 2) =>
  n === null || n === undefined || !Number.isFinite(n)
    ? "—"
    : n.toLocaleString("en-US", {
        maximumFractionDigits: places,
        minimumFractionDigits: places,
      });
export function NumberField({
  label,
  value,
  onChange,
  unit,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  unit?: string;
  disabled?: boolean;
}) {
  return (
    <label>
      {label}
      {unit && <span className="rcUnit">{unit}</span>}
      <input
        type="number"
        step="any"
        disabled={disabled}
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) =>
          onChange(e.target.value === "" ? NaN : Number(e.target.value))
        }
      />
    </label>
  );
}
