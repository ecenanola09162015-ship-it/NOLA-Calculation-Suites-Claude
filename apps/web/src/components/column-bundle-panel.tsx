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
  bundleUnits,
  rebarDesignation,
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
  onApplied,
}: {
  input: RectangularColumnInput;
  selected: number[];
  onSelect: (bars: number[]) => void;
  onChange: (next: RectangularColumnInput) => void;
  /** Smallest tie diameter of the catalogue meeting 25.7.2.2 for bundles. */
  minTie: number;
  /** Called with the new bundle ids after Apply (show / scroll to them). */
  onApplied?: (bundles: string[]) => void;
}) {
  const [size, setSize] = useState<BundleSize>(2);
  const [refused, setRefused] = useState<ReturnType<typeof bundleIssues>>([]);
  // Result of the last Apply / Unbundle, shown until the next selection.
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const select = (bars: number[]) => {
    setStatus(null);
    onSelect(bars);
  };
  const live = bundleIssues(input);
  const shown = refused.length ? refused : live;
  const summary = bundleSummary(input.bars);
  const anyBundled = selected.some((i) => input.bars[i]?.bundle);
  return (
    <div className="bundlePanel">
      <h3 className="rcSubhead">Bundled Bars</h3>
      <p className="rcMuted">
        Click bars in the section (or tick them in Edit individual bars), choose
        the bundle size, then Apply bundles. Unselected bars stay single.
        {summary ? ` Current: ${summary}.` : ""}
      </p>
      <div className="bundleSelectRow">
        <button className="suiteSecondary" onClick={() => select(perimeterBars(input.bars, true))}>
          Select corners
        </button>
        <button className="suiteSecondary" onClick={() => select(perimeterBars(input.bars))}>
          Select all perimeter
        </button>
        <button className="suiteSecondary" disabled={!selected.length} onClick={() => select([])}>
          Clear
        </button>
      </div>
      <label className="bundleSize">
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
      <div className="bundleActionRow">
        <button
          className="suitePrimary"
          disabled={!selected.length}
          onClick={() => {
            const r = bundleBars(input, selected, size);
            if (!r.applied) {
              setRefused(r.issues.filter((i) => i.level === "error"));
              setStatus({ ok: false, text: "Not applied — fix the items below or choose other bars." });
              return;
            }
            const before = new Set(input.bars.map((b) => b.bundle).filter(Boolean));
            const ids = [...new Set(r.bars.map((b) => b.bundle).filter((b): b is string => !!b && !before.has(b)))];
            const added = r.bars.length - input.bars.length;
            const range = ids.length > 1 ? `${ids[0]}–${ids[ids.length - 1]}` : ids[0];
            setRefused([]);
            onSelect([]);
            onChange({ ...input, bars: r.bars });
            setStatus({
              ok: true,
              text: `Bundled bars applied: ${ids.length} × ${size}-bar bundle${ids.length > 1 ? "s" : ""} (${range}). ${added} bar${added === 1 ? "" : "s"} added; ${r.bars.length} bars total.`,
            });
            onApplied?.(ids);
          }}
        >
          Apply bundles{selected.length ? `: ${selected.length} × ${size} bars` : ""}
        </button>
        <button
          className="suiteSecondary"
          disabled={!anyBundled}
          onClick={() => {
            const ids = [...new Set(selected.map((i) => input.bars[i]?.bundle).filter(Boolean))];
            const bars = unbundleBars(input, selected);
            setRefused([]);
            onSelect([]);
            onChange({ ...input, bars });
            setStatus({
              ok: true,
              text: `Bundles removed: ${ids.join(", ")} back to single bars. ${input.bars.length - bars.length} bars removed; ${bars.length} bars total.`,
            });
          }}
        >
          Unbundle selected
        </button>
      </div>
      {status && (
        <p className={status.ok ? "bundleApplied" : "bundleRefused"} role="status">
          {status.text}
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

/**
 * Magnified view of one bundle (about 3× the section scale): the bundle and
 * its neighbours, concrete faces and tie line, with db,eq and cover.
 */
export function BundleInset({
  input,
  bundle,
}: {
  input: RectangularColumnInput;
  bundle: string;
}) {
  const unit = bundleUnits(input.bars).find((u) => u.bundle === bundle);
  if (!unit) return null;
  const bars = unit.bars.map((i) => input.bars[i]!);
  const d = bars[0]!.diameter;
  const reach = Math.max(...bars.map((b) => Math.hypot(b.x - unit.x, b.y - unit.y) + b.diameter / 2));
  const half = Math.max(reach + input.cover + input.tieDiameter + 25, 70);
  const S = 150 / half; // px per mm in a 300 px window
  const X = (x: number) => 150 + (x - unit.x) * S,
    Y = (y: number) => 150 - (y - unit.y) * S;
  const hw = input.width / 2,
    hh = input.depth / 2,
    t = input.cover + input.tieDiameter / 2;
  const cover = Math.min(
    ...bars.map((b) => Math.min(hw - Math.abs(b.x), hh - Math.abs(b.y)) - b.diameter / 2),
  );
  const desig = rebarDesignation(input.rebarStandard ?? "PNS49", d);
  return (
    <figure className="bundleInset">
      <svg viewBox="0 0 300 300" role="img" aria-label={`Bundle ${bundle} magnified`}>
        <defs>
          <clipPath id={`clip-${bundle}`}>
            <rect width="300" height="300" />
          </clipPath>
        </defs>
        <g clipPath={`url(#clip-${bundle})`}>
          <rect x={X(-hw)} y={Y(hh)} width={input.width * S} height={input.depth * S} fill="#edf2f3" stroke="#657780" strokeWidth="2" />
          <rect
            x={X(-hw + t)}
            y={Y(hh - t)}
            width={(input.width - 2 * t) * S}
            height={(input.depth - 2 * t) * S}
            fill="none"
            stroke="#318477"
            strokeWidth={Math.max(1, input.tieDiameter * S)}
            strokeOpacity="0.85"
          />
          {input.bars.map((b, i) => (
            <circle
              key={i}
              cx={X(b.x)}
              cy={Y(b.y)}
              r={(b.diameter * S) / 2}
              fill={b.bundle === bundle ? "#5b3a8a" : "#b9a6cf"}
            />
          ))}
          <circle cx={X(unit.x)} cy={Y(unit.y)} r={reach * S + 4} fill="none" stroke="#e07000" strokeWidth="2" />
        </g>
      </svg>
      <figcaption>
        <strong>
          {bundle} · {bars.length}-{desig}
        </strong>
        <br />
        db,eq = {d}·√{bars.length} = {unit.deq.toFixed(1)} mm · cover to bundle {cover.toFixed(0)} mm
        (≥ {Math.min(unit.deq, 50).toFixed(1)} mm, 20.5.1.3.4)
      </figcaption>
    </figure>
  );
}
