"use client";
/**
 * Custom anchor rod coordinates (engine 0.6.0): rod centres in mm from the
 * column centroid (x east, y north). Rows can be pasted from Excel as
 * "ID  x  y" (tab, comma or space separated; a header row is skipped).
 */
import { useState } from "react";

export interface RodPoint {
  id: string;
  x: number;
  y: number;
}

/** Parse pasted rows: "ID x y" or "x y" per line. Returns null if none. */
export function parseRodPoints(text: string): RodPoint[] | null {
  const out: RodPoint[] = [];
  for (const line of text.split(/\r?\n/)) {
    const cells = line
      .trim()
      .split(/[\t,;]+|\s{1,}/)
      .filter(Boolean);
    if (!cells.length) continue;
    const nums = cells.map(Number);
    if (
      cells.length >= 3 &&
      Number.isFinite(nums[1]) &&
      Number.isFinite(nums[2])
    )
      out.push({ id: cells[0]!.slice(0, 12), x: nums[1]!, y: nums[2]! });
    else if (
      cells.length === 2 &&
      Number.isFinite(nums[0]) &&
      Number.isFinite(nums[1])
    )
      out.push({ id: `A${out.length + 1}`, x: nums[0]!, y: nums[1]! });
    // Anything else (a header row) is skipped.
  }
  return out.length ? out : null;
}

export function BasePlateRodPoints({
  points,
  onChange,
  onFromGrid,
}: {
  points: RodPoint[];
  onChange: (points: RodPoint[]) => void;
  onFromGrid: () => void;
}) {
  const [paste, setPaste] = useState("");
  const [pasteMsg, setPasteMsg] = useState("");
  const edit = (k: number, patch: Partial<RodPoint>) =>
    onChange(points.map((p, n) => (n === k ? { ...p, ...patch } : p)));
  const add = () => {
    let n = points.length + 1;
    while (points.some((p) => p.id === `A${n}`)) n++;
    onChange([...points, { id: `A${n}`, x: 0, y: 0 }]);
  };
  const ids = points.map((p) => p.id);
  const dup = new Set(ids.filter((id, k) => ids.indexOf(id) !== k));
  return (
    <div className="bpRodPoints">
      <p className="slabHint">
        Rod centres from the column centroid, mm (x east, y north). Checks,
        drawings and the report use these points.
      </p>
      <div className="slabTableWrap">
        <table className="bpLoads" aria-label="Anchor rod coordinates">
          <thead>
            <tr>
              <th>ID</th>
              <th>x mm</th>
              <th>y mm</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {points.map((p, k) => (
              <tr key={k}>
                <td>
                  <input
                    value={p.id}
                    maxLength={12}
                    aria-label={`Rod ${k + 1} ID`}
                    aria-invalid={dup.has(p.id) || undefined}
                    onChange={(e) => edit(k, { id: e.target.value })}
                  />
                </td>
                {(["x", "y"] as const).map((key) => (
                  <td key={key}>
                    <input
                      type="number"
                      step="any"
                      aria-label={`${p.id} ${key}`}
                      value={Number.isFinite(p[key]) ? p[key] : ""}
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
                  <button
                    className="suiteSecondary"
                    onClick={() => onChange(points.filter((_, n) => n !== k))}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {dup.size > 0 && (
        <p className="slabHint" role="alert">
          Duplicate rod IDs: {[...dup].join(", ")}.
        </p>
      )}
      <div className="bpRodPointActions">
        <button
          className="suiteSecondary"
          onClick={add}
          disabled={points.length >= 64}
        >
          Add rod
        </button>
        <button
          className="suiteSecondary"
          onClick={onFromGrid}
          title="Replace the table with the rods of the nx × ny grid"
        >
          Start from current grid
        </button>
      </div>
      <label className="slabNumeric bpRodPaste">
        <span>Paste from Excel (ID, x, y per row)</span>
        <textarea
          rows={3}
          value={paste}
          aria-label="Paste rod coordinates"
          onChange={(e) => {
            setPaste(e.target.value);
            setPasteMsg("");
          }}
        />
      </label>
      <button
        className="suiteSecondary"
        disabled={!paste.trim()}
        onClick={() => {
          const pts = parseRodPoints(paste);
          if (!pts) {
            setPasteMsg("No rows with numeric x and y found.");
            return;
          }
          onChange(pts.slice(0, 64));
          setPaste("");
          setPasteMsg(`${Math.min(pts.length, 64)} rods loaded.`);
        }}
      >
        Replace table with pasted rows
      </button>
      {pasteMsg && <p className="slabHint">{pasteMsg}</p>}
    </div>
  );
}

/** Read-only coordinates of the grid / perimeter rods with an edit switch. */
export function BasePlateRodCoordinates({
  points,
  onEdit,
}: {
  points: RodPoint[];
  onEdit: () => void;
}) {
  const n0 = (v: number) => (Math.abs(v) < 0.05 ? "0" : v.toFixed(1));
  return (
    <details className="bpRodPoints" open>
      <summary>Rod coordinates ({points.length} rods)</summary>
      <p className="slabHint">
        Rod centres from the column centroid, mm (x east, y north).
      </p>
      <div className="slabTableWrap">
        <table className="bpLoads" aria-label="Anchor rod coordinates">
          <thead>
            <tr>
              <th>ID</th>
              <th>x mm</th>
              <th>y mm</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.id}>
                <td>{p.id}</td>
                <td>{n0(p.x)}</td>
                <td>{n0(p.y)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        className="suiteSecondary"
        onClick={onEdit}
        title="Switch the layout to Custom coordinates, starting from these rods"
      >
        Edit coordinates
      </button>
    </details>
  );
}
