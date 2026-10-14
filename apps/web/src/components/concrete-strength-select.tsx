"use client";
/**
 * Concrete f′c picker: psi catalogue (1000–15000 psi, 500 psi steps) with the
 * exact MPa equivalent, plus "Custom (MPa)". The engine value stays in MPa
 * (exact conversion, 1 psi = 0.00689476 MPa), so saved drafts are unchanged.
 */
import { Fragment, useState } from "react";

export const PSI_TO_MPA = 0.00689476;
/** ACI 318-19 Table 19.2.1.1 minimum for structural concrete. */
export const FC_CODE_MIN = 17;
export const psiOptions = Array.from({ length: 29 }, (_, k) => 1000 + 500 * k);
export const psiToMpa = (psi: number) => psi * PSI_TO_MPA;
export const mpaToPsi = (mpa: number) => mpa / PSI_TO_MPA;
const fmt2 = (n: number) => n.toFixed(2);
const CUSTOM = "custom";

/** Catalogue psi value matching an MPa value (to 0.005 MPa), else null. */
export function matchPsi(mpa: number) {
  if (!Number.isFinite(mpa)) return null;
  return psiOptions.find((p) => Math.abs(psiToMpa(p) - mpa) < 0.005) ?? null;
}

export function ConcreteStrengthSelect({
  value,
  onChange,
  label = "Concrete f′c",
  layout = "slab",
  minMpa = 0,
  maxMpa = Infinity,
  disabled,
}: {
  /** f′c, MPa. */
  value: number;
  onChange: (mpa: number) => void;
  label?: string;
  /** Label markup of the host form (slab: "(unit)" small text; rc: unit chip). */
  layout?: "slab" | "rc";
  /** Engine limits: catalogue entries outside are not offered. */
  minMpa?: number;
  maxMpa?: number;
  disabled?: boolean;
}) {
  const options = psiOptions.filter((p) => {
    const m = psiToMpa(p);
    return m >= minMpa - 1e-9 && m <= maxMpa + 1e-9;
  });
  const matched = matchPsi(value);
  const [forceCustom, setForceCustom] = useState(false);
  const custom = forceCustom || matched === null || !options.includes(matched);
  const caption =
    layout === "slab" ? (
      <span>
        {label} <small>(psi / MPa)</small>
      </span>
    ) : (
      <>
        {label}
        <span className="rcUnit">psi / MPa</span>
      </>
    );
  const warnings = [
    Number.isFinite(value) && value < FC_CODE_MIN
      ? "Below 17 MPa (ACI 318-19 Table 19.2.1.1 minimum for structural concrete) — allowed for assessment only."
      : "",
    Number.isFinite(value) &&
    Number.isFinite(maxMpa) &&
    (value < minMpa || value > maxMpa)
      ? `Outside this module's range ${fmt2(minMpa)}–${fmt2(maxMpa)} MPa.`
      : "",
  ].filter(Boolean);
  // Slab: one grid cell; column (rc grid): select and custom entry are cells.
  const Box = layout === "slab" ? "div" : Fragment;
  const boxProps = layout === "slab" ? { className: "fcSelect" } : {};
  return (
    <Box {...boxProps}>
      <label className={layout === "slab" ? "slabNumeric" : undefined}>
        {caption}
        <select
          aria-label={`${label} (psi)`}
          disabled={disabled}
          value={custom ? CUSTOM : String(matched)}
          onChange={(e) => {
            if (e.target.value === CUSTOM) {
              setForceCustom(true);
              return;
            }
            setForceCustom(false);
            onChange(psiToMpa(Number(e.target.value)));
          }}
        >
          {options.map((p) => (
            <option key={p} value={p}>
              {p.toLocaleString("en-US")} psi = {fmt2(psiToMpa(p))} MPa
              {psiToMpa(p) < FC_CODE_MIN ? " (< 17 MPa)" : ""}
            </option>
          ))}
          <option value={CUSTOM}>Custom (MPa)…</option>
        </select>
      </label>
      {custom && (
        <label className={`fcCustom ${layout === "slab" ? "slabNumeric" : ""}`}>
          {layout === "slab" ? (
            <span>
              Custom f′c <small>(MPa)</small>
            </span>
          ) : (
            <>
              Custom f′c
              <span className="rcUnit">MPa</span>
            </>
          )}
          <input
            type="number"
            step="any"
            aria-label={`${label} custom (MPa)`}
            disabled={disabled}
            value={Number.isFinite(value) ? value : ""}
            onChange={(e) =>
              onChange(e.target.value === "" ? NaN : Number(e.target.value))
            }
          />
          <small className="fcEquivalent">
            = {Number.isFinite(value) ? Math.round(mpaToPsi(value)) : "—"} psi
          </small>
        </label>
      )}
      {warnings.map((w) => (
        <small key={w} className="fcWarning" role="note">
          {w}
        </small>
      ))}
    </Box>
  );
}
