import {
  columnHookGeometry,
  type ColumnQuantityInput,
  type RectangularColumnInput,
} from "@nola/calc-core";
import { crossTiePositions } from "../lib/column-tie-layout";

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
  const hook = columnHookGeometry(d, basis);
  const radius = (hook.insideBend ?? 4 * d) / 2 + d / 2;
  const left = inset,
    right = w - inset,
    top = inset,
    bottom = h - inset;
  const rad = Math.min(radius, (right - left) / 2, (bottom - top) / 2);
  const ext = hook.extension / Math.sqrt(2);
  const x = crossTiePositions(section, zone, "X"),
    y = crossTiePositions(section, zone, "Y");
  const font = Math.max(w, h) * 0.032;
  const margin = Math.max(w, h) * 0.1;
  function crossPath(a: number, b: number, transverse: number, r: number) {
    const q = r / Math.sqrt(2);
    return `M ${a - q + ext} ${transverse - q + ext} L ${a - q} ${transverse - q} A ${r} ${r} 0 0 0 ${a} ${transverse + r} L ${b} ${transverse + r} A ${r} ${r} 0 0 0 ${b + q} ${transverse - q} L ${b + q - ext} ${transverse - q + ext}`;
  }
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
            const a = engaged.length ? w / 2 + engaged[0].x : left + rad;
            const b = engaged.length ? w / 2 + engaged.at(-1)!.x : right - rad;
            const radius = Math.max(
              rad,
              ...engaged.map((b) => b.diameter / 2 + d / 2),
            );
            return (
              <path
                key={`x${i}`}
                strokeDasharray={x.valid ? undefined : "8 5"}
                d={crossPath(a, b, py, radius)}
              />
            );
          })}
          {y.drawable.map((p, i) => {
            const px = w / 2 + p;
            const engaged = section.bars
              .filter((b) => Math.abs(b.x - p) < 0.1)
              .sort((a, b) => b.y - a.y);
            const a = engaged.length ? h / 2 - engaged[0].y : top + rad;
            const b = engaged.length ? h / 2 - engaged.at(-1)!.y : bottom - rad;
            const radius = Math.max(
              rad,
              ...engaged.map((b) => b.diameter / 2 + d / 2),
            );
            return (
              <path
                key={`y${i}`}
                strokeDasharray={y.valid ? undefined : "8 5"}
                d={crossPath(a, b, px, radius)}
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
        Dimensions And Diameters To Scale. Hook Orientation Illustrative; Bend
        Fit And Bar Engagement Require Review.
      </small>
    </>
  );
}
