"use client";
/**
 * Bundled bars (user decisions 17 Oct 2026): pick bars in the section
 * picture or the coordinates table, choose 2, 3 or 4, press "Bundle
 * selected". Code checks run live (see column-bundles.ts).
 */
import {
  bundleBars,
  bundleIssues,
  bundleSummary,
  unbundleBars,
  type BundleSize,
  type ColumnBar,
  type RectangularColumnInput,
} from "@nola/calc-core";
import { useState } from "react";

/** Bars on the outer bar lines (perimeter) and at the corners. */
export function perimeterBars(bars: ColumnBar[], cornersOnly = false) {
  const anchors = bars
    .map((b, i) => ({ b, i }))
    .filter(({ b, i }) => !b.bundle || bars.findIndex((c) => c.bundle === b.bundle) === i);
  const maxX = Math.max(...anchors.map(({ b }) => Math.abs(b.x)));
  const maxY = Math.max(...anchors.map(({ b }) => Math.abs(b.y)));
  return anchors
    .filter(({ b }) => {
      const onX = Math.abs(Math.abs(b.x) - maxX) <= b.diameter / 2;
      const onY = Math.abs(Math.abs(b.y) - maxY) <= b.diameter / 2;
      return cornersOnly ? onX && onY : onX || onY;
    })
    .map(({ i }) => i);
}

export function ColumnBundlePanel({
  input,
  selected,
  onSelect,
  onChange,
  minTie,
}: {
  input: RectangularColumnInput;
  selected: number[];
  onSelect: (bars: number[]) => void;
  onChange: (next: RectangularColumnInput) => void;
  /** Smallest tie diameter of the catalogue meeting 25.7.2.2 for bundles. */
  minTie: number;
}) {
  const [size, setSize] = useState<BundleSize>(2);
  const [refused, setRefused] = useState<ReturnType<typeof bundleIssues>>([]);
  const live = bundleIssues(input);
  const shown = refused.length ? refused : live;
  const summary = bundleSummary(input.bars);
  const anyBundled = selected.some((i) => input.bars[i]?.bundle);
  return (
    <div className="bundlePanel">
      <h3 className="rcSubhead">Bundled Bars</h3>
      <p className="rcMuted">
        Click bars in the section (or tick them in Edit individual bars), choose
        the bundle size, then Bundle selected. Unselected bars stay single.
        {summary ? ` Current: ${summary}.` : ""}
      </p>
      <div className="bundleControls">
        <label>
          Bars per bundle
          <select
            value={size}
            onChange={(e) => setSize(Number(e.target.value) as BundleSize)}
          >
            <option value={2}>2 bars</option>
            <option value={3}>3 bars</option>
            <option value={4}>4 bars (maximum, 25.6.1.1)</option>
          </select>
        </label>
        <button className="suiteSecondary" onClick={() => onSelect(perimeterBars(input.bars, true))}>
          Select corners
        </button>
        <button className="suiteSecondary" onClick={() => onSelect(perimeterBars(input.bars))}>
          Select all perimeter
        </button>
        <button className="suiteSecondary" disabled={!selected.length} onClick={() => onSelect([])}>
          Clear selection
        </button>
        <button
          className="suitePrimary"
          disabled={!selected.length}
          onClick={() => {
            const r = bundleBars(input, selected, size);
            if (!r.applied) return setRefused(r.issues.filter((i) => i.level === "error"));
            setRefused([]);
            onSelect([]);
            onChange({ ...input, bars: r.bars });
          }}
        >
          Bundle selected ({selected.length})
        </button>
        <button
          className="suiteSecondary"
          disabled={!anyBundled}
          onClick={() => {
            setRefused([]);
            onSelect([]);
            onChange({ ...input, bars: unbundleBars(input, selected) });
          }}
        >
          Unbundle selected
        </button>
      </div>
      {refused.length > 0 && (
        <p className="bundleRefused" role="alert">
          Not bundled — fix the items below or choose other bars.
        </p>
      )}
      {shown.length > 0 && (
        <ul className="fcNotes bundleIssues">
          {shown.map((i, k) => (
            <li
              key={k}
              className={`fcNote ${i.level === "error" ? "warning" : i.level === "warning" ? "caution" : "info"}`}
            >
              {i.text} <em>({i.clause})</em>
              {i.clause.includes("25.7.2.2") && (
                <button
                  className="suiteSecondary bundleFix"
                  onClick={() => onChange({ ...input, tieDiameter: minTie })}
                >
                  Use Ø{minTie}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
