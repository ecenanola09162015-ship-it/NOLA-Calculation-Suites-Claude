"use client";
/**
 * Catalogue dropdowns for bar sizes and steel grades (PNS 49 / ASTM) with a
 * "Custom…" override. Values stay numeric (mm, MPa) so saved drafts and the
 * engines are unchanged; custom values are flagged.
 */
import { useState } from "react";
import {
  rebarGradeFor,
  rebarGrades,
  rebarSizeFor,
  rebarSizes,
  rebarStandards,
  type RebarStandard,
} from "@nola/calc-core";

const CUSTOM = "custom";

export function RebarStandardSelect({
  value,
  onChange,
  disabled,
}: {
  value: RebarStandard;
  onChange: (v: RebarStandard) => void;
  disabled?: boolean;
}) {
  return (
    <label>
      Rebar standard
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as RebarStandard)}
      >
        {rebarStandards.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Wrap({
  label,
  unit,
  children,
}: {
  label?: string;
  unit?: string;
  children: React.ReactNode;
}) {
  return label ? (
    <label>
      {label}
      {unit && <span className="rcUnit">{unit}</span>}
      {children}
    </label>
  ) : (
    <span className="rebarSelect">{children}</span>
  );
}

export function RebarSizeSelect({
  standard,
  value,
  onChange,
  label,
  ariaLabel,
  disabled,
  min = 0,
  max = Infinity,
}: {
  standard: RebarStandard;
  /** Engine diameter, mm. */
  value: number;
  onChange: (diameter: number) => void;
  label?: string;
  ariaLabel?: string;
  disabled?: boolean;
  min?: number;
  max?: number;
}) {
  const match = Number.isFinite(value) ? rebarSizeFor(standard, value) : null;
  const [forced, setForced] = useState(false);
  const custom = forced || !match;
  return (
    <Wrap label={label} unit={label ? "mm" : undefined}>
      <select
        aria-label={ariaLabel ?? label}
        disabled={disabled}
        value={custom ? CUSTOM : match!.label}
        onChange={(e) => {
          if (e.target.value === CUSTOM) return setForced(true);
          const s = rebarSizes[standard].find(
            (x) => x.label === e.target.value,
          );
          if (s) {
            setForced(false);
            onChange(s.calcDiameter);
          }
        }}
      >
        {rebarSizes[standard].map((s) => {
          const out = s.calcDiameter < min || s.calcDiameter > max;
          return (
            <option key={s.label} value={s.label} disabled={out}>
              {standard === "ASTM"
                ? `${s.label} (${s.nominal} mm, ${s.area} mm²)`
                : `${s.label} (${s.nominal} mm)`}
              {out ? " — not supported here" : ""}
            </option>
          );
        })}
        <option value={CUSTOM}>Custom…</option>
      </select>
      {custom ? (
        <span className="rebarCustom">
          <input
            type="number"
            step="any"
            aria-label={`${ariaLabel ?? label ?? "Bar"} custom diameter (mm)`}
            disabled={disabled}
            value={Number.isFinite(value) ? value : ""}
            onChange={(e) =>
              onChange(e.target.value === "" ? NaN : Number(e.target.value))
            }
          />
          <em className="customBadge">Custom</em>
        </span>
      ) : null}
    </Wrap>
  );
}

export function RebarGradeSelect({
  standard,
  fy,
  gradeId,
  onChange,
  label,
  ariaLabel,
  disabled,
  maxFy = Infinity,
}: {
  standard: RebarStandard;
  fy: number;
  gradeId?: string | null;
  onChange: (fy: number, gradeId: string | null) => void;
  label?: string;
  ariaLabel?: string;
  disabled?: boolean;
  maxFy?: number;
}) {
  const match = Number.isFinite(fy)
    ? rebarGradeFor(standard, fy, gradeId)
    : null;
  const inStandard = match?.standard === standard ? match : null;
  const [forced, setForced] = useState(false);
  const custom = forced || !inStandard;
  return (
    <Wrap label={label} unit={label ? "MPa" : undefined}>
      <select
        aria-label={ariaLabel ?? label}
        disabled={disabled}
        value={custom ? CUSTOM : inStandard!.id}
        onChange={(e) => {
          if (e.target.value === CUSTOM) return setForced(true);
          const g = rebarGrades[standard].find((x) => x.id === e.target.value);
          if (g) {
            setForced(false);
            onChange(g.fy, g.id);
          }
        }}
      >
        {rebarGrades[standard].map((g) => {
          const out = g.fy > maxFy;
          return (
            <option key={g.id} value={g.id} disabled={out}>
              {g.label} · fy {g.fy}
              {g.fyMax ? ` (max ${g.fyMax})` : ""}
              {g.weldable ? " · weldable" : ""}
              {out ? " — not supported here" : ""}
            </option>
          );
        })}
        <option value={CUSTOM}>Custom…</option>
      </select>
      {custom ? (
        <span className="rebarCustom">
          <input
            type="number"
            step="any"
            aria-label={`${ariaLabel ?? label ?? "Steel"} custom fy (MPa)`}
            disabled={disabled}
            value={Number.isFinite(fy) ? fy : ""}
            onChange={(e) =>
              onChange(
                e.target.value === "" ? NaN : Number(e.target.value),
                null,
              )
            }
          />
          <em className="customBadge">Custom</em>
        </span>
      ) : null}
    </Wrap>
  );
}
