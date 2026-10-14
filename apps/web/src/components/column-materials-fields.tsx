"use client";
/**
 * Panel 01 blocks (user decision sheet, 14 Oct 2026): Primary Design Code,
 * Other Codes (documentation only). Concrete f′c: concrete-strength-fields.tsx.
 */
import type { RectangularColumnInput } from "@nola/calc-core";

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
