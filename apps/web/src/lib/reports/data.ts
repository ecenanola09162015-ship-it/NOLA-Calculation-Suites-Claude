import {
  columnDesignChecks,
  slabDesignChecks,
  designCheckStatus,
  estimateColumnQuantity,
  estimateSlabQuantity,
  columnQuantityLimitations,
  slabQuantityLimitations,
  type DesignCheckPolicy,
  type DesignRemarks,
  type RectangularColumnInput,
  type RectangularColumnResult,
  type ColumnQuantityInput,
  type SlabInput,
  type SlabResult,
  type SlabQuantityInput,
} from "@nola/calc-core";
import type { ProjectRecord } from "../projects";
import { columnFigures, slabFigures } from "./figures";
export type Cell = { text: string; color?: string };
export type ReportSection = {
  title: string;
  columns: string[];
  rows: (string | Cell)[][];
};
export type ReportFigure = { title: string; svg: string; png?: string };
export type ReportData = {
  module: string;
  title: string;
  code: string;
  basis: string;
  project?: ProjectRecord;
  policy: DesignCheckPolicy;
  remarks: DesignRemarks;
  summary: ReportSection[];
  figures: ReportFigure[];
  checks: ReportSection;
  sections: ReportSection[];
  references: ReportSection;
  limitations: string[];
  criticalNotes: string[];
  generatedAt: string;
  estimate?: ReportSection;
};
export const f = (n: number | null | undefined, d = 2) =>
  n == null || !Number.isFinite(n) ? "Not Evaluated" : n.toFixed(d);
function status(
  dcr: number | null,
  policy: DesignCheckPolicy,
  remark?: string,
): Cell {
  const s = designCheckStatus(dcr, policy);
  return {
    text:
      s.label +
      (s.id === "judgment"
        ? " | Remarks: " + (remark?.trim() || "Not Recorded")
        : ""),
    color: s.color,
  };
}
const section = (
  title: string,
  rows: (string | Cell)[][],
  columns = ["Item", "Value"],
): ReportSection => ({ title, columns, rows });
const refColumn = section("Code References — ACI 318-19", [
  ["Axial / Flexure", "22.2, 22.4; strength factors 21.2"],
  ["Reinforcement Limits", "10.6; detailing 10.7"],
  ["Column Shear (Not Evaluated)", "22.5; minimum transverse steel 10.6.2"],
  ["Tie / Hook Review", "10.7, 25.3, 25.7; seismic 18.7 (not automated)"],
]);
const refSlab = section("Code References — ACI 318-19", [
  ["Flexure / Strength Factors", "22.2, 22.3, 21.2"],
  ["One-Way Shear", "Table 22.5.5.1"],
  [
    "Minimum Thickness / Deflection",
    "7.3, 8.3, 24.2; immediate elastic screen only",
  ],
  ["Minimum Reinforcement / Spacing", "7.6, 8.6, 7.7.2, 8.7.2, 24.4, 25.2"],
  ["Cover / Development / Cutoffs", "20.5, 25.4, 7.7.3, 8.7.4"],
]);
function checkTable(
  checks: ReturnType<typeof columnDesignChecks>,
  policy: DesignCheckPolicy,
  remarks: DesignRemarks,
): ReportSection {
  return section(
    "DCR Design Checks And Engineering Remarks",
    checks.map((c) => [
      c.label,
      f(c.dcr, 3),
      status(c.dcr, policy, remarks[c.id]),
    ]),
    ["Check", "DCR", "Status / Remarks"],
  );
}
export function columnReportData(
  project: ProjectRecord | undefined,
  title: string,
  input: RectangularColumnInput,
  result: RectangularColumnResult,
  quantity: ColumnQuantityInput,
  policy: DesignCheckPolicy,
  remarks: DesignRemarks,
): ReportData {
  const g = result.governing;
  const checks = columnDesignChecks(result);
  const governing = checks.filter((c) =>
    c.id.startsWith((g?.load.id ?? "") + ":"),
  );
  const barGroups = new Map<number, number>();
  for (const bar of input.bars)
    barGroups.set(bar.diameter, (barGroups.get(bar.diameter) ?? 0) + 1);
  const summary = [
    section("Materials", [
      ["Approved By", project?.approvedBy ?? "Not Set"],
      ["Concrete / Steel", `fc = ${f(input.fc)} MPa; fy = ${f(input.fy)} MPa`],
      [
        "Elastic Modulus / Cover",
        `Es = ${f(input.es, 0)} MPa; cover = ${f(input.cover, 0)} mm`,
      ],
    ]),
    section("Section And Reinforcement", [
      [
        "Section",
        `${input.width} x ${input.depth} mm; Ag = ${f(result.grossArea, 0)} mm²`,
      ],
      [
        "Longitudinal Bars",
        [...barGroups].map(([d, n]) => `${n}-D${d}`).join("; ") +
          `; As = ${f(result.steelArea, 0)} mm²`,
      ],
      [
        "Ties",
        `D${input.tieDiameter}; estimating spacing ${quantity.enabled ? quantity.zones.map((z) => z.name + ": " + z.spacing + " mm").join("; ") : "Not Defined In Design Inputs"}`,
      ],
      [
        "Steel Ratio",
        `rho = ${f(result.steelRatio * 100)}%; ${result.steelRatio >= 0.01 && result.steelRatio <= 0.08 ? "Within General 1–8% Range" : "Outside General 1–8% Range — Review Required"}`,
      ],
    ]),
    section("Governing Loads And Design", [
      ["Combination", g?.load.id ?? "None"],
      [
        "Pu / Mux / Muy",
        g
          ? `${f(g.load.pu)} kN / ${f(g.load.mx)} / ${f(g.load.my)} kN·m`
          : "Not Evaluated",
      ],
      ["Vux / Vuy", "Not Supplied; Column Shear Not Evaluated"],
      ...governing.map((c) => [
        c.label.replace((g?.load.id ?? "") + " · ", ""),
        {
          text: `DCR ${f(c.dcr, 3)} | ${status(c.dcr, policy, remarks[c.id]).text}`,
          color: designCheckStatus(c.dcr, policy).color,
        },
      ]),
    ]),
  ];
  const equations = section(
    "Section Strength And Screening Equations",
    [
      [
        "Gross / Steel Area",
        `Ag = b h = ${input.width} x ${input.depth} = ${f(result.grossArea, 0)} mm²; As = sum(pi db²/4) = ${f(result.steelArea, 0)} mm²`,
        "10.6; 22.4",
      ],
      [
        "Concentric Strength",
        `P0 = [0.85 fc (Ag-As) + fy As]/1000 = ${f(result.p0)} kN`,
        "22.4",
      ],
      [
        "Tied Axial Cap",
        `0.80 x 0.65 x P0 = ${f(result.axialCap)} kN`,
        "22.4; 21.2",
      ],
      [
        "Stress Block",
        `beta1 = ${f(result.beta1, 3)}; a = beta1 c; concrete strain = 0.003`,
        "22.2",
      ],
      [
        "Strain Equilibrium",
        "steel strain = 0.003(d-c)/c; fs = clamp(Es strain, -fy, fy); Pn = Cc + sum(Fs); Mn = sum(force x lever arm)",
        "22.2",
      ],
      [
        "Strength Reduction",
        "phi = 0.65 to 0.90 from tensile strain; design P limited by tied-column cap",
        "21.2",
      ],
      [
        "Biaxial Screen",
        "DCR = |Mux|/phiMnx(Pu) + |Muy|/phiMny(Pu); linear screening, not full biaxial surface",
        "Engineering screen",
      ],
      [
        "Governing Combination Substitution",
        g
          ? `Pu = ${f(g.load.pu)} kN; phiMnx = ${f(g.capacityX)}; phiMny = ${f(g.capacityY)} kN·m; DCRx = |${f(g.load.mx)}|/${f(g.capacityX)}; DCRy = |${f(g.load.my)}|/${f(g.capacityY)}; interaction = ${f(g.interaction, 3)}; axial DCR = ${f(g.axialRatio, 3)}`
          : "No Governing Combination",
        "22.2; Linear Biaxial Screen",
      ],
      [
        "Reinforcement Limits",
        `rho = As/Ag = ${f(result.steelRatio * 100)}%; general-column range 1–8%; seismic limits require separate review`,
        "10.6; 18.7",
      ],
      [
        "Shear / Slenderness / Seismic Ties",
        "Not Evaluated By This Section-Strength Pilot",
        "22.5; Ch. 6, 18, 25",
      ],
    ],
    ["Check / Equation", "Substitution / Result", "Reference"],
  );
  const loadRows = result.checks.map((c) => [
    c.load.id,
    c.load.included ? "Included" : "Excluded",
    f(c.load.pu),
    f(c.load.mx),
    f(c.load.my),
    "Not Supplied",
    f(c.axialRatio, 3),
    f(c.interaction, 3),
    c.load.included
      ? status(
          Math.max(c.axialRatio, c.interaction ?? Infinity),
          policy,
          remarks[c.load.id + ":interaction"],
        )
      : "Excluded",
  ]);
  const curveRows = result.curves.flatMap((curve) =>
    curve.points
      .filter(
        (_, index) =>
          index === 0 ||
          index === curve.points.length - 1 ||
          index % Math.max(1, Math.floor(curve.points.length / 10)) === 0,
      )
      .map((p) => [
        curve.axis.toUpperCase(),
        String(curve.direction),
        f(p.c),
        f(p.pn),
        f(p.mn),
        f(p.phi, 3),
        f(p.designP),
        f(p.designM),
      ]),
  );
  let estimate: ReportSection | undefined;
  const extra: ReportSection[] = [];
  if (quantity.enabled) {
    const q = estimateColumnQuantity(input, quantity);
    if (!q) throw Error("Column Estimate Could Not Be Calculated.");
    estimate = section("Quantity Estimate", [
      ["Concrete Volume", `${f(q.concrete, 3)} m³`],
      ["Total Rebar Weight", `${f(q.total)} kg`],
      ["Steel / Concrete", `${f(q.ratio)} kg/m³`],
      [
        "Longitudinal / Shear Weight",
        `${f(q.longitudinalPercent)}% / ${f(q.shearPercent)}%`,
      ],
    ]);
    extra.push(
      section(
        "Rebar Cutting Schedule",
        q.rows.map((r) => [
          r.mark,
          r.function,
          String(r.diameter),
          String(r.fy),
          String(r.count),
          f(r.length / 1000, 3),
          f(r.weight),
        ]),
        [
          "Mark",
          "Function",
          "db mm",
          "fy MPa",
          "Count",
          "Length m",
          "Weight kg",
        ],
      ),
    );
  }
  return {
    module: "RC Column",
    title,
    code: input.code,
    basis: result.calculationBasis,
    project,
    policy,
    remarks,
    summary,
    figures: columnFigures(input, result, project?.reportSettings?.style),
    checks: checkTable(checks, policy, remarks),
    sections: [
      equations,
      section("All Load Combinations", loadRows, [
        "Combo",
        "Use",
        "Pu kN",
        "Mux",
        "Muy",
        "Vux / Vuy",
        "Axial DCR",
        "Interaction",
        "Status",
      ]),
      section(
        "Bar Coordinates",
        input.bars.map((b, k) => [
          String(k + 1),
          String(b.diameter),
          f(b.x),
          f(b.y),
        ]),
        ["Bar", "db mm", "x mm", "y mm"],
      ),
      section(
        "Selected Interaction-Curve Calculation States (Full Curves Plotted)",
        curveRows,
        [
          "Axis",
          "Sign",
          "c mm",
          "Pn kN",
          "Mn kN·m",
          "phi",
          "Design P",
          "Design M",
        ],
      ),
      ...extra,
    ],
    references: refColumn,
    criticalNotes: result.warnings.slice(4),
    limitations: [
      ...result.warnings,
      "Column shear, member slenderness and seismic tie compliance are not evaluated; tie quantities are estimating inputs only.",
      ...(quantity.enabled ? columnQuantityLimitations : []),
    ],
    generatedAt: new Date().toISOString(),
    estimate,
  };
}
export function slabReportData(
  project: ProjectRecord | undefined,
  title: string,
  input: SlabInput,
  r: SlabResult,
  quantity: SlabQuantityInput,
  policy: DesignCheckPolicy,
  remarks: DesignRemarks,
): ReportData {
  const checks = slabDesignChecks(input, r),
    flex = [...r.regions].sort((a, b) => b.dcr - a.dcr)[0],
    shear = [...r.shear].sort((a, b) => b.dcr - a.dcr)[0];
  const load = input.loads.find((l) => l.id === flex.combination)!;
  const grouped = [
    ["Flexure", checks.filter((c) => c.id.endsWith(":flexure"))],
    ["Shear", checks.filter((c) => c.id.startsWith("shear:"))],
    ["Deflection", checks.filter((c) => c.id === "deflection")],
    [
      "Detailing",
      checks.filter(
        (c) =>
          !c.id.endsWith(":flexure") &&
          !c.id.startsWith("shear:") &&
          c.id !== "deflection",
      ),
    ],
  ] as const;
  const summary = [
    section("Materials", [
      ["Approved By", project?.approvedBy ?? "Not Set"],
      [
        "Concrete / Steel",
        `fc = ${f(input.fc)} MPa; fy = ${f(input.fy)} MPa; Es = ${f(input.es, 0)} MPa`,
      ],
      [
        "Cover",
        `Top ${input.topCover}; Bottom ${input.bottomCover}; Side ${input.sideCover} mm`,
      ],
    ]),
    section("Section And Reinforcement", [
      ["Geometry", `${input.lx} x ${input.ly} m; h = ${input.h} mm; ${r.type}`],
      [
        "Supports",
        Object.entries(input.supports)
          .map(([e, s]) => e + ": " + s)
          .join("; "),
      ],
      ...r.bars.map((b) => [
        b.group.toUpperCase() + " " + b.layer,
        `D${b.diameter} @ ${b.spacing} mm; z = ${f(b.z, 1)} mm`,
      ]),
    ]),
    section("Governing Loads And Results", [
      ["Flexural Combination", flex.combination],
      [
        "D / SDL / Partition / L",
        `${f((input.h / 1000) * input.unitWeight)} / ${f(input.sdl)} / ${f(input.partition)} / ${f(input.live)} kPa`,
      ],
      [
        "Factored Load",
        `${load.deadFactor}(${f(r.dead)}) + ${load.liveFactor}(${f(input.live)}) = ${f(load.deadFactor * r.dead + load.liveFactor * input.live)} kPa`,
      ],
      [
        "Mu / Vu",
        `${f(flex.mu)} kN·m/m (${flex.label}); ${f(shear?.vu)} kN/m (${shear?.combination ?? "—"}, ${shear?.edge ?? "—"})`,
      ],
      [
        "Immediate Deflection",
        `${f(r.deflection.immediate)} / Allowable ${f(r.deflection.limit)} mm; ${r.deflection.combination}`,
      ],
      ...grouped.flatMap(([label, list]) => {
        const check = [...list].sort(
          (a, b) => (b.dcr ?? Infinity) - (a.dcr ?? Infinity),
        )[0];
        return check
          ? [
              [
                label,
                {
                  text: `${check.label}: DCR ${f(check.dcr, 3)} | ${status(check.dcr, policy, remarks[check.id]).text}`,
                  color: designCheckStatus(check.dcr, policy).color,
                },
              ] as (string | Cell)[],
            ]
          : [];
      }),
    ]),
  ];
  const equations: ReportSection[] = [
    section("Loads And Analysis Method", [
      [
        "Self Weight",
        `${input.h}/1000 x ${input.unitWeight} = ${f((input.h / 1000) * input.unitWeight)} kPa`,
      ],
      [
        "Total Dead",
        `${f((input.h / 1000) * input.unitWeight)} + ${input.sdl} + ${input.partition} = ${f(r.dead)} kPa`,
      ],
      [
        "Classification",
        `Llong/Lshort = ${f(r.ratio)}; ${r.type}; ${r.method}`,
      ],
      [
        "Moment Coefficients",
        Object.entries(r.coefficients)
          .map(([k, v]) => k + "=" + f(v, 5))
          .join("; "),
      ],
    ]),
    section(
      "All Load Combinations",
      input.loads.map((l) => [
        l.id,
        l.included ? "Included" : "Excluded",
        String(l.deadFactor),
        String(l.liveFactor),
        f(l.deadFactor * r.dead + l.liveFactor * input.live),
        String(l.serviceLiveFactor),
      ]),
      [
        "Combo",
        "Use",
        "Dead Factor",
        "Live Factor",
        "wu kPa",
        "Service Live Factor",
      ],
    ),
    section(
      "Flexural Equilibrium By Region",
      r.regions.map((v) => [
        v.label,
        `Mu = ${f(v.mu)}; As = ${f(v.mainAs, 0)} + ${f(v.extraAs, 0)} = ${f(v.as, 0)} mm²/m; d = ${f(v.d)} mm; epsilon_t = ${f(v.strain, 5)}; phi = ${f(v.phi, 3)}; phiMn = ${f(v.phiMn)}; DCR = ${f(v.mu)}/${f(v.phiMn)} = ${f(v.dcr, 3)}`,
        "22.2, 22.3, 21.2",
      ]),
      ["Region", "Substitution / Result", "Reference"],
    ),
    section(
      "Combined Reinforcement At Cutoff Zones",
      r.regions.flatMap((v) =>
        v.zones.map((z) => [
          v.label + " / " + z.label,
          `${f(z.mainAs, 0)} + ${f(z.extraAs, 0)} = ${f(z.as, 0)}`,
          f(z.mu),
          f(z.phiMn),
          f(z.dcr, 3),
          z.combination + " @ " + f(z.position, 3),
        ]),
      ),
      ["Region / Zone", "MAIN + EXTRA As", "Mu", "phiMn", "DCR", "Combo / x/L"],
    ),
    section(
      "One-Way Shear",
      r.shear.map((v) => [
        v.edge,
        `lambda_s=${f(v.lambdaS, 3)}; rho_w=${f(v.rho, 5)}; d=${f(v.d)}; phiVc=0.75 min(0.66 lambda_s rho_w^(1/3),0.42) sqrt(fc) b d = ${f(v.phiVc)} kN/m; DCR=${f(v.vu)}/${f(v.phiVc)}=${f(v.dcr, 3)}`,
        "Table 22.5.5.1",
      ]),
      ["Edge", "Equation / Substitution / Result", "Reference"],
    ),
    section(
      "Serviceability And Detailing",
      [
        [
          "Immediate Deflection",
          `Ec=4700 sqrt(${input.fc}) MPa; delta=beta ws Lshort^4 / elastic rigidity; ${f(r.deflection.immediate)} mm; limit=${f(r.shortSpan * 1000, 0)}/${input.deflectionDivisor}=${f(r.deflection.limit)} mm`,
          "24.2 — elastic screen",
        ],
        [
          "Minimum Steel",
          `As,min=0.0018 x 1000 x ${input.h}=${f(0.0018 * 1000 * input.h, 0)} mm²/m; continuous MAIN BARS checked separately from local MAIN + EXTRA strength`,
          "7.6, 8.6, 24.4",
        ],
        ...r.regions.map((v) => [
          v.label + " Spacing",
          v.spacingChecks
            .map(
              (s) =>
                `${s.label}: clear ${f(s.minClear)} >= ${f(s.requiredClear)}; max pitch ${f(s.maxPitch)} <= ${f(s.maxSpacing)} mm`,
            )
            .join("; "),
          "25.2; 7.7.2 / 8.7.2",
        ]),
        ...r.detailing.development.map((v) => [
          v.layer + " Development",
          `ld=${f(v.ld)} mm; available=${f(v.extension)} mm; ${v.ok ? "Screen Satisfied" : "Review Required"}; cutoff allowance max(d,12db) also required`,
          "25.4; 7.7.3 / 8.7.4",
        ]),
      ],
      ["Check", "Equation / Substitution / Result", "Reference"],
    ),
  ];
  const loadDcrRows = input.loads
    .filter((l) => l.included)
    .map((l) => {
      const regions = r.regions.map((v) => {
        let maximum = 0;
        for (const sample of v.samples.filter((s) => s.combination === l.id)) {
          const zone = v.zones.find((z) => z.extraAs > 0);
          const main = v.zones.find((z) => z.extraAs === 0);
          const capacity = sample.extra ? (zone ?? main)?.phiMn : main?.phiMn;
          maximum = Math.max(
            maximum,
            capacity && capacity > 0 ? sample.mu / capacity : Infinity,
          );
        }
        return maximum;
      });
      const wu = l.deadFactor * r.dead + l.liveFactor * input.live;
      const shearDcr = Math.max(
        ...r.shear.map((s) => {
          const source = input.loads.find((row) => row.id === s.combination)!;
          const sourceWu =
            source.deadFactor * r.dead + source.liveFactor * input.live;
          return sourceWu > 0 ? (s.dcr * wu) / sourceWu : 0;
        }),
      );
      const sourceService = input.loads.find(
        (row) => row.id === r.deflection.combination,
      )!;
      const sourceWs = r.dead + sourceService.serviceLiveFactor * input.live;
      const delta =
        sourceWs > 0
          ? (r.deflection.immediate *
              (r.dead + l.serviceLiveFactor * input.live)) /
            sourceWs
          : 0;
      return [
        l.id,
        ...regions.map((d) => f(d, 3)),
        f(shearDcr, 3),
        f(delta / r.deflection.limit, 3),
      ];
    });
  equations.splice(
    2,
    0,
    section("Design DCRs By Load Combination", loadDcrRows, [
      "Combo",
      ...r.regions.map((v) => v.label),
      "Max Shear DCR",
      "Deflection DCR",
    ]),
  );
  let estimate: ReportSection | undefined;
  if (quantity.enabled) {
    const q = estimateSlabQuantity(input, quantity);
    if (!q) throw Error("Slab Estimate Could Not Be Calculated.");
    estimate = section("Quantity Estimate", [
      ["Concrete Volume", `${f(q.concrete, 3)} m³ (Bounding Beams Excluded)`],
      ["Total Rebar Weight", `${f(q.total)} kg`],
      ["Steel / Concrete", `${f(q.ratio)} kg/m³`],
      [
        "Flexural / Distribution Weight",
        `${f(q.flexuralPercent)}% / ${f(q.distributionPercent)}%`,
      ],
    ]);
    equations.push(
      section(
        "Rebar Cutting Schedule",
        q.rows.map((b) => [
          b.mark,
          b.function,
          String(b.diameter),
          String(b.fy),
          String(b.count),
          f(b.length, 3),
          f(b.weight),
        ]),
        [
          "Mark",
          "Function",
          "db mm",
          "fy MPa",
          "Count",
          "Length m",
          "Weight kg",
        ],
      ),
    );
  }
  return {
    module: "Slab Design",
    title,
    code: input.code,
    basis: "ACI 318-19",
    project,
    policy,
    remarks,
    summary,
    figures: slabFigures(input, r, project?.reportSettings?.style),
    checks: checkTable(checks, policy, remarks),
    sections: equations,
    references: refSlab,
    criticalNotes: r.detailing.messages,
    limitations: [
      ...r.warnings,
      ...r.detailing.messages,
      ...(quantity.enabled ? slabQuantityLimitations : []),
    ],
    generatedAt: new Date().toISOString(),
    estimate,
  };
}
