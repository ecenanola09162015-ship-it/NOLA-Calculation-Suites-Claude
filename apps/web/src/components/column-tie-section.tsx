import {
  columnHookGeometry,
  type ColumnQuantityInput,
  type RectangularColumnInput,
} from "@nola/calc-core";
import {
  crossTieHookPath,
  crossTiePositions,
} from "../lib/column-tie-layout";

export function ColumnTieSection({
  section,
  zone,
  basis,
  color,
}: {
  section: RectangularColumnInput;
  zone: ColumnQuantityInput["zones"][number];
  basis: ColumnQuantityInput["hookBasis"];
  color: string;
}) {
  const { width: w, depth: h, cover: c } = section;
  const d = zone.diameter,
    inset = c + d / 2;
  // A size outside a basis's range falls back to the 135° geometry for the
  // drawing; the estimate and checks report the range problem.
  let hook: ReturnType<typeof columnHookGeometry>;
  try {
    hook = columnHookGeometry(d, basis);
  } catch {
    hook = columnHookGeometry(Math.min(Math.max(d, 9.5), 25.4), "aci135");
  }
  const ninety = hook.crossTieSecondAngle === 90 ? hook.crossTieEnds[1] : null;
  const radius = (hook.insideBend ?? 4 * d) / 2 + d / 2;
  const left = inset,
    right = w - inset,
    top = inset,
    bottom = h - inset;
  const rad = Math.min(radius, (right - left) / 2, (bottom - top) / 2);
  // Cross-tie bend centreline radius (Table 25.3.2 inside diameter); the bend
  // centre is offset inward so the hook hugs the bar's outer face.
  const bend = radius;
  const ext = hook.extension / Math.sqrt(2);
  const x = crossTiePositions(section, zone, "X"),
    y = crossTiePositions(section, zone, "Y");
  const font = Math.max(w, h) * 0.032;
  const margin = Math.max(w, h) * 0.1;
  return (
    <>
      <svg
        viewBox={`${-margin} ${-margin} ${w + 2 * margin} ${h + 3 * margin}`}
        role="img"
        aria-label={`${zone.name} dimension-scaled reinforcement section, tie diameter ${d} mm`}
      >
        <rect
          width={w}
          height={h}
          fill="#f2f6f8"
          stroke="#718495"
          strokeWidth={1}
        />
        <rect
          x={c}
          y={c}
          width={w - 2 * c}
          height={h - 2 * c}
          fill="none"
          stroke="#a3afb9"
          strokeWidth={1}
          strokeDasharray="5 5"
        />
        <g
          fill="none"
          stroke={color}
          strokeWidth={d}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect
            x={left}
            y={top}
            width={right - left}
            height={bottom - top}
            rx={rad}
          />
          <path
            d={`M ${left + rad} ${top} L ${left + rad + ext} ${top + ext} M ${left} ${top + rad} L ${left + ext} ${top + rad + ext}`}
          />
          {x.drawable.map((p, i) => {
            const py = h / 2 - p;
            const engaged = section.bars
              .filter((b) => Math.abs(b.y - p) < 0.1)
              .sort((a, b) => a.x - b.x);
            const hug = engaged.length
              ? Math.max(...engaged.map((b) => b.diameter / 2 + d / 2))
              : rad;
            const radius = Math.max(bend, hug);
            const a =
              (engaged.length ? w / 2 + engaged[0].x : left + rad) +
              (radius - hug);
            const b =
              (engaged.length ? w / 2 + engaged.at(-1)!.x : right - rad) -
              (radius - hug);
            return (
              <path
                key={`x${i}`}
                strokeDasharray={x.valid ? undefined : "8 5"}
                d={crossTieHookPath(
                  a,
                  b,
                  py,
                  radius,
                  ext,
                  ninety ? { ext: ninety, at: i % 2 ? "a" : "b" } : undefined,
                )}
              />
            );
          })}
          {y.drawable.map((p, i) => {
            const px = w / 2 + p;
            const engaged = section.bars
              .filter((b) => Math.abs(b.x - p) < 0.1)
              .sort((a, b) => b.y - a.y);
            const hug = engaged.length
              ? Math.max(...engaged.map((b) => b.diameter / 2 + d / 2))
              : rad;
            const radius = Math.max(bend, hug);
            const a =
              (engaged.length ? h / 2 - engaged[0].y : top + rad) +
              (radius - hug);
            const b =
              (engaged.length ? h / 2 - engaged.at(-1)!.y : bottom - rad) -
              (radius - hug);
            return (
              <path
                key={`y${i}`}
                strokeDasharray={y.valid ? undefined : "8 5"}
                d={crossTieHookPath(
                  a,
                  b,
                  px,
                  radius,
                  ext,
                  ninety ? { ext: ninety, at: i % 2 ? "b" : "a" } : undefined,
                )}
                transform="matrix(0 1 1 0 0 0)"
              />
            );
          })}
        </g>
        {section.bars.map((b, i) => (
          <circle
            key={i}
            cx={w / 2 + b.x}
            cy={h / 2 - b.y}
            r={b.diameter / 2}
            fill="#245f9a"
            stroke="#fff"
            strokeWidth={1}
          />
        ))}
        <text
          x={w / 2}
          y={h + margin * 0.6}
          textAnchor="middle"
          fontSize={font}
        >
          {w} × {h} mm · Tie Ø{d} · Clear Cover {c} mm
        </text>
      </svg>
      {!x.valid || !y.valid ? (
        <p className="rcAlert">
          Review Cross-Tie Positions: {x.drawable.length}/{x.count} X And{" "}
          {y.drawable.length}/{y.count} Y Shown. Dashed Connections Are
          Unverified.
        </p>
      ) : null}
      {zone.hoops > 1 ? (
        <small>
          {zone.hoops} Coincident Full-Section Hoops Per Set; Not Nested Hoops.
        </small>
      ) : null}
      <small>
        {ninety
          ? "Dimensions And Diameters To Scale. Crossties: 135° Seismic Hook One End, 90° Hook (6db) The Other; 90° Ends Alternate End For End On Consecutive Crossties (ACI 318-14 / NSCP 2015 Crosstie Definition, 18.7.5.2(c) / 418.7.5.2(c)). Hoops: 135° Both Ends. Bend Fit And Bar Engagement Require Review."
          : "Dimensions And Diameters To Scale. 135° Hook Tails Turn Away From The Leg Into The Core At 45° (ACI 318-19 25.3.2, 25.7.1.6). Bend Fit And Bar Engagement Require Review."}
      </small>
    </>
  );
}
