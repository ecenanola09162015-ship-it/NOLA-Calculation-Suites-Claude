"use client";
import { useMemo, useState } from "react";
import {
  estimateColumnQuantity,
  editColumnTieArrangement,
  defaultColumnTieZones,
  columnQuantityLimitations,
  type ColumnQuantityInput,
  type RectangularColumnInput,
} from "@nola/calc-core";
const f = (v: number, p = 2) =>
  Number.isFinite(v)
    ? v.toLocaleString("en-US", {
        minimumFractionDigits: p,
        maximumFractionDigits: p,
      })
    : "—";
function Num({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        step="any"
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) =>
          onChange(e.target.value === "" ? NaN : Number(e.target.value))
        }
      />
    </label>
  );
}
export function ColumnQuantityPanel({
  section,
  value,
  onChange,
}: {
  section: RectangularColumnInput;
  value: ColumnQuantityInput;
  onChange: (q: ColumnQuantityInput) => void;
}) {
  const [diameter, setDiameter] = useState("all"),
    [grade, setGrade] = useState("all"),
    [fn, setFn] = useState("all");
  const computed = useMemo(() => {
    try {
      return { result: estimateColumnQuantity(section, value), error: "" };
    } catch (e) {
      return {
        result: null,
        error: e instanceof Error ? e.message : "Check quantity inputs.",
      };
    }
  }, [section, value]);
  const r = computed.result,
    rows =
      r?.rows.filter(
        (b) =>
          (diameter === "all" || String(b.diameter) === diameter) &&
          (grade === "all" || String(b.fy) === grade) &&
          (fn === "all" || b.function === fn),
      ) || [];
  function change(k: keyof ColumnQuantityInput, n: number) {
    onChange({ ...value, [k]: n });
  }
  function zone(index: number, key: string, v: number | string | null) {
    onChange({
      ...value,
      zones: value.zones.map((z, i) =>
        i !== index
          ? z
          : key === "hoops" || key === "interiorX" || key === "interiorY"
            ? editColumnTieArrangement(z, key, Number(v))
            : { ...z, [key]: v },
      ),
    });
  }
  return (
    <section
      id="column-quantity"
      className={`rcPanel cqPanel ${!value.enabled ? "cqDisabled" : ""}`}
    >
      <h2>Quantity estimate · Column segment</h2>
      <label className="cqToggle">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(e) => onChange({ ...value, enabled: e.target.checked })}
        />{" "}
        Enable Quantity Estimate
      </label>
      {!value.enabled ? (
        <p className="rcMuted">
          Estimate disabled. Inputs are retained; structural section checks
          remain active.
        </p>
      ) : (
        <>
          <div className="cqControls">
            <Num
              label="Floor-to-floor height (mm)"
              value={value.height}
              onChange={(v) => change("height", v)}
            />
            <Num
              label="Upper beam depth (mm)"
              value={value.beamDepth}
              onChange={(v) => change("beamDepth", v)}
            />
            <Num
              label="Identical columns"
              value={value.members}
              onChange={(v) => change("members", v)}
            />
            <Num
              label="First tie above floor (mm)"
              value={value.firstOffset}
              onChange={(v) => change("firstOffset", v)}
            />
            <Num
              label="Last tie below upper floor (mm)"
              value={value.lastOffset}
              onChange={(v) => change("lastOffset", v)}
            />
            <label>
              Hook basis
              <select
                value={value.hookBasis}
                onChange={(e) =>
                  onChange({
                    ...value,
                    hookBasis: e.target
                      .value as ColumnQuantityInput["hookBasis"],
                  })
                }
              >
                <option value="aci135">ACI 318-19 · 135° both ends</option>
                <option value="allowance8db">
                  Designer allowance · 8db each end
                </option>
              </select>
            </label>
          </div>
          <p className="rcMuted">
            Longitudinal bars follow the current column design: diameter, count
            and fy. Interior cross-ties are parallel to X (width) and Y (depth).
            Each full-section hoop contributes 2 exterior legs in each
            direction. Enter interior cross-ties only; total legs are calculated
            automatically. Multiple hoops are assumed full-section, not
            overlapping inner hoops.
          </p>
          <div className="cqActions">
            <button
              type="button"
              className="suiteSecondary"
              onClick={() => {
                if (
                  Number.isFinite(value.height) &&
                  value.height > value.beamDepth &&
                  value.beamDepth >= 0
                )
                  onChange({
                    ...value,
                    zones: defaultColumnTieZones(
                      value.height,
                      value.beamDepth,
                      section.tieDiameter,
                    ),
                  });
              }}
            >
              Generate / reset spacing zones
            </button>
            <button
              type="button"
              className="suiteSecondary"
              disabled={value.zones.length >= 20}
              onClick={() => {
                const last = value.zones.at(-1)!;
                onChange({
                  ...value,
                  zones: [
                    ...value.zones,
                    {
                      ...last,
                      name: `Zone ${value.zones.length + 1}`,
                      start: last.end,
                      end: value.height,
                    },
                  ],
                });
              }}
            >
              Add zone
            </button>
          </div>
          <div className="cqScroll">
            <table>
              <caption>
                Tie zones · elevations measured from lower floor (mm)
              </caption>
              <thead>
                <tr>
                  {[
                    "Zone",
                    "Start",
                    "End",
                    "Spacing",
                    "Ø",
                    "fy MPa",
                    "Hoops / set",
                    "Interior X cross-ties / set",
                    "Interior Y cross-ties / set",
                    "",
                  ].map((s, i) => (
                    <th key={i}>{s}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {value.zones.map((z, i) => (
                  <tr key={i}>
                    <td>
                      <input
                        aria-label={`Zone ${i + 1} name`}
                        value={z.name}
                        onChange={(e) => zone(i, "name", e.target.value)}
                      />
                    </td>
                    {(
                      [
                        "start",
                        "end",
                        "spacing",
                        "diameter",
                        "fy",
                        "hoops",
                        "interiorX",
                        "interiorY",
                      ] as const
                    ).map((k) => (
                      <td key={k}>
                        <input
                          aria-label={`Zone ${i + 1} ${k === "interiorX" ? "interior X cross-ties" : k === "interiorY" ? "interior Y cross-ties" : k}`}
                          type="number"
                          step={
                            k === "hoops" || k.startsWith("interior")
                              ? 1
                              : "any"
                          }
                          min={
                            k === "hoops"
                              ? 1
                              : k.startsWith("interior")
                                ? 0
                                : undefined
                          }
                          value={
                            k === "interiorX"
                              ? Number.isFinite(z.legsX - 2 * z.hoops)
                                ? z.legsX - 2 * z.hoops
                                : ""
                              : k === "interiorY"
                                ? Number.isFinite(z.legsY - 2 * z.hoops)
                                  ? z.legsY - 2 * z.hoops
                                  : ""
                                : Number.isFinite(z[k])
                                  ? z[k]
                                  : ""
                          }
                          onChange={(e) =>
                            zone(
                              i,
                              k,
                              e.target.value === ""
                                ? NaN
                                : Number(e.target.value),
                            )
                          }
                        />
                        {k === "interiorX" || k === "interiorY" ? (
                          <small className="cqDerivedLegs">
                            Total {k === "interiorX" ? "X" : "Y"} legs:{" "}
                            {Number.isFinite(
                              k === "interiorX" ? z.legsX : z.legsY,
                            )
                              ? k === "interiorX"
                                ? z.legsX
                                : z.legsY
                              : "—"}
                          </small>
                        ) : null}
                      </td>
                    ))}
                    <td>
                      <button
                        type="button"
                        aria-label={`Remove zone ${i + 1}`}
                        disabled={value.zones.length === 1}
                        onClick={() =>
                          onChange({
                            ...value,
                            zones: value.zones.filter((_, j) => i !== j),
                          })
                        }
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details className="cqActions">
            <summary>Checked cutting-length overrides (mm)</summary>
            <p>
              Automatic lengths exclude bend arcs and closure details. Enter
              independently checked full piece lengths to include those effects.
            </p>
            <div className="cqControls">
              {value.zones.map((z, i) => (
                <div key={i}>
                  <strong>{z.name}</strong>
                  {(
                    ["hoopLength", "crossXLength", "crossYLength"] as const
                  ).map((k) => (
                    <label key={k}>
                      {k === "hoopLength"
                        ? "Hoop"
                        : k === "crossXLength"
                          ? "X cross-tie"
                          : "Y cross-tie"}
                      <input
                        aria-label={`${z.name} ${k} cutting length override`}
                        type="number"
                        placeholder="Auto"
                        value={z[k] ?? ""}
                        onChange={(e) =>
                          zone(
                            i,
                            k,
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                          )
                        }
                      />
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </details>
          {computed.error ? (
            <p role="alert" className="rcAlert">
              {computed.error}
            </p>
          ) : null}
          {r ? (
            <>
              <div className="cqSummary">
                <div>
                  <strong>{f(r.longitudinal)} kg</strong>Longitudinal —
                  axial/flexural
                  <small>
                    {f(r.longitudinalPercent)}% of total steel weight
                  </small>
                </div>
                <div>
                  <strong>{f(r.shear)} kg</strong>Shear / ties
                  <small>{f(r.shearPercent)}% of total steel weight</small>
                </div>
                <div>
                  <strong>{f(r.total)} kg</strong>Total steel
                </div>
                <div>
                  <strong>{f(r.concrete, 3)} m³</strong>Gross concrete incl.
                  joint
                </div>
                <div>
                  <strong>{f(r.ratio)} kg/m³</strong>Total steel / concrete
                </div>
              </div>
              <div className="cqDrawings">
                <figure>
                  <figcaption>
                    Elevation · actual tie levels · 1 column
                  </figcaption>
                  <svg
                    viewBox="0 0 440 390"
                    role="img"
                    aria-label="Column elevation with spacing zones and upper beam-column joint"
                  >
                    <rect
                      x="30"
                      y="15"
                      width="125"
                      height="345"
                      fill="#edf3f6"
                      stroke="#617a88"
                    />
                    {value.beamDepth > 0 ? (
                      <rect
                        x="15"
                        y="15"
                        width="155"
                        height={(345 * value.beamDepth) / value.height}
                        fill="#d1e7eb"
                      />
                    ) : null}
                    {r.zones.map((z, i) => (
                      <g key={i}>
                        {z.elevations.map((e) => (
                          <line
                            key={e}
                            x1="38"
                            x2="147"
                            y1={360 - (345 * e) / value.height}
                            y2={360 - (345 * e) / value.height}
                            stroke="#df7c22"
                            strokeWidth="1.4"
                          />
                        ))}
                        <text
                          x="185"
                          y={360 - (345 * (z.start + z.end)) / 2 / value.height}
                          fontSize="11"
                        >
                          {z.name}: {z.sets} sets, ≤{z.spacing} mm
                        </text>
                      </g>
                    ))}
                    <text x="30" y="382" fontSize="11">
                      Floor-to-floor {value.height} mm · joint {value.beamDepth}{" "}
                      mm
                    </text>
                  </svg>
                </figure>
                <div>
                  {r.zones.map((z, i) => (
                    <figure key={i}>
                      <figcaption>
                        {z.name} · {z.hoops} hoop(s), {z.legsX - 2 * z.hoops} X
                        cross-ties, {z.legsY - 2 * z.hoops} Y cross-ties
                      </figcaption>
                      <svg
                        viewBox="0 0 240 170"
                        role="img"
                        aria-label={`${z.name} schematic tie arrangement`}
                      >
                        <rect
                          x="20"
                          y="10"
                          width="200"
                          height="120"
                          fill="#edf3f6"
                          stroke="#617a88"
                        />
                        {Array.from({ length: z.hoops }, (_, j) => (
                          <rect
                            key={j}
                            x={35 + j * 3}
                            y={23 + j * 3}
                            width={170 - j * 6}
                            height={94 - j * 6}
                            fill="none"
                            stroke="#df7c22"
                          />
                        ))}
                        {Array.from(
                          { length: z.legsX - 2 * z.hoops },
                          (_, k) => (
                            <line
                              key={`x${k}`}
                              x1="35"
                              x2="205"
                              y1={
                                23 +
                                (94 * (k + 1)) / (z.legsX - 2 * z.hoops + 1)
                              }
                              y2={
                                23 +
                                (94 * (k + 1)) / (z.legsX - 2 * z.hoops + 1)
                              }
                              stroke="#df7c22"
                            />
                          ),
                        )}
                        {Array.from(
                          { length: z.legsY - 2 * z.hoops },
                          (_, k) => (
                            <line
                              key={`y${k}`}
                              y1="23"
                              y2="117"
                              x1={
                                35 +
                                (170 * (k + 1)) / (z.legsY - 2 * z.hoops + 1)
                              }
                              x2={
                                35 +
                                (170 * (k + 1)) / (z.legsY - 2 * z.hoops + 1)
                              }
                              stroke="#df7c22"
                            />
                          ),
                        )}
                        {section.bars.map((b, j) => (
                          <circle
                            key={j}
                            cx={120 + (b.x / section.width) * 200}
                            cy={70 - (b.y / section.depth) * 120}
                            r="3"
                            fill="#145da0"
                          />
                        ))}
                        <text x="20" y="148" fontSize="10">
                          X → width · Y ↑ depth · hooks schematic only
                        </text>
                      </svg>
                      <small>
                        {z.hook.angle
                          ? `135° ends · extension ${f(z.hook.extension, 1)} mm each · min inside bend ${f(z.hook.insideBend!, 1)} mm`
                          : `8db = ${f(z.hook.extension, 1)} mm each end`}
                      </small>
                    </figure>
                  ))}
                </div>
              </div>
              <div className="cqFilters">
                <label>
                  Diameter
                  <select
                    value={diameter}
                    onChange={(e) => setDiameter(e.target.value)}
                  >
                    <option value="all">All</option>
                    {[...new Set(r.rows.map((b) => b.diameter))]
                      .sort((a, b) => a - b)
                      .map((d) => (
                        <option key={d}>{d}</option>
                      ))}
                  </select>
                </label>
                <label>
                  fy MPa
                  <select
                    value={grade}
                    onChange={(e) => setGrade(e.target.value)}
                  >
                    <option value="all">All</option>
                    {[...new Set(r.rows.map((b) => b.fy))]
                      .sort((a, b) => a - b)
                      .map((d) => (
                        <option key={d}>{d}</option>
                      ))}
                  </select>
                </label>
                <label>
                  Function
                  <select value={fn} onChange={(e) => setFn(e.target.value)}>
                    <option value="all">All</option>
                    <option>Longitudinal — axial/flexural</option>
                    <option>Shear / ties</option>
                  </select>
                </label>
              </div>
              <div className="cqScroll">
                <table>
                  <caption>
                    Detailed estimate · counts include {value.members} identical
                    column(s)
                  </caption>
                  <thead>
                    <tr>
                      {[
                        "Mark",
                        "Zone / piece",
                        "Function",
                        "Ø mm",
                        "fy",
                        "Count",
                        "Length / piece m",
                        "Total length m",
                        "kg/m",
                        "Weight kg",
                      ].map((s) => (
                        <th key={s}>{s}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((b) => (
                      <tr key={b.mark}>
                        <td>{b.mark}</td>
                        <td>
                          {b.zone} / {b.piece}
                        </td>
                        <td>{b.function}</td>
                        <td>{b.diameter}</td>
                        <td>{b.fy}</td>
                        <td>{b.count}</td>
                        <td>
                          {f(b.length, 3)}
                          <br />
                          <small>{b.lengthBasis}</small>
                        </td>
                        <td>{f(b.totalLength, 3)}</td>
                        <td>{f(b.unitWeight, 4)}</td>
                        <td>{f(b.weight)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>
                Filtered subtotal:{" "}
                <strong>{f(rows.reduce((s, b) => s + b.weight, 0))} kg</strong>.
                Overall totals above remain unfiltered.
              </p>
            </>
          ) : null}
          <p className="rcMuted">
            Unit weight = π/4 × (d/1000)² × 7850 kg/m. Shared zone boundaries
            are counted once and assigned to the upper zone. Actual grid spacing
            is fitted at or below the entered maximum.
          </p>
          <h3>Assumptions & limitations</h3>
          <ul>
            {columnQuantityLimitations.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <p>
            ACI hook reference: Table 25.3.2, §§25.3.4–25.3.5. 76.2 mm retains
            the US edition’s 3-inch minimum conservatively. 135° hooks are used
            at both ends in automatic mode; no 90° cross-tie exception is
            applied. Leg counts do not verify confinement, supported-bar
            geometry or joint reinforcement requirements.
          </p>
        </>
      )}
    </section>
  );
}
