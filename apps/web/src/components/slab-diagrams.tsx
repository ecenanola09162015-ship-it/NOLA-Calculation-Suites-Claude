import type {
  SlabInput,
  SlabResolvedBar,
  SlabFace,
  SlabDirection,
  SlabEdge,
} from "@nola/calc-core";
import {
  slabExtraActive,
  slabLoadPatch,
  slabPrimaryAxisX,
} from "@nola/calc-core";
import { loadStyles } from "@/lib/load-styles";
const colors = { main: "#145da0", extra: "#e87916" };
function segments(i: SlabInput, b: SlabResolvedBar): [number, number][] {
  if (b.group === "main") return [[0, 1]];
  if (b.face === "bottom")
    return [[i.cutoffs.bottomStart, i.cutoffs.bottomEnd]];
  const alongX = (b.direction === "short") === slabPrimaryAxisX(i),
    a: SlabEdge = alongX ? "west" : "south",
    c: SlabEdge = alongX ? "east" : "north";
  const out: [number, number][] = [];
  if (i.supports[a] === "Fixed") out.push([0, i.cutoffs[a]]);
  if (i.supports[c] === "Fixed") out.push([1 - i.cutoffs[c], 1]);
  return out;
}
export function SlabPlan({
  input: i,
  bars,
  face,
}: {
  input: SlabInput;
  bars: SlabResolvedBar[];
  face: SlabFace;
}) {
  if (![i.lx, i.ly].every((v) => Number.isFinite(v) && v > 0))
    return <p>Complete valid span dimensions to view the slab.</p>;
  if (
    !Object.values(i.cutoffs).every(Number.isFinite) ||
    !Number.isFinite(i.sideCover)
  )
    return <p>Complete valid cover and cutoff inputs to view the slab.</p>;
  const scale = Math.min(440 / i.lx, 270 / i.ly),
    w = i.lx * scale,
    h = i.ly * scale,
    x = (560 - w) / 2,
    y = 70;
  const shortX = slabPrimaryAxisX(i),
    sx = i.lx * 1000,
    sy = i.ly * 1000;
  return (
    <figure className="slabFigure">
      <figcaption>
        {face === "bottom" ? "BOTTOM REINFORCEMENT" : "TOP REINFORCEMENT"}
      </figcaption>
      <svg
        viewBox="0 0 560 425"
        role="img"
        aria-label={`${face} slab reinforcement plan: blue continuous main bars and orange cut-off extra bars`}
      >
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          fill="#f5f8fa"
          stroke="#445766"
          strokeWidth="2"
        />
        {i.supports.north !== "Free" && (
          <rect x={x} y={y} width={w} height="12" fill="#dbe4e7" />
        )}
        {i.supports.south !== "Free" && (
          <rect x={x} y={y + h - 12} width={w} height="12" fill="#dbe4e7" />
        )}
        {i.supports.west !== "Free" && (
          <rect x={x} y={y} width="12" height={h} fill="#dbe4e7" />
        )}
        {i.supports.east !== "Free" && (
          <rect x={x + w - 12} y={y} width="12" height={h} fill="#dbe4e7" />
        )}
        {bars
          .filter((b) => b.face === face)
          .map((b) => {
            const alongX = (b.direction === "short") === shortX;
            const padding = i.sideCover / (alongX ? sx : sy),
              ranges = segments(i, b);
            return (
              <g
                key={`${b.group}-${b.layer}`}
                stroke={colors[b.group]}
                strokeWidth={b.group === "main" ? 1.25 : 2}
                data-bar-group={b.group}
                data-direction={b.direction}
              >
                {b.positions.flatMap((p, k) =>
                  ranges.map(([a, c], n) => {
                    const start = Math.max(padding, a),
                      end = Math.min(1 - padding, c);
                    return alongX ? (
                      <line
                        key={`${k}-${n}`}
                        x1={x + w * start}
                        x2={x + w * end}
                        y1={y + h * (1 - p / sy)}
                        y2={y + h * (1 - p / sy)}
                      />
                    ) : (
                      <line
                        key={`${k}-${n}`}
                        x1={x + (w * p) / sx}
                        x2={x + (w * p) / sx}
                        y1={y + h * (1 - end)}
                        y2={y + h * (1 - start)}
                      />
                    );
                  }),
                )}
              </g>
            );
          })}
        <g stroke="#455a66" strokeDasharray="6 4" fill="none">
          <line
            x1={shortX ? x - 15 : x + w * 0.5}
            x2={shortX ? x + w + 15 : x + w * 0.5}
            y1={shortX ? y + h * 0.5 : y - 15}
            y2={shortX ? y + h * 0.5 : y + h + 15}
          />
          <line
            x1={!shortX ? x - 15 : x + w * 0.5}
            x2={!shortX ? x + w + 15 : x + w * 0.5}
            y1={!shortX ? y + h * 0.5 : y - 15}
            y2={!shortX ? y + h * 0.5 : y + h + 15}
          />
        </g>
        {(i.pointLoads ?? []).length > 0 && (
          <g data-point-loads fontSize="11" textAnchor="middle">
            <defs>
              <pattern
                id={`area-hatch-${face}`}
                width="6"
                height="6"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <line
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="6"
                  stroke={loadStyles.area.stroke}
                  strokeWidth="1.5"
                />
              </pattern>
            </defs>
            {(i.pointLoads ?? []).map((p) => {
              const r = slabLoadPatch(p),
                st = loadStyles[r.kind],
                x0 = x + r.x0 * scale,
                x1 = x + r.x1 * scale,
                y0 = y + h - r.y1 * scale,
                y1 = y + h - r.y0 * scale;
              const label = (
                <text x={(x0 + x1) / 2} y={y0 - 4} fill={st.text}>
                  {p.id}
                </text>
              );
              if (r.kind === "line") {
                const alongX = p.kind === "line" && p.direction === "X",
                  cy = (y0 + y1) / 2,
                  cx = (x0 + x1) / 2,
                  t = 6;
                return (
                  <g
                    key={p.id}
                    data-load-kind="line"
                    aria-label={`Line load ${p.id}`}
                    stroke={st.stroke}
                  >
                    {alongX ? (
                      <>
                        <line x1={x0} y1={cy} x2={x1} y2={cy} strokeWidth="5" />
                        <line
                          x1={x0}
                          y1={cy - t}
                          x2={x0}
                          y2={cy + t}
                          strokeWidth="2"
                        />
                        <line
                          x1={x1}
                          y1={cy - t}
                          x2={x1}
                          y2={cy + t}
                          strokeWidth="2"
                        />
                      </>
                    ) : (
                      <>
                        <line x1={cx} y1={y0} x2={cx} y2={y1} strokeWidth="5" />
                        <line
                          x1={cx - t}
                          y1={y0}
                          x2={cx + t}
                          y2={y0}
                          strokeWidth="2"
                        />
                        <line
                          x1={cx - t}
                          y1={y1}
                          x2={cx + t}
                          y2={y1}
                          strokeWidth="2"
                        />
                      </>
                    )}
                    <g stroke="none">{label}</g>
                  </g>
                );
              }
              const pw = Math.max(4, x1 - x0),
                ph = Math.max(4, y1 - y0),
                mx = (x0 + x1) / 2,
                my = (y0 + y1) / 2;
              return (
                <g
                  key={p.id}
                  data-load-kind={r.kind}
                  aria-label={`${st.label} ${p.id}`}
                >
                  <rect
                    x={mx - pw / 2}
                    y={my - ph / 2}
                    width={pw}
                    height={ph}
                    fill={
                      r.kind === "area" ? `url(#area-hatch-${face})` : st.fill
                    }
                    fillOpacity={r.kind === "area" ? 1 : 0.85}
                    stroke={st.stroke}
                    strokeWidth="1.5"
                  />
                  {label}
                </g>
              );
            })}
            <g data-load-legend fontSize="10" textAnchor="start">
              {(["point", "line", "area"] as const)
                .filter((k) =>
                  (i.pointLoads ?? []).some((p) => (p.kind ?? "point") === k),
                )
                .map((k, n) => (
                  <g key={k} transform={`translate(${12 + n * 110}, 18)`}>
                    {k === "line" ? (
                      <line
                        x1="0"
                        y1="0"
                        x2="14"
                        y2="0"
                        stroke={loadStyles[k].stroke}
                        strokeWidth="4"
                      />
                    ) : (
                      <rect
                        x="0"
                        y="-5"
                        width="14"
                        height="10"
                        fill={
                          k === "area"
                            ? `url(#area-hatch-${face})`
                            : loadStyles[k].fill
                        }
                        stroke={loadStyles[k].stroke}
                      />
                    )}
                    <text x="18" y="4" fill={loadStyles[k].text}>
                      {loadStyles[k].label}
                    </text>
                  </g>
                ))}
            </g>
          </g>
        )}
        <g fill="#263d4d" fontSize="12" textAnchor="middle">
          <text x={x + w / 2} y={y - 30}>
            NORTH · {i.supports.north}
          </text>
          <text x={x + w / 2} y={y + h + 32}>
            SOUTH · {i.supports.south}
          </text>
          <text transform={`translate(${x - 24},${y + h / 2}) rotate(-90)`}>
            WEST · {i.supports.west}
          </text>
          <text transform={`translate(${x + w + 24},${y + h / 2}) rotate(90)`}>
            EAST · {i.supports.east}
          </text>
          <text
            x={shortX ? x - 8 : x + w / 2}
            y={shortX ? y + h / 2 - 8 : y - 8}
          >
            A
          </text>
          <text
            x={!shortX ? x - 8 : x + w / 2}
            y={!shortX ? y + h / 2 - 8 : y - 8}
          >
            B
          </text>
          <text x={x + w / 2} y={y + h + 58}>
            X = {i.lx.toFixed(2)} m · Y = {i.ly.toFixed(2)} m
          </text>
          <text x="280" y="400">
            {face === "top"
              ? "Extra bars at fixed supports · repeated across full edge width"
              : "Extra bars at midspan · repeated across full transverse width"}
          </text>
        </g>
      </svg>
    </figure>
  );
}
export function SlabSection({
  input: i,
  bars,
  direction,
}: {
  input: SlabInput;
  bars: SlabResolvedBar[];
  direction: SlabDirection;
}) {
  if (!Number.isFinite(i.h) || i.h <= 0)
    return <p>Complete a valid slab thickness.</p>;
  if (
    ![i.lx, i.ly, i.topCover, i.bottomCover, i.supportWidth].every(
      (v) => Number.isFinite(v) && v > 0,
    ) ||
    bars.some((b) => !Number.isFinite(b.z)) ||
    !Object.values(i.cutoffs).every(Number.isFinite)
  )
    return (
      <p>
        Complete valid dimensions, cover and elevations to view the sections.
      </p>
    );
  const span =
      direction === "short" ? Math.min(i.lx, i.ly) : Math.max(i.lx, i.ly),
    x = 60,
    width = 650,
    support = Math.min(
      70,
      Math.max(10, (650 * i.supportWidth) / (span * 1000)),
    ),
    top = 44,
    height = 100,
    zY = (z: number) => top + height * (1 - z / i.h),
    title =
      direction === "short"
        ? "SECTION A–A · Along short span"
        : "SECTION B–B · Along long span";
  return (
    <figure className="slabFigure slabSection">
      <figcaption>
        {title} ({span.toFixed(2)} m)
      </figcaption>
      <svg viewBox="0 0 800 205" role="img" aria-label={title}>
        <path
          d={`M ${x - support / 2} ${top} H ${x + width + support / 2} V ${top + height + 40} H ${x + width - support / 2} V ${top + height} H ${x + support / 2} V ${top + height + 40} H ${x - support / 2} Z`}
          fill="#f0f3f4"
          stroke="#526671"
          strokeWidth="1.5"
        />
        {bars.map((b) => {
          const yy = zY(b.z);
          if (b.direction !== direction) {
            if (b.group === "extra" && !slabExtraActive(i, b.layer, 0.5))
              return null;
            const actualSpan = span * 1000;
            return (
              <g key={`${b.group}-${b.layer}`} fill={colors[b.group]}>
                {b.positions.map((p, k) => (
                  <circle
                    key={k}
                    cx={x + (width * p) / actualSpan}
                    cy={yy}
                    r={Math.max(1.8, ((b.diameter / i.h) * height) / 2)}
                  />
                ))}
              </g>
            );
          }
          return (
            <g
              key={`${b.group}-${b.layer}`}
              stroke={colors[b.group]}
              strokeWidth={b.group === "main" ? 2 : 3}
              strokeDasharray={b.group === "extra" ? "5 4" : undefined}
              fill="none"
              data-bar-group={b.group}
            >
              {segments(i, b).map(([a, c], k) => (
                <line
                  key={k}
                  x1={x + width * a}
                  x2={x + width * c}
                  y1={yy}
                  y2={yy}
                />
              ))}
            </g>
          );
        })}
        <g fill="#263d4d" fontSize="12">
          <text x={x} y="25">
            Top cover {i.topCover} mm
          </text>
          <text x={x + width - 160} y="25">
            h = {i.h} mm
          </text>
          <text x={x} y="183">
            Bottom cover {i.bottomCover} mm
          </text>
          <text x={x + width - 205} y="183">
            z = 0 at soffit · thickness exaggerated
          </text>
        </g>
      </svg>
    </figure>
  );
}
