"use client";
/**
 * Panel 01 blocks shared by Column, Slab and Retaining Wall: Primary Design
 * Code (shared catalogue, design-code-select.tsx; 17 Oct 2026) and Other
 * Codes (documentation only). Concrete f′c: concrete-strength-fields.tsx.
 */
import type { ConcreteDesignCode } from "@nola/calc-core";
import { DesignCodeSelect } from "./design-code-select";

type CodeInput = { code: ConcreteDesignCode; otherCodes?: string };

export function DesignCodeFields<T extends CodeInput>({
  input,
  onChange,
}: {
  input: T;
  onChange: (next: T) => void;
}) {
  return (
    <div className="rcCodeBlock">
      <DesignCodeSelect
        discipline="concrete"
        value={input.code}
        onChange={(code) => onChange({ ...input, code })}
      />
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
