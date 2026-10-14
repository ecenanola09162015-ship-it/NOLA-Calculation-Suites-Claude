"use client";
/**
 * Concrete f′c, shared by Column and Slab (decision sheet F1–F10, 14 Oct
 * 2026): psi dropdown on the left (1000–15000 psi, 500 psi steps, + Custom
 * typed in psi), read-only MPa on the right (psi × 0.006894757 rounded to
 * 0.1 MPa). Code notes are shown under the fields; nothing is blocked.
 */
import { useState } from "react";
import {
  CONCRETE_PSI_OPTIONS,
  PSI_MAX,
  PSI_MIN,
  concreteStrengthNotes,
  fcFromPsi,
  psiFromMpa,
  psiToMpaExact,
} from "@nola/calc-core";

export type ConcreteStrength = { fc: number; fcPsi?: number | null };

/** Dropdown value shown for a stored strength (old drafts open unchanged). */
export function concretePsiState(v: ConcreteStrength) {
  const listed = CONCRETE_PSI_OPTIONS.find((p) =>
    v.fcPsi != null
      ? p === v.fcPsi
      : fcFromPsi(p) === v.fc || Math.abs(psiToMpaExact(p) - v.fc) < 0.005,
  );
  const psi = v.fcPsi ?? listed ?? psiFromMpa(v.fc);
  return { psi, option: listed ?? ("custom" as const) };
}

const mpaText = (fc: number) =>
  !Number.isFinite(fc)
    ? ""
    : Math.abs(fc * 10 - Math.round(fc * 10)) < 1e-9
      ? fc.toFixed(1)
      : fc.toFixed(2); // older draft stored in MPa: shown as stored

export function ConcreteStrengthFields({
  value,
  onChange,
  smf = false,
}: {
  value: ConcreteStrength;
  onChange: (next: { fc: number; fcPsi: number | null }) => void;
  /** Column with special-moment-frame confinement (21 MPa minimum). */
  smf?: boolean;
}) {
  const state = concretePsiState(value);
  // "Custom" stays selected while typing, even when a listed value is typed.
  const [custom, setCustom] = useState(state.option === "custom");
  const setPsi = (psi: number) =>
    onChange({
      fcPsi: Number.isFinite(psi) ? psi : null,
      fc: Number.isFinite(psi) ? fcFromPsi(psi) : NaN,
    });
  const notes = concreteStrengthNotes(value.fc, { smf });
  const outOfRange =
    custom && Number.isFinite(state.psi) && (state.psi < PSI_MIN || state.psi > PSI_MAX);
  return (
    <div className="fcPair">
      <label>
        Concrete f′c
        <span className="rcUnit">psi</span>
        <select
          aria-label="Concrete f′c (psi)"
          value={custom ? "custom" : String(state.option)}
          onChange={(e) => {
            if (e.target.value === "custom") return setCustom(true);
            setCustom(false);
            setPsi(Number(e.target.value));
          }}
        >
          {CONCRETE_PSI_OPTIONS.map((p) => {
            // First note's tag marks the option (warning before caution / info).
            const tag = concreteStrengthNotes(fcFromPsi(p), { smf })[0]?.tag;
            return (
              <option key={p} value={p}>
                {p.toLocaleString("en-US")} psi
                {tag ? ` — ${tag}` : ""}
              </option>
            );
          })}
          <option value="custom">Custom (type psi)</option>
        </select>
        {custom && (
          <input
            type="number"
            step="any"
            min={PSI_MIN}
            max={PSI_MAX}
            aria-label="Custom concrete f′c (psi)"
            value={Number.isFinite(state.psi) ? state.psi : ""}
            onChange={(e) =>
              setPsi(e.target.value === "" ? NaN : Number(e.target.value))
            }
          />
        )}
      </label>
      <label>
        Concrete f′c
        <span className="rcUnit">MPa</span>
        <input
          type="text"
          readOnly
          aria-readonly="true"
          className="rcDerived"
          value={mpaText(value.fc)}
        />
        <small className="rcMuted">
          psi × 0.006894757, rounded to 0.1 MPa
        </small>
      </label>
      {(notes.length > 0 || outOfRange) && (
        <ul className="fcNotes">
          {outOfRange && (
            <li className="fcNote warning">
              Enter 1,000–15,000 psi (6.9–103.4 MPa).
            </li>
          )}
          {notes.map((n) => (
            <li key={n.text} className={`fcNote ${n.level}`}>
              {n.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
