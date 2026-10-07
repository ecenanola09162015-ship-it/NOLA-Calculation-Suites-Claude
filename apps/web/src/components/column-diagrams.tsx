import type {
  ColumnCheck,
  RectangularColumnInput,
  RectangularColumnResult,
} from "@nola/calc-core";
const fixed = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : "—");
export function ColumnSection({ input }: { input: RectangularColumnInput }) {
  if (
    ![
      input.width,
      input.depth,
      input.cover,
      input.tieDiameter,
      ...input.bars.flatMap((bar) => [bar.x, bar.y, bar.diameter]),
    ].every(Number.isFinite) ||
    input.width <= 0 ||
    input.depth <= 0
  )
    return (
      <p>Complete valid dimensions and bar coordinates to view the section.</p>
    );
  const scale = 240 / Math.max(input.width || 1, input.depth || 1);
  const w = input.width * scale,
    h = input.depth * scale;
  return (
    <svg
      viewBox="0 0 340 330"
      role="img"
      aria-label="Rectangular column section with numbered bar locations, x right and y upward"
    >
      <rect
        x={170 - w / 2}
        y={155 - h / 2}
        width={Math.max(0, w)}
        height={Math.max(0, h)}
        rx="2"
        fill="#edf2f3"
        stroke="#657780"
        strokeWidth="2"
      />
      {w > 2 * input.cover * scale && h > 2 * input.cover * scale && (
        <rect
          x={170 - w / 2 + (input.cover + input.tieDiameter / 2) * scale}
          y={155 - h / 2 + (input.cover + input.tieDiameter / 2) * scale}
          width={Math.max(
            0,
            w - 2 * (input.cover + input.tieDiameter / 2) * scale,
          )}
          height={Math.max(
            0,
            h - 2 * (input.cover + input.tieDiameter / 2) * scale,
          )}
          fill="none"
          stroke="#318477"
          strokeWidth={Math.max(1, input.tieDiameter * scale)}
        />
      )}
      {input.bars.map((bar, i) => (
        <g key={i}>
          <circle
            cx={170 + bar.x * scale}
            cy={155 - bar.y * scale}
            r={Math.max(2, (bar.diameter * scale) / 2)}
            fill="#8058a4"
          />
          <text
            x={170 + bar.x * scale + 9}
            y={155 - bar.y * scale - 5}
            fontSize="10"
            fill="#49405a"
          >
            {i + 1}
          </text>
        </g>
      ))}
      <path
        d="M170 155h45m-5 -4 5 4 -5 4M170 155v-45m-4 5 4 -5 4 5"
        stroke="#64737d"
        fill="none"
      />
      <text x="220" y="160" fontSize="12">
        x
      </text>
      <text x="176" y="111" fontSize="12">
        y
      </text>
      <text x="170" y="294" textAnchor="middle" fontSize="13">
        b = {fixed(input.width)} mm
      </text>
      <text x="170" y="314" textAnchor="middle" fontSize="13">
        h = {fixed(input.depth)} mm · centroid coordinates
      </text>
    </svg>
  );
}
export function ColumnPMPlot({
  result,
  axis,
  selected,
}: {
  result: RectangularColumnResult;
  axis: "x" | "y";
  selected: string;
}) {
  const curves = result.curves.filter((c) => c.axis === axis);
  const loads = result.checks.filter((c) => c.load.included);
  const maxM =
    Math.max(
      1,
      ...curves.flatMap((c) => c.points.map((p) => Math.abs(p.mn))),
      ...loads.map((c) => Math.abs(axis === "x" ? c.load.mx : c.load.my)),
    ) * 1.12;
  const maxP = Math.max(result.p0, ...loads.map((c) => c.load.pu), 1) * 1.08;
  const minP =
    Math.min(result.tensionCap / 0.9, ...loads.map((c) => c.load.pu), 0) * 1.15;
  const px = (m: number) => 50 + ((m + maxM) / (2 * maxM)) * 470,
    py = (p: number) => 22 + ((maxP - p) / (maxP - minP)) * 286;
  const path = (
    points: { mn: number; pn: number; designM: number; designP: number }[],
    design: boolean,
  ) =>
    points
      .map(
        (p, i) =>
          `${i ? "L" : "M"}${px(design ? p.designM : p.mn).toFixed(2)},${py(design ? p.designP : p.pn).toFixed(2)}`,
      )
      .join(" ");
  return (
    <svg
      viewBox="0 0 570 370"
      role="img"
      aria-label={`Signed P–M${axis} interaction diagram. Solid design strength; dashed nominal strength; points are included factored loads.`}
    >
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <g key={t}>
          <line
            x1="50"
            x2="520"
            y1={22 + t * 286}
            y2={22 + t * 286}
            stroke="#e0e6ea"
          />
          <text x="44" y={26 + t * 286} textAnchor="end" fontSize="10">
            {fixed(maxP - t * (maxP - minP))}
          </text>
          <text x={50 + t * 470} y="327" textAnchor="middle" fontSize="10">
            {fixed((2 * t - 1) * maxM)}
          </text>
        </g>
      ))}
      <line x1={px(0)} x2={px(0)} y1="22" y2="308" stroke="#9dabb5" />
      <line x1="50" x2="520" y1={py(0)} y2={py(0)} stroke="#9dabb5" />
      {curves.map((c) => (
        <g key={c.direction}>
          <path
            d={path(c.points, false)}
            fill="none"
            stroke="#9caab6"
            strokeDasharray="5 4"
          />
          <path
            d={path(c.points, true)}
            fill="none"
            stroke={axis === "x" ? "#147d73" : "#8058a4"}
            strokeWidth="2.5"
          />
        </g>
      ))}
      <line
        x1="50"
        x2="520"
        y1={py(result.axialCap)}
        y2={py(result.axialCap)}
        stroke="#cb9149"
        strokeDasharray="3 5"
      />
      {loads.map((c) => (
        <g key={c.load.id}>
          <circle
            cx={px(axis === "x" ? c.load.mx : c.load.my)}
            cy={py(c.load.pu)}
            r={selected === c.load.id ? 6 : 3.5}
            fill={
              c.outcome === "outside-screening-envelope" ? "#bc514c" : "#254353"
            }
            stroke="white"
          />
          <title>{`${c.load.id}: Pu ${fixed(c.load.pu)} kN, M${axis} ${fixed(axis === "x" ? c.load.mx : c.load.my)} kN·m`}</title>
          {selected === c.load.id && (
            <text
              x={px(axis === "x" ? c.load.mx : c.load.my) + 9}
              y={py(c.load.pu) - 8}
              fontSize="11"
            >
              {c.load.id}
            </text>
          )}
        </g>
      ))}
      <text x="50" y="13" fontSize="11">
        Pu (kN), compression +
      </text>
      <text x="285" y="352" textAnchor="middle" fontSize="12">
        M{axis} (kN·m)
      </text>
    </svg>
  );
}
export function ColumnBiaxialPlot({
  check,
}: {
  check: ColumnCheck | undefined;
}) {
  if (
    !check ||
    check.capacityX === null ||
    check.capacityY === null ||
    check.capacityX <= 0 ||
    check.capacityY <= 0
  )
    return (
      <p>
        Moment capacity is unavailable at this Pu. Review axial demand and the
        P–M diagrams.
      </p>
    );
  const x = Math.abs(check.load.mx) / check.capacityX,
    y = Math.abs(check.load.my) / check.capacityY,
    limit = Math.max(1.3, x * 1.15, y * 1.15);
  const px = (v: number) => 40 + (v / limit) * 240,
    py = (v: number) => 280 - (v / limit) * 240;
  return (
    <svg
      viewBox="0 0 340 330"
      role="img"
      aria-label={`Linear biaxial screening for ${check.load.id}: normalized Mx plus normalized My ${fixed(x + y)}`}
    >
      <path d={`M40 40V280H300`} fill="none" stroke="#9dabb5" />
      <path
        d={`M40 280L${px(1)} 280L40 ${py(1)}Z`}
        fill="#edf7f3"
        stroke="#147d73"
        strokeWidth="2"
      />
      <circle
        cx={px(x)}
        cy={py(y)}
        r="6"
        fill={x + y > 1 ? "#bc514c" : "#8058a4"}
      />
      <text x={px(x) + 8} y={py(y) - 8} fontSize="11">
        {check.load.id}
      </text>
      <text x="160" y="308" fontSize="12" textAnchor="middle">
        |Mux| / φMnx at Pu
      </text>
      <text x="40" y="23" fontSize="12">
        |Muy| / φMny at Pu
      </text>
      <text x={px(1)} y="295" fontSize="11">
        1
      </text>
      <text x="27" y={py(1)} fontSize="11">
        1
      </text>
    </svg>
  );
}
