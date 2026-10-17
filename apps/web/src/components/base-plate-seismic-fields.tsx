"use client";
/**
 * Base plate seismic design (engine 0.5.0). Off until the user activates it:
 * the panel first lists what will be applied, then shows SDC, base type
 * (AISC 341-22 D2.6), column Ry, ACI 17.10 option and the weak-base UT rod.
 */
import { useState } from "react";
import {
  columnRyGrades,
  seismicAciOption,
  type BasePlateInput,
} from "@nola/calc-core";

type Seismic = BasePlateInput["seismic"];
const IN = 25.4;

function Num({
  label,
  value,
  onChange,
  unit = "mm",
  title,
  step = "any",
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  unit?: string;
  title?: string;
  step?: string;
}) {
  return (
    <label className="slabNumeric" title={title}>
      <span>
        {label} {unit && <small>({unit})</small>}
      </span>
      <input
        type="number"
        step={step}
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) =>
          onChange(e.target.value === "" ? NaN : Number(e.target.value))
        }
      />
    </label>
  );
}

const baseTypes: { id: Seismic["baseType"]; label: string; note: string }[] = [
  {
    id: "general",
    label: "Not part of the SFRS / R = 3 — ACI 17.10 only",
    note: "E combinations get ACI 318-19 17.10; enter AISC 341 demands yourself.",
  },
  {
    id: "braced",
    label: "Braced frame — strong base (DG1 6.5)",
    note: "Chapter 4 force-based design with the E combinations.",
  },
  {
    id: "strong",
    label: "Moment frame — strong base (AISC 341 D2.6c(a))",
    note: "Each E combination is also checked with M = 1.1 Ry Fy Z / αs.",
  },
  {
    id: "weak",
    label: "Moment frame — weak base, yielding rods (D2.6c(b), DG1 6.4.2)",
    note: "UT rods yield; concrete and plate for Rt × Treduced; shear lug required.",
  },
];

export function BasePlateSeismicFields({
  input,
  onChange,
}: {
  input: BasePlateInput;
  onChange: (next: BasePlateInput) => void;
}) {
  const s = input.seismic;
  const [confirming, setConfirming] = useState(false);
  const set = (patch: Partial<Seismic>) =>
    onChange({ ...input, seismic: { ...s, ...patch } });
  if (!s.active)
    return (
      <div className="bpSeismic" data-state="off">
        <p className="slabMuted">
          Seismic design is off: no SDC, earthquake (E) flags, ACI 318-19 17.10
          or AISC 341 checks are applied.
        </p>
        {!confirming ? (
          <button
            type="button"
            className="suiteSecondary"
            onClick={() => setConfirming(true)}
          >
            Activate seismic design
          </button>
        ) : (
          <div
            className="bpSeismicConfirm"
            role="dialog"
            aria-label="Activate seismic design"
          >
            <strong>Activating seismic design will:</strong>
            <ul>
              <li>
                show the E column in the load tables and apply ACI 318-19 17.10
                to E combinations in SDC C–F;
              </li>
              <li>
                exclude friction from E combinations (ASCE 7 Ch. 13/15, DG1
                4.3.5);
              </li>
              <li>
                offer AISC 341-22 D2.6 base types: braced, strong base (1.1 Ry
                Fy Z) or weak base with ductile UT rods (DG1 6.4.2);
              </li>
              <li>
                with ASD, run the seismic and ACI checks on the LRFD
                combinations (DG1 Ch. 6 is LRFD).
              </li>
            </ul>
            <button
              type="button"
              className="suitePrimary"
              onClick={() => {
                setConfirming(false);
                onChange({
                  ...input,
                  seismic: { ...s, active: true },
                  ...(input.designMethod === "ASD"
                    ? { asdAnchorBasis: "lrfd" as const }
                    : {}),
                });
              }}
            >
              Activate
            </button>{" "}
            <button
              type="button"
              className="suiteSecondary"
              onClick={() => setConfirming(false)}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    );
  const high = ["C", "D", "E", "F"].includes(s.sdc);
  const bt = baseTypes.find((b) => b.id === s.baseType)!;
  const grade = columnRyGrades.find((g) => g.label === s.columnGrade);
  return (
    <div className="bpSeismic" data-state="on">
      <p className="rcAlert">
        Seismic design active (SDC {s.sdc}).{" "}
        {high
          ? bt.note
          : "ACI 17.10 and AISC 341 base provisions apply to SDC C–F only."}{" "}
        <button
          type="button"
          className="suiteSecondary"
          onClick={() => set({ active: false })}
        >
          Turn off seismic design
        </button>
      </p>
      <div className="slabFieldGrid">
        <label className="slabNumeric">
          <span>Seismic design category</span>
          <select
            value={s.sdc}
            onChange={(e) => set({ sdc: e.target.value as Seismic["sdc"] })}
          >
            {(["A", "B", "C", "D", "E", "F"] as const).map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label className="slabNumeric bpWide">
          <span>Base type (AISC 341-22 D2.6)</span>
          <select
            value={s.baseType}
            onChange={(e) =>
              set({ baseType: e.target.value as Seismic["baseType"] })
            }
          >
            {baseTypes.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
            <option disabled>
              Pinned base (D2.6c(c)) — Future Development
            </option>
          </select>
        </label>
        {(s.baseType === "general" || s.baseType === "braced") && (
          <label className="slabNumeric bpWide">
            <span>ACI 17.10.5.3 option</span>
            <select
              value={s.option}
              onChange={(e) => set({ option: e.target.value as "a" | "d" })}
            >
              <option value="d">(d) E combinations include Ω0</option>
              <option value="a">(a) Ductile steel governs</option>
            </select>
          </label>
        )}
        {s.baseType !== "general" && s.baseType !== "braced" && (
          <p className="slabMuted bpWide">
            ACI 17.10.5.3 option ({seismicAciOption(input)}) set by the base
            type.
          </p>
        )}
        {seismicAciOption(input) === "a" && s.baseType !== "weak" && (
          <Num
            label="Stretch length"
            value={s.stretchLength}
            onChange={(v) => set({ stretchLength: v })}
            title="≥ 8da (17.10.5.3(a))"
          />
        )}
        {s.baseType === "strong" && (
          <>
            <label className="slabNumeric">
              <span>Column grade (Ry, AISC 341 Table A3.2)</span>
              <select
                value={grade?.label ?? "custom"}
                onChange={(e) => {
                  const g = columnRyGrades.find(
                    (x) => x.label === e.target.value,
                  );
                  if (g) set({ columnGrade: g.label, ry: g.ry });
                }}
              >
                {columnRyGrades.map((g) => (
                  <option key={g.label} value={g.label}>
                    {g.label} (Ry {g.ry})
                  </option>
                ))}
                <option value="custom">Custom Ry</option>
              </select>
            </label>
            <Num
              label="Ry"
              unit=""
              step="0.05"
              value={s.ry}
              onChange={(ry) => set({ ry, columnGrade: "Custom" })}
            />
          </>
        )}
        {s.baseType === "weak" && (
          <>
            <Num
              label="UT reduced diameter"
              value={s.ut.dReduced}
              onChange={(v) => set({ ut: { ...s.ut, dReduced: v } })}
              title={`DG1 Fig. 6-1 (${(s.ut.dReduced / IN).toFixed(3)} in)`}
            />
            <Num
              label="Stretch length Lstretch"
              value={s.ut.lStretch}
              onChange={(v) => set({ ut: { ...s.ut, lStretch: v } })}
              title="≥ f (DG1 6.4.2)"
            />
            <Num
              label="Rt (expected / specified Fu)"
              unit=""
              step="0.05"
              value={s.ut.rt}
              onChange={(v) => set({ ut: { ...s.ut, rt: v } })}
            />
          </>
        )}
      </div>
      <label className="bpCheck">
        <input
          type="checkbox"
          checked={s.exempt20}
          onChange={(e) => set({ exempt20: e.target.checked })}
        />{" "}
        Earthquake share ≤ 20 % of the factored anchor forces (ACI 17.10.3 —
        17.10.5/17.10.6 not applied)
      </label>
      {s.baseType === "weak" && input.shear.method !== "lug" && (
        <p className="slabError">
          Weak base: select a shear lug under Shear transfer (DG1 6.4.2).
        </p>
      )}
      {s.baseType === "weak" && input.anchors.abrg === 0 && (
        <p className="slabMuted">
          Tip: DG1 Ex. 6.4-1 uses bottom washer plates for pullout — enter the
          bearing area under Anchor Rods (Abrg override).
        </p>
      )}
    </div>
  );
}
