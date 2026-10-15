"use client";
/**
 * Panel 01 blocks shared by Column and Slab (decision sheets 14–15 Oct 2026):
 * Primary Design Code, Other Codes (documentation only). Concrete f′c:
 * concrete-strength-fields.tsx.
 */
type DesignCode = "ACI 318-19" | "NSCP 2015";
type CodeInput = { code: DesignCode; otherCodes?: string };

export function DesignCodeFields<T extends CodeInput>({
  input,
  onChange,
  engine = "section-strength",
}: {
  input: T;
  onChange: (next: T) => void;
  /** Wording of the NSCP note ("section-strength" column, "slab" slab). */
  engine?: "section-strength" | "slab";
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
              code: e.target.value as DesignCode,
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
          option uses the same ACI{" "}
          {engine === "slab" ? "slab design" : "section-strength"} engine; it
          does not confirm compliance with every NSCP 2015 provision.
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
