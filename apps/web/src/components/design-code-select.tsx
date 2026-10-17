"use client";
/**
 * Shared "Primary Design Code" dropdown. Options come from the calc-core
 * design-code catalogue: active codes are selectable, future codes are shown
 * disabled as "— Future Development". Do not list codes in module workspaces.
 */
import {
  designCodeOptions,
  type ActiveDesignCode,
  type CodeDiscipline,
} from "@nola/calc-core";

export function DesignCodeSelect<D extends CodeDiscipline>({
  discipline,
  value,
  onChange,
  label = "Primary Design Code",
  labels,
  className,
}: {
  discipline: D;
  value: ActiveDesignCode<D>;
  onChange: (code: ActiveDesignCode<D>) => void;
  label?: string;
  /** Per-module wording for an option, e.g. AISC 360-22 + DG1 in Base Plate. */
  labels?: Partial<Record<string, string>>;
  className?: string;
}) {
  const options = designCodeOptions(discipline);
  return (
    <label className={className}>
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as ActiveDesignCode<D>)}
      >
        {options.map((c) =>
          c.status === "active" ? (
            <option key={c.id} value={c.id}>
              {labels?.[c.id] ?? c.label}
            </option>
          ) : (
            <option key={c.id} value={`future:${c.id}`} disabled>
              {labels?.[c.id] ?? c.label} — Future Development
            </option>
          ),
        )}
      </select>
    </label>
  );
}
