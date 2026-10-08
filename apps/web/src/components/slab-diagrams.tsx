import type {
  SlabInput,
  SlabResolvedBar,
  SlabFace,
  SlabDirection,
  SlabEdge,
} from "@nola/calc-core";
import { slabExtraActive } from "@nola/calc-core";
const colors = { main: "#145da0", extra: "#e87916" };
function segments(i: SlabInput, b: SlabResolvedBar): [number, number][] {
  if (b.group === "main") return [[0, 1]];
  if (b.face === "bottom")
    return [[i.cutoffs.bottomStart, i.cutoffs.bottomEnd]];
  const alongX = (b.direction === "short") === i.lx <= i.ly,
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
  const shortX = i.lx <= i.ly,
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
        <rect x={x} y={y} width={w} height="12" fill="#dbe4e7" />
        <rect x={x} y={y + h - 12} width={w} height="12" fill="#dbe4e7" />
        <rect x={x} y={y} width="12" height={h} fill="#dbe4e7" />
        <rect x={x + w - 12} y={y} width="12" height={h} fill="#dbe4e7" />
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
