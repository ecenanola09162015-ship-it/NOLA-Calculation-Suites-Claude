/**
 * Stairs drawings (decisions D1–D3, V1, V3, V4): longitudinal sections with
 * bars, dog-leg elevation, plan, and factored M / V / N envelopes. True
 * scale in mm (SVG viewBox in mm, y up = −svg y). Support beams are drawn
 * with their top flush with the finished level; bar sets carry their mark
 * and colour and dim when another set is highlighted for editing.
 */
import type {
  StairBarSetId,
  StairStripGeometry,
  StairStripResult,
  StairsInput,
  StairSupportDef,
} from "@nola/calc-core";
import {
  STAIR_BEAM_DEPTH,
  stairBarMarks,
  stairGeometry,
  stairPitch,
} from "@nola/calc-core";
import { loadStyles } from "@/lib/load-styles";
import { pathOf, stairBarLines, type Pt } from "@/lib/stair-drawing";
import { dimmed, stairBarColors, stairBarSetIds } from "@/lib/stair-bar-styles";
import styles from "./stair-workspace.module.css";

const INK = "#263d4d";
const fmt = (n: number, p = 0) =>
  Number.isFinite(n)
    ? n.toLocaleString("en-US", {
        minimumFractionDigits: p,
        maximumFractionDigits: p,
      })
    : "—";
type Highlight = StairBarSetId | null;

const along = (poly: Pt[], x: number, pick: "min" | "max") => {
  const ys: number[] = [];
  for (let k = 0; k < poly.length - 1; k++) {
    const a = poly[k],
      b = poly[k + 1];
    if (x < Math.min(a.x, b.x) - 1e-6 || x > Math.max(a.x, b.x) + 1e-6)
      continue;
    ys.push(
      Math.abs(b.x - a.x) < 1e-9
        ? pick === "max"
          ? Math.max(a.y, b.y)
          : Math.min(a.y, b.y)
        : a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y),
    );
  }
  if (!ys.length) return (pick === "max" ? poly[poly.length - 1] : poly[0]).y;
  return pick === "max" ? Math.max(...ys) : Math.min(...ys);
};
/** Finished top level and soffit at plan position x, mm. */
export const topAt = (g: StairStripGeometry, x: number) =>
  x <= 0.5
    ? g.top[0].y
    : x >= g.length - 0.5
      ? g.top[g.top.length - 1].y
      : along(g.top, x, "max");
export const soffitAt = (g: StairStripGeometry, x: number) =>
  along(g.soffit, Math.min(Math.max(x, 0), g.length), "min");
/** Beam depth for a support (V1). */
export const beamDepthOf = (i: StairsInput, s: StairSupportDef) =>
  (s.role === "bottom" ? i.bottomSupport.beamDepth : i.topSupport.beamDepth) ??
  STAIR_BEAM_DEPTH;

/** Bottom of the support symbol (engineering y, mm) for layout. */
function supportBottom(
  i: StairsInput,
  g: StairStripGeometry,
  s: StairSupportDef,
  scale: number,
) {
  const ground = s.role === "bottom" && i.bottomSupport.onGround;
  if (ground) {
    const f = i.bottomSupport.footing;
    return soffitAt(g, s.x) - (f.design ? f.thickness : 250) - 190 * scale;
  }
  return topAt(g, s.x) - beamDepthOf(i, s) - 126 * scale - 150 * scale;
}

function SupportSymbol({
  s,
  g,
  i,
  scale,
  mx,
  label = true,
}: {
  s: StairSupportDef;
  g: StairStripGeometry;
  i: StairsInput;
  scale: number;
  mx: (x: number) => number;
  label?: boolean;
}) {
  const x = mx(s.x),
    t = 90 * scale;
  const ground = s.role === "bottom" && i.bottomSupport.onGround;
  if (ground) {
    const y = soffitAt(g, s.x);
    const f = i.bottomSupport.footing;
    const w = f.design ? f.width : s.bearing,
      h = f.design ? f.thickness : 250;
    return (
      <g data-support={s.condition} data-ground="true">
        <rect
          x={x - w / 2}
          y={-y}
          width={w}
          height={h}
          fill="#e8e1d4"
          stroke={INK}
          strokeWidth={3 * scale}
        />
        <path
          d={`M${x - w / 2 - 120} ${-y + h} H${x + w / 2 + 120}`}
          stroke={INK}
          strokeWidth={3 * scale}
        />
        {Array.from({ length: 8 }, (_, k) => (
          <path
            key={k}
            d={`M${x - w / 2 - 120 + k * ((w + 240) / 8)} ${-y + h} l${-60} ${60}`}
            stroke={INK}
            strokeWidth={2 * scale}
          />
        ))}
        {label && (
          <text
            x={x}
            y={-y + h + 150 * scale}
            className={styles.svgLabel}
            style={{ fontSize: 60 * scale }}
            textAnchor="middle"
          >
            {f.design ? `Footing ${f.width}×${f.thickness}` : "On ground"} ·{" "}
            {s.condition}
          </text>
        )}
      </g>
    );
  }
  // Beam: top flush with the finished level at the support (V1).
  const top = topAt(g, s.x),
    depth = beamDepthOf(i, s),
    bottom = top - depth,
    half = s.bearing / 2;
  return (
    <g data-support={s.condition} data-beam={`${s.bearing}x${depth}`}>
      <rect
        x={x - half}
        y={-top}
        width={s.bearing}
        height={depth}
        fill="#dfe4e8"
        stroke={INK}
        strokeWidth={2.5 * scale}
      />
      {s.condition === "Fixed" ? (
        Array.from({ length: 6 }, (_, k) => (
          <path
            key={k}
            d={`M${x - half + (k * s.bearing) / 6} ${-bottom} l${s.bearing / 6} ${60}`}
            stroke={INK}
            strokeWidth={2 * scale}
          />
        ))
      ) : (
        <path
          d={`M${x} ${-bottom} l${-t} ${t * 1.4} h${2 * t} Z`}
          fill="white"
          stroke={INK}
          strokeWidth={3 * scale}
        />
      )}
      {s.condition === "Sliding" && (
        <path
          d={`M${x - t * 1.3} ${-bottom + t * 1.4 + 25 * scale} h${2.6 * t}`}
          stroke={INK}
          strokeWidth={3 * scale}
        />
      )}
      {label && (
        <text
          x={x}
          y={-bottom + t * 1.4 + 110 * scale}
          className={styles.svgLabel}
          style={{ fontSize: 60 * scale }}
          textAnchor="middle"
        >
          {s.label} · {s.condition} · beam {s.bearing}×{depth}
        </text>
      )}
    </g>
  );
}

/** Text with a white halo so marks read over hatching and bars. */
function Mark({
  x,
  y,
  text,
  color,
  size,
  set,
}: {
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
  set: string;
}) {
  return (
    <text
      x={x}
      y={y}
      data-mark={set}
      fill={color}
      stroke="white"
      strokeWidth={size * 0.25}
      paintOrder="stroke"
      style={{
        fontSize: size,
        fontWeight: 700,
        fontFamily: "Arial, sans-serif",
      }}
      textAnchor="middle"
    >
      {text}
    </text>
  );
}
const midOf = (line: Pt[]) => {
  const lens = line
    .slice(1)
    .map((p, k) => Math.hypot(p.x - line[k].x, p.y - line[k].y));
  let half = lens.reduce((a, b) => a + b, 0) / 2;
  for (let k = 0; k < lens.length; k++) {
    if (half <= lens[k]) {
      const r = half / (lens[k] || 1);
      return {
        x: line[k].x + (line[k + 1].x - line[k].x) * r,
        y: line[k].y + (line[k + 1].y - line[k].y) * r,
      };
    }
    half -= lens[k];
  }
  return line[line.length - 1];
};

function StripSection({
  i,
  g,
  mirror = false,
  xRange,
  highlight,
}: {
  i: StairsInput;
  g: StairStripGeometry;
  mirror?: boolean;
  /** Common plan range (dog-leg: both strips on the flight-1 axis). */
  xRange?: [number, number];
  highlight: Highlight;
}) {
  const L = g.length;
  const mx = (x: number) => (mirror ? L - x : x);
  const mp = (pts: Pt[]) => pts.map((p) => ({ x: mx(p.x), y: p.y }));
  const ys = g.outline.map((p) => p.y);
  const own = [
    Math.min(0, ...g.supports.map((s) => s.x - s.bearing)) - 400,
    Math.max(L, ...g.supports.map((s) => s.x + s.bearing)) + 400,
  ].map(mx);
  const [minX, maxX] = xRange ?? [Math.min(...own), Math.max(...own)];
  const maxY = Math.max(...ys) + 500;
  const scale = Math.max(1, (maxX - minX) / 4200);
  const lowest = Math.min(
    Math.min(...ys) - 200,
    ...g.supports.map((s) => supportBottom(i, g, s, scale)),
  );
  const dimY = lowest - 140 * scale,
    minY = dimY - 160 * scale;
  const bars = stairBarLines(i, g);
  const { degrees } = stairPitch(i.riser, i.going);
  const size = 78 * scale;
  const markAt = (line: Pt[], set: StairBarSetId, dy: number) => {
    const m = midOf(mp(line));
    return (
      <Mark
        key={`m-${set}-${m.x.toFixed(0)}`}
        x={m.x}
        y={-m.y + dy}
        text={stairBarMarks[set]}
        color={stairBarColors[set]}
        size={size}
        set={set}
      />
    );
  };
  const bottomColor = stairBarColors.mainBottom;
  return (
    <svg
      viewBox={`${minX} ${-maxY} ${maxX - minX} ${maxY - minY}`}
      role="img"
      aria-label={`${g.label} longitudinal section with reinforcement`}
      className={styles.drawing}
    >
      {g.supports.map((s) => (
        <SupportSymbol key={s.id} s={s} g={g} i={i} scale={scale} mx={mx} />
      ))}
      <path
        d={pathOf(mp(g.outline)) + " Z"}
        fill="#ece7dd"
        stroke={INK}
        strokeWidth={4 * scale}
      />
      {g.freeEnds.map((f) => (
        <text
          key={f.label}
          x={mx(f.x)}
          y={-soffitAt(g, f.x) + 160 * scale}
          className={styles.svgLabel}
          style={{ fontSize: 60 * scale }}
          textAnchor="middle"
        >
          Free end
        </text>
      ))}
      <g opacity={dimmed(highlight, "mainBottom")}>
        {bars.bottom.map((line, k) => (
          <path
            key={`b${k}`}
            d={pathOf(mp(line))}
            stroke={bottomColor}
            strokeWidth={(highlight === "mainBottom" ? 13 : 7) * scale}
            fill="none"
            data-bar="bottom"
          />
        ))}
        {bars.bottom[0] && markAt(bars.bottom[0], "mainBottom", 120 * scale)}
      </g>
      {bars.top.map((t, k) => (
        <g key={`t${k}`} opacity={dimmed(highlight, t.set)}>
          {t.lines.map((line, n) => (
            <path
              key={n}
              d={pathOf(mp(line))}
              stroke={stairBarColors[t.set]}
              strokeWidth={(highlight === t.set ? 13 : 7) * scale}
              fill="none"
              data-bar={t.set}
            />
          ))}
          {t.lines[0] && markAt(t.lines[0], t.set, -50 * scale)}
        </g>
      ))}
      <g opacity={dimmed(highlight, "distribution")}>
        {bars.distribution.map((p, k) => (
          <circle
            key={`d${k}`}
            cx={mx(p.x)}
            cy={-p.y}
            r={
              Math.max(5, i.bars.distribution.diameter / 2) *
              scale *
              (highlight === "distribution" ? 1.8 : 1)
            }
            fill={stairBarColors.distribution}
            data-bar="distribution"
          />
        ))}
        {bars.distribution.length > 2 && (
          <Mark
            x={mx(
              bars.distribution[Math.floor(bars.distribution.length / 3)].x,
            )}
            y={
              -bars.distribution[Math.floor(bars.distribution.length / 3)].y -
              70 * scale
            }
            text="D1"
            color={stairBarColors.distribution}
            size={size}
            set="distribution"
          />
        )}
      </g>
      {g.knees.map((k, n) => (
        <circle
          key={`k${n}`}
          cx={mx(k.x)}
          cy={-k.y}
          r={14 * scale}
          fill="none"
          stroke="#9a6300"
          strokeWidth={3 * scale}
        />
      ))}
      <g className={styles.svgDim} style={{ fontSize: 62 * scale }}>
        <path
          d={`M${mx(0)} ${-dimY} H${mx(L)}`}
          stroke={INK}
          strokeWidth={2 * scale}
        />
        {[0, L, ...g.regions.map((r) => r.x0)].map((x, k) => (
          <path
            key={k}
            d={`M${mx(x)} ${-dimY - 40 * scale} v${80 * scale}`}
            stroke={INK}
            strokeWidth={2 * scale}
          />
        ))}
        {g.regions.map((r) => (
          <text
            key={r.label}
            x={mx((r.x0 + r.x1) / 2)}
            y={-dimY - 30 * scale}
            textAnchor="middle"
          >
            {r.kind === "flight"
              ? (() => {
                  const n =
                    g.flights.find((fl) => Math.abs(fl.xa - r.x0) < 1e-6)
                      ?.risers ?? 0;
                  const treads = (n - 1) * i.going;
                  return `${r.label}: ${n}R, ${n - 1} × ${i.going} = ${fmt(treads)}${r.x1 - r.x0 > treads + 1 ? ` + seat ${fmt(r.x1 - r.x0 - treads)}` : ""}`;
                })()
              : `${r.label} ${fmt(r.x1 - r.x0)}`}
          </text>
        ))}
        <text x={minX + 120 * scale} y={-maxY + 120 * scale}>
          R {i.riser} · T {i.going} · θ {degrees.toFixed(1)}° · waist {i.waist}
          {mirror ? " · drawn as built (returns toward the start)" : ""}
        </text>
      </g>
    </svg>
  );
}

/** Dog-leg elevation (V4): flight 1 in front, flight 2 behind, as in the 3-D view. */
export function StairDogLegElevation({ input: i }: { input: StairsInput }) {
  let geos: StairStripGeometry[];
  try {
    geos = stairGeometry(i);
  } catch {
    return null;
  }
  if (geos.length < 2) return null;
  const [g1, g2] = geos;
  const L1 = g1.length;
  const back = (p: Pt) => ({ x: L1 - p.x, y: p.y });
  const ys = [...g1.outline, ...g2.outline].map((p) => p.y);
  const xs = [
    ...g1.outline.map((p) => p.x),
    ...g2.outline.map((p) => L1 - p.x),
  ];
  const minX = Math.min(...xs, -400) - 300,
    maxX = Math.max(...xs) + 600;
  const scale = Math.max(1, (maxX - minX) / 4200);
  const maxY = Math.max(...ys) + 500,
    minY = Math.min(...ys) - 900;
  const mid1 = g1.supports.find((s) => s.role === "mid");
  return (
    <figure className="slabFigure">
      <figcaption>
        DOG-LEG ELEVATION · flight 1 in front, flight 2 behind
      </figcaption>
      <svg
        viewBox={`${minX} ${-maxY} ${maxX - minX} ${maxY - minY}`}
        role="img"
        aria-label="Dog-leg elevation"
        className={styles.drawing}
      >
        <path
          d={pathOf(g2.outline.map(back)) + " Z"}
          fill="#f4f1ea"
          stroke={INK}
          strokeWidth={3 * scale}
          strokeDasharray={`${24 * scale} ${14 * scale}`}
          data-flight="2"
        />
        {g2.supports
          .filter((s) => s.role !== "mid")
          .map((s) => (
            <SupportSymbol
              key={s.id}
              s={s}
              g={g2}
              i={i}
              scale={scale}
              mx={(x) => L1 - x}
              label={false}
            />
          ))}
        {g1.supports.map((s) => (
          <SupportSymbol
            key={s.id}
            s={s}
            g={g1}
            i={i}
            scale={scale}
            mx={(x) => x}
            label={false}
          />
        ))}
        <path
          d={pathOf(g1.outline) + " Z"}
          fill="#ece7dd"
          stroke={INK}
          strokeWidth={4 * scale}
          data-flight="1"
        />
        <g className={styles.svgDim} style={{ fontSize: 66 * scale }}>
          <text
            x={g1.flights[0].xa + 300}
            y={-(g1.baseLevel + 2 * i.riser) + 260 * scale}
          >
            Flight 1 (front) · {g1.flights[0].risers}R ↗
          </text>
          <text
            x={L1 - g2.flights[0].xa - 1400}
            y={-(g2.baseLevel + g2.flights[0].risers * i.riser) - 150 * scale}
          >
            ↖ Flight 2 (behind) · {g2.flights[0].risers}R
          </text>
          {mid1 && (
            <text
              x={mid1.x}
              y={-(g1.baseLevel + g1.flights[0].risers * i.riser) - 120 * scale}
              textAnchor="end"
            >
              Mid landing
            </text>
          )}
        </g>
      </svg>
    </figure>
  );
}

export function StairSection({
  input: i,
  highlight = null,
}: {
  input: StairsInput;
  highlight?: Highlight;
}) {
  let geos: StairStripGeometry[];
  try {
    geos = stairGeometry(i);
  } catch (e) {
    return (
      <p className="slabError">
        {e instanceof Error ? e.message : "Check geometry."}
      </p>
    );
  }
  const dog = i.stairType === "dog-leg";
  // Dog-leg: both strip sections on the flight-1 plan axis, flight 2 mirrored
  // (it returns from the mid landing), matching the plan and the 3-D view.
  const range: [number, number] | undefined = dog
    ? [
        Math.min(
          -400,
          ...geos.flatMap((g) =>
            g.supports.map(
              (s) => (g.index === 1 ? s.x : geos[0].length - s.x) - s.bearing,
            ),
          ),
        ) - 300,
        Math.max(
          geos[0].length,
          ...geos.flatMap((g) =>
            g.supports.map(
              (s) => (g.index === 1 ? s.x : geos[0].length - s.x) + s.bearing,
            ),
          ),
        ) + 400,
      ]
    : undefined;
  return (
    <>
      {dog && <StairDogLegElevation input={i} />}
      {geos.map((g) => (
        <figure key={g.index} className="slabFigure">
          <figcaption>
            {i.stairType === "single"
              ? "LONGITUDINAL SECTION · 1 m strip"
              : `SECTION · ${g.label.toUpperCase()}`}
          </figcaption>
          {dog && g.index === 2 ? (
            <StripSectionOnAxis
              i={i}
              g={g}
              L1={geos[0].length}
              range={range!}
              highlight={highlight}
            />
          ) : (
            <StripSection i={i} g={g} xRange={range} highlight={highlight} />
          )}
        </figure>
      ))}
      <div className="slabLegend">
        {stairBarSetIds.map((k) => (
          <span
            key={k}
            style={{ color: stairBarColors[k], opacity: dimmed(highlight, k) }}
            data-legend={k}
          >
            {k === "distribution" ? "●" : "━"} {stairBarMarks[k]} Ø
            {i.bars[k].diameter} @ {i.bars[k].spacing}
          </span>
        ))}
        <span style={{ color: "#9a6300" }}>
          ○ Knee — bars cross at re-entrant corners
        </span>
      </div>
    </>
  );
}

/**
 * Flight-2 strip drawn on the flight-1 axis: plan X = L1 − x, so its mid
 * landing sits over flight 1's mid landing (V4).
 */
function StripSectionOnAxis({
  i,
  g,
  L1,
  range,
  highlight,
}: {
  i: StairsInput;
  g: StairStripGeometry;
  L1: number;
  range: [number, number];
  highlight: Highlight;
}) {
  // mirror about the strip length, then shift so x = 0 lands on L1
  const shift = L1 - g.length;
  return (
    <StripSection
      i={i}
      g={g}
      mirror
      xRange={[range[0] - shift, range[1] - shift]}
      highlight={highlight}
    />
  );
}

export function StairPlan({
  input: i,
  highlight = null,
}: {
  input: StairsInput;
  highlight?: Highlight;
}) {
  let geos: StairStripGeometry[];
  try {
    geos = stairGeometry(i);
  } catch {
    return null;
  }
  const B = i.flightWidth,
    gap = i.flightGap,
    L1 = geos[0].length;
  const dog = i.stairType === "dog-leg";
  const totalW = dog
    ? 2 * B + gap
    : Math.max(B, i.topLanding.width, i.bottomLanding.width);
  const minX = -400,
    maxX = Math.max(...geos.map((g) => g.length)) + 400,
    w = maxX - minX,
    h = totalW + 900;
  const scale = Math.max(1, w / 4200);
  const bandY = (k: number) => (k === 0 ? 0 : B + gap);
  const X = (k: number, x: number) => (k === 0 ? x : L1 - x);
  const markSize = 80 * scale;
  return (
    <figure className="slabFigure">
      <figcaption>
        PLAN{dog ? " · DOG-LEG" : ""} · bottom layer and top-bar zones
      </figcaption>
      <svg
        viewBox={`${minX} ${-450} ${w} ${h}`}
        role="img"
        aria-label="Stair plan"
        className={styles.drawing}
      >
        {geos.map((g, k) => (
          <g key={g.index}>
            {g.regions.map((r) => {
              const xa = X(k, r.x0),
                xb = X(k, r.x1);
              const mid = /Mid landing/.test(r.label);
              const src = /Bottom/.test(r.label)
                ? i.bottomLanding
                : /Top/.test(r.label)
                  ? i.topLanding
                  : null;
              const wide = !dog && src && src.width > B ? src.width : B;
              if (mid && k === 1) return null;
              return (
                <rect
                  key={r.label}
                  x={Math.min(xa, xb)}
                  y={mid ? 0 : bandY(k)}
                  width={Math.abs(xb - xa)}
                  height={mid ? 2 * B + gap : r.kind === "landing" ? wide : B}
                  fill={r.kind === "landing" ? "#e3ecf2" : "#f4f1ea"}
                  stroke={INK}
                  strokeWidth={4 * scale}
                />
              );
            })}
            {g.flights.flatMap((f) =>
              Array.from({ length: f.risers }, (_, r) => {
                const x = X(k, f.xa + r * i.going);
                return (
                  <path
                    key={`${f.label}${r}`}
                    d={`M${x} ${bandY(k)} v${B}`}
                    stroke={INK}
                    strokeWidth={2 * scale}
                  />
                );
              }),
            )}
            {/* Top-bar zones across the width */}
            {(() => {
              const zones: { set: StairBarSetId; x0: number; x1: number }[] =
                [];
              const first = g.index === 1,
                last = i.stairType === "single" || g.index === 2;
              for (const s of g.supports) {
                const set: StairBarSetId =
                  s.role === "bottom" && first
                    ? "topBottom"
                    : s.role === "top" && last
                      ? "topTop"
                      : "topKnee";
                const e = i.bars[set].extension;
                zones.push({
                  set,
                  x0: Math.max(0, s.x - e),
                  x1: Math.min(g.length, s.x + e),
                });
              }
              for (const kn of g.knees) {
                const e = i.bars.topKnee.extension;
                zones.push({
                  set: "topKnee",
                  x0: Math.max(0, kn.x - e),
                  x1: Math.min(g.length, kn.x + e),
                });
              }
              return zones.map((z, n) => {
                const a = X(k, z.x0),
                  b = X(k, z.x1);
                return (
                  <g
                    key={`z${n}`}
                    opacity={dimmed(highlight, z.set)}
                    data-zone={z.set}
                  >
                    <rect
                      x={Math.min(a, b)}
                      y={bandY(k) + 40}
                      width={Math.abs(b - a)}
                      height={B - 80}
                      fill={stairBarColors[z.set]}
                      fillOpacity={highlight === z.set ? 0.32 : 0.14}
                      stroke={stairBarColors[z.set]}
                      strokeWidth={3 * scale}
                    />
                    <Mark
                      x={(a + b) / 2}
                      y={bandY(k) + 150 * scale}
                      text={stairBarMarks[z.set]}
                      color={stairBarColors[z.set]}
                      size={markSize}
                      set={z.set}
                    />
                  </g>
                );
              });
            })()}
            {/* Bottom layer: B1 along the run, D1 across */}
            <g opacity={dimmed(highlight, "mainBottom")}>
              {[0.25, 0.5, 0.75].map((t) => (
                <path
                  key={t}
                  d={`M${X(k, 0)} ${bandY(k) + t * B} H${X(k, g.length)}`}
                  stroke={stairBarColors.mainBottom}
                  strokeWidth={(highlight === "mainBottom" ? 12 : 6) * scale}
                  data-bar="mainBottom"
                />
              ))}
              <Mark
                x={X(k, g.length * 0.18)}
                y={bandY(k) + 0.25 * B - 30 * scale}
                text="B1"
                color={stairBarColors.mainBottom}
                size={markSize}
                set="mainBottom"
              />
            </g>
            <g opacity={dimmed(highlight, "distribution")}>
              {(() => {
                const count = Math.max(
                  2,
                  Math.floor(
                    g.length / Math.max(i.bars.distribution.spacing, 1) / 3,
                  ),
                );
                return Array.from({ length: count }, (_, n) => {
                  const x = X(k, ((n + 0.5) * g.length) / count);
                  return (
                    <path
                      key={n}
                      d={`M${x} ${bandY(k) + 60} v${B - 120}`}
                      stroke={stairBarColors.distribution}
                      strokeWidth={
                        (highlight === "distribution" ? 10 : 4) * scale
                      }
                      data-bar="distribution"
                    />
                  );
                });
              })()}
              <Mark
                x={X(k, g.length * 0.82)}
                y={bandY(k) + B - 60 * scale}
                text="D1"
                color={stairBarColors.distribution}
                size={markSize}
                set="distribution"
              />
            </g>
            {g.flights.map((f) => {
              const x0 = X(k, f.xa),
                x1 = X(k, f.xa + (f.risers - 1) * i.going + i.going * 0.6),
                y = bandY(k) + B / 2;
              return (
                <g key={`up${f.label}`}>
                  <path
                    d={`M${x0} ${y} L${x1} ${y}`}
                    stroke="#0a7f6f"
                    strokeWidth={6 * scale}
                    markerEnd="url(#stairUp)"
                  />
                  <text
                    x={(x0 + x1) / 2}
                    y={y - 40 * scale}
                    className={styles.svgLabel}
                    style={{ fontSize: 70 * scale }}
                    textAnchor="middle"
                  >
                    UP · {f.label} · {f.risers}R
                  </text>
                </g>
              );
            })}
            {i.widthMode === "strip" && (
              <rect
                x={Math.min(X(k, 0), X(k, g.length))}
                y={bandY(k) + B / 2 - Math.min(1000, B) / 2}
                width={g.length}
                height={Math.min(1000, B)}
                fill="none"
                stroke="#0a7f6f"
                strokeWidth={3 * scale}
                strokeDasharray={`${30 * scale} ${18 * scale}`}
              />
            )}
          </g>
        ))}
        {i.localLoads.map((l) => {
          const k = dog ? (l.strip ?? 1) - 1 : 0;
          const st = loadStyles[l.kind];
          const yc = bandY(k) + B / 2;
          if (l.kind === "area")
            return (
              <rect
                key={l.id}
                x={Math.min(X(k, l.x0), X(k, l.x1))}
                y={yc - Math.min(l.width, B) / 2}
                width={Math.abs(l.x1 - l.x0)}
                height={Math.min(l.width, B)}
                fill={st.fill}
                fillOpacity={0.3}
                stroke={st.stroke}
                strokeWidth={3 * scale}
              />
            );
          if (l.kind === "line")
            return (
              <path
                key={l.id}
                d={`M${X(k, l.x)} ${bandY(k)} v${B}`}
                stroke={st.stroke}
                strokeWidth={12 * scale}
              />
            );
          return (
            <rect
              key={l.id}
              x={X(k, l.x) - 60}
              y={yc - 60}
              width={120}
              height={120}
              fill={st.fill}
              stroke={st.stroke}
            />
          );
        })}
        <defs>
          <marker
            id="stairUp"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M0 0 L10 5 L0 10 z" fill="#0a7f6f" />
          </marker>
        </defs>
        <text
          x={0}
          y={totalW + 300}
          className={styles.svgLabel}
          style={{ fontSize: 70 * scale }}
        >
          Flight width {fmt(B)} mm{dog ? ` · gap ${fmt(gap)} mm` : ""} · B1
          along the run, D1 across (bottom layer); shaded: top-bar zones T1–T3
          {i.widthMode === "strip" ? " · dashed: 1 m design strip" : ""}
        </text>
      </svg>
    </figure>
  );
}

/** Factored envelopes along the developed length (decision D3). */
export function StairForceDiagrams({ strip }: { strip: StairStripResult }) {
  const st = strip.stations;
  if (!st.length) return null;
  const sMax = Math.max(...st.map((p) => p.s));
  const W = 560,
    H = 120,
    pad = 34;
  const series: {
    key: string;
    title: string;
    unit: string;
    lines: { values: number[]; color: string; name: string }[];
  }[] = [
    {
      key: "m",
      title: "Mu envelope",
      unit: "kN·m/m",
      lines: [
        {
          values: st.map((p) => p.mPos),
          color: stairBarColors.mainBottom,
          name: "Mu+ (sagging)",
        },
        {
          values: st.map((p) => p.mNeg),
          color: stairBarColors.topBottom,
          name: "Mu− (hogging)",
        },
      ],
    },
    {
      key: "v",
      title: "|Vu| envelope",
      unit: "kN/m",
      lines: [{ values: st.map((p) => p.vu), color: "#2e8b3e", name: "|Vu|" }],
    },
    {
      key: "n",
      title: "Nu envelope",
      unit: "kN/m",
      lines: [
        {
          values: st.map((p) => -p.nuCompression),
          color: "#6d4bb3",
          name: "Compression (−)",
        },
        {
          values: st.map((p) => p.nuTension),
          color: "#b42318",
          name: "Tension (+)",
        },
      ],
    },
  ];
  const sx = (s: number) => pad + (s / (sMax || 1)) * (W - 2 * pad);
  const supportS = strip.geometry.supports.map((s) => {
    let best = st[0];
    for (const p of st)
      if (Math.abs(p.x - s.x) < Math.abs(best.x - s.x)) best = p;
    return best.s;
  });
  return (
    <div className={styles.forces}>
      {series.map((g) => {
        const all = g.lines.flatMap((l) => l.values);
        const hi = Math.max(1e-6, ...all),
          lo = Math.min(0, ...all);
        const span = hi - lo || 1;
        const sy = (v: number) => pad / 2 + ((hi - v) / span) * (H - pad);
        return (
          <figure key={g.key} className="slabFigure">
            <figcaption>
              {g.title} ({g.unit}) · {strip.geometry.label}
            </figcaption>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              role="img"
              aria-label={`${g.title} along the developed length`}
            >
              <path
                d={`M${pad} ${sy(0)} H${W - pad}`}
                stroke="#98a2b3"
                strokeWidth={1}
              />
              {supportS.map((s, k) => (
                <path
                  key={k}
                  d={`M${sx(s)} ${pad / 2} V${H - pad / 2}`}
                  stroke="#98a2b3"
                  strokeDasharray="3 3"
                />
              ))}
              {g.lines.map((l) => (
                <path
                  key={l.name}
                  d={st
                    .map(
                      (p, k) =>
                        `${k ? "L" : "M"}${sx(p.s).toFixed(1)} ${sy(l.values[k]).toFixed(1)}`,
                    )
                    .join(" ")}
                  stroke={l.color}
                  strokeWidth={1.8}
                  fill="none"
                />
              ))}
              <text
                x={W - pad}
                y={12}
                textAnchor="end"
                className={styles.chartText}
              >
                max {fmt(hi, 2)} · min {fmt(lo, 2)}
              </text>
              <text x={pad} y={H - 4} className={styles.chartText}>
                s = 0
              </text>
              <text
                x={W - pad}
                y={H - 4}
                textAnchor="end"
                className={styles.chartText}
              >
                developed length {fmt(sMax / 1000, 2)} m
              </text>
              {g.lines.map((l, k) => (
                <text
                  key={l.name}
                  x={pad + 4 + k * 150}
                  y={12}
                  className={styles.chartText}
                  fill={l.color}
                >
                  {l.name}
                </text>
              ))}
            </svg>
          </figure>
        );
      })}
    </div>
  );
}

export type { Pt };
