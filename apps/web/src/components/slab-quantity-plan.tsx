import type { estimateSlabQuantity, SlabQuantityInput } from "@nola/calc-core";
export function SlabQuantityPlan({
  result: r,
  value,
  face,
}: {
  result: NonNullable<ReturnType<typeof estimateSlabQuantity>>;
  value: SlabQuantityInput;
  face: "top" | "bottom";
}) {
  const { west: w, east: e, south: s, north: n } = value.beams;
  const scale = Math.min(
    780 / (r.x + w.width + e.width),
    470 / (r.y + s.width + n.width),
  );
  const px = (x: number) => 70 + (x + w.width) * scale,
    py = (y: number) => 50 + (r.y + n.width - y) * scale;
  return (
    <figure>
      <figcaption>
        Estimate Plan · {face === "top" ? "Top" : "Bottom"} Reinforcement · One
        Panel
      </figcaption>
      <svg
        viewBox="0 0 920 630"
        role="img"
        aria-label={`Slab estimate ${face} plan with main and extra bars distributed across the full panel`}
      >
        <rect
          x={px(-w.width)}
          y={py(r.y + n.width)}
          width={(r.x + w.width + e.width) * scale}
          height={(r.y + s.width + n.width) * scale}
          fill="#dce8ec"
          stroke="#617989"
        />
        <rect
          x={px(0)}
          y={py(r.y)}
          width={r.x * scale}
          height={r.y * scale}
          fill="#f3f6f8"
          stroke="#617989"
        />
        {r.rows
          .filter((b) => b.layer.includes(face))
          .flatMap((b) =>
            b.positions.map((p, k) => (
              <line
                key={`${b.mark}-${k}`}
                data-bar-group={b.group}
                x1={px(b.axis === "X" ? b.start - b.nearExtension * 1000 : p)}
                y1={py(b.axis === "X" ? p : b.start - b.nearExtension * 1000)}
                x2={px(b.axis === "X" ? b.end + b.farExtension * 1000 : p)}
                y2={py(b.axis === "X" ? p : b.end + b.farExtension * 1000)}
                stroke={b.group === "MAIN BARS" ? "#2468ae" : "#df7620"}
                strokeWidth={Math.max(0.7, b.diameter * scale)}
              />
            )),
          )}
        <text x="70" y="555" fontSize="13">
          MAIN BARS: Blue · EXTRA BARS: Orange · {r.x} × {r.y} mm Clear Panel
        </text>
        <text x="70" y="580" fontSize="12">
          Extensions Into Beams Shown. Vertical L-Hook Tails Are Shown In
          Sections.
        </text>
        <text x="70" y="603" fontSize="12">
          Bounding Beams (Grey) Are Excluded From Concrete Volume.
        </text>
      </svg>
    </figure>
  );
}
