"use client";
/**
 * Shared steel shape picker (AISC Shapes Database v16.0), reusable by the
 * Base Plate, Steel Column and Steel Beam modules. ARIA combobox: type "W12",
 * "w12x40", "HSS8x8" or a metric name "W310x60"; ↑/↓, PgUp/PgDn, Enter, Esc.
 * The ~130 kB index loads on first focus; the family file only on selection.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  loadShapeFamily,
  loadShapeIndex,
  searchShapes,
  shapeDimensionLabel,
  shapeFamilies,
  shapeFamilyOf,
  type ShapeGroup,
  type ShapeIndexRow,
  type ShapeRecord,
} from "@nola/calc-core";

const VISIBLE = 60;

export function ShapePicker({
  value,
  groups,
  onSelect,
  label = "Column shape",
}: {
  value: string;
  /** Shape groups allowed (e.g. I, HSS-RECT, HSS-ROUND for base plates). */
  groups: readonly ShapeGroup[];
  onSelect: (shape: ShapeRecord) => void;
  label?: string;
}) {
  const id = useId();
  const [rows, setRows] = useState<ShapeIndexRow[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [families, setFamilies] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => setQuery(value), [value]);
  const familyOptions = shapeFamilies.filter((f) =>
    (groups as readonly string[]).includes(f.group),
  );
  function ensureIndex() {
    if (rows || loadError) return;
    loadShapeIndex()
      .then(setRows)
      .catch(() =>
        setLoadError(
          "Shape database could not be loaded. Retry, or check the connection.",
        ),
      );
  }
  const matches = useMemo(() => {
    if (!rows) return [];
    const pool = families.length
      ? rows.filter((r) => families.includes(shapeFamilyOf(r)))
      : rows;
    return searchShapes(pool, query === value ? "" : query, groups, 400);
  }, [rows, query, value, groups, families]);
  useEffect(() => {
    const el = list.current?.querySelector<HTMLElement>(
      `[data-index="${active}"]`,
    );
    el?.scrollIntoView?.({ block: "nearest" });
  }, [active]);
  async function choose(r: ShapeIndexRow) {
    setBusy(true);
    try {
      const rec = (await loadShapeFamily(shapeFamilyOf(r))).find(
        (s) => s.name === r.name,
      );
      if (rec) {
        onSelect(rec);
        setQuery(rec.name);
        setOpen(false);
      }
    } catch {
      setLoadError("Shape properties could not be loaded. Retry.");
    } finally {
      setBusy(false);
    }
  }
  const shown = matches.slice(0, Math.max(VISIBLE, active + 20));
  return (
    <div className="bpShapePicker">
      <label htmlFor={`${id}-input`}>{label}</label>
      <div className="bpChips" role="group" aria-label="Filter by family">
        {familyOptions.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={families.includes(f.id)}
            onClick={() => {
              ensureIndex();
              setFamilies((x) =>
                x.includes(f.id) ? x.filter((y) => y !== f.id) : [...x, f.id],
              );
              setOpen(true);
              setActive(0);
            }}
          >
            {f.label}
          </button>
        ))}
      </div>
      <input
        id={`${id}-input`}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={
          open && shown[active] ? `${id}-opt-${active}` : undefined
        }
        autoComplete="off"
        spellCheck={false}
        placeholder="Type W12, HSS8X8, W310X60…"
        value={query}
        onFocus={() => {
          ensureIndex();
          setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          const step = (d: number) => {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.max(0, Math.min(a + d, matches.length - 1)));
          };
          if (e.key === "ArrowDown") step(1);
          else if (e.key === "ArrowUp") step(-1);
          else if (e.key === "PageDown") step(10);
          else if (e.key === "PageUp") step(-10);
          else if (e.key === "Enter" && open && matches[active]) {
            e.preventDefault();
            void choose(matches[active]!);
          } else if (e.key === "Escape") {
            setOpen(false);
            setQuery(value);
          }
        }}
      />
      {open && (
        <ul
          id={`${id}-list`}
          ref={list}
          role="listbox"
          className="bpShapeList"
          aria-label="Matching shapes"
        >
          {!rows && !loadError && (
            <li className="bpShapeNote">Loading AISC shapes…</li>
          )}
          {loadError && <li className="bpShapeNote">{loadError}</li>}
          {rows && !matches.length && (
            <li className="bpShapeNote">
              No matching shape. Check the name or clear the family filter.
            </li>
          )}
          {shown.map((r, k) => (
            <li
              key={r.name}
              id={`${id}-opt-${k}`}
              data-index={k}
              role="option"
              aria-selected={k === active}
              className={k === active ? "isActive" : ""}
              onMouseDown={(e) => {
                e.preventDefault();
                void choose(r);
              }}
              onMouseEnter={() => setActive(k)}
            >
              <strong>{r.name}</strong>
              {r.metric && <span className="bpMetric">{r.metric}</span>}
              <span className="bpDims">
                {shapeDimensionLabel(r)} · A {r.area.toFixed(0)} mm² ·{" "}
                {r.weight.toFixed(1)} kg/m
              </span>
            </li>
          ))}
          {matches.length > shown.length && (
            <li className="bpShapeNote">
              {matches.length - shown.length} more — keep typing to narrow.
            </li>
          )}
        </ul>
      )}
      {busy && <small className="slabMuted">Loading properties…</small>}
    </div>
  );
}
