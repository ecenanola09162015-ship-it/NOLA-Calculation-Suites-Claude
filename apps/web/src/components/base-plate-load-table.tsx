"use client";
/**
 * Editable combination table (ID, P, Mx, My, Vx, Vy, E). Used for the LRFD
 * combinations that drive the ACI 318 checks when the steel method is ASD.
 */
import type { BasePlateLoad } from "@nola/calc-core";

export function BasePlateLoadTable({
  loads,
  onChange,
  caption,
  prefix = "U",
}: {
  loads: BasePlateLoad[];
  onChange: (loads: BasePlateLoad[]) => void;
  caption: string;
  prefix?: string;
}) {
  const edit = (k: number, patch: Partial<BasePlateLoad>) =>
    onChange(loads.map((l, n) => (n === k ? { ...l, ...patch } : l)));
  const add = () => {
    let n = loads.length + 1;
    while (loads.some((l) => l.id === `${prefix}${n}`)) n++;
    onChange([
      ...loads,
      {
        id: `${prefix}${n}`,
        pu: 100,
        mx: 0,
        my: 0,
        vx: 0,
        vy: 0,
        seismic: false,
        included: true,
      },
    ]);
  };
  return (
    <>
      <div className="slabTableWrap">
        <table className="bpLoads" aria-label={caption}>
          <thead>
            <tr>
              <th>Use</th>
              <th>ID</th>
              <th>Pu kN (+C)</th>
              <th>Mx kN·m</th>
              <th>My kN·m</th>
              <th>Vx kN</th>
              <th>Vy kN</th>
              <th>E</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loads.map((l, k) => (
              <tr key={k}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Include ${l.id}`}
                    checked={l.included}
                    onChange={(e) => edit(k, { included: e.target.checked })}
                  />
                </td>
                <td>
                  <input
                    value={l.id}
                    maxLength={30}
                    onChange={(e) => edit(k, { id: e.target.value })}
                  />
                </td>
                {(["pu", "mx", "my", "vx", "vy"] as const).map((key) => (
                  <td key={key}>
                    <input
                      type="number"
                      step="any"
                      aria-label={`${l.id} ${key}`}
                      value={Number.isFinite(l[key]) ? l[key] : ""}
                      onChange={(e) =>
                        edit(k, {
                          [key]:
                            e.target.value === ""
                              ? NaN
                              : Number(e.target.value),
                        })
                      }
                    />
                  </td>
                ))}
                <td>
                  <input
                    type="checkbox"
                    aria-label={`${l.id} includes earthquake`}
                    checked={l.seismic}
                    onChange={(e) => edit(k, { seismic: e.target.checked })}
                  />
                </td>
                <td>
                  <button
                    className="suiteSecondary"
                    onClick={() => onChange(loads.filter((_, n) => n !== k))}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        className="suiteSecondary"
        onClick={add}
        disabled={loads.length >= 100}
      >
        Add LRFD combination
      </button>
    </>
  );
}
