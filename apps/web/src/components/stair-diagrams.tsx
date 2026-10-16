/**
 * Stairs drawings (decisions D1–D3): longitudinal section with bars,
 * plan, and factored M / V / N envelopes along the developed length.
 * Section and plan are true scale in mm (SVG viewBox in mm).
 */
import type {
  StairStripGeometry,
  StairStripResult,
  StairsInput,
  StairSupportDef,
} from "@nola/calc-core";
import { stairGeometry, stairPitch } from "@nola/calc-core";
import { loadStyles } from "@/lib/load-styles";
import { pathOf, stairBarLines, type Pt } from "@/lib/stair-drawing";
import styles from "./stair-workspace.module.css";

const BAR = { bottom: "#145da0", top: "#e87916", dist: "#145da0" };
const INK = "#263d4d";
const fmt = (n: number, p = 0) =>
  Number.isFinite(n)
    ? n.toLocaleString("en-US", {
        minimumFractionDigits: p,
        maximumFractionDigits: p,
      })
    : "—";

function SupportSymbol({
  s,
  y,
  i,
  scale,
}: {
  s: StairSupportDef;
  y: number;
  i: StairsInput;
  scale: number;
}) {
  const x = s.x,
    half = s.bearing / 2,
    t = 90 * scale;
  const ground = s.role === "bottom" && i.bottomSupport.onGround;
  if (ground) {
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
      </g>
    );
  }
  return (
    <g data-support={s.condition}>
      <rect
        x={x - half}
        y={-y}
        width={s.bearing}
        height={300}
        fill="#eef1f4"
        stroke={INK}
        strokeWidth={2 * scale}
        strokeDasharray={`${12 * scale} ${8 * scale}`}
      />
      {s.condition === "Fixed" ? (
        Array.from({ length: 6 }, (_, k) => (
          <path
            key={k}
            d={`M${x - half + (k * s.bearing) / 6} ${-y + 300} l${s.bearing / 6} ${-60}`}
            stroke={INK}
            strokeWidth={2 * scale}
          />
        ))
      ) : (
        <path
          d={`M${x} ${-y + 300} l${-t} ${t * 1.4} h${2 * t} Z`}
          fill="white"
          stroke={INK}
          strokeWidth={3 * scale}
        />
      )}
      {s.condition === "Sliding" && (
        <path
          d={`M${x - t * 1.3} ${-y + 300 + t * 1.4 + 25 * scale} h${2.6 * t}`}
          stroke={INK}
          strokeWidth={3 * scale}
        />
      )}
      <text
        x={x}
        y={-y + 300 + t * 1.4 + 110 * scale}
        className={styles.svgLabel}
        style={{ fontSize: 60 * scale }}
        textAnchor="middle"
      >
        {s.label} · {s.condition}
      </text>
    </g>
  );
}

function StripSection({ i, g }: { i: StairsInput; g: StairStripGeometry }) {
  const xs = g.outline.map((p) => p.x),
    ys = g.outline.map((p) => p.y);
  const minX = Math.min(...xs, ...g.supports.map((s) => s.x - s.bearing)) - 400,
    maxX = Math.max(...xs, ...g.supports.map((s) => s.x + s.bearing)) + 400,
    maxY = Math.max(...ys) + 500;
  const scale = Math.max(1, (maxX - minX) / 4200);
  const ySoff = (x: number) => {
    const s = g.soffit;
    for (let k = 0; k < s.length - 1; k++)
      if (x >= s[k].x - 1e-6 && x <= s[k + 1].x + 1e-6)
        return (
          s[k].y +
          ((x - s[k].x) / (s[k + 1].x - s[k].x || 1)) * (s[k + 1].y - s[k].y)
        );
    return s[s.length - 1].y;
  };
  // Dimension line below the lowest support symbol and its label.
  const f = i.bottomSupport.footing;
  const lowest = Math.min(
    Math.min(...ys) - 200,
    ...g.supports.map((s) =>
      s.role === "bottom" && i.bottomSupport.onGround
        ? ySoff(s.x) - (f.design ? f.thickness : 250) - 190 * scale
        : ySoff(s.x) - 300 - 126 * scale - 140 * scale,
    ),
  );
  const dimY = lowest - 140 * scale,
    minY = dimY - 160 * scale;
  const w = maxX - minX,
    h = maxY - minY;
  const bars = stairBarLines(i, g);
  const sw = 4 * scale;
  const { degrees } = stairPitch(i.riser, i.going);
  const flight = g.flights[0];
  return (
    <svg
      viewBox={`${minX} ${-maxY} ${w} ${h}`}
      role="img"
      aria-label={`${g.label} longitudinal section with reinforcement`}
      className={styles.drawing}
    >
      <path
        d={pathOf(g.outline) + " Z"}
        fill="#ece7dd"
        stroke={INK}
        strokeWidth={sw}
      />
      {g.supports.map((s) => (
        <SupportSymbol key={s.id} s={s} y={ySoff(s.x)} i={i} scale={scale} />
      ))}
      {g.freeEnds.map((f) => (
        <text
          key={f.label}
          x={f.x}
          y={-ySoff(f.x) + 160 * scale}
          className={styles.svgLabel}
          style={{ fontSize: 60 * scale }}
          textAnchor="middle"
        >
          Free end
        </text>
      ))}
      {bars.bottom.map((line, k) => (
        <path
          key={`b${k}`}
          d={pathOf(line)}
          stroke={BAR.bottom}
          strokeWidth={7 * scale}
          fill="none"
          data-bar="bottom"
        />
      ))}
      {bars.top.flatMap((t, k) =>
        t.lines.map((line, n) => (
          <path
            key={`t${k}-${n}`}
            d={pathOf(line)}
            stroke={BAR.top}
            strokeWidth={7 * scale}
            fill="none"
            data-bar={t.set}
          />
        )),
      )}
      {bars.distribution.map((p, k) => (
        <circle
          key={`d${k}`}
          cx={p.x}
          cy={-p.y}
          r={Math.max(5, i.bars.distribution.diameter / 2) * scale}
          fill={BAR.dist}
          data-bar="distribution"
        />
      ))}
      {g.knees.map((k, n) => (
        <circle
          key={`k${n}`}
          cx={k.x}
          cy={-k.y}
          r={14 * scale}
          fill="none"
          stroke="#9a6300"
          strokeWidth={3 * scale}
        />
      ))}
      {/* dimensions */}
      <g className={styles.svgDim} style={{ fontSize: 62 * scale }}>
        <path
          d={`M0 ${-dimY} H${g.length}`}
          stroke={INK}
          strokeWidth={2 * scale}
        />
        {[0, g.length, ...g.regions.map((r) => r.x0)].map((x, k) => (
          <path
            key={k}
            d={`M${x} ${-dimY - 40 * scale} v${80 * scale}`}
            stroke={INK}
            strokeWidth={2 * scale}
          />
        ))}
        {g.regions.map((r) => (
          <text
            key={r.label}
            x={(r.x0 + r.x1) / 2}
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
        {flight && (
          <text x={minX + 120 * scale} y={-maxY + 120 * scale}>
            R {i.riser} · T {i.going} · θ {degrees.toFixed(1)}° · waist{" "}
            {i.waist}
          </text>
        )}
      </g>
    </svg>
  );
}

export function StairSection({ input: i }: { input: StairsInput }) {
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
  return (
    <>
      {geos.map((g) => (
        <figure key={g.index} className="slabFigure">
          <figcaption>
            {i.stairType === "single"
              ? "LONGITUDINAL SECTION · 1 m strip"
              : `SECTION · ${g.label.toUpperCase()}`}
          </figcaption>
          <StripSection i={i} g={g} />
        </figure>
      ))}
      <div className="slabLegend">
        <span style={{ color: BAR.bottom }}>
          ━ Main bottom bars Ø{i.bars.mainBottom.diameter} @{" "}
          {i.bars.mainBottom.spacing}
        </span>
        <span style={{ color: BAR.top }}>
          ━ Top bars (supports {i.bars.topBottom.diameter}/
          {i.bars.topTop.diameter}, knees Ø{i.bars.topKnee.diameter} @{" "}
          {i.bars.topKnee.spacing})
        </span>
        <span style={{ color: BAR.dist }}>
          ● Distribution Ø{i.bars.distribution.diameter} @{" "}
          {i.bars.distribution.spacing}
        </span>
        <span style={{ color: "#9a6300" }}>
          ○ Knee — bars cross at re-entrant corners
        </span>
      </div>
    </>
  );
}

export function StairPlan({ input: i }: { input: StairsInput }) {
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
  return (
    <figure className="slabFigure">
      <figcaption>PLAN{dog ? " · DOG-LEG" : ""}</figcaption>
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
                y={bandY(k) + B / 2 - 500}
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
          Flight width {fmt(B)} mm{dog ? ` · gap ${fmt(gap)} mm` : ""} · B1 Ø
          {i.bars.mainBottom.diameter}@{i.bars.mainBottom.spacing} along the run
          · D1 Ø{i.bars.distribution.diameter}@{i.bars.distribution.spacing}{" "}
          across
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
          color: BAR.bottom,
          name: "Mu+ (sagging)",
        },
        {
          values: st.map((p) => p.mNeg),
          color: BAR.top,
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
