"use client";
/**
 * Base plate panel 01: Concrete and Steel Primary Design Codes side by side,
 * the LRFD / ASD method (shared steel-module convention) and Other Codes.
 * Code lists come from the shared catalogue (design-code-select.tsx,
 * 17 Oct 2026): concrete ACI 318-19, steel AISC 360-22 + DG1.
 */
import {
  ASD_TO_STRENGTH_DEFAULT,
  steelDesignMethods,
  type BasePlateInput,
  type SteelDesignMethod,
} from "@nola/calc-core";
import { DesignCodeSelect } from "./design-code-select";

type Codes = Pick<
  BasePlateInput,
  | "concreteCode"
  | "steelCode"
  | "designMethod"
  | "asdAlpha"
  | "asdAnchorBasis"
  | "otherCodes"
>;

export function BasePlateCodeFields<T extends Codes>({
  input,
  onChange,
}: {
  input: T;
  onChange: (next: T) => void;
}) {
  return (
    <div className="bpCodes">
      <div className="bpCodeRow">
        <DesignCodeSelect
          discipline="concrete"
          label="Concrete Primary Design Code"
          value={input.concreteCode}
          onChange={(concreteCode) => onChange({ ...input, concreteCode })}
        />
        <DesignCodeSelect
          discipline="steel"
          label="Steel Primary Design Code"
          labels={{
            "AISC 360-22": "AISC 360-22 + AISC Design Guide 1, 3rd Ed.",
          }}
          value={input.steelCode}
          onChange={(steelCode) => onChange({ ...input, steelCode })}
        />
      </div>
      <div className="bpCodeRow">
        <label>
          Steel Design Method
          <select
            value={input.designMethod}
            onChange={(e) => {
              const m = e.target.value as SteelDesignMethod;
              // Switching to ASD: ACI checks default to LRFD combinations.
              onChange({
                ...input,
                designMethod: m,
                ...(m === "ASD" && input.designMethod !== "ASD"
                  ? { asdAnchorBasis: "lrfd" as T["asdAnchorBasis"] }
                  : {}),
              });
            }}
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
          <label title="ACI 318 has no ASD provisions">
            ACI 318 checks (anchors, friction, lug concrete)
            <select
              value={input.asdAnchorBasis}
              onChange={(e) =>
                onChange({
                  ...input,
                  asdAnchorBasis: e.target.value as T["asdAnchorBasis"],
                })
              }
            >
              <option value="lrfd">
                LRFD combinations (DG1 practice, recommended)
              </option>
              <option value="alpha">α × ASD demand</option>
            </select>
          </label>
        )}
        {input.designMethod === "ASD" && input.asdAnchorBasis === "alpha" && (
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
      {input.designMethod === "ASD" && (
        <p className="slabMuted">
          ASD: enter service-level (ASD) combinations. Steel checks use Rn/Ω;
          ACI 318-19 anchor checks use{" "}
          {input.asdAnchorBasis === "lrfd"
            ? "the LRFD combinations entered under Calculations & loads."
            : `${input.asdAlpha || ASD_TO_STRENGTH_DEFAULT} × ASD demand vs φRn.`}
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
