/**
 * Base plate report data (Simple and Complete PDF through the shared
 * pdf-lib pipeline). Drawings and step-by-step rows come from the same
 * functions as the workspace, so the PDF prints identical numbers.
 */
import {
  basePlateDesignChecks,
  designCheckStatus,
  futaUsed,
  getRodSpec,
  stiffenerLayoutInfo,
  suggestPlateThickness,
  type BasePlateInput,
  type BasePlateResult,
  type DesignCheckPolicy,
  type DesignRemarks,
} from "@nola/calc-core";
import type { ProjectRecord } from "../projects";
import { basePlatePlanSvg, basePlateSectionSvg } from "../base-plate-drawing";
import { basePlateSteps } from "../base-plate-steps";
import {
  f,
  fcText,
  type Cell,
  type ReportData,
  type ReportSection,
} from "./data";

const section = (
  title: string,
  rows: (string | Cell)[][],
  columns = ["Item", "Value"],
): ReportSection => ({ title, columns, rows });
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
const kindLabel: Record<string, string> = {
  "cast-in-headed-bolt": "Cast-in headed bolt",
  "cast-in-hooked-bolt": "Cast-in hooked bolt",
  "cast-in-headed-stud": "Cast-in headed stud",
  adhesive: "Adhesive (post-installed)",
  "mech-torque-expansion": "Torque-controlled expansion",
  "mech-displacement-expansion": "Displacement-controlled expansion",
  "mech-undercut": "Undercut",
  "mech-screw": "Screw anchor",
};

export const basePlateLimitations = [
  "Exposed base plate with a rigid-plate, uniform bearing stress block (AISC DG1 3rd Ed. Ch. 4). Embedded and blockout bases and plate flexibility are not covered. Stiffened plates (engine 0.3.0) are outside the DG1 scope: yield-line or strip panels on the DG1 critical lines, DG1 Ex. 4.7-7 tension side, stiffener checked as a cantilever bracket; HSS-wall and flange-tip local checks are not calculated.",
  "Biaxial large moment with compression: DG1 Eq. 4-69 when the shear is carried by a lug or friction; with rods in shear, per-axis analyses with full Pu and superposed rod tension (conservative). Biaxial moment with net tension is outside DG1 and is treated the same conservative way.",
  "Concrete breakout in shear parallel to an edge (17.7.2.1(c)) and edge-reinforcement ψc,V = 1.2 are not evaluated.",
  "Pedestal reinforcement, column stability and erection loads are not designed. Supplementary reinforcement is an input (Condition A/B), not detailed.",
  "Shear lug local plate bending uses the lug moment alone and neglects the column (DG1 Ex. 4.7-5); plate washer bearing (J3.11) is not checked.",
  "Friction (DG1 Eq. 4-30) uses the bearing area of each combination as Ac; it is not relied on for uplift or earthquake combinations.",
  "Post-installed anchor capacities depend on the product values entered from its evaluation report; verify the report number, edition and installation conditions.",
  "Clause references are to be confirmed against the licensed AISC 360-22 and ACI 318-19 texts before release.",
];

export function basePlateReportData(
  project: ProjectRecord | undefined,
  title: string,
  i: BasePlateInput,
  r: BasePlateResult,
  policy: DesignCheckPolicy,
  remarks: DesignRemarks,
  snapshot3d?: string | null,
): ReportData {
  const checks = basePlateDesignChecks(i, r);
  const a = i.anchors;
  const spec = getRodSpec(a.specId);
  const gov =
    r.combos.find((c) => c.load.id === r.governing.tp.combo) ?? r.combos[0]!;
  const worst = [...checks].sort((x, y) => (y.dcr ?? -1) - (x.dcr ?? -1))[0];
  const groups: [string, (id: string) => boolean][] = [
    [
      "Bearing / Plate / Weld",
      (id) => ["bearing", "plate", "weld"].includes(id),
    ],
    ["Anchor Steel", (id) => id.startsWith("rod-")],
    ["Biaxial", (id) => id === "biaxial"],
    [
      "Anchor Concrete",
      (id) =>
        /breakout|pullout|side-face|bond|sustained|pryout|interaction|seismic/.test(
          id,
        ),
    ],
    ["Shear Transfer", (id) => /friction|lug/.test(id)],
    ["Stiffeners", (id) => id.startsWith("stiffener-")],
    ["Geometry", (id) => id.startsWith("geo-")],
  ];
  const summary = [
    section("Column, Plate And Pedestal", [
      [
        "Design Codes / Method",
        `Concrete ${i.concreteCode}; Steel ${i.steelCode}; ${i.designMethod}${i.designMethod === "ASD" ? (i.asdAnchorBasis === "lrfd" ? ` (ACI 318 checks from ${i.lrfdLoads.length} LRFD combinations)` : ` (ACI 318 checks at ${i.asdAlpha} × ASD demand)`) : ""}`,
      ],
      [
        "Column",
        `${i.column.designation} (${i.column.shapeType}, ${i.column.source}); Fy ${f(i.column.fy, 0)} MPa; orientation ${i.rotation}°`,
      ],
      [
        "Base Plate",
        `${f(i.plate.bx, 0)} × ${f(i.plate.by, 0)} × ${f(i.plate.tp, 0)} mm, Fy ${f(i.plate.fy, 0)} MPa; grout ${f(i.grout.thickness, 0)} mm`,
      ],
      [
        "Pedestal",
        `${f(i.pedestal.px, 0)} × ${f(i.pedestal.py, 0)} mm, ha ${f(i.pedestal.height, 0)} mm; f′c ${fcText(i.pedestal)}; ${i.pedestal.cracked ? "cracked" : "uncracked"}; Condition ${i.pedestal.condition}`,
      ],
      [
        "Weld",
        `${f(i.weld.size, 0)} mm fillet all around, FEXX ${f(i.weld.fexx, 0)} MPa`,
      ],
      ...(i.stiffeners.layout !== "none"
        ? [
            [
              "Stiffeners",
              `${stiffenerLayoutInfo[i.stiffeners.layout].label}; ${f(i.stiffeners.t, 0)} mm thick, hc ${f(i.stiffeners.hc, 0)} / he ${f(i.stiffeners.he, 0)} mm, snip ${f(i.stiffeners.clip, 0)} mm, Fy ${f(i.stiffeners.fy, 0)} MPa; fillets ${f(i.stiffeners.weldColumn, 0)} mm to column, ${f(i.stiffeners.weldPlate, 0)} mm to plate (both sides); ${i.stiffeners.section === "tee" ? "tee section" : "stiffener alone"}; plate panels by ${i.stiffeners.plateMethod === "strip" ? "strip method" : "yield-line"}`,
            ] as (string | Cell)[],
          ]
        : []),
    ]),
    section("Anchor Rods", [
      [
        "Type / Specification",
        `${kindLabel[a.kind]}; ${spec?.label ?? a.specId}${spec?.userStrength ? " (user strength, flagged)" : ""}`,
      ],
      [
        "Size / Strength",
        `${r.rods.length} × ${a.sizeId} (da ${f(a.da, 1)} mm, Ase ${f(a.ase, 1)} mm²); Fy ${f(a.fy, 1)}, Fu ${f(a.fu, 1)}, futa ${f(futaUsed(a.fy, a.fu), 1)} MPa; ${a.ductile ? "ductile" : "brittle"}`,
      ],
      [
        "Layout",
        `${a.layout} ${a.nx} × ${a.ny}, sx ${f(a.sx, 0)}, sy ${f(a.sy, 0)} mm; hef ${f(a.hef, 0)} mm; hole ${f(a.hole, 1)} mm (${a.holeSource === "table" ? "Table 14-2" : "custom"}); washer ${f(a.washer.size, 1)} × ${f(a.washer.thickness, 1)} mm${a.weldedWashers ? " welded" : ""}`,
      ],
      ...(a.product
        ? [
            [
              "Product",
              `${a.product.name}, ${a.product.report}, category ${a.product.category}`,
            ] as (string | Cell)[],
          ]
        : []),
      [
        "Shear Transfer",
        i.shear.method === "anchors"
          ? "Anchor rods"
          : i.shear.method === "friction"
            ? `Friction μ = ${i.shear.mu} (DG1 Eq. 4-30)`
            : i.shear.method === "friction-anchors"
              ? `Friction μ = ${i.shear.mu} + anchor rods (ACI 349 D.6.1.4)`
              : `Shear lug ${i.shear.lug.orientation}, ${f(i.shear.lug.width, 0)} × ${f(i.shear.lug.thickness, 0)} × ${f(i.shear.lug.depth, 0)} mm, Fy ${f(i.shear.lug.fy, 0)} / Fu ${f(i.shear.lug.fu, 0)} MPa, ${f(i.shear.lug.weld, 0)} mm fillets`,
      ],
    ]),
    section("Governing Results", [
      [
        "Plate Thickness",
        `tp,req ${f(r.governing.tp.value, 1)} mm (${r.governing.tp.combo}) vs ${f(i.plate.tp, 0)} mm; standard ${suggestPlateThickness(r.governing.tp.value) ?? "—"} mm`,
      ],
      [
        "Bearing",
        `φc fp,max ${f(r.bearing.fpMax, 2)} MPa; √(A2/A1) = ${f(r.bearing.ratio, 3)}`,
      ],
      ["Governing Case", `${gov.load.id}: ${gov.method}`],
      ...(worst
        ? [
            [
              "Highest DCR",
              {
                text: `${worst.label}: ${f(worst.dcr, 3)} | ${status(worst.dcr, policy, remarks[worst.id]).text}`,
                color: designCheckStatus(worst.dcr, policy).color,
              },
            ] as (string | Cell)[],
          ]
        : []),
      ...groups.flatMap(([label, test]) => {
        const c = checks
          .filter((x) => test(x.id))
          .sort((x, y) => (y.dcr ?? -1) - (x.dcr ?? -1))[0];
        return c
          ? [
              [
                label,
                {
                  text: `${c.label}: DCR ${f(c.dcr, 3)} | ${status(c.dcr, policy, remarks[c.id]).text}`,
                  color: designCheckStatus(c.dcr, policy).color,
                },
              ] as (string | Cell)[],
            ]
          : [];
      }),
    ]),
  ];
  const sections: ReportSection[] = [
    section(
      "All Load Combinations And Results",
      r.combos.map((c) => [
        c.load.id,
        `${f(c.load.pu, 1)} / ${f(c.load.mx, 1)} / ${f(c.load.my, 1)}`,
        `${f(c.load.vx, 1)} / ${f(c.load.vy, 1)}${c.seismicApplies ? " E" : ""}`,
        c.case,
        f(c.tpRequired, 1),
        f(c.anchor.nuaMax / 1e3, 1),
        f(c.anchor.interaction.ratio, 3),
      ]),
      [
        "Combo",
        "Pu / Mx / My",
        "Vx / Vy",
        "Case",
        "tp,req mm",
        "Nua kN",
        "T–V DCR",
      ],
    ),
    section(
      "Anchor Rod Forces — " + gov.load.id,
      r.rods.map((rod, k) => [
        rod.id,
        `x ${f(rod.x, 0)}, y ${f(rod.y, 0)}`,
        f(gov.rodTension[k]! / 1e3, 2),
        f(gov.rodShear[k]! / 1e3, 2),
      ]),
      ["Rod", "Position mm", "Tension kN", "Shear kN"],
    ),
    section("Step-By-Step — " + gov.load.id, basePlateSteps(i, r, gov), [
      "Check",
      "Equation / Substitution / Result",
      "Reference",
    ]),
  ];
  const figures = [
    { title: `Plan — ${gov.load.id}`, svg: basePlatePlanSvg(i, gov) },
    {
      title: `Section A-A — ${gov.load.id}`,
      svg: basePlateSectionSvg(i, "A", gov),
    },
    {
      title: `Section B-B — ${gov.load.id}`,
      svg: basePlateSectionSvg(i, "B", gov),
    },
    ...(snapshot3d
      ? [
          {
            title: "3D View With Anchor Rods And Loads (snapshot)",
            svg: "",
            png: snapshot3d,
            completeOnly: true,
          },
        ]
      : []),
  ];
  return {
    module: "Base Plate",
    title,
    code: `Concrete: ${i.concreteCode} · Steel: ${i.steelCode} (${i.designMethod})`,
    basis: `ACI 318-19 Ch. 17 / AISC 360-22 + AISC DG1 3rd Ed. — ${i.designMethod}`,
    project,
    policy,
    remarks,
    summary,
    figures,
    checks: section(
      "DCR Design Checks And Engineering Remarks",
      checks.map((c) => [
        c.label,
        c.clause,
        f(c.dcr, 3),
        status(c.dcr, policy, remarks[c.id]),
      ]),
      ["Check", "Code Reference", "DCR", "Status / Remarks"],
    ),
    sections,
    references: section("Code References", [
      ...(i.otherCodes.trim()
        ? [["Other Codes (Reference Only)", i.otherCodes.trim()]]
        : []),
      [
        `Concrete — ${i.concreteCode}`,
        "Ch. 17: 17.5 φ, 17.6 tension, 17.7 shear, 17.8 interaction, 17.9 edges, 17.10 seismic, 17.11 shear lugs" +
          (i.designMethod === "ASD"
            ? `; strength level = ${i.asdAlpha} × ASD demand`
            : ""),
      ],
      [
        `Steel — ${i.steelCode} (${i.designMethod})`,
        `B3.${i.designMethod === "LRFD" ? "1 LRFD φ" : "2 ASD Ω"}; J8 bearing; J2 welds; J9 anchor rods → ACI 318; AISC DG1 3rd Ed. Ch. 4; AISC Manual 16th Ed. Table 14-2`,
      ],
      ...(["C", "D", "E", "F"].includes(i.seismic.sdc)
        ? [
            [
              "Seismic — AISC 341-22 / ACI 318-19 17.10",
              "D2.6 column-base required strengths not calculated (designer-supplied reactions); ACI 17.10 applied",
            ],
          ]
        : []),
      [
        "Materials",
        "ASTM F1554, A36, A193, A449, ISO 898-1 (specified minimum strengths); AISC Shapes Database v16.0",
      ],
    ]),
    criticalNotes: r.notes,
    limitations: [...r.notes, ...basePlateLimitations],
    generatedAt: new Date().toISOString(),
    simplePageLimit: 3,
    scopeNote:
      "Steel column base plate and anchor rods: AISC DG1 uniform bearing, ACI 318-19 Ch. 17 anchors; development pilot.",
  };
}
