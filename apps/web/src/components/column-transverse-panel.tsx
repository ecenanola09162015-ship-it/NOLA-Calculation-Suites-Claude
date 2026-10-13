"use client";
import type {
  ColumnQuantityInput,
  ColumnTieDesignInput,
  RectangularColumnInput,
  TransverseResult,
} from "@nola/calc-core";
import { ColumnTieSection } from "./column-tie-section";
import { DesignStatus } from "./design-review-panel";
import { NumberField, fmt } from "./column-ui";
import type { DesignCheckPolicy } from "@nola/calc-core";

type Props = {
  input: RectangularColumnInput;
  value: ColumnTieDesignInput;
  onChange: (next: ColumnTieDesignInput) => void;
  design: TransverseResult | null;
  error: string;
  policy: DesignCheckPolicy;
};

/** Zone-like object so the estimate's section drawing can be reused. */
function designZone(value: ColumnTieDesignInput, design: TransverseResult) {
  return {
    name: "Design",
    start: 0,
    end: 1,
    spacing: design.adopted.sEnd,
    diameter: value.tie.diameter,
    fy: value.tie.fyt,
    hoops: 1,
    legsX: design.layout.legsX,
    legsY: design.layout.legsY,
    crossXPositions: design.layout.crossX,
    crossYPositions: design.layout.crossY,
  };
}

function TieArrangementFields({
  value,
  onChange,
}: Pick<Props, "value" | "onChange">) {
  const tie = (k: keyof ColumnTieDesignInput["tie"], v: number) =>
    onChange({ ...value, tie: { ...value.tie, [k]: v } });
  return (
    <div className="rcFields">
      <NumberField
        label="Tie diameter"
        unit="mm"
        value={value.tie.diameter}
        onChange={(v) => tie("diameter", v)}
      />
      <NumberField
        label="Tie fyt"
        unit="MPa"
        value={value.tie.fyt}
        onChange={(v) => tie("fyt", v)}
      />
      <NumberField
        label="Interior cross-ties ∥ X"
        value={value.tie.interiorX}
        onChange={(v) => tie("interiorX", v)}
      />
      <NumberField
        label="Interior cross-ties ∥ Y"
        value={value.tie.interiorY}
        onChange={(v) => tie("interiorY", v)}
      />
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
  return (
    <svg
      viewBox="0 0 300 370"
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
          <text x="148" y={top + (lo * S) / 2 + 4} fontSize="11" fill={end}>
            lo = {lo} · s = {sEnd}
          </text>
          <text x="148" y={top + H / 2 + 4} fontSize="11" fill={mid}>
            s = {sMid}
          </text>
          <text x="148" y={top + H - (lo * S) / 2 + 4} fontSize="11" fill={end}>
            lo = {lo} · s = {sEnd}
          </text>
        </>
      ) : (
        <text x="148" y={top + H / 2} fontSize="11" fill={end}>
          Full height · s = {sEnd}
        </text>
      )}
      <text x="10" y="362" fontSize="10">
        Clear height between joint faces; joints shaded (18.8.3)
      </text>
    </svg>
  );
}

function ChecksTable({
  rows,
  policy,
}: {
  rows: TransverseResult["checks"];
  policy: DesignCheckPolicy;
}) {
  return (
    <div className="rcTableWrap">
      <table>
        <thead>
          <tr>
            <th>Check</th>
            <th>Detail</th>
            <th>Reference</th>
            <th>DCR</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              <th scope="row">{c.label}</th>
              <td>{c.detail}</td>
              <td className="designClause">{c.clause}</td>
              <td>{fmt(c.dcr, 3)}</td>
              <td>
                <DesignStatus dcr={c.dcr} policy={policy} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ColumnShearPanel(props: Props) {
  const { input, value, onChange, design, error, policy } = props;
  const on = value.shear.enabled;
  const rows = design?.checks.filter((c) => c.id.startsWith("shear")) ?? [];
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
          <TieArrangementFields value={value} onChange={onChange} />
          {error ? <p className="rcAlert">{error}</p> : null}
          {design ? (
            <>
              <div className="cqDrawings">
                <figure>
                  <figcaption>Vuy (along y) · pairs with Mux</figcaption>
                  <ShearDirectionFigure input={input} design={design} dir="y" />
                </figure>
                <figure>
                  <figcaption>Vux (along x) · pairs with Muy</figcaption>
                  <ShearDirectionFigure input={input} design={design} dir="x" />
                </figure>
              </div>
              <ChecksTable rows={rows} policy={policy} />
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
  const rows = design?.checks.filter((x) => !x.id.startsWith("shear")) ?? [];
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
            <TieArrangementFields value={value} onChange={onChange} />
          ) : (
            <p className="rcMuted">
              Tie arrangement is set in panel 05: D{value.tie.diameter}, fyt{" "}
              {value.tie.fyt} MPa, {value.tie.interiorX} / {value.tie.interiorY}{" "}
              interior cross-ties.
            </p>
          )}
          {error ? <p className="rcAlert">{error}</p> : null}
          {design ? (
            <>
              <div className="cqSummary">
                <div>
                  <strong>{design.adopted.lo || "—"} mm</strong>Zone length lo
                  <small>{design.loBasis}</small>
                </div>
                <div>
                  <strong>{fmt(design.layout.hx, 0)} mm</strong>hx
                  <small>
                    {design.layout.nl} of {input.bars.length} bars supported
                  </small>
                </div>
                {design.seismic ? (
                  <div>
                    <strong>
                      {fmt(design.adopted.ve.x, 1)} /{" "}
                      {fmt(design.adopted.ve.y, 1)} kN
                    </strong>
                    Ve x / y<small>{design.ve.basis}</small>
                  </div>
                ) : null}
              </div>
              <div className="cqDrawings">
                <figure>
                  <figcaption>Elevation · Adopted Confinement Zones</figcaption>
                  <ElevationFigure value={value} design={design} />
                </figure>
                <figure>
                  <figcaption>
                    Section · {design.layout.legsX} legs ∥ X,{" "}
                    {design.layout.legsY} legs ∥ Y · hx ={" "}
                    {fmt(design.layout.hx, 0)} mm
                  </figcaption>
                  <ColumnTieSection
                    section={input}
                    zone={designZone(value, design)}
                    basis="aci135"
                    color="#b45309"
                  />
                </figure>
              </div>
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
              <ChecksTable rows={rows} policy={policy} />
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
  onChange,
  design,
  quantity,
  onAdopt,
}: {
  value: ColumnTieDesignInput;
  onChange: (next: ColumnTieDesignInput) => void;
  design: TransverseResult | null;
  quantity: ColumnQuantityInput;
  onAdopt: () => void;
}) {
  if (!design || (!value.shear.enabled && !value.confinement.enabled))
    return null;
  const o = value.override;
  const set = (k: keyof ColumnTieDesignInput["override"], v: number) =>
    onChange({
      ...value,
      override: { ...o, [k]: Number.isFinite(v) && v > 0 ? v : null },
    });
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
      <h2>07 · Adopted Transverse Design</h2>
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
      <div className="rcFields">
        {design.seismic ? (
          <NumberField
            label={`lo · recommended ${design.recommended.lo}`}
            unit="mm"
            value={o.lo ?? NaN}
            onChange={(v) => set("lo", v)}
          />
        ) : null}
        {design.seismic ? (
          <NumberField
            label={`s in lo · recommended ${design.recommended.sEnd}`}
            unit="mm"
            value={o.sEnd ?? NaN}
            onChange={(v) => set("sEnd", v)}
          />
        ) : null}
        <NumberField
          label={`s ${design.seismic ? "outside lo" : "full height"} · recommended ${design.recommended.sMid}`}
          unit="mm"
          value={o.sMid ?? NaN}
          onChange={(v) => set("sMid", v)}
        />
        {design.seismic ? (
          <>
            <NumberField
              label={`Ve x · calculated ${fmt((2 * design.ve.mprY * 1000) / value.confinement.clearHeight, 1)}`}
              unit="kN"
              value={o.veX ?? NaN}
              onChange={(v) => set("veX", v)}
            />
            <NumberField
              label={`Ve y · calculated ${fmt((2 * design.ve.mprX * 1000) / value.confinement.clearHeight, 1)}`}
              unit="kN"
              value={o.veY ?? NaN}
              onChange={(v) => set("veY", v)}
            />
          </>
        ) : null}
      </div>
      <p className="rcMuted">
        Blank fields use the recommended values (rounded down to 25 mm).
        Overrides are re-checked in panels 05 and 06 and the Design Review.
      </p>
      <div className="cqSummary">
        {design.seismic ? (
          <div>
            <strong>
              {design.adopted.lo} mm @ {design.adopted.sEnd}
            </strong>
            lo zones (each end + joint)
          </div>
        ) : null}
        <div>
          <strong>{design.adopted.sMid} mm</strong>
          {design.seismic ? "Outside lo" : "Full height"}
        </div>
        <div>
          <strong>
            D{value.tie.diameter} · {design.layout.legsX}×{design.layout.legsY}{" "}
            legs
          </strong>
          Hoop + cross-ties
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
