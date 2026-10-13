"use client";
import {
  defaultColumnSlenderness,
  type ColumnCheck,
  type ColumnSlendernessInput,
  type RectangularColumnInput,
} from "@nola/calc-core";
import { NumberField, fmt } from "./column-ui";
import { storeyClearHeights } from "@nola/calc-core";

/**
 * ℓu from storey geometry (6.2.4) with a per-direction override, e.g. for
 * intermediate bracing. Overrides are shown in the override colour.
 */
function StoreyLu({
  input,
  onChange,
  axis,
}: {
  input: RectangularColumnInput;
  onChange: (next: RectangularColumnInput) => void;
  axis: "x" | "y";
}) {
  const s = input.storey!;
  const h = storeyClearHeights(s);
  const key = axis === "x" ? "luOverrideX" : "luOverrideY";
  const derived = axis === "x" ? h.derivedX : h.derivedY;
  const over = s[key];
  return (
    <label className={over !== null ? "isOverride" : ""}>
      Unsupported length ℓu
      <span className="rcUnit">mm</span>
      <span className="rebarCustom">
        <input
          type="number"
          step="any"
          aria-label={`ℓu about ${axis} override`}
          placeholder={`${fmt(derived, 0)} (storey geometry)`}
          value={over ?? ""}
          onChange={(e) => {
            const v = Number(e.target.value);
            onChange({
              ...input,
              storey: {
                ...s,
                [key]: e.target.value === "" || !(v > 0) ? null : v,
              },
            });
          }}
        />
        {over !== null ? (
          <>
            <em className="overrideBadge">Override · storey {fmt(derived, 0)}</em>
            <button
              type="button"
              className="linkButton"
              onClick={() => onChange({ ...input, storey: { ...s, [key]: null } })}
            >
              Use {fmt(derived, 0)}
            </button>
          </>
        ) : (
          <small className="rcMuted">
            From storey geometry: H − beam along {axis === "x" ? "Y" : "X"}
          </small>
        )}
      </span>
    </label>
  );
}

/** Slenderness inputs (ACI 318-19 6.2.5, 6.6.4). Changing them clears results. */
export function ColumnSlendernessInputs({
  input,
  onChange,
}: {
  input: RectangularColumnInput;
  onChange: (next: RectangularColumnInput) => void;
}) {
  const sl = input.slenderness ?? defaultColumnSlenderness();
  const set = (next: ColumnSlendernessInput) =>
    onChange({ ...input, slenderness: next });
  const dir = (axis: "x" | "y", label: string) => (
    <fieldset className="rcFields" disabled={!sl.enabled}>
      <legend>{label}</legend>
      {input.storey ? (
        <StoreyLu input={input} onChange={onChange} axis={axis} />
      ) : (
        <NumberField
          label="Unsupported length ℓu"
          unit="mm"
          value={sl[axis].lu}
          onChange={(lu) => set({ ...sl, [axis]: { ...sl[axis], lu } })}
        />
      )}
      <NumberField
        label="Effective length factor k"
        value={sl[axis].k}
        onChange={(k) => set({ ...sl, [axis]: { ...sl[axis], k } })}
      />
      <label className="rcCheckbox">
        <input
          type="checkbox"
          checked={sl[axis].sway}
          onChange={(e) =>
            set({ ...sl, [axis]: { ...sl[axis], sway: e.target.checked } })
          }
        />
        <span>Sway (unbraced) in this direction</span>
      </label>
      {sl[axis].sway && sl.swayMethod === "stability-index" ? (
        <NumberField
          label="Stability index Q (6.6.4.4.1)"
          value={sl[axis].q}
          onChange={(q) => set({ ...sl, [axis]: { ...sl[axis], q } })}
        />
      ) : null}
    </fieldset>
  );
  return (
    <section className={`rcPanel ${sl.enabled ? "" : "cqDisabled"}`}>
      <div className="rcPanelHeading">
        <h2>04 · Slenderness (Moment Magnification)</h2>
        <label className="rcCheckbox">
          <input
            type="checkbox"
            aria-label="Consider slenderness"
            checked={sl.enabled}
            onChange={(e) => set({ ...sl, enabled: e.target.checked })}
          />
          <span>Consider slenderness</span>
        </label>
      </div>
      {!sl.enabled ? (
        <p className="rcMuted">
          Off: the column is treated as short and Mu is used as entered. Turn on
          to apply ACI 318-19 6.2.5 limits and 6.6.4 magnification.
        </p>
      ) : (
        <>
          <div className="rcGrid">
            {dir("x", "Bending about x (Mux) · h = depth")}
            {dir("y", "Bending about y (Muy) · h = width")}
          </div>
          <div className="rcFields">
            <NumberField
              label="βdns, sustained / total axial (6.6.4.4.4)"
              value={sl.betaDns}
              onChange={(betaDns) => set({ ...sl, betaDns })}
            />
            <label>
              Sway moments
              <select
                value={sl.swayMethod}
                onChange={(e) =>
                  set({
                    ...sl,
                    swayMethod: e.target
                      .value as ColumnSlendernessInput["swayMethod"],
                  })
                }
              >
                <option value="second-order">
                  From ETABS P-Δ (second-order) analysis · δs = 1
                </option>
                <option value="stability-index">
                  First-order · δs = 1/(1 − Q) (6.6.4.6.2a)
                </option>
              </select>
            </label>
          </div>
          <label className="rcCheckbox">
            <input
              type="checkbox"
              checked={sl.transverseLoad}
              onChange={(e) => set({ ...sl, transverseLoad: e.target.checked })}
            />
            <span>
              Transverse loads between supports (Cm = 1.0, 6.6.4.5.3b)
            </span>
          </label>
          <p className="rcMuted">
            Enter end moments M1x / M1y in the load table for Cm. Use the same
            moment-diagram sign as Mu: same sign = single curvature. Blank M1
            uses Cm = 1.0 and the single-curvature limit kℓu/r ≤ 22
            (conservative). EI is the larger of 6.6.4.4.4(a) and (b); Ec =
            4700√f′c.
          </p>
        </>
      )}
    </section>
  );
}

export function ColumnSlendernessResults({
  check,
}: {
  check: ColumnCheck | undefined;
}) {
  if (!check?.slenderness) return null;
  const rows = [check.slenderness.x, check.slenderness.y];
  return (
    <section className="rcPanel">
      <h3>Slenderness · {check.load.id}</h3>
      <div className="rcTableWrap">
        <table>
          <thead>
            <tr>
              <th>Axis</th>
              <th>kℓu/r</th>
              <th>Limit</th>
              <th>EI (kN·m²)</th>
              <th>Pc (kN)</th>
              <th>Cm</th>
              <th>δ</th>
              <th>M2 (kN·m)</th>
              <th>Mc (kN·m)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.axis}>
                <th scope="row">
                  M{d.axis} {d.sway ? "· sway" : "· nonsway"}
                </th>
                <td>{fmt(d.klur, 1)}</td>
                <td>{fmt(d.limit, 1)}</td>
                <td>{d.ei === null ? "—" : fmt(d.ei / 1e9, 0)}</td>
                <td>{fmt(d.pc, 0)}</td>
                <td>{fmt(d.cm, 3)}</td>
                <td>{fmt(d.delta, 3)}</td>
                <td>{fmt(d.m2)}</td>
                <td>{fmt(d.mc)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="rcMuted">
        {rows.map((d) => (
          <li key={d.axis}>
            M{d.axis}: {d.note}
          </li>
        ))}
      </ul>
      <p className="rcMuted">
        ACI 318-19: r = 0.3h (6.2.5.2); limits 6.2.5.1; Pc = π²EI/(kℓu)²
        (6.6.4.4.2); δns = Cm/(1 − Pu/0.75Pc) ≥ 1 (6.6.4.5.2); M2,min = Pu(15 +
        0.03h) (6.6.4.5.4); total second-order moment ≤ 1.4 × first-order
        (6.2.5.3).
      </p>
    </section>
  );
}
