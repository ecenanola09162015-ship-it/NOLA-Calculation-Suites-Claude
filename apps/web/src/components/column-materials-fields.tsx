"use client";
/**
 * Panel 01 blocks (user decision sheet, 14 Oct 2026): Primary Design Code,
 * Other Codes (documentation only) and Concrete Strength (psi → MPa).
 */
import { useState } from "react";
import {
  CONCRETE_PSI_OPTIONS,
  fcFromPsi,
  psiFromMpa,
  type RectangularColumnInput,
} from "@nola/calc-core";

/** Dropdown value shown for a stored strength (D18). */
export function concretePsiState(input: Pick<RectangularColumnInput, "fc" | "fcPsi">) {
  const psi = input.fcPsi ?? psiFromMpa(input.fc);
  // A listed option whose 0.1 MPa value equals the stored fc is shown as that option.
  const listed = (CONCRETE_PSI_OPTIONS as readonly number[]).find((p) =>
    input.fcPsi != null ? p === input.fcPsi : fcFromPsi(p) === input.fc,
  );
  return { psi: listed ?? psi, option: listed ?? ("custom" as const) };
}

export function DesignCodeFields({
  input,
  onChange,
}: {
  input: RectangularColumnInput;
  onChange: (next: RectangularColumnInput) => void;
}) {
  return (
    <div className="rcCodeBlock">
      <label>
        Primary Design Code
        <select
          value={input.code}
          onChange={(e) =>
            onChange({
              ...input,
              code: e.target.value as RectangularColumnInput["code"],
            })
          }
        >
          <option>ACI 318-19</option>
          <option value="NSCP 2015">
            NSCP 2015 project — ACI 318-19 calculation basis
          </option>
          <option disabled>BS EN 1992 — Future Development</option>
          <option disabled>AS 3600 — Future Development</option>
        </select>
      </label>
      {input.code === "NSCP 2015" && (
        <p className="rcAlert">
          Project standard: NSCP 2015. Calculation basis: ACI 318-19. This
          option uses the same ACI section-strength engine; it does not confirm
          compliance with every NSCP 2015 provision.
        </p>
      )}
      <label>
        Other Codes*
        <input
          type="text"
          maxLength={300}
          placeholder="e.g. NSCP 2015; ASCE 7-16"
          value={input.otherCodes ?? ""}
          onChange={(e) => onChange({ ...input, otherCodes: e.target.value })}
        />
      </label>
      <p className="rcMuted rcCodeNote">
        *Documentation only — does not change the Primary Design Code.
      </p>
    </div>
  );
}

export function ConcreteStrengthFields({
  input,
  onChange,
}: {
  input: RectangularColumnInput;
  onChange: (next: RectangularColumnInput) => void;
}) {
  const state = concretePsiState(input);
  // "Custom" stays selected while typing, even when a listed value is typed.
  const [custom, setCustom] = useState(state.option === "custom");
  const setPsi = (psi: number) =>
    onChange({
      ...input,
      fcPsi: Number.isFinite(psi) ? psi : null,
      fc: Number.isFinite(psi) ? fcFromPsi(psi) : NaN,
    });
  return (
    <div className="rcFields rcSteelPairs">
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
          {CONCRETE_PSI_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {p.toLocaleString("en-US")} psi
            </option>
          ))}
          <option value="custom">Custom (type psi)</option>
        </select>
        {custom && (
          <input
            type="number"
            step="any"
            min={2000}
            max={12000}
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
          value={
            !Number.isFinite(input.fc)
              ? ""
              : Math.abs(input.fc * 10 - Math.round(input.fc * 10)) < 1e-9
                ? input.fc.toFixed(1)
                : String(input.fc) // older draft typed in MPa: shown as stored
          }
        />
        <small className="rcMuted">
          Calculation value: psi × 0.006894757, rounded to 0.1 MPa
        </small>
      </label>
    </div>
  );
}
