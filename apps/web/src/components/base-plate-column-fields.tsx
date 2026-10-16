"use client";
/**
 * Base plate column section: AISC database shape (shared picker) or a
 * custom section — choose the type, then enter the dimensions it needs.
 * Custom sections map to the engine families I / HSS-RECT / HSS-ROUND.
 */
import { useState } from "react";
import {
  basePlateColumnFromShape,
  basePlateColumnProperties,
  basePlateCustomColumn,
  basePlateShapeGroups,
  customColumnTypeInfo,
  customColumnTypes,
  type BasePlateInput,
  type CustomColumnType,
} from "@nola/calc-core";
import { ShapePicker } from "./shape-picker";

type Column = BasePlateInput["column"];
const fmt = (n: number, p = 1) =>
  Number.isFinite(n)
    ? n.toLocaleString("en-US", { maximumFractionDigits: p })
    : "—";
const typeFor = (c: Column): CustomColumnType =>
  c.customType ??
  (c.family === "I" ? "built-up-I" : c.family === "HSS-ROUND" ? "tube" : "box");

/** Small labelled sketch of the section type (which dimension is which). */
function Sketch({ type }: { type: CustomColumnType }) {
  const ink = "#24476b",
    fill = "#a9c1d9",
    dim = "#5b6670";
  const t = (
    x: number,
    y: number,
    s: string,
    a: "middle" | "start" | "end" = "middle",
  ) => (
    <text x={x} y={y} fontSize="9" textAnchor={a} fill={dim}>
      {s}
    </text>
  );
  return (
    <svg
      className="bpSketch"
      viewBox="0 0 120 100"
      role="img"
      aria-label={`${customColumnTypeInfo[type].label} dimensions`}
    >
      {type === "built-up-I" && (
        <>
          <path
            d="M30 15h60v10H64v50h26v10H30V75h26V25H30z"
            fill={fill}
            stroke={ink}
            strokeWidth="1.2"
          />
          {t(60, 10, "bf")}
          {t(104, 52, "d")}
          {t(22, 22, "tf", "end")}
          {t(70, 52, "tw", "start")}
          <line
            x1="96"
            y1="15"
            x2="96"
            y2="85"
            stroke={dim}
            strokeWidth="0.6"
          />
        </>
      )}
      {(type === "box" || type === "solid") && (
        <>
          <rect
            x="30"
            y="15"
            width="60"
            height="70"
            fill={fill}
            stroke={ink}
            strokeWidth="1.2"
          />
          {type === "box" && (
            <rect
              x="38"
              y="23"
              width="44"
              height="54"
              fill="#fff"
              stroke={ink}
              strokeWidth="1"
            />
          )}
          {t(60, 10, "B")}
          {t(104, 52, "H")}
          {type === "box" && t(22, 22, "t", "end")}
          <line
            x1="96"
            y1="15"
            x2="96"
            y2="85"
            stroke={dim}
            strokeWidth="0.6"
          />
        </>
      )}
      {type === "tube" && (
        <>
          <circle
            cx="60"
            cy="50"
            r="35"
            fill={fill}
            stroke={ink}
            strokeWidth="1.2"
          />
          <circle
            cx="60"
            cy="50"
            r="28"
            fill="#fff"
            stroke={ink}
            strokeWidth="1"
          />
          {t(60, 10, "OD")}
          {t(102, 30, "t", "start")}
        </>
      )}
    </svg>
  );
}

export function BasePlateColumnFields({
  column,
  onChange,
}: {
  column: Column;
  onChange: (c: Column) => void;
}) {
  const custom = column.sectionSource === "custom";
  // Last database shape, restored when switching back from Custom.
  const [lastDb, setLastDb] = useState<Column | null>(custom ? null : column);
  const type = typeFor(column);
  const info = customColumnTypeInfo[type];
  const auto = basePlateCustomColumn(type, column, column.fy).designation;
  const [autoName, setAutoName] = useState(
    !custom || column.designation === auto,
  );
  const props = basePlateColumnProperties(column);
  function rebuild(
    next: Partial<Column> & { customType?: CustomColumnType },
    name?: string,
  ) {
    const t = next.customType ?? type;
    const dims = {
      d: next.d ?? column.d,
      bf: next.bf ?? column.bf,
      tf: next.tf ?? column.tf,
      tw: next.tw ?? column.tw,
    };
    onChange(
      basePlateCustomColumn(
        t,
        dims,
        next.fy ?? column.fy,
        name ?? (autoName ? undefined : column.designation),
      ),
    );
  }
  return (
    <div className="bpColumn">
      <div
        className="bpSegment"
        role="radiogroup"
        aria-label="Column section source"
      >
        {(["database", "custom"] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={column.sectionSource === s}
            onClick={() => {
              if (s === column.sectionSource) return;
              if (s === "custom") {
                setLastDb(column);
                setAutoName(true);
                onChange(
                  basePlateCustomColumn(
                    typeFor({ ...column, customType: null }),
                    column,
                    column.fy,
                  ),
                );
              } else if (lastDb) onChange(lastDb);
            }}
          >
            {s === "database" ? "AISC database" : "Custom section"}
          </button>
        ))}
      </div>
      {!custom ? (
        <>
          <ShapePicker
            value={column.designation}
            groups={basePlateShapeGroups}
            onSelect={(rec) => {
              const col = basePlateColumnFromShape(rec, column.fy);
              if (col) {
                setLastDb(col);
                onChange(col);
              }
            }}
          />
          <p className="slabMuted">
            {column.shapeType} ·{" "}
            {column.family === "HSS-ROUND"
              ? `OD ${fmt(column.d)} × t ${fmt(column.tf, 2)}`
              : column.family === "HSS-RECT"
                ? `${fmt(column.d)} × ${fmt(column.bf)} × t ${fmt(column.tf, 2)}`
                : `d ${fmt(column.d)} · bf ${fmt(column.bf)} · tf ${fmt(column.tf, 2)} · tw ${fmt(column.tw, 2)}`}{" "}
            mm · {column.source}
          </p>
        </>
      ) : (
        <>
          <label className="slabNumeric bpWide">
            <span>Section type</span>
            <select
              value={type}
              onChange={(e) =>
                rebuild({ customType: e.target.value as CustomColumnType })
              }
            >
              {customColumnTypes.map((t) => (
                <option key={t} value={t}>
                  {customColumnTypeInfo[t].label}
                </option>
              ))}
              <option disabled>Unequal-flange I — Future Development</option>
              <option disabled>Cruciform — Future Development</option>
              <option disabled>Channel / angle — Future Development</option>
            </select>
          </label>
          <div className="bpCustom">
            <Sketch type={type} />
            <div className="slabFieldGrid">
              {info.dims.map((dm) => (
                <label key={dm.key} className="slabNumeric">
                  <span>
                    {dm.label} <small>(mm)</small>
                  </span>
                  <input
                    type="number"
                    step="any"
                    aria-label={dm.label}
                    value={
                      Number.isFinite(column[dm.key]) ? column[dm.key] : ""
                    }
                    onChange={(e) =>
                      rebuild({
                        [dm.key]:
                          e.target.value === "" ? NaN : Number(e.target.value),
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </div>
          <label className="slabNumeric bpWide">
            <span>Designation</span>
            <input
              value={column.designation}
              maxLength={40}
              onChange={(e) => {
                setAutoName(
                  e.target.value.trim() === "" || e.target.value === auto,
                );
                rebuild({}, e.target.value);
              }}
            />
          </label>
          <p className="bpStrength">
            A {fmt(props.a, 0)} mm² · {fmt(props.weight, 1)} kg/m · Ix{" "}
            {fmt(props.ix / 1e6, 2)} × 10⁶ mm⁴ · Iy {fmt(props.iy / 1e6, 2)} ×
            10⁶ mm⁴ · Custom (user input), checked as{" "}
            {info.family === "I"
              ? "I-shape (DG1 0.95d / 0.80bf)"
              : info.family === "HSS-RECT"
                ? "rectangular section (0.95 both ways)"
                : "round section (0.80D)"}
          </p>
        </>
      )}
    </div>
  );
}
