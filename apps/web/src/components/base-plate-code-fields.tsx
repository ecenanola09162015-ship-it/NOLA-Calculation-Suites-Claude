"use client";
/**
 * Base plate panel 01: Concrete and Steel Primary Design Codes side by side,
 * the LRFD / ASD method (shared steel-module convention) and Other Codes.
 * Calculations stay on ACI 318-19 / AISC 360-22; NSCP 2015 is recorded as
 * the project standard.
 */
import {
  ASD_TO_STRENGTH_DEFAULT,
  steelDesignMethods,
  type BasePlateInput,
  type SteelDesignMethod,
} from "@nola/calc-core";

type Codes = Pick<
  BasePlateInput,
  "concreteCode" | "steelCode" | "designMethod" | "asdAlpha" | "otherCodes"
>;

export function BasePlateCodeFields<T extends Codes>({
  input,
  onChange,
}: {
  input: T;
  onChange: (next: T) => void;
}) {
  const nscp =
    input.concreteCode === "NSCP 2015" || input.steelCode === "NSCP 2015";
  const differ =
    (input.concreteCode === "NSCP 2015") !== (input.steelCode === "NSCP 2015");
  return (
    <div className="bpCodes">
      <div className="bpCodeRow">
        <label>
          Concrete Primary Design Code
          <select
            value={input.concreteCode}
            onChange={(e) =>
              onChange({
                ...input,
                concreteCode: e.target.value as T["concreteCode"],
              })
            }
          >
            <option value="ACI 318-19">ACI 318-19</option>
            <option value="NSCP 2015">
              NSCP 2015 project — ACI 318-19 calculation basis
            </option>
            <option disabled>ACI 318-14 — Future Development</option>
            <option disabled>EN 1992-4 (anchorage) — Future Development</option>
            <option disabled>AS 5216 / AS 3600 — Future Development</option>
          </select>
        </label>
        <label>
          Steel Primary Design Code
          <select
            value={input.steelCode}
            onChange={(e) =>
              onChange({
                ...input,
                steelCode: e.target.value as T["steelCode"],
              })
            }
          >
            <option value="AISC 360-22">
              AISC 360-22 + AISC Design Guide 1, 3rd Ed.
            </option>
            <option value="NSCP 2015">
              NSCP 2015 project — AISC 360-22 calculation basis
            </option>
            <option disabled>AISC 360-16 — Future Development</option>
            <option disabled>EN 1993-1-8 — Future Development</option>
            <option disabled>AS 4100 — Future Development</option>
            <option disabled>CSA S16 — Future Development</option>
          </select>
        </label>
      </div>
      <div className="bpCodeRow">
        <label>
          Steel Design Method
          <select
            value={input.designMethod}
            onChange={(e) =>
              onChange({
                ...input,
                designMethod: e.target.value as SteelDesignMethod,
              })
            }
          >
            {steelDesignMethods.map((m) => (
              <option key={m} value={m}>
                {m === "LRFD"
                  ? "LRFD — factored loads, φRn (B3.1)"
                  : "ASD — service loads, Rn/Ω (B3.2)"}
              </option>
            ))}
          </select>
        </label>
        {input.designMethod === "ASD" && (
          <label title="ACI 318 has no ASD provisions: anchor checks use α × ASD demand vs φRn">
            Anchor check factor α (ACI 318 strength level)
            <input
              type="number"
              step="0.05"
              min={1.4}
              max={2}
              value={Number.isFinite(input.asdAlpha) ? input.asdAlpha : ""}
              onChange={(e) =>
                onChange({
                  ...input,
                  asdAlpha:
                    e.target.value === "" ? NaN : Number(e.target.value),
                })
              }
            />
          </label>
        )}
      </div>
      {nscp && (
        <p className="rcAlert">
          Project standard: NSCP 2015. Calculation basis:{" "}
          {input.concreteCode === "NSCP 2015"
            ? "ACI 318-19 (concrete / anchorage)"
            : ""}
          {input.concreteCode === "NSCP 2015" && input.steelCode === "NSCP 2015"
            ? " and "
            : ""}
          {input.steelCode === "NSCP 2015" ? "AISC 360-22 + DG1 (steel)" : ""}.
          This does not confirm compliance with every NSCP 2015 provision (Sec.
          417 / 510 are ACI 318-14 / AISC 360-10 based).
        </p>
      )}
      {differ && (
        <p className="slabMuted">
          Concrete and steel primary codes differ; confirm the project's code
          basis.
        </p>
      )}
      {input.designMethod === "ASD" && (
        <p className="slabMuted">
          ASD: enter service-level (ASD) combinations. Steel checks use Rn/Ω;
          ACI 318-19 anchor checks use{" "}
          {input.asdAlpha || ASD_TO_STRENGTH_DEFAULT} × ASD demand vs φRn.
        </p>
      )}
      <label className="bpWideLabel">
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
        *Documentation only — does not change the Primary Design Codes.
      </p>
    </div>
  );
}
