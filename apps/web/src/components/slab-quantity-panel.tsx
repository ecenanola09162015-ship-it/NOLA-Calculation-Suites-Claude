"use client";
import { useMemo, useState } from "react";
import { SlabQuantityPlan } from "./slab-quantity-plan";
import {
  estimateSlabQuantity,
  slabQuantityEdges,
  slabQuantityLimitations,
  type SlabInput,
  type SlabQuantityInput,
} from "@nola/calc-core";
const fmt = (v: number, p = 2) =>
  Number.isFinite(v)
    ? v.toLocaleString("en-US", {
        minimumFractionDigits: p,
        maximumFractionDigits: p,
      })
    : "—";
function NumberField({
  label,
  value,
  change,
  placeholder,
}: {
  label: string;
  value: number | null;
  change: (v: number | null) => void;
  placeholder?: string;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        step="any"
        value={value === null || !Number.isFinite(value) ? "" : value}
        placeholder={placeholder}
        onChange={(e) =>
          change(e.target.value === "" ? null : Number(e.target.value))
        }
      />
    </label>
  );
}
export function SlabQuantityPanel({
  input,
  value,
  onChange,
  onResetCutoffs,
}: {
  input: SlabInput;
  value: SlabQuantityInput;
  onChange: (v: SlabQuantityInput) => void;
  onResetCutoffs: () => void;
}) {
  const [diameter, setDiameter] = useState("all"),
    [grade, setGrade] = useState("all"),
    [fn, setFn] = useState("all"),
    [group, setGroup] = useState("all");
  const calculated = useMemo(() => {
    try {
      return { result: estimateSlabQuantity(input, value), error: "" };
    } catch (e) {
      return {
        result: null,
        error: e instanceof Error ? e.message : "Check estimate inputs.",
      };
    }
  }, [input, value]);
  const r = calculated.result;
  const rows =
    r?.rows.filter(
      (b) =>
        (diameter === "all" || String(b.diameter) === diameter) &&
        (grade === "all" || String(b.fy) === grade) &&
        (fn === "all" || b.function === fn) &&
        (group === "all" || b.group === group),
    ) ?? [];
  return (
    <section
      id="slab-quantity"
      className={`slabPanel cqPanel sqPanel ${!value.enabled ? "cqDisabled" : ""}`}
    >
      <h2>Quantity Estimate · Slab Panel</h2>
      <label className="cqToggle">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(e) => onChange({ ...value, enabled: e.target.checked })}
        />
        Enable Quantity Estimate
      </label>
      {value.enabled ? (
        <>
          <div className="cqControls">
            <NumberField
              label="Clear Panel X (mm)"
              value={value.clearX}
              placeholder={`Auto: ${input.lx * 1000}`}
              change={(v) => onChange({ ...value, clearX: v })}
            />
            <NumberField
              label="Clear Panel Y (mm)"
              value={value.clearY}
              placeholder={`Auto: ${input.ly * 1000}`}
              change={(v) => onChange({ ...value, clearY: v })}
            />
            <NumberField
              label="Identical Slab Panels"
              value={value.members}
              change={(v) => onChange({ ...value, members: v ?? NaN })}
            />
          </div>
          <p>
            Enter Clear Dimensions Between Beam Faces. Blank Dimensions Use The
            Analysis Spans; Confirm This Assumption. Bounding Beams Are Excluded
            From Concrete Volume.
          </p>
          <h3>Bounding Beams &amp; Bar End Details</h3>
          <div className="sqBeams">
            {slabQuantityEdges.map((edge) => {
              const beam = value.beams[edge];
              const edit = (next: typeof beam) =>
                onChange({ ...value, beams: { ...value.beams, [edge]: next } });
              return (
                <fieldset key={edge}>
                  <legend>{edge[0].toUpperCase() + edge.slice(1)} Beam</legend>
                  <div className="cqControls">
                    {(["width", "depth", "cover"] as const).map((k) => (
                      <NumberField
                        key={k}
                        label={`${edge[0].toUpperCase() + edge.slice(1)} ${k[0].toUpperCase() + k.slice(1)} (mm)`}
                        value={beam[k]}
                        change={(v) => edit({ ...beam, [k]: v ?? NaN })}
                      />
                    ))}
                  </div>
                  {(["main", "extra"] as const).map((g) => (
                    <div key={g} className="sqEndGroup">
                      <strong
                        className={
                          g === "main" ? "slabMainLabel" : "slabExtraLabel"
                        }
                      >
                        {g === "main" ? "MAIN BARS" : "EXTRA BARS"}
                      </strong>
                      <div className="cqControls">
                        <label>
                          Extension Into Beam
                          <select
                            value={beam[g].extensionMode}
                            onChange={(e) =>
                              edit({
                                ...beam,
                                [g]: {
                                  ...beam[g],
                                  extensionMode: e.target
                                    .value as typeof beam.main.extensionMode,
                                },
                              })
                            }
                          >
                            <option value="half">
                              Half Beam Width (Default)
                            </option>
                            <option value="cover">
                              To Far-Side Clear Cover
                            </option>
                            <option value="custom">Custom Extension</option>
                          </select>
                        </label>
                        {beam[g].extensionMode === "custom" ? (
                          <NumberField
                            label="Custom Extension (mm)"
                            value={beam[g].extension}
                            change={(v) =>
                              edit({
                                ...beam,
                                [g]: { ...beam[g], extension: v ?? NaN },
                              })
                            }
                          />
                        ) : null}
                        <label>
                          End Detail
                          <select
                            value={beam[g].shape}
                            onChange={(e) =>
                              edit({
                                ...beam,
                                [g]: {
                                  ...beam[g],
                                  shape: e.target
                                    .value as typeof beam.main.shape,
                                },
                              })
                            }
                          >
                            <option value="straight">Straight</option>
                            <option value="L-hook">L-Hook</option>
                          </select>
                        </label>
                        {beam[g].shape === "L-hook" ? (
                          <label>
                            Hook Direction
                            <select
                              value={beam[g].hookDirection}
                              onChange={(e) =>
                                edit({
                                  ...beam,
                                  [g]: {
                                    ...beam[g],
                                    hookDirection: e.target.value as
                                      "up" | "down",
                                  },
                                })
                              }
                            >
                              <option value="down">
                                Down Into Beam (Default)
                              </option>
                              <option value="up">Up</option>
                            </select>
                          </label>
                        ) : null}
                        {beam[g].shape === "L-hook" ? (
                          <NumberField
                            label="L-Hook Tail (mm)"
                            value={beam[g].hookTail}
                            placeholder="Auto: 12db"
                            change={(v) =>
                              edit({
                                ...beam,
                                [g]: { ...beam[g], hookTail: v },
                              })
                            }
                          />
                        ) : null}
                      </div>
                    </div>
                  ))}
                </fieldset>
              );
            })}
          </div>
          <p>
            Clear Cover Is Measured To The Slab Bar's Outer Surface At The Far
            Beam Face. The Bar Centreline Stops Half A Bar Diameter Before That
            Cover Line. End Details Apply To Each Active Layer In The Selected
            MAIN/EXTRA Group; 12db Uses Each Layer's Diameter.
          </p>
          <div className="cqActions">
            <button
              type="button"
              className="suiteSecondary"
              onClick={onResetCutoffs}
            >
              Reset Extra-Bar Lengths To L/3 Top And L/2 Bottom
            </button>
            <a className="suiteSecondary" href="#slab-cutoffs">
              Edit Extra-Bar Lengths ↑
            </a>
          </div>
          <p>
            Extra Lengths Follow The Shared Design Cutoff Inputs Above. Top Bars
            Extend From Each Fixed Support. Bottom Extras Normally Terminate At
            Midspan; Beam Extensions Apply If Their Overrides Reach A Support.
            MAIN BARS Are Continuous.
          </p>
          {calculated.error ? (
            <p className="rcAlert" role="alert">
              {calculated.error}
            </p>
          ) : null}
          {r ? (
            <>
              <div className="cqSummary">
                <div>
                  <strong>{fmt(r.main)} kg</strong>MAIN BARS
                  <small>{fmt(r.mainPercent)}% Of Total Steel</small>
                </div>
                <div>
                  <strong>{fmt(r.extra)} kg</strong>EXTRA BARS
                  <small>{fmt(r.extraPercent)}% Of Total Steel</small>
                </div>
                <div>
                  <strong>{fmt(r.total)} kg</strong>Total Steel
                </div>
                <div>
                  <strong>{fmt(r.concrete, 3)} m³</strong>Slab Concrete Only
                </div>
                <div>
                  <strong>{fmt(r.ratio)} kg/m³</strong>Steel / Slab Concrete
                </div>
              </div>
              <p>
                Flexural Reinforcement: {fmt(r.flexural)} kg (
                {fmt(r.flexuralPercent)}%). Distribution Reinforcement:{" "}
                {fmt(r.distribution)} kg ({fmt(r.distributionPercent)}%).
                Percentages Use Total Unfiltered Steel Weight.
              </p>
              <div className="cqScroll">
                <table>
                  <caption>Bounding Beam Geometry &amp; End Settings</caption>
                  <thead>
                    <tr>
                      <th>Edge</th>
                      <th>Width × Depth mm</th>
                      <th>Far-Side Cover mm</th>
                      <th>MAIN BARS</th>
                      <th>EXTRA BARS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {slabQuantityEdges.map((e) => (
                      <tr key={e}>
                        <th>{e}</th>
                        <td>
                          {value.beams[e].width} × {value.beams[e].depth}
                        </td>
                        <td>{value.beams[e].cover}</td>
                        {(["main", "extra"] as const).map((g) => (
                          <td key={g}>
                            {value.beams[e][g].extensionMode} ·{" "}
                            {value.beams[e][g].shape}
                            {value.beams[e][g].shape === "L-hook"
                              ? ` · ${value.beams[e][g].hookDirection} · Tail ${value.beams[e][g].hookTail === null ? "12db" : `${value.beams[e][g].hookTail} mm`}`
                              : ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="sqDiagrams">
                <SlabQuantityPlan result={r} value={value} face="bottom" />
                <SlabQuantityPlan result={r} value={value} face="top" />
                {(["X", "Y"] as const).map((axis) => {
                  const near = axis === "X" ? "west" : "south",
                    far = axis === "X" ? "east" : "north",
                    span = axis === "X" ? r.x : r.y;
                  const n = value.beams[near],
                    f = value.beams[far],
                    sx = 780 / (span + n.width + f.width),
                    sy = 190 / Math.max(n.depth, f.depth, input.h);
                  const px = (p: number) => 70 + (p + n.width) * sx,
                    top = 50,
                    base = top + input.h * sy;
                  return (
                    <figure key={axis}>
                      <figcaption>
                        Estimate Section · {axis} Direction · Clear Span{" "}
                        {fmt(span, 0)} mm
                      </figcaption>
                      <svg
                        viewBox="0 0 920 310"
                        role="img"
                        aria-label={`Slab estimate ${axis} section with beam extensions and hook tails`}
                      >
                        <rect
                          x={px(-n.width)}
                          y={top}
                          width={n.width * sx}
                          height={n.depth * sy}
                          fill="#dce8ec"
                          stroke="#627987"
                        />
                        <rect
                          x={px(span)}
                          y={top}
                          width={f.width * sx}
                          height={f.depth * sy}
                          fill="#dce8ec"
                          stroke="#627987"
                        />
                        <rect
                          x={px(0)}
                          y={top}
                          width={span * sx}
                          height={input.h * sy}
                          fill="#f0f4f6"
                          stroke="#627987"
                        />
                        {r.rows
                          .filter((b) => b.axis === axis)
                          .map((b) => {
                            const y = base - b.z * sy,
                              start = px(b.start - b.nearExtension * 1000),
                              end = px(b.end + b.farExtension * 1000),
                              sign = b.nearTailSign;
                            return (
                              <path
                                key={b.mark}
                                data-bar-group={b.group}
                                d={`M ${start} ${y + sign * b.nearTail * 1000 * sy} L ${start} ${y} L ${end} ${y} L ${end} ${y + b.farTailSign * b.farTail * 1000 * sy}`}
                                fill="none"
                                stroke={
                                  b.group === "MAIN BARS"
                                    ? "#2468ae"
                                    : "#df7620"
                                }
                                strokeWidth={Math.max(1, b.diameter * sy)}
                                strokeLinejoin="round"
                              />
                            );
                          })}
                        <text x={px(0)} y="270" fontSize="12">
                          MAIN BARS: Blue · EXTRA BARS: Orange · Vertical Scale
                          Exaggerated
                        </text>
                        <text x={px(0)} y="290" fontSize="11">
                          Beam Depths And End Allowances Shown; Bend Arcs
                          Excluded From Estimate
                        </text>
                      </svg>
                    </figure>
                  );
                })}
              </div>
              {r.warnings.length ? (
                <ul className="slabWarnings">
                  {r.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              ) : null}
              <div className="cqFilters">
                {(
                  [
                    [
                      "Diameter",
                      diameter,
                      setDiameter,
                      [...new Set(r.rows.map((b) => String(b.diameter)))],
                    ],
                    [
                      "fy (MPa)",
                      grade,
                      setGrade,
                      [...new Set(r.rows.map((b) => String(b.fy)))],
                    ],
                    [
                      "Function",
                      fn,
                      setFn,
                      [...new Set(r.rows.map((b) => b.function))],
                    ],
                    ["Bar Group", group, setGroup, ["MAIN BARS", "EXTRA BARS"]],
                  ] as const
                ).map(([label, v, set, options]) => (
                  <label key={label}>
                    {label}
                    <select value={v} onChange={(e) => set(e.target.value)}>
                      <option value="all">All</option>
                      {options.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <div className="cqScroll">
                <table>
                  <caption>
                    Detailed Slab Estimate · {value.members} Panel(s) · Lengths
                    In Metres
                  </caption>
                  <thead>
                    <tr>
                      {[
                        "Mark",
                        "Group / Layer",
                        "Function",
                        "Ø mm",
                        "fy",
                        "Count",
                        "Slab Body",
                        "Near / Far Extension",
                        "Near / Far Hook Tail",
                        "Length / Piece",
                        "Total Length",
                        "kg/m",
                        "Weight kg",
                      ].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((b) => (
                      <tr key={b.mark}>
                        <td>{b.mark}</td>
                        <td>
                          {b.group}
                          <br />
                          {b.layer} · {b.axis}
                        </td>
                        <td>{b.function}</td>
                        <td>{b.diameter}</td>
                        <td>{b.fy}</td>
                        <td>{b.count}</td>
                        <td>{fmt(b.body, 3)}</td>
                        <td>
                          {fmt(b.nearExtension, 3)} / {fmt(b.farExtension, 3)}
                        </td>
                        <td>
                          {fmt(b.nearTail, 3)} / {fmt(b.farTail, 3)}
                        </td>
                        <td>{fmt(b.length, 3)}</td>
                        <td>{fmt(b.totalLength, 3)}</td>
                        <td>{fmt(b.unitWeight, 4)}</td>
                        <td>{fmt(b.weight)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>
                Filtered Subtotal:{" "}
                <strong>
                  {fmt(rows.reduce((s, b) => s + b.weight, 0))} kg
                </strong>
                . Overall Totals Remain Unfiltered.
              </p>
            </>
          ) : null}
          <h3>Assumptions &amp; Limitations</h3>
          <p>Unit Weight = π/4 × (d/1000)² × 7850 kg/m.</p>
          <ul>
            {slabQuantityLimitations.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </>
      ) : (
        <p>Estimate Disabled. Inputs Are Retained.</p>
      )}
    </section>
  );
}
