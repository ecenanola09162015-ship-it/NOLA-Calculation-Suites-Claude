import { OVERRIDE_COLOR } from "../override-style";
import {
  columnHookBasisLabel,
  storeyClearHeights,
  rebarDesignation,
  rebarGradeLabel,
  columnDesignChecks,
  columnTransverseChecks,
  slabDesignChecks,
  slabMinimumSteelRatio,
  slabClauses,
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
  type ColumnTieDesignInput,
  type TransverseResult,
  type SlabInput,
  type SlabResult,
  type SlabQuantityInput,
} from "@nola/calc-core";
import type { ProjectRecord } from "../projects";
import {
  columnBiaxialFigure,
  columnFigures,
  columnTieElevationFigure,
  columnTieSectionFigure,
  columnStoreyFigure,
  slabFigures,
} from "./figures";
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
  /** Scope sentence printed in the simple-report overview. */
  scopeNote?: string;
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
const refColumn = (shear: boolean, seismic: boolean, slender: boolean) =>
  section("Code References — ACI 318-19", [
    ["Axial / Flexure / Biaxial", "22.2, 22.4; strength factors 21.2"],
    ["Reinforcement Limits", "10.6; detailing 10.7"],
    [slender ? "Slenderness" : "Slenderness (Not Considered)", "6.2.5, 6.6.4"],
    [
      shear ? "Column Shear" : "Column Shear (Not Evaluated)",
      "22.5; 10.6.2; 10.7.6.5",
    ],
    [
      seismic ? "Seismic Ties" : "Tie / Hook Review",
      seismic ? "18.4.3 / 18.7.4–18.7.6; 25.7.2" : "10.7, 25.3, 25.7",
    ],
  ]);
const refSlab = section("Code References — ACI 318-19", [
  ["Flexure / Strength Factors", "22.2, 22.3, 21.2"],
  ["One-Way / Punching Shear", "Table 22.5.5.1, 7.4.3.2; 22.6"],
  [
    "Minimum Thickness / Deflection",
    "Tables 7.3.1.1, 8.3.1.2, 24.2.3.5, 24.2.2; immediate only",
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
      c.clause,
      f(c.dcr, 3),
      status(c.dcr, policy, remarks[c.id]),
    ]),
    ["Check", "Code Reference", "DCR", "Status / Remarks"],
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
  tieDesign?: ColumnTieDesignInput,
  transverse?: TransverseResult | null,
): ReportData {
  const g = result.governing;
  const t = transverse ?? null;
  const std = input.rebarStandard ?? "PNS49";
  // Designer overrides are printed beside the adopted value for traceability.
  const ov = (k: "lo" | "sEnd" | "sMid") =>
    t && tieDesign?.override[k] != null
      ? ` (designer override; recommended ${t.recommended[k]})`
      : "";
  const overridden = {
    lo: tieDesign?.override.lo != null,
    sEnd: tieDesign?.override.sEnd != null,
    sMid: tieDesign?.override.sMid != null,
  };
  const anyOverride =
    !!t && (overridden.lo || overridden.sEnd || overridden.sMid);
  const storey = input.storey ?? null;
  const sh = storey ? storeyClearHeights(storey) : null;
  const storeyLine =
    storey && sh
      ? `H ${f(storey.height, 0)}; beam ∥X ${f(storey.beamX, 0)} / ∥Y ${f(storey.beamY, 0)} mm${storey.capital ? `; capital ${f(storey.capital, 0)}` : ""}${storey.bottom ? `; bottom ${f(storey.bottom, 0)}` : ""}; ℓu,x ${f(sh.luX, 0)}${storey.luOverrideX !== null ? " (override)" : ""} / ℓu,y ${f(sh.luY, 0)}${storey.luOverrideY !== null ? " (override)" : ""} mm; joint ${f(sh.joint, 0)} mm`
      : "";
  const checks = [...columnDesignChecks(result), ...columnTransverseChecks(t)];
  const slender = !!input.slenderness?.enabled;
  const shearOn = !!t && (!!tieDesign?.shear.enabled || t.seismic);
  const twoPages = slender || !!t;
  // Summary shows one biaxial flexure row: the 3D strain-compatibility check
  // (exact; it passes whenever the conservative linear screen passes).
  // Bresler and the linear screen stay in the complete report.
  const governing = checks.filter(
    (c) =>
      c.id.startsWith((g?.load.id ?? "") + ":") && !c.id.endsWith(":bresler"),
  );
  const barGroups = new Map<number, number>();
  for (const bar of input.bars)
    barGroups.set(bar.diameter, (barGroups.get(bar.diameter) ?? 0) + 1);
  const summary = [
    section("Materials", [
      ["Approved By", project?.approvedBy ?? "Not Set"],
      [
        "Concrete / Steel",
        `fc = ${f(input.fc)} MPa; ${rebarGradeLabel(std, input.fy, input.gradeId)}, fy = ${f(input.fy)} MPa (${std === "ASTM" ? "ASTM A615/A706" : "PNS 49"})`,
      ],
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
      ...(storey
        ? [
            [
              "Storey Geometry",
              storey.luOverrideX !== null || storey.luOverrideY !== null
                ? { text: storeyLine, color: OVERRIDE_COLOR }
                : storeyLine,
            ] as (string | Cell)[],
          ]
        : []),
      [
        "Longitudinal Bars",
        [...barGroups]
          .map(([d, n]) => `${n}-${rebarDesignation(std, d)}`)
          .join("; ") + `; As = ${f(result.steelArea, 0)} mm²`,
      ],
      t && tieDesign
        ? [
            "Ties (Design)",
            {
              text: `${rebarDesignation(std, tieDesign.tie.diameter)} ${rebarGradeLabel(std, tieDesign.tie.fyt, tieDesign.tie.gradeId)} hoop + cross-ties, ${t.layout.legsX} x ${t.layout.legsY} legs${t.midSeparate ? ` in lo, ${t.layoutMid.legsX} x ${t.layoutMid.legsY} outside lo` : ""}; ${t.seismic ? `lo ${t.adopted.lo} mm${ov("lo")} @ ${t.adopted.sEnd}${ov("sEnd")}; outside lo @ ${t.adopted.sMid} mm${ov("sMid")}` : `@ ${t.adopted.sMid} mm${ov("sMid")}`}`,
              ...(anyOverride ? { color: OVERRIDE_COLOR } : {}),
            },
          ]
        : [
            "Ties",
            `${rebarDesignation(std, input.tieDiameter)}; estimating spacing ${quantity.enabled ? quantity.zones.map((z) => z.name + ": " + z.spacing + " mm").join("; ") : "Not Defined In Design Inputs"}`,
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
      ...(g?.slenderness
        ? [
            [
              "Slenderness (6.6.4)",
              [g.slenderness.x, g.slenderness.y]
                .map(
                  (d) =>
                    `M${d.axis}: kl/r ${f(d.klur, 1)} vs ${f(d.limit, 1)}; ${d.slender ? `delta ${f(d.delta, 3)}, Mc ${f(d.mc)} kN·m` : "short"}`,
                )
                .join("; "),
            ],
          ]
        : [["Slenderness", "Not Considered (Short Column Assumed)"]]),
      shearOn && t
        ? [
            "Shear (Governing)",
            (() => {
              const s = [...t.shear].sort((a, b) => b.dcr - a.dcr)[0];
              return s
                ? `${s.load} V${s.dir === "x" ? "ux" : "uy"} ${f(s.vu, 1)} kN${t.seismic ? ` (Ve x/y ${f(t.adopted.ve.x, 1)} / ${f(t.adopted.ve.y, 1)})` : ""}; phiVn ${f(s.phiVn, 1)} kN; DCR ${f(s.dcr, 3)}`
                : "No Shear Demand";
            })(),
          ]
        : ["Vux / Vuy", "Not Supplied; Column Shear Not Evaluated"],
      ...governing.map((c) => [
        c.label.replace((g?.load.id ?? "") + " · ", ""),
        {
          text: `DCR ${f(c.dcr, 3)} | ${status(c.dcr, policy, remarks[c.id]).text}`,
          color: designCheckStatus(c.dcr, policy).color,
        },
      ]),
    ]),
    ...(t
      ? [
          section(
            t.seismic
              ? `Shear And Confinement Design (${t.frame})`
              : "Shear Design",
            [
              ...(t.seismic
                ? [
                    ["Zone Length lo", t.loBasis] as (string | Cell)[],
                    [
                      "Design Shear Ve x / y",
                      `${f(t.adopted.ve.x, 1)} / ${f(t.adopted.ve.y, 1)} kN; ${t.ve.basis}`,
                    ],
                  ]
                : []),
              ...columnTransverseChecks(t).map((c) => [
                c.label,
                {
                  text: `DCR ${f(c.dcr, 3)} | ${status(c.dcr, policy, remarks[c.id]).text}`,
                  color: designCheckStatus(c.dcr, policy).color,
                },
              ]),
            ],
          ),
        ]
      : []),
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
        "Biaxial 3D (Governing)",
        "Rotated neutral axis; concrete block clipped to the section; DCR = |Mu| / phiMn on the (Mux, Muy) ray at constant Pu",
        "22.2.1, 22.2.2; 22.4.2.1",
      ],
      [
        "Biaxial Bresler (Reference)",
        "1/phiPni = 1/phiPnx + 1/phiPny - 1/phiPo; phiPo = 0.65 P0; valid for Pu/0.65 >= 0.10 fc Ag",
        "R22.4 (Bresler)",
      ],
      [
        "Linear Screen (Reference)",
        "|Mux|/phiMnx(Pu) + |Muy|/phiMny(Pu)",
        "Engineering screen",
      ],
      [
        "Governing Combination Substitution",
        g
          ? `Pu = ${f(g.load.pu)} kN; Mux = ${f(g.mux)}; Muy = ${f(g.muy)} kN·m; 3D: ${f(Math.hypot(g.mux, g.muy))}/${f(g.biaxial?.capacity ?? null)} = ${f(g.biaxialRatio, 3)}; Bresler: ${g.bresler.applicable ? `${f(g.load.pu)}/${f(g.bresler.pni)} = ${f(g.bresler.ratio, 3)}` : "n/a"}; linear = ${f(g.interaction, 3)}; axial DCR = ${f(g.axialRatio, 3)}`
          : "No Governing Combination",
        "22.2; 22.4",
      ],
      ...(g?.slenderness
        ? [g.slenderness.x, g.slenderness.y].map((d) => [
            `Slenderness M${d.axis}`,
            d.slender
              ? `r = 0.3h = ${f(d.r, 0)} mm; kl/r = ${f(d.klur, 1)} > ${f(d.limit, 1)}; EI = ${f((d.ei ?? 0) / 1e9, 0)} kN·m²; Pc = ${f(d.pc, 0)} kN; Cm = ${f(d.cm, 3)}; delta = ${f(d.delta, 3)}; Mc = ${f(d.mc)} kN·m`
              : `kl/r = ${f(d.klur, 1)} <= ${f(d.limit, 1)}: neglected`,
            d.sway ? "6.2.5.1; 6.6.4.6" : "6.2.5.1; 6.6.4.4; 6.6.4.5",
          ])
        : []),
      [
        "Reinforcement Limits",
        `rho = As/Ag = ${f(result.steelRatio * 100)}%; general-column range 1–8%; seismic limits require separate review`,
        "10.6; 18.7",
      ],
      [
        "Shear / Seismic Ties",
        "Not Evaluated In This Build",
        "22.5; Ch. 18, 25",
      ],
    ],
    ["Check / Equation", "Substitution / Result", "Reference"],
  );
  const loadRows = result.checks.map((c) => [
    c.load.id,
    c.load.included ? "Included" : "Excluded",
    f(c.load.pu),
    f(c.mux),
    f(c.muy),
    f(c.axialRatio, 3),
    f(c.biaxialRatio, 3),
    c.bresler.applicable ? f(c.bresler.ratio, 3) : "n/a",
    c.load.included
      ? status(
          Math.max(c.axialRatio, c.biaxialRatio ?? Infinity),
          policy,
          remarks[c.load.id + ":biaxial3d"],
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
  const transverseSections: ReportSection[] = t
    ? [
        section(
          "Transverse Reinforcement Equations",
          [
            [
              "Shear Section",
              `x: bw ${f(t.sections.x.bw, 0)}, d ${f(t.sections.x.d, 1)} mm, Av ${f(t.sections.x.av, 0)} mm²; y: bw ${f(t.sections.y.bw, 0)}, d ${f(t.sections.y.d, 1)} mm, Av ${f(t.sections.y.av, 0)} mm²`,
              "22.5.2; 22.5.8.5.3",
            ],
            [
              "Concrete Shear",
              "Vc = max[(0.17 sqrt fc + Nu/6Ag), (0.66 rho_w^(1/3) sqrt fc + Nu/6Ag)] bw d with Av >= Av,min; else 0.66 lambda_s rho_w^(1/3) sqrt fc; Nu/6Ag <= 0.05fc; Vc <= 0.42 sqrt fc bw d",
              "Table 22.5.5.1",
            ],
            [
              "Steel Shear / Strength",
              "Vs = Av fyt d / s (fyt <= 420 MPa); phiVn = 0.75(Vc + Vs); Vu <= phi(Vc + 0.66 sqrt fc bw d)",
              "22.5.8.5.3; 22.5.1.2; 21.2.1",
            ],
            ...(t.seismic
              ? [
                  [
                    "Zone Length",
                    t.loBasis,
                    t.frame === "SMF" ? "18.7.5.1" : "18.4.3.3",
                  ],
                  [
                    "Design Shear",
                    t.ve.basis,
                    t.frame === "SMF" ? "18.7.6.1.1" : "18.4.3.1",
                  ],
                  ...t.ash.map((r) => [
                    `Ash Legs Parallel ${r.dir.toUpperCase()}`,
                    `bc ${f(r.bc, 0)} mm; (a) ${f(r.terms.a, 5)}, (b) ${f(r.terms.b, 5)}${r.terms.c !== null ? `, (c) ${f(r.terms.c, 5)}` : ""}; Ash ${f(r.provided, 0)} mm² => s <= ${f(r.sMax, 1)} mm`,
                    "Table 18.7.5.4",
                  ]),
                ]
              : []),
            ...t.limits.map((l) => [
              l.label,
              `${t.seismic ? `lo: ${Number.isFinite(l.end) ? f(l.end, 0) : "-"} mm; ` : ""}${t.seismic ? "outside lo" : "full height"}: ${Number.isFinite(l.mid) ? f(l.mid, 0) : "-"} mm`,
              l.clause,
            ]),
            [
              "Adopted",
              `${t.seismic ? `lo ${t.adopted.lo} mm @ ${t.adopted.sEnd} mm; ` : ""}@ ${t.adopted.sMid} mm; recommended ${t.seismic ? `${t.recommended.lo} / ${t.recommended.sEnd} / ` : ""}${t.recommended.sMid}`,
              "Designer selection",
            ],
          ],
          ["Check / Equation", "Substitution / Result", "Reference"],
        ),
        section(
          "Shear By Combination",
          t.shear.map((c) => [
            c.load,
            t.seismic ? (c.zone === "end" ? "lo" : "mid") : "all",
            c.dir,
            f(c.vu, 1),
            f(c.vc, 1) + (c.vcZero ? " (Vc=0)" : ""),
            f(c.vs, 1),
            f(c.phiVn, 1),
            f(c.dcr, 3),
          ]),
          [
            "Combo",
            "Zone",
            "Dir",
            "Vu kN",
            "Vc kN",
            "Vs kN",
            "phiVn kN",
            "DCR",
          ],
        ),
      ]
    : [];
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
      [
        "Hook Basis",
        columnHookBasisLabel[quantity.hookBasis] +
          (quantity.hookBasis === "aci14x90"
            ? " — crosstie 135° max(6db, 75) + 90° 6db; 90° ends alternated (ACI 318-14 / NSCP 2015 Ch. 2 / 402, 18.7.5.2(c) / 418.7.5.2(c), 25.3.4 / 425.3.4)"
            : quantity.hookBasis === "aci135"
              ? " — max(6db, 75) each end (ACI 318-19 25.3.4)"
              : ""),
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
    figures: [
      ...columnFigures(input, result, project?.reportSettings?.style),
      ...(storey
        ? [columnStoreyFigure(storey, project?.reportSettings?.style)]
        : []),
      ...(twoPages
        ? [columnBiaxialFigure(input, result, project?.reportSettings?.style)]
        : []),
      ...(t && tieDesign
        ? [
            columnTieElevationFigure(
              t.seismic ? t.clearHeight || tieDesign.confinement.clearHeight : 3000,
              t,
              project?.reportSettings?.style,
              overridden,
            ),
            columnTieSectionFigure(
              input,
              t,
              tieDesign.tie.diameter,
              project?.reportSettings?.style,
            ),
            ...(t.midSeparate
              ? [
                  columnTieSectionFigure(
                    input,
                    t,
                    tieDesign.tie.diameter,
                    project?.reportSettings?.style,
                    "mid",
                  ),
                ]
              : []),
          ]
        : []),
    ].filter((x): x is ReportFigure => !!x),
    checks: checkTable(checks, policy, remarks),
    sections: [
      equations,
      ...(storey && sh
        ? [
            section(
              "Storey Geometry (ACI 318-19 6.2.4, 18.7.5.1, 18.7.6.1.1, 18.8.3)",
              [
                ["Floor-to-floor height H (top of slab to top of slab)", `${f(storey.height, 0)} mm`],
                ["Beam along X / along Y (depth)", `${f(storey.beamX, 0)} / ${f(storey.beamY, 0)} mm`],
                ["Capital / drop / haunch; bottom deduction", `${f(storey.capital ?? 0, 0)} / ${f(storey.bottom ?? 0, 0)} mm`],
                ["ℓu,x (Mux) = H − beam ∥Y − capital − bottom", `${f(sh.derivedX, 0)} mm${storey.luOverrideX !== null ? `; override ${f(storey.luOverrideX, 0)} mm` : ""}`],
                ["ℓu,y (Muy) = H − beam ∥X − capital − bottom", `${f(sh.derivedY, 0)} mm${storey.luOverrideY !== null ? `; override ${f(storey.luOverrideY, 0)} mm` : ""}`],
                ["Clear height for lo (larger ℓu)", `${f(sh.loClear, 0)} mm`],
                ["Joint depth (deeper beam) / estimate clear height", `${f(sh.joint, 0)} / ${f(storey.height - sh.joint, 0)} mm`],
              ],
              ["Item", "Value"],
            ),
          ]
        : []),
      ...transverseSections,
      section("All Load Combinations", loadRows, [
        "Combo",
        "Use",
        "Pu kN",
        "Mux (Mc)",
        "Muy (Mc)",
        "Axial DCR",
        "3D DCR",
        "Bresler DCR",
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
    references: refColumn(shearOn, !!t?.seismic, slender),
    scopeNote: `Rectangular Tied Column. ${slender ? "Slenderness By Moment Magnification." : "Short Column (Slenderness Not Considered)."} ${shearOn ? "Shear Designed." : "Shear Not Evaluated."} ${t?.seismic ? `${t.frame} Confinement Designed.` : "Seismic Confinement Not Evaluated."}`,
    criticalNotes: result.warnings.slice(4),
    limitations: [
      ...result.warnings,
      ...(t
        ? t.notes
        : [
            "Column shear and seismic tie compliance are not evaluated; tie quantities are estimating inputs only.",
          ]),
      ...(t
        ? [
            "Transverse design excludes splice location/length (18.7.4.3), joint shear (18.8) and development; confirm hook engagement and fit in detailing.",
          ]
        : []),
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
    [
      "Shear",
      checks.filter(
        (c) => c.id.startsWith("shear:") || c.id.startsWith("punching:"),
      ),
    ],
    ["Deflection", checks.filter((c) => c.id === "deflection")],
    [
      "Detailing",
      checks.filter(
        (c) =>
          !c.id.endsWith(":flexure") &&
          !c.id.startsWith("shear:") &&
          !c.id.startsWith("punching:") &&
          c.id !== "deflection",
      ),
    ],
  ] as const;
  const summary = [
    section("Materials", [
      ["Approved By", project?.approvedBy ?? "Not Set"],
      [
        "Concrete / Steel",
        `fc = ${f(input.fc)} MPa; ${rebarGradeLabel(input.rebarStandard ?? "PNS49", input.fy, input.gradeId)}, fy = ${f(input.fy)} MPa; Es = ${f(input.es, 0)} MPa`,
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
        `${rebarDesignation(input.rebarStandard ?? "PNS49", b.diameter)} @ ${b.spacing} mm; z = ${f(b.z, 1)} mm`,
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
        "Deflection Control",
        r.deflection.governedBy === "thickness"
          ? `h ${input.h} >= hmin ${f(r.deflection.minimumThickness.hmin, 1)} mm (waived); cracked ${f(r.deflection.crackedImmediate)} / ${f(r.deflection.limit)} mm`
          : `h ${input.h} < hmin ${f(r.deflection.minimumThickness.hmin, 1)} mm; cracked ${f(r.deflection.crackedImmediate)} / ${f(r.deflection.limit)} mm`,
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
    ...((input.pointLoads ?? []).length
      ? [
          section(
            "Point Loads",
            input.pointLoads.map((p) => [
              p.id,
              `${f(p.x, 3)}, ${f(p.y, 3)}`,
              `${f(p.bx, 0)} x ${f(p.by, 0)}`,
              `${f(p.bx + input.h, 0)} x ${f(p.by + input.h, 0)}`,
              f(p.dead),
              f(p.live),
            ]),
            [
              "ID",
              "Centre x, y m",
              "Loaded Area mm",
              "Dispersed to Mid-Plane mm",
              "PD kN",
              "PL kN",
            ],
          ),
        ]
      : []),
    section(
      "Flexural Equilibrium By Region",
      r.regions.map((v) => [
        v.label,
        `Mu = ${f(v.mu)}; As = ${f(v.mainAs, 0)} + ${f(v.extraAs, 0)} = ${f(v.as, 0)} mm²/m; d = ${f(v.d)} mm; epsilon_t = ${f(v.strain, 5)}; phi = ${f(v.phi, 3)}; phiMn = ${f(v.phiMn)}; DCR = ${f(v.mu)}/${f(v.phiMn)} = ${f(v.dcr, 3)}`,
        slabClauses.flexure(r.type),
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
        `lambda_s=${f(v.lambdaS, 3)}; rho_w=${f(v.rho, 5)}; d=${f(v.d)}; phiVc=0.75 min(0.66 lambda_s rho_w^(1/3),0.42) min(sqrt(fc),8.3)=${f(Math.min(Math.sqrt(input.fc), 8.3), 3)} b d = ${f(v.phiVc)} kN/m; DCR=${f(v.vu)}/${f(v.phiVc)}=${f(v.dcr, 3)}`,
        v.concentratedWithinD
          ? slabClauses.shearAtSupport(r.type)
          : slabClauses.shear(r.type),
      ]),
      ["Edge", "Equation / Substitution / Result", "Reference"],
    ),
    ...(r.punching.length
      ? [
          section(
            "Punching Shear At Point Loads",
            r.punching.map((p) => [
              p.id,
              `d=(dshort+dlong)/2=${f(p.d, 1)} mm; b0=${f(p.b0, 0)} mm (${p.sides} sides, alpha_s=${p.alphaS}); beta=${f(p.beta, 2)}; lambda_s=${f(p.lambdaS, 3)}; vc=min(0.33, 0.17(1+2/beta), 0.083(2+alpha_s d/b0)) lambda_s min(sqrt(fc),8.3) = min(${p.vcLimits.map((v) => f(v, 3)).join(", ")}) = ${f(p.vc, 3)} MPa; phiVc=0.75 vc b0 d=${f(p.phiVc)} kN; Vu=${f(p.vu)} kN (${p.combination}, incl. uniform load on ${f(p.area, 3)} m²); DCR=${Number.isFinite(p.dcr) ? f(p.dcr, 3) : "not evaluated"}`,
              slabClauses.punching(),
            ]),
            ["Load", "Equation / Substitution / Result", "Reference"],
          ),
        ]
      : []),
    section(
      "Serviceability And Detailing",
      [
        [
          "Minimum Thickness",
          `${r.deflection.minimumThickness.formula}${r.deflection.minimumThickness.continuity ? ` (${r.deflection.minimumThickness.continuity})` : ""}; h = ${input.h} mm ${r.deflection.minimumThickness.ok ? ">= hmin: calculated deflection waived" : "< hmin: deflection calculated"}`,
          slabClauses.minimumThickness(r.deflection.minimumThickness.system),
        ],
        [
          "Immediate Deflection",
          `Ec=4700 sqrt(${input.fc}) MPa; fr=0.62 sqrt(fc); Ig=${f(r.deflection.ig / 1e6, 1)}e6, Icr=${f(r.deflection.icr / 1e6, 1)}e6 mm⁴; Mcr=${f(r.deflection.mcr)}, Ma=${f(r.deflection.ma)} kN·m/m; Ie,mid=${f(r.deflection.ieMid / 1e6, 1)}e6${r.deflection.ieAvg === null ? "" : `, Ie,avg=${f(r.deflection.ieAvg / 1e6, 1)}e6`}, Ie=${f(r.deflection.ie / 1e6, 1)}e6 mm⁴; delta,g=${f(r.deflection.immediate)} mm; delta,cr=delta,g x Ig/Ie=${f(r.deflection.crackedImmediate)} mm; limit=${f(r.shortSpan * 1000, 0)}/${input.deflectionDivisor}=${f(r.deflection.limit)} mm`,
          slabClauses.deflection(r.type),
        ],
        [
          "Minimum Steel",
          `As,min=${slabMinimumSteelRatio(input.fy).toFixed(4)} x 1000 x ${input.h}=${f(slabMinimumSteelRatio(input.fy) * 1000 * input.h, 0)} mm²/m (fy=${input.fy} MPa: ${input.fy < 420 ? "0.0020Ag for fy < 420" : "max(0.0018x420/fy, 0.0014)Ag"}); continuous MAIN BARS checked separately from local MAIN + EXTRA strength`,
          slabClauses.minimumSteel(r.type),
        ],
        ...r.regions.map((v) => [
          v.label + " Spacing",
          v.spacingChecks
            .map(
              (s) =>
                `${s.label}: clear ${f(s.minClear)} >= ${f(s.requiredClear)}; max pitch ${f(s.maxPitch)} <= ${f(s.maxSpacing)} mm`,
            )
            .join("; "),
          slabClauses.spacing(
            r.type,
            r.type === "one-way" && v.layer.startsWith("long"),
          ),
        ]),
        ...(r.detailing.anchorage
          ? [
              [
                "Cantilever Top-Bar Anchorage",
                `${r.detailing.anchorage.layer} D${r.detailing.anchorage.diameter}: straight ld=${f(r.detailing.anchorage.ld)} mm required beyond the support face into the back-span/support; Review Required (not checked)`,
                slabClauses.cantileverAnchorage(),
              ],
            ]
          : []),
        ...r.detailing.development.map((v) => [
          v.layer + " Development",
          `ld=${f(v.ld)} mm; available=${f(v.extension)} mm; ${v.ok ? "Screen Satisfied" : "Review Required"}; cutoff allowance max(d,12db) also required`,
          slabClauses.development(r.type),
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
