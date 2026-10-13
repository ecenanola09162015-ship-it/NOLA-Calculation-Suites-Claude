"use client";
import type {
  ColumnQuantityInput,
  ColumnTieDesignInput,
  RectangularColumnInput,
  TransverseResult,
} from "@nola/calc-core";
import { useState } from "react";
import { ColumnTieSection } from "./column-tie-section";
import { OVERRIDE_COLOR, OVERRIDE_LEGEND } from "../lib/override-style";
import { DesignReviewPanel, DesignStatus } from "./design-review-panel";
import { NumberField, fmt } from "./column-ui";
import {
  rebarDesignation,
  rebarGradeLabel,
  type RebarStandard,
} from "@nola/calc-core";
import {
  columnTransverseChecks,
  type DesignCheckPolicy,
  type DesignRemarks,
} from "@nola/calc-core";

type Props = {
  input: RectangularColumnInput;
  value: ColumnTieDesignInput;
  onChange: (next: ColumnTieDesignInput) => void;
  design: TransverseResult | null;
  error: string;
  policy: DesignCheckPolicy;
  remarks: DesignRemarks;
  onRemarksChange: (next: DesignRemarks) => void;
};

/** Zone-like object so the estimate's section drawing can be reused. */
function designZone(
  value: ColumnTieDesignInput,
  design: TransverseResult,
  zone: "lo" | "mid" = "lo",
) {
  const lay = zone === "mid" ? design.layoutMid : design.layout;
  return {
    name: zone === "mid" ? "Outside lo" : "Design",
    start: 0,
    end: 1,
    spacing: zone === "mid" ? design.adopted.sMid : design.adopted.sEnd,
    diameter: value.tie.diameter,
    fy: value.tie.fyt,
    hoops: 1,
    legsX: lay.legsX,
    legsY: lay.legsY,
    crossXPositions: lay.crossX,
    crossYPositions: lay.crossY,
  };
}

/** Why a typed cross-tie count is rejected, or "" when it is valid. */
export function crossTieError(raw: string, max?: number) {
  const v = Number(raw);
  if (raw.trim() === "" || !Number.isFinite(v))
    return "Enter a whole number (0 or more).";
  if (v < 0) return "Cross-ties cannot be negative.";
  if (!Number.isInteger(v)) return "Cross-ties must be a whole number.";
  if (max !== undefined && v > max)
    return `Only ${max} interior bar pair${max === 1 ? "" : "s"} can be engaged on this face (25.7.2.3).`;
  return "";
}

/**
 * Whole number of interior cross-ties, 0 … the number of interior bar pairs
 * a cross-tie can engage (25.7.2.3). Invalid entries are not passed on; the
 * last valid count stays in force and the reason is shown.
 */
export function CrossTieField({
  label,
  value,
  max,
  onChange,
  legs,
}: {
  label: string;
  value: number;
  /** Interior bar pairs available; undefined before the first design. */
  max?: number;
  onChange: (v: number) => void;
  /** Resulting leg count text, e.g. "→ 5 legs ∥ X (2 hoop + 3 cross-ties)". */
  legs?: string;
}) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState("");
  const shown = text ?? String(value);
  return (
    <label className="crossTieField">
      {label}
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={max}
        step={1}
        aria-invalid={!!error}
        value={shown}
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          const problem = crossTieError(raw, max);
          if (problem) return setError(problem);
          setError("");
          setText(null);
          onChange(Number(raw));
        }}
        onBlur={() => {
          setText(null);
          setError("");
        }}
      />
      {error ? (
        <span className="fieldError" role="alert">
          {error} Keeping {value}.
        </span>
      ) : legs ? (
        <span className="rcMuted crossTieLegs">{legs}</span>
      ) : null}
    </label>
  );
}

const legsText = (axis: "X" | "Y", legs: number | undefined) =>
  legs === undefined
    ? undefined
    : `→ ${legs} legs ∥ ${axis} (2 hoop + ${legs - 2} cross-tie${legs - 2 === 1 ? "" : "s"})`;

function TieArrangementFields({
  value,
  onChange,
  standard,
  design,
  showCounts = true,
}: Pick<Props, "value" | "onChange"> & {
  standard: RebarStandard;
  design: TransverseResult | null;
  /** Panel 05 puts the counts inside the Vux / Vuy cards instead. */
  showCounts?: boolean;
}) {
  const tie = (k: "interiorX" | "interiorY", v: number) =>
    onChange({ ...value, tie: { ...value.tie, [k]: v } });
  return (
    <div className="rcFields">
      <p className="rcMuted tieFromMaterials">
        Tie {rebarDesignation(standard, value.tie.diameter)},{" "}
        {rebarGradeLabel(standard, value.tie.fyt, value.tie.gradeId)} (fyt{" "}
        {value.tie.fyt} MPa) from Section &amp; Materials.
      </p>
      {showCounts ? (
        <>
          <CrossTieField
            label={`Interior cross-ties ∥ X — resist Vux${design?.seismic ? " (lo zone)" : ""}`}
            value={value.tie.interiorX}
            max={design?.layout.availableX}
            legs={legsText("X", design?.layout.legsX)}
            onChange={(v) => tie("interiorX", v)}
          />
          <CrossTieField
            label={`Interior cross-ties ∥ Y — resist Vuy${design?.seismic ? " (lo zone)" : ""}`}
            value={value.tie.interiorY}
            max={design?.layout.availableY}
            legs={legsText("Y", design?.layout.legsY)}
            onChange={(v) => tie("interiorY", v)}
          />
        </>
      ) : null}
    </div>
  );
}

/**
 * Optional arrangement outside lo (seismic frames). Inside lo the lo-zone
 * counts (panel 05 / above) govern Ash, hx and so (18.7.5.2–18.7.5.4);
 * outside lo, 18.7.5.5, 25.7.2 and shear (22.5) govern.
 */
function MidArrangementFields({
  value,
  onChange,
  design,
}: Pick<Props, "value" | "onChange"> & { design: TransverseResult }) {
  const on =
    value.tie.midInteriorX != null || value.tie.midInteriorY != null;
  const set = (next: Partial<ColumnTieDesignInput["tie"]>) =>
    onChange({ ...value, tie: { ...value.tie, ...next } });
  return (
    <div className="midArrangement">
      <label className="rcCheckbox">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) =>
            set(
              e.target.checked
                ? {
                    midInteriorX: value.tie.interiorX,
                    midInteriorY: value.tie.interiorY,
                  }
                : { midInteriorX: null, midInteriorY: null },
            )
          }
        />
        <span>Different tie arrangement outside lo (18.7.5.5)</span>
      </label>
      {on ? (
        <div className="rcFields">
          <CrossTieField
            label="Outside lo: cross-ties ∥ X — resist Vux"
            value={value.tie.midInteriorX ?? value.tie.interiorX}
            max={design.layoutMid.availableX}
            legs={legsText("X", design.layoutMid.legsX)}
            onChange={(v) => set({ midInteriorX: v })}
          />
          <CrossTieField
            label="Outside lo: cross-ties ∥ Y — resist Vuy"
            value={value.tie.midInteriorY ?? value.tie.interiorY}
            max={design.layoutMid.availableY}
            legs={legsText("Y", design.layoutMid.legsY)}
            onChange={(v) => set({ midInteriorY: v })}
          />
        </div>
      ) : null}
    </div>
  );
}

/** Section figure for one shear direction: legs resisting it highlighted. */
function ShearDirectionFigure({
  input,
  design,
  dir,
}: {
  input: RectangularColumnInput;
  design: TransverseResult;
  dir: "x" | "y";
}) {
  const { width: w, depth: h, cover: c } = input;
  const sec = design.sections[dir];
  const S = 200 / Math.max(w, h);
  const ox = 20,
    oy = 44;
  const X = (x: number) => ox + (w / 2 + x) * S,
    Y = (y: number) => oy + (h / 2 - y) * S;
  const hl = "#c2410c",
    dim = "#4b5d6b";
  const legs =
    dir === "x"
      ? [-(h / 2 - c), ...design.layout.crossX, h / 2 - c].map((y) => (
          <line
            key={y}
            x1={X(-w / 2 + c)}
            x2={X(w / 2 - c)}
            y1={Y(y)}
            y2={Y(y)}
            stroke={hl}
            strokeWidth="3"
          />
        ))
      : [-(w / 2 - c), ...design.layout.crossY, w / 2 - c].map((x) => (
          <line
            key={x}
            y1={Y(-h / 2 + c)}
            y2={Y(h / 2 - c)}
            x1={X(x)}
            x2={X(x)}
            stroke={hl}
            strokeWidth="3"
          />
        ));
  // d measured from the compression face along the shear direction.
  const d = sec.d;
  return (
    <svg
      viewBox="0 0 300 300"
      role="img"
      aria-label={`Shear along ${dir}: ${sec.legs} legs, bw ${fmt(sec.bw, 0)} mm, d ${fmt(d, 0)} mm`}
    >
      <rect
        x={X(-w / 2)}
        y={Y(h / 2)}
        width={w * S}
        height={h * S}
        fill="#f2f6f8"
        stroke="#718495"
      />
      <rect
        x={X(-w / 2 + c)}
        y={Y(h / 2 - c)}
        width={(w - 2 * c) * S}
        height={(h - 2 * c) * S}
        fill="none"
        stroke="#a3afb9"
      />
      {legs}
      {input.bars.map((b, i) => (
        <circle
          key={i}
          cx={X(b.x)}
          cy={Y(b.y)}
          r={Math.max(2, (b.diameter / 2) * S)}
          fill={(dir === "x" ? b.x : b.y) < -0.1 ? "#245f9a" : "#9db4c8"}
        />
      ))}
      {dir === "x" ? (
        <>
          <path
            d={`M${X(-w / 2) - 14} ${Y(0)}h${w * S + 28}`}
            stroke={dim}
            markerEnd={`url(#vArrow-${dir})`}
          />
          <path
            d={`M${X(w / 2)} ${Y(-h / 2) + 14}h${-d * S}`}
            stroke={dim}
            strokeDasharray="3 2"
          />
          <text
            x={X(w / 2) - (d * S) / 2}
            y={Y(-h / 2) + 26}
            fontSize="10"
            textAnchor="middle"
          >
            d = {fmt(d, 0)}
          </text>
        </>
      ) : (
        <>
          <path
            d={`M${X(0)} ${Y(h / 2) - 14}v${h * S + 28}`}
            stroke={dim}
            markerEnd={`url(#vArrow-${dir})`}
          />
          <path
            d={`M${X(w / 2) + 14} ${Y(h / 2)}v${d * S}`}
            stroke={dim}
            strokeDasharray="3 2"
          />
          <text x={X(w / 2) + 18} y={Y(h / 2) + (d * S) / 2} fontSize="10">
            d = {fmt(d, 0)}
          </text>
        </>
      )}
      <defs>
        <marker
          id={`vArrow-${dir}`}
          markerWidth="8"
          markerHeight="8"
          refX="7"
          refY="4"
          orient="auto"
        >
          <path d="M0 0L8 4L0 8Z" fill={dim} />
        </marker>
      </defs>
      <text x="10" y="16" fontSize="11">
        V{dir === "x" ? "ux" : "uy"} along {dir} · {sec.legs} legs · bw ={" "}
        {fmt(sec.bw, 0)} mm
      </text>
      <text x="10" y="294" fontSize="10" fill={hl}>
        Orange: legs resisting V{dir === "x" ? "ux" : "uy"} · Dark bars: tension
        side
      </text>
    </svg>
  );
}

/** Label that wraps after the first " · " so long override notes stay legible. */
function OverrideText({
  x,
  y,
  fill,
  text,
  bold,
}: {
  x: number;
  y: number;
  fill: string;
  text: string;
  bold: boolean;
}) {
  const [first, ...rest] = text.split(" · override");
  return (
    <text x={x} y={y} fontSize="11" fill={fill} fontWeight={bold ? 700 : 400}>
      <tspan>{first}</tspan>
      {rest.length ? (
        <tspan x={x} dy="13" fontSize="10">
          override{rest.join(" · override")}
        </tspan>
      ) : null}
    </text>
  );
}

function ElevationFigure({
  value,
  design,
}: {
  value: ColumnTieDesignInput;
  design: TransverseResult;
}) {
  const lu = value.confinement.clearHeight;
  const { lo, sEnd, sMid } = design.adopted;
  const H = 300,
    top = 30,
    S = H / lu;
  const Y = (z: number) => top + H - z * S;
  const full = design.fullHeight || 2 * lo >= lu;
  const lines: { z: number; end: boolean }[] = [];
  const push = (a: number, b: number, s: number, end: boolean) => {
    const n = Math.max(1, Math.ceil((b - a) / s));
    for (let k = 0; k <= n; k++) lines.push({ z: a + ((b - a) * k) / n, end });
  };
  if (full) push(0, lu, sEnd, true);
  else {
    push(0, lo, sEnd, true);
    push(lo, lu - lo, sMid, false);
    push(lu - lo, lu, sEnd, true);
  }
  const end = "#b45309",
    mid = "#007f86";
  const o = value.override;
  const endOv = o.lo !== null || o.sEnd !== null;
  const midOv = o.sMid !== null;
  const endLabel = (`lo = ${lo} · s = ${sEnd}` +
    (endOv
      ? ` · override (rec. ${o.lo !== null ? `lo ${design.recommended.lo}` : ""}${o.lo !== null && o.sEnd !== null ? ", " : ""}${o.sEnd !== null ? `s ${design.recommended.sEnd}` : ""})`
      : ""));
  const midLabel =
    `s = ${sMid}` +
    (midOv ? ` · override (recommended ${design.recommended.sMid})` : "") +
    (design.midSeparate
      ? ` · ${design.layoutMid.legsX}×${design.layoutMid.legsY} legs`
      : "");
  return (
    <svg
      viewBox="0 0 380 370"
      role="img"
      aria-label={`Column elevation: lo ${lo} mm at each end at ${sEnd} mm, middle at ${sMid} mm, clear height ${lu} mm`}
    >
      <rect x="40" y={top - 22} width="120" height="22" fill="#d1e7eb" />
      <rect x="40" y={top + H} width="120" height="22" fill="#d1e7eb" />
      <rect
        x="70"
        y={top}
        width="60"
        height={H}
        fill="#edf3f6"
        stroke="#617a88"
      />
      {!full ? (
        <>
          <rect
            x="70"
            y={Y(lo)}
            width="60"
            height={lo * S}
            fill={end}
            fillOpacity={0.13}
          />
          <rect
            x="70"
            y={top}
            width="60"
            height={lo * S}
            fill={end}
            fillOpacity={0.13}
          />
        </>
      ) : (
        <rect
          x="70"
          y={top}
          width="60"
          height={H}
          fill={end}
          fillOpacity={0.13}
        />
      )}
      {lines.map((l, i) => (
        <line
          key={i}
          x1="74"
          x2="126"
          y1={Y(l.z)}
          y2={Y(l.z)}
          stroke={l.end ? end : mid}
          strokeWidth="1.2"
        />
      ))}
      <path d={`M30 ${top}V${top + H}`} stroke="#4b5d6b" />
      <text
        x="26"
        y={top + H / 2}
        fontSize="10"
        textAnchor="end"
        transform={`rotate(-90 26 ${top + H / 2})`}
      >
        ℓu = {lu}
      </text>
      {!full ? (
        <>
          <path
            d={`M140 ${top}V${Y(lu - lo)}M136 ${Y(lu - lo)}h8`}
            stroke={end}
          />
          <path d={`M140 ${Y(lo)}V${top + H}M136 ${Y(lo)}h8`} stroke={end} />
          <OverrideText
            x={148}
            y={top + (lo * S) / 2 + 4}
            fill={endOv ? OVERRIDE_COLOR : end}
            text={endLabel}
            bold={endOv}
          />
          <OverrideText
            x={148}
            y={top + H / 2 + 4}
            fill={midOv ? OVERRIDE_COLOR : mid}
            text={midLabel}
            bold={midOv}
          />
          <OverrideText
            x={148}
            y={top + H - (lo * S) / 2 + 4}
            fill={endOv ? OVERRIDE_COLOR : end}
            text={endLabel}
            bold={endOv}
          />
        </>
      ) : (
        <OverrideText
          x={148}
          y={top + H / 2}
          fill={endOv ? OVERRIDE_COLOR : end}
          text={`Full height · s = ${sEnd}${endOv ? " · override" : ""}`}
          bold={endOv}
        />
      )}
      <text x="10" y="362" fontSize="10">
        Clear height between joint faces; joints shaded (18.8.3)
      </text>
    </svg>
  );
}

/** Panel 05 rows: shear strength, section limit, Av,min, spacing (22.5, 10.6, 10.7). */
export const shearReviewChecks = (design: TransverseResult | null) =>
  columnTransverseChecks(design).filter((c) => c.id.startsWith("tie:shear"));
/** Panel 06 rows: Ash, hx, so, lo, SCWB, Ve, weldability (Chapter 18, 25.7). */
export const confinementReviewChecks = (design: TransverseResult | null) =>
  columnTransverseChecks(design).filter((c) => !c.id.startsWith("tie:shear"));

type OverrideKey = keyof ColumnTieDesignInput["override"];
/** Spacing / lo / Ve overrides shared by panels 05 and 06 (one set of values). */
function SpacingOverrides({
  value,
  onChange,
  design,
  keys,
}: {
  value: ColumnTieDesignInput;
  onChange: (next: ColumnTieDesignInput) => void;
  design: TransverseResult;
  keys: OverrideKey[];
}) {
  const o = value.override;
  const set = (k: OverrideKey, v: number) =>
    onChange({
      ...value,
      override: { ...o, [k]: Number.isFinite(v) && v > 0 ? v : null },
    });
  const lu = value.confinement.clearHeight;
  const field: Record<
    OverrideKey,
    { show: boolean; label: string; unit: string; rec: number }
  > = {
    lo: {
      show: design.seismic,
      label: "Confinement length lo",
      unit: "mm",
      rec: design.recommended.lo,
    },
    sEnd: {
      show: design.seismic,
      label: "Tie spacing in lo",
      unit: "mm",
      rec: design.recommended.sEnd,
    },
    sMid: {
      show: true,
      label: design.seismic ? "Tie spacing outside lo" : "Tie spacing",
      unit: "mm",
      rec: design.recommended.sMid,
    },
    veX: {
      show: design.seismic,
      label: "Design shear Ve x",
      unit: "kN",
      rec: +((2 * design.ve.mprY * 1000) / lu).toFixed(1),
    },
    veY: {
      show: design.seismic,
      label: "Design shear Ve y",
      unit: "kN",
      rec: +((2 * design.ve.mprX * 1000) / lu).toFixed(1),
    },
  };
  const shown = keys.filter((k) => field[k].show);
  // Every active override (including ones set in the other panel).
  const active = (Object.keys(field) as OverrideKey[]).filter(
    (k) => field[k].show && o[k] !== null,
  );
  if (!shown.length) return null;
  return (
    <div className="spacingOverrides">
      <div className="rcFields">
        {shown.map((k) => (
          <label key={k} className={o[k] !== null ? "isOverride" : ""}>
            {field[k].label}
            <span className="rcUnit">{field[k].unit}</span>
            <span className="rebarCustom">
              <input
                type="number"
                step="any"
                aria-label={`${field[k].label} override`}
                placeholder={`${field[k].rec} (recommended)`}
                value={o[k] ?? ""}
                onChange={(e) =>
                  set(k, e.target.value === "" ? NaN : Number(e.target.value))
                }
              />
              {o[k] !== null ? (
                <>
                  <em className="overrideBadge">
                    Override · rec. {field[k].rec}
                  </em>
                  <button
                    type="button"
                    className="linkButton"
                    onClick={() => set(k, NaN)}
                  >
                    Use {field[k].rec}
                  </button>
                </>
              ) : null}
            </span>
          </label>
        ))}
      </div>
      <p className="rcMuted">
        Blank uses the recommended value (rounded down to 25 mm for spacing).
        Overrides are re-checked immediately. Spacing overrides are shared by
        panels 05 and 06.
      </p>
      {active.length ? (
        <p className="overrideNote" role="status">
          Active designer overrides:{" "}
          {active
            .map(
              (k) =>
                `${field[k].label} ${o[k]} ${field[k].unit} (recommended ${field[k].rec})`,
            )
            .join("; ")}
          .
        </p>
      ) : null}
    </div>
  );
}

export function ColumnShearPanel(props: Props) {
  const { input, value, onChange, design, error, policy } = props;
  const on = value.shear.enabled;
  const rows = shearReviewChecks(design);
  return (
    <section className={`rcPanel cqPanel ${on ? "" : "cqDisabled"}`}>
      <h2>05 · Shear Design</h2>
      <label className="cqToggle">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) =>
            onChange({ ...value, shear: { enabled: e.target.checked } })
          }
        />{" "}
        Enable Shear Design
      </label>
      {!on ? (
        <p className="rcMuted">
          Shear design disabled. Enter Vux / Vuy in the load table after
          enabling. Seismic frames check shear in panel 06 regardless.
        </p>
      ) : (
        <>
          <TieArrangementFields
            value={value}
            onChange={onChange}
            standard={input.rebarStandard ?? "PNS49"}
            design={design}
            showCounts={!design}
          />
          {error ? <p className="rcAlert">{error}</p> : null}
          {design ? (
            <SpacingOverrides
              value={value}
              onChange={onChange}
              design={design}
              keys={["sEnd", "sMid"]}
            />
          ) : null}
          {design ? (
            <>
              {/* Each count sits in the card of the shear it resists: legs ∥ X
                  carry Vux, legs ∥ Y carry Vuy (22.5.8.5). */}
              <div className="cqDrawings">
                <figure>
                  <figcaption>Vux (along x) · pairs with Muy</figcaption>
                  <CrossTieField
                    label={`Interior cross-ties ∥ X — resist Vux${design.seismic ? " (lo zone)" : ""}`}
                    value={value.tie.interiorX}
                    max={design.layout.availableX}
                    legs={legsText("X", design.layout.legsX)}
                    onChange={(v) =>
                      onChange({ ...value, tie: { ...value.tie, interiorX: v } })
                    }
                  />
                  <ShearDirectionFigure input={input} design={design} dir="x" />
                </figure>
                <figure>
                  <figcaption>Vuy (along y) · pairs with Mux</figcaption>
                  <CrossTieField
                    label={`Interior cross-ties ∥ Y — resist Vuy${design.seismic ? " (lo zone)" : ""}`}
                    value={value.tie.interiorY}
                    max={design.layout.availableY}
                    legs={legsText("Y", design.layout.legsY)}
                    onChange={(v) =>
                      onChange({ ...value, tie: { ...value.tie, interiorY: v } })
                    }
                  />
                  <ShearDirectionFigure input={input} design={design} dir="y" />
                </figure>
              </div>
              {design.midSeparate ? (
                <p className="rcMuted">
                  Drawings show the lo-zone arrangement. Outside lo:{" "}
                  {design.layoutMid.legsX} legs ∥ X, {design.layoutMid.legsY}{" "}
                  legs ∥ Y (set in panel 06); mid-height shear rows use those
                  legs.
                </p>
              ) : null}
              <DesignReviewPanel
                title="Shear Checks"
                compact
                checks={rows}
                policy={policy}
                remarks={props.remarks}
                onChange={props.onRemarksChange}
              />
              <details>
                <summary>All combinations · {design.shear.length} rows</summary>
                <div className="rcTableWrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Combo</th>
                        <th>Zone</th>
                        <th>Dir</th>
                        <th>Pu kN</th>
                        <th>Vu kN</th>
                        <th>Vc kN</th>
                        <th>Vs kN</th>
                        <th>φVn kN</th>
                        <th>s req mm</th>
                        <th>DCR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {design.shear.map((c) => (
                        <tr key={`${c.load}${c.zone}${c.dir}`}>
                          <td>{c.load}</td>
                          <td>
                            {design.seismic
                              ? c.zone === "end"
                                ? "lo"
                                : "mid"
                              : "all"}
                          </td>
                          <td>{c.dir}</td>
                          <td>{fmt(c.pu, 1)}</td>
                          <td>{fmt(c.vu, 1)}</td>
                          <td>
                            {fmt(c.vc, 1)}
                            {c.vcZero ? " (0)" : ""}
                          </td>
                          <td>{fmt(c.vs, 1)}</td>
                          <td>{fmt(c.phiVn, 1)}</td>
                          <td>
                            {Number.isFinite(c.sReq) ? fmt(c.sReq, 0) : "—"}
                          </td>
                          <td>{fmt(c.dcr, 3)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
              <p className="rcMuted">
                ACI 318-19: φ = 0.75 (21.2.1); Vc Table 22.5.5.1 with Nu/6Ag ≤
                0.05f′c, √f′c ≤ 8.3 MPa (22.5.3.1), λs (22.5.5.1.3); Vs = Av fyt
                d/s, fyt ≤ 420 MPa (22.5.8.5.3, 20.2.2.4a); section limit
                22.5.1.2; Av,min 10.6.2; spacing 10.7.6.5.2; biaxial shear
                22.5.1.10–11. d is to the tension-half bar centroid of the
                actual layout.
              </p>
            </>
          ) : null}
        </>
      )}
    </section>
  );
}

export function ColumnConfinementPanel(props: Props) {
  const { input, value, onChange, design, error, policy } = props;
  const on = value.confinement.enabled;
  const c = value.confinement;
  const set = (next: Partial<ColumnTieDesignInput["confinement"]>) =>
    onChange({ ...value, confinement: { ...c, ...next } });
  const rows = confinementReviewChecks(design);
  return (
    <section className={`rcPanel cqPanel ${on ? "" : "cqDisabled"}`}>
      <h2>06 · Seismic Confinement Design</h2>
      <label className="cqToggle">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => set({ enabled: e.target.checked })}
        />{" "}
        Enable Confinement Design
      </label>
      {!on ? (
        <p className="rcMuted">
          Confinement design disabled. Tie spacing and zone lengths are not
          checked against Chapter 18.
        </p>
      ) : (
        <>
          <div className="rcFields">
            <label>
              Frame type
              <select
                value={c.frame}
                onChange={(e) =>
                  set({ frame: e.target.value as typeof c.frame })
                }
              >
                <option value="SMF">Special moment frame (18.7)</option>
                <option value="IMF">Intermediate moment frame (18.4.3)</option>
                <option value="OMF">Ordinary / non-seismic (25.7.2)</option>
              </select>
            </label>
            <NumberField
              label="Clear height ℓu (joint face to joint face)"
              unit="mm"
              value={c.clearHeight}
              onChange={(v) => set({ clearHeight: v })}
            />
            {c.frame === "SMF" ? (
              <>
                <NumberField
                  label="ΣMnb about x (optional)"
                  unit="kN·m"
                  value={c.sumMnbX ?? NaN}
                  onChange={(v) =>
                    set({ sumMnbX: Number.isFinite(v) ? v : null })
                  }
                />
                <NumberField
                  label="ΣMnb about y (optional)"
                  unit="kN·m"
                  value={c.sumMnbY ?? NaN}
                  onChange={(v) =>
                    set({ sumMnbY: Number.isFinite(v) ? v : null })
                  }
                />
              </>
            ) : null}
          </div>
          {c.frame === "SMF" ? (
            <label className="rcCheckbox">
              <input
                type="checkbox"
                checked={c.discontinuedSupport}
                onChange={(e) => set({ discontinuedSupport: e.target.checked })}
              />
              <span>
                Supports a discontinued wall or other stiff member (18.7.5.6)
              </span>
            </label>
          ) : null}
          {!value.shear.enabled ? (
            <TieArrangementFields
              value={value}
              onChange={onChange}
              standard={input.rebarStandard ?? "PNS49"}
              design={design}
            />
          ) : (
            <p className="rcMuted">
              Tie{" "}
              {rebarDesignation(
                input.rebarStandard ?? "PNS49",
                value.tie.diameter,
              )}{" "}
              from Section &amp; Materials; {value.tie.interiorX} ∥ X /{" "}
              {value.tie.interiorY} ∥ Y interior cross-ties
              {design?.seismic ? " in lo" : ""} set in panel 05.
            </p>
          )}
          {design?.seismic && !design.fullHeight ? (
            <MidArrangementFields value={value} onChange={onChange} design={design} />
          ) : null}
          {error ? <p className="rcAlert">{error}</p> : null}
          {design ? (
            <SpacingOverrides
              value={value}
              onChange={onChange}
              design={design}
              keys={["lo", "sEnd", "sMid", "veX", "veY"]}
            />
          ) : null}
          {design ? (
            <>
              <div className="cqSummary">
                <div className={value.override.lo !== null ? "isOverride" : ""}>
                  <strong>{design.adopted.lo || "—"} mm</strong>Zone length lo
                  {value.override.lo !== null ? (
                    <em className="overrideTag">
                      override · recommended {design.recommended.lo}
                    </em>
                  ) : null}
                  <small>{design.loBasis}</small>
                </div>
                <div>
                  <strong>{fmt(design.layout.hx, 0)} mm</strong>hx
                  <small>
                    {design.layout.nl} of {input.bars.length} bars supported
                  </small>
                </div>
                {design.seismic ? (
                  <div
                    className={
                      value.override.veX !== null || value.override.veY !== null
                        ? "isOverride"
                        : ""
                    }
                  >
                    <strong>
                      {fmt(design.adopted.ve.x, 1)} /{" "}
                      {fmt(design.adopted.ve.y, 1)} kN
                    </strong>
                    Ve x / y
                    {value.override.veX !== null ||
                    value.override.veY !== null ? (
                      <em className="overrideTag">
                        override{value.override.veX !== null ? " x" : ""}
                        {value.override.veY !== null ? " y" : ""}
                      </em>
                    ) : null}
                    <small>{design.ve.basis}</small>
                  </div>
                ) : null}
              </div>
              <div className="cqDrawings">
                <figure>
                  <figcaption>Elevation · Adopted Confinement Zones</figcaption>
                  <ElevationFigure value={value} design={design} />
                </figure>
                <figure>
                  <figcaption
                    style={
                      value.override.sEnd !== null
                        ? { color: OVERRIDE_COLOR }
                        : undefined
                    }
                  >
                    Section{design.seismic ? " within lo" : ""} ·{" "}
                    {design.layout.legsX} legs ∥ X, {design.layout.legsY} legs
                    ∥ Y · hx = {fmt(design.layout.hx, 0)} mm · s ={" "}
                    {design.seismic ? design.adopted.sEnd : design.adopted.sMid}
                    {value.override.sEnd !== null && design.seismic
                      ? " (override)"
                      : ""}
                  </figcaption>
                  <ColumnTieSection
                    section={input}
                    zone={designZone(value, design)}
                    basis={value.tie.hookBasis ?? "aci135"}
                    color="#b45309"
                  />
                </figure>
                {design.midSeparate ? (
                  <figure>
                    <figcaption
                      style={
                        value.override.sMid !== null
                          ? { color: OVERRIDE_COLOR }
                          : undefined
                      }
                    >
                      Section outside lo · {design.layoutMid.legsX} legs ∥ X,{" "}
                      {design.layoutMid.legsY} legs ∥ Y · s ={" "}
                      {design.adopted.sMid}
                      {value.override.sMid !== null ? " (override)" : ""}
                    </figcaption>
                    <ColumnTieSection
                      section={input}
                      zone={designZone(value, design, "mid")}
                      basis={value.tie.hookBasis ?? "aci135"}
                      color="#007f86"
                    />
                  </figure>
                ) : null}
              </div>
              <p className="overrideLegend">
                <span style={{ color: OVERRIDE_COLOR }}>■</span> {OVERRIDE_LEGEND}
              </p>
              {design.ash.length ? (
                <div className="rcTableWrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Legs</th>
                        <th>bc mm</th>
                        <th>(a)</th>
                        <th>(b)</th>
                        <th>(c)</th>
                        <th>Ash/(s bc) req</th>
                        <th>Ash mm²</th>
                        <th>s max mm</th>
                      </tr>
                    </thead>
                    <tbody>
                      {design.ash.map((r) => (
                        <tr key={r.dir}>
                          <td>∥ {r.dir}</td>
                          <td>{fmt(r.bc, 0)}</td>
                          <td>{fmt(r.terms.a, 5)}</td>
                          <td>{fmt(r.terms.b, 5)}</td>
                          <td>
                            {r.terms.c === null ? "n/a" : fmt(r.terms.c, 5)}
                          </td>
                          <td>{fmt(r.ratio, 5)}</td>
                          <td>{fmt(r.provided, 0)}</td>
                          <td>{fmt(r.sMax, 1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              <DesignReviewPanel
                title="Confinement & Detailing Checks"
                compact
                checks={rows}
                policy={policy}
                remarks={props.remarks}
                onChange={props.onRemarksChange}
              />
              {design.notes.length ? (
                <ul className="rcMuted">
                  {design.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </section>
  );
}

export function ColumnTieDesignSummary({
  value,
  design,
  quantity,
  onAdopt,
  groups = [],
  policy,
}: {
  /** Governing DCR per review group (flexure / shear / confinement). */
  groups?: { label: string; panel: string; dcr: number | null }[];
  policy?: DesignCheckPolicy;
  value: ColumnTieDesignInput;
  /** Kept for API compatibility; overrides are edited in panels 05/06. */
  onChange?: (next: ColumnTieDesignInput) => void;
  design: TransverseResult | null;
  quantity: ColumnQuantityInput;
  onAdopt: () => void;
}) {
  if (!design || (!value.shear.enabled && !value.confinement.enabled))
    return null;
  const estClear = quantity.height - quantity.beamDepth;
  const mismatch =
    design.seismic &&
    quantity.enabled &&
    Math.abs(estClear - value.confinement.clearHeight) > 1;
  const limiting = design.limits
    .filter((l) => Number.isFinite(l.end) || Number.isFinite(l.mid))
    .map((l) => ({
      ...l,
      end: Number.isFinite(l.end) ? fmt(l.end, 0) : "—",
      mid: Number.isFinite(l.mid) ? fmt(l.mid, 0) : "—",
    }));
  return (
    <section className="rcPanel">
      <h2>07 · Design Summary &amp; Adopted Transverse Design</h2>
      {groups.length && policy ? (
        <div className="rcTableWrap">
          <table>
            <thead>
              <tr>
                <th>Check group</th>
                <th>Reviewed in</th>
                <th>Governing DCR</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.label}>
                  <th scope="row">{g.label}</th>
                  <td>{g.panel}</td>
                  <td>{fmt(g.dcr, 3)}</td>
                  <td>
                    <DesignStatus dcr={g.dcr} policy={policy} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <div className="rcTableWrap">
        <table>
          <thead>
            <tr>
              <th>Spacing limit</th>
              <th>Reference</th>
              <th>{design.seismic ? "lo zone mm" : "—"}</th>
              <th>{design.seismic ? "Outside lo mm" : "Full height mm"}</th>
            </tr>
          </thead>
          <tbody>
            {limiting.map((l) => (
              <tr key={l.label}>
                <th scope="row">{l.label}</th>
                <td className="designClause">ACI 318-19 {l.clause}</td>
                <td>{design.seismic ? l.end : "—"}</td>
                <td>{l.mid}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="rcMuted">
        Spacing and lo are set (or overridden) in panels 05 and 06; this panel
        summarises the adopted values and writes them to the estimate.
      </p>
      <div className="cqSummary">
        {design.seismic ? (
          <div
            className={
              value.override.lo !== null || value.override.sEnd !== null
                ? "isOverride"
                : ""
            }
          >
            <strong>
              {design.adopted.lo} mm @ {design.adopted.sEnd}
            </strong>
            lo zones (each end + joint)
            {value.override.lo !== null || value.override.sEnd !== null ? (
              <em className="overrideTag">
                override · recommended {design.recommended.lo} @{" "}
                {design.recommended.sEnd}
              </em>
            ) : null}
          </div>
        ) : null}
        <div className={value.override.sMid !== null ? "isOverride" : ""}>
          <strong>{design.adopted.sMid} mm</strong>
          {design.seismic ? "Outside lo" : "Full height"}
          {value.override.sMid !== null ? (
            <em className="overrideTag">
              override · recommended {design.recommended.sMid}
            </em>
          ) : null}
        </div>
        <div>
          <strong>
            D{value.tie.diameter} · {design.layout.legsX}×{design.layout.legsY}{" "}
            legs{design.midSeparate ? " in lo" : ""}
          </strong>
          Hoop + cross-ties
          {design.midSeparate ? (
            <small>
              Outside lo: {design.layoutMid.legsX}×{design.layoutMid.legsY}{" "}
              legs
            </small>
          ) : null}
        </div>
      </div>
      {mismatch ? (
        <p className="rcAlert">
          The estimate's clear height ({estClear} mm = floor-to-floor − beam
          depth) differs from the design ℓu ({value.confinement.clearHeight}{" "}
          mm). Zones are placed in the estimate's height using the adopted lo.
        </p>
      ) : null}
      <button className="suitePrimary" onClick={onAdopt}>
        Adopt to estimate
      </button>
    </section>
  );
}
