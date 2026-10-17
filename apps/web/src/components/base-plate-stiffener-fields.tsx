"use client";
/**
 * Base plate stiffeners: layout chooser with true-scale plan thumbnails,
 * then plate size, material, welds, flexure section and plate-panel method.
 */
import {
  basePlateColumnRects,
  basePlateStiffening,
  defaultStiffenerInput,
  stiffenerLayoutInfo,
  stiffenerLayoutsFor,
  type BasePlateInput,
  type StiffenerLayout,
} from "@nola/calc-core";

type Stiff = BasePlateInput["stiffeners"];
const steels = [
  { label: "ASTM A36 (Fy 248)", fy: 248 },
  { label: "ASTM A572 Gr 50 (Fy 345)", fy: 345 },
  { label: "SS400 / JIS G3101 (Fy 245)", fy: 245 },
];

/** Plan thumbnail of a layout for the current column, plate and rotation. */
function Thumb({
  input,
  layout,
}: {
  input: BasePlateInput;
  layout: StiffenerLayout;
}) {
  const i = { ...input, stiffeners: { ...input.stiffeners, layout } };
  const st = basePlateStiffening(i);
  const size = 64,
    pad = 6;
  const s = (size - 2 * pad) / Math.max(i.plate.bx, i.plate.by);
  const X = (x: number) => size / 2 + x * s,
    Y = (y: number) => size / 2 - y * s;
  const ink = "#24476b";
  return (
    <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <rect
        x={X(-i.plate.bx / 2)}
        y={Y(i.plate.by / 2)}
        width={i.plate.bx * s}
        height={i.plate.by * s}
        fill="#a9c1d9"
        stroke="#173a5e"
        strokeWidth="1"
      />
      {i.column.family === "HSS-ROUND" ? (
        <circle
          cx={X(0)}
          cy={Y(0)}
          r={(i.column.d / 2) * s}
          fill="none"
          stroke={ink}
          strokeWidth={Math.max(i.column.tf * s, 1.2)}
        />
      ) : (
        basePlateColumnRects(i).map((r, k) => (
          <rect
            key={k}
            x={X(r.x0)}
            y={Y(r.y1)}
            width={(r.x1 - r.x0) * s}
            height={(r.y1 - r.y0) * s}
            fill={i.column.family === "I" ? ink : "none"}
            stroke={ink}
            strokeWidth={i.column.family === "I" ? 0.5 : 1.6}
          />
        ))
      )}
      {(st?.plates ?? []).map((p) => {
        const t = Math.max(i.stiffeners.t * s, 1.6);
        const a0 = p.side * p.root,
          a1 = p.side * p.tip;
        return p.axis === "x" ? (
          <rect
            key={p.id}
            x={X(Math.min(a0, a1))}
            y={Y(p.pos) - t / 2}
            width={Math.abs(a1 - a0) * s}
            height={t}
            fill="#e67e00"
          />
        ) : (
          <rect
            key={p.id}
            x={X(p.pos) - t / 2}
            y={Y(Math.max(a0, a1))}
            width={t}
            height={Math.abs(a1 - a0) * s}
            fill="#e67e00"
          />
        );
      })}
    </svg>
  );
}

function Num({
  label,
  value,
  onChange,
  unit = "mm",
  title,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  unit?: string;
  title?: string;
}) {
  return (
    <label className="slabNumeric" title={title}>
      <span>
        {label} {unit && <small>({unit})</small>}
      </span>
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

export function BasePlateStiffenerFields({
  input,
  onChange,
}: {
  input: BasePlateInput;
  onChange: (s: Stiff) => void;
}) {
  const s = input.stiffeners ?? defaultStiffenerInput();
  const set = (patch: Partial<Stiff>) => onChange({ ...s, ...patch });
  const layouts = stiffenerLayoutsFor(input.column.family);
  return (
    <div className="bpStiffeners">
      <div
        className="bpStiffChoices"
        role="radiogroup"
        aria-label="Stiffener layout"
      >
        {layouts.map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={s.layout === l}
            title={stiffenerLayoutInfo[l].description}
            onClick={() => set({ layout: l })}
          >
            <Thumb input={input} layout={l} />
            <span>{stiffenerLayoutInfo[l].label}</span>
          </button>
        ))}
      </div>
      {s.layout !== "none" && (
        <>
          <p className="slabMuted">
            {stiffenerLayoutInfo[s.layout].description} Stiffened bases are
            outside the AISC DG1 scope; the method is printed with the results.
          </p>
          <div className="slabFieldGrid">
            <Num
              label="Thickness ts"
              value={s.t}
              onChange={(t) => set({ t })}
            />
            <Num
              label="Height at column hc"
              value={s.hc}
              onChange={(hc) => set({ hc })}
            />
            <Num
              label="Height at edge he"
              value={s.he}
              onChange={(he) => set({ he })}
              title="0 = triangular stiffener"
            />
            <Num
              label="Corner snip"
              value={s.clip}
              onChange={(clip) => set({ clip })}
              title="Clip at the column / plate corner for weld access"
            />
            <label className="slabNumeric">
              <span>Stiffener steel</span>
              <select
                value={steels.find((x) => x.fy === s.fy)?.fy ?? "custom"}
                onChange={(e) =>
                  e.target.value !== "custom" &&
                  set({ fy: Number(e.target.value) })
                }
              >
                {steels.map((x) => (
                  <option key={x.fy} value={x.fy}>
                    {x.label}
                  </option>
                ))}
                <option value="custom">Custom Fy</option>
              </select>
            </label>
            <Num
              label="Stiffener Fy"
              unit="MPa"
              value={s.fy}
              onChange={(fy) => set({ fy })}
            />
            <Num
              label="Weld to column"
              value={s.weldColumn}
              onChange={(weldColumn) => set({ weldColumn })}
              title="Fillet size, both sides"
            />
            <Num
              label="Weld to plate"
              value={s.weldPlate}
              onChange={(weldPlate) => set({ weldPlate })}
              title="Fillet size, both sides"
            />
            <label className="slabNumeric">
              <span>Flexure section</span>
              <select
                value={s.section}
                onChange={(e) =>
                  set({ section: e.target.value as Stiff["section"] })
                }
              >
                <option value="plate">Stiffener alone (F11)</option>
                <option value="tee">Tee with plate (F9, 15εtp)</option>
              </select>
            </label>
            <label className="slabNumeric">
              <span>Plate panels</span>
              <select
                value={s.plateMethod}
                onChange={(e) =>
                  set({ plateMethod: e.target.value as Stiff["plateMethod"] })
                }
              >
                <option value="yield-line">Yield-line (default)</option>
                <option value="strip">Strip method (lower bound)</option>
              </select>
            </label>
          </div>
        </>
      )}
    </div>
  );
}
