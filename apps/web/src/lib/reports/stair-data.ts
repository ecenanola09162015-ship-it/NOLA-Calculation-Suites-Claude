/**
 * Stairs PDF report data (decisions R1, R2): same ReportData contract and
 * generator (pdf.ts) as Slab and RC Column. Simple report: inputs, governing
 * check per heading plus every amber / red row, section and plan. Complete
 * report: every check, substitutions per heading, loads, analysis,
 * reactions, footing, quantities, elevation, envelopes and 3-D snapshot.
 */
import {
  designCheckStatus,
  rebarDesignation,
  rebarGradeLabel,
  stairBarLabels,
  stairBarMarks,
  stairCalculationBasis,
  stairClauses,
  stairQuantities,
  stairsDesignCheckSections,
  type DesignCheck,
  type DesignCheckPolicy,
  type DesignRemarks,
  type StairBarSetId,
  type StairsInput,
  type StairsResult,
} from "@nola/calc-core";
import type { ProjectRecord } from "../projects";
import {
  f,
  fcText,
  type Cell,
  type ReportData,
  type ReportSection,
} from "./data";
import { stairFigures } from "./stair-figures";

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
/**
 * Characters used by the stairs text that the shared PDF font map does not
 * cover (it already maps φ, λ, θ, Δ, ψ, ℓ, √, ≤, ≥, ², ³ …).
 */
const pdfSafe = (t: string) =>
  t
    .replaceAll("−", "-")
    .replaceAll("γ", "gamma ")
    .replaceAll("μ", "mu")
    .replaceAll("≈", "~")
    .replaceAll("↗", "")
    .replaceAll("↖", "")
    .replaceAll("ξ", "xi");
const safeCell = (c: string | Cell): string | Cell =>
  typeof c === "string" ? pdfSafe(c) : { ...c, text: pdfSafe(c.text) };
const safeSection = (s: ReportSection): ReportSection => ({
  ...s,
  title: pdfSafe(s.title),
  rows: s.rows.map((r) => r.map(safeCell)),
  ...(s.simpleRows
    ? { simpleRows: s.simpleRows.map((r) => r.map(safeCell)) }
    : {}),
});
const SETS: StairBarSetId[] = [
  "mainBottom",
  "topBottom",
  "topTop",
  "topKnee",
  "distribution",
];

function safeReport(d: ReportData): ReportData {
  return {
    ...d,
    title: d.title,
    summary: d.summary.map(safeSection),
    checks: safeSection(d.checks),
    sections: d.sections.map(safeSection),
    references: safeSection(d.references),
    estimate: d.estimate ? safeSection(d.estimate) : undefined,
    limitations: d.limitations.map(pdfSafe),
    criticalNotes: d.criticalNotes.map(pdfSafe),
    scopeNote: d.scopeNote ? pdfSafe(d.scopeNote) : d.scopeNote,
    figures: d.figures.map((f) => ({ ...f, title: pdfSafe(f.title) })),
  };
}

export function stairsReportData(
  project: ProjectRecord | undefined,
  title: string,
  input: StairsInput,
  r: StairsResult,
  policy: DesignCheckPolicy,
  remarks: DesignRemarks,
  estimateOn: boolean,
  snapshot3d?: string | null,
): ReportData {
  const i = input;
  const std = i.rebarStandard ?? "PNS49";
  const dog = i.stairType === "dog-leg";
  const full = i.widthMode === "full";
  const B = i.flightWidth / 1000;
  const sections = stairsDesignCheckSections(r);
  /** DCR text: an exceeded check (DCR ∞) names its condition, not "Not Evaluated". */
  const dcrText = (c: Pick<DesignCheck, "dcr" | "invalidLabel">) =>
    c.dcr === null || Number.isNaN(c.dcr)
      ? "Not Evaluated"
      : Number.isFinite(c.dcr)
        ? f(c.dcr, 3)
        : (c.invalidLabel ?? "Exceeds Capacity");
  const row = (sec: string, c: DesignCheck): (string | Cell)[] => [
    `${sec} · ${c.label}`,
    c.clause,
    dcrText(c),
    status(c.dcr, policy, remarks[c.id]),
  ];
  // Simple: governing row per heading + every amber / red row (never hidden).
  const simpleRows = sections.flatMap((s) => {
    const governing = [...s.checks].sort(
      (a, b) => (b.dcr ?? Infinity) - (a.dcr ?? Infinity),
    )[0];
    const flagged = s.checks.filter(
      (c) =>
        c !== governing &&
        ["judgment", "improve"].includes(designCheckStatus(c.dcr, policy).id),
    );
    return [governing, ...flagged].filter(Boolean).map((c) => row(s.title, c));
  });
  const checks: ReportSection = {
    ...section(
      "DCR Design Checks And Engineering Remarks (By Flight)",
      sections.flatMap((s) => s.checks.map((c) => row(s.title, c))),
      ["Check", "Code Reference", "DCR", "Status / Remarks"],
    ),
    simpleRows,
  };
  const fl = r.loads.flight;
  const stations = r.strips.flatMap((s) => s.stations);
  const mPos = Math.max(0, ...stations.map((s) => s.mPos)),
    mNeg = Math.min(0, ...stations.map((s) => s.mNeg)),
    vu = Math.max(0, ...stations.map((s) => s.vu));
  const flightLabel = (k: number) =>
    dog ? `Flight ${k + 1}` : `Flight ${k + 1}`;
  const summary: ReportSection[] = [
    section("Materials And Basis", [
      ["Approved By", project?.approvedBy ?? "Not Set"],
      [
        "Concrete / Steel",
        `fc = ${fcText(i)}; ${rebarGradeLabel(std, i.fy, i.gradeId)}, fy = ${f(i.fy, 0)} MPa; Es = ${f(i.es, 0)} MPa`,
      ],
      ["Cover", `Top ${i.topCover}; Bottom ${i.bottomCover} mm`],
      [
        "Design Width",
        full
          ? `Full flight width B = ${i.flightWidth} mm (results per metre; totals × B)`
          : "1 m design strip (results and quantities per metre)",
      ],
    ]),
    section("Geometry And Supports", [
      [
        "Stair",
        `${dog ? "Dog-leg" : "Single span"}; R ${i.riser} · T ${i.going} mm; θ ${f(r.pitch.degrees, 2)}°; 2R + T = ${r.pitch.blondel} mm; waist ${i.waist} mm`,
      ],
      [
        "Flights",
        i.flights
          .map(
            (fx, k) =>
              `${flightLabel(k)}: ${fx.risers}R${fx.landingAfter ? `; ${dog ? "mid" : "intermediate"} landing ${fx.landingAfter.length} × ${fx.landingAfter.thickness} mm` : ""}`,
          )
          .join(" | "),
      ],
      [
        "Landings",
        `Bottom ${i.bottomLanding.length ? `${i.bottomLanding.length} × ${i.bottomLanding.thickness} mm` : "none"}; Top ${i.topLanding.length ? `${i.topLanding.length} × ${i.topLanding.thickness} mm` : "none"}`,
      ],
      [
        "Supports",
        `Bottom: ${i.bottomSupport.onGround ? `on ground${i.bottomSupport.footing.design ? ` (footing ${i.bottomSupport.footing.width} × ${i.bottomSupport.footing.thickness} mm, qa ${i.bottomSupport.footing.qa} kPa)` : " (footing by others)"}` : "suspended"} · ${i.bottomSupport.condition}; Top: ${i.topSupport.condition}; seismic: ${i.seismic.connection}`,
      ],
    ]),
    section(
      "Reinforcement (Marks As Drawn)",
      SETS.map((k) => {
        const b = i.bars[k];
        const ext = "extension" in b ? `; ${b.extension} mm each side` : "";
        return [
          `${stairBarMarks[k]} ${stairBarLabels[k]}`,
          `${rebarDesignation(std, b.diameter)} @ ${b.spacing} mm${ext}`,
        ];
      }),
    ),
    section("Governing Loads And Results", [
      [
        "Flight Dead Load (Plan)",
        `${f(fl.waist)} + ${f(fl.steps)} + ${f(fl.finishes)} + ${f(fl.soffit)} = ${f(fl.total)} kPa${full ? ` (× B = ${f(fl.total * B)} kN/m)` : ""}`,
      ],
      [
        "Live Load",
        `${f(i.live)} kPa${full ? ` (× B = ${f(i.live * B)} kN/m)` : ""}`,
      ],
      [
        "Mu+ / Mu− / |Vu| Max",
        `${f(mPos)} / ${f(mNeg)} kN·m/m; ${f(vu)} kN/m${full ? ` (× B: ${f(mPos * B)} / ${f(mNeg * B)} kN·m; ${f(vu * B)} kN)` : ""}`,
      ],
      ...sections.map((s) => {
        const c = [...s.checks].sort(
          (a, b) => (b.dcr ?? Infinity) - (a.dcr ?? Infinity),
        )[0];
        return [
          s.title,
          {
            text: `${c?.label ?? "—"}: DCR ${c ? dcrText(c) : "—"} | ${status(s.governing, policy, c ? remarks[c.id] : undefined).text}`,
            color: designCheckStatus(s.governing, policy).color,
          },
        ] as (string | Cell)[];
      }),
    ]),
  ];
  // Complete report: substitutions per heading, loads, analysis, reactions.
  const detailSections = sections.map((s) =>
    section(
      `Calculations · ${s.title}`,
      s.checks.map((c) => [c.label, c.detail ?? "", c.clause]),
      ["Check", "Equation / Substitution / Result", "Reference"],
    ),
  );
  const loads = section(
    "Loads (On Plan)",
    [
      [
        "Flight",
        `waist γt/cosθ = ${i.unitWeight}×${i.waist}/1000/${f(Math.cos((r.pitch.degrees * Math.PI) / 180), 4)} = ${f(fl.waist)}; steps γR/2 = ${i.unitWeight}×${i.riser}/2000 = ${f(fl.steps)}; finishes ${f(fl.finishes)}; soffit ${i.soffitFinish}/cosθ = ${f(fl.soffit)}; total ${f(fl.total)} kPa`,
        "Self-weight on plan (L1)",
      ],
      ...r.loads.landings.map((l) => [
        l.label,
        `γt = ${i.unitWeight}×${l.thickness}/1000 + finishes ${i.finishes} + soffit ${i.soffitFinish} = ${f(l.dead)} kPa`,
        "—",
      ]),
      [
        "Live",
        `${f(i.live)} kPa; sustained fraction ψ = ${i.sustainedLiveFactor}`,
        "NSCP 2015 Table 205-1 / ASCE 7-16 Table 4.3-1 (confirm occupancy)",
      ],
      ...i.combinations.map((c) => [
        c.id,
        `${c.deadFactor}D + ${c.liveFactor}L${c.included ? "" : " (excluded)"}`,
        stairClauses.combinations(),
      ]),
      ...i.localLoads.map((l) => [
        l.id,
        `${l.kind} ${l.case}: ${l.value} ${l.kind === "point" ? "kN" : l.kind === "line" ? "kN/m" : "kPa"} at ${l.kind === "area" ? `x ${l.x0}–${l.x1}` : `x ${l.x}`} mm${l.kind === "line" ? "" : `, width ${l.width} mm`}${dog ? `, flight ${l.strip ?? 1}` : ""}`,
        full
          ? stairClauses.effectiveWidth()
          : "Whole load on the 1 m strip (conservative)",
      ]),
    ],
    ["Item", "Build-Up", "Reference / Note"],
  );
  const reactions = section(
    "Support Reactions (Per Metre Width = Line Load On The Supporting Beam)",
    r.strips.flatMap((s) =>
      s.reactions.map((x) => [
        `${s.geometry.label} · ${x.support.label} (${x.support.condition})`,
        `D ${f(x.dead.v)} + L ${f(x.live.v)} = ${f(x.service.v)} kN/m; H ${f(x.service.h)} kN/m; Vu ${f(x.factored.vMin)} to ${f(x.factored.vMax)} kN/m (${x.factored.combination}); |Hu| ${f(x.factored.hAbsMax)}; |Mu| ${f(x.factored.mAbsMax)} kN·m/m${full ? `; × B: V ${f(x.service.v * B)} kN service, ${f(x.factored.vMax * B)} kN factored` : ""}`,
      ]),
    ),
  );
  const spans = section(
    "Spans · Thickness And Deflection",
    r.strips.flatMap((s) =>
      s.spans.map((sp) => [
        `${s.geometry.label} · ${sp.label}`,
        `ℓ dev ${f(sp.developed, 0)} mm; hmin ${f(sp.hmin, 0)} / h ${sp.hProvided} mm; Ie/Ig ${f(sp.ieRatio, 3)}; Δ live ${f(sp.immediateLive)} mm (limit ${f(sp.limitImmediate)}); Δ long-term + live ${f(sp.total)} mm (limit ${f(sp.limitTotal)})`,
        stairClauses.deflection(),
      ]),
    ),
    ["Span", "Result", "Reference"],
  );
  const extra: ReportSection[] = [loads, reactions, spans, ...detailSections];
  if (r.footing) {
    const ft = r.footing;
    extra.push(
      section(
        "Strip Footing",
        [
          [
            "Bearing",
            `P = ${f(ft.serviceP)} kN/m; e = ${f(ft.eccentricity, 3)} m; q,max = ${f(ft.qMax, 1)} kPa vs qa ${ft.qa} kPa`,
            stairClauses.footingBearing(),
          ],
          [
            "Flexure",
            `qu = ${f(ft.qu, 1)} kPa; cantilever ${f(ft.cantilever, 0)} mm; Mu = ${f(ft.mu)} vs φMn = ${f(ft.phiMn)} kN·m/m`,
            stairClauses.footingFlexure(),
          ],
          [
            "Shear",
            `Vu = ${f(ft.vu)} vs φVc = ${f(ft.phiVc)} kN/m`,
            stairClauses.footingShear(),
          ],
          [
            "Dowels",
            `ldh ${f(ft.dowelRequired, 0)} mm vs ${f(ft.dowelAvailable, 0)} mm available`,
            stairClauses.hook(),
          ],
        ],
        ["Check", "Result", "Reference"],
      ),
    );
  }
  let estimate: ReportSection | undefined;
  const q = estimateOn ? stairQuantities(i) : null;
  if (q && !q.error) {
    estimate = section("Quantity Estimate", [
      [
        "Design Width",
        full ? `${f(q.widthM, 3)} m (full flight)` : "1 m strip",
      ],
      ["Concrete", `${f(q.totals.concrete, 3)} m³`],
      ["Formwork", `${f(q.totals.formwork, 2)} m²`],
      [
        "Reinforcement",
        `${f(q.totals.steel, 1)} kg (${f(q.totals.steelRatio, 0)} kg/m³)`,
      ],
    ]);
    extra.push(
      section(
        "Bar Schedule",
        q.bars.map((b) => [
          b.mark,
          `${b.label} · ${b.strip}`,
          `${rebarDesignation(std, b.diameter)} @ ${b.spacing}`,
          String(b.count),
          f(b.length, 0),
          f(b.mass, 1),
        ]),
        ["Mark", "Description", "Bar", "No.", "Length mm", "Mass kg"],
      ),
    );
  }
  const references = section("Code References — ACI 318-19", [
    ...(i.otherCodes?.trim()
      ? [["Other Codes (Reference Only)", i.otherCodes.trim()]]
      : []),
    [
      "Calculation Basis",
      stairCalculationBasis(i),
    ],
    [
      "Analysis / Combinations",
      `${stairClauses.analysis()}; ${stairClauses.combinations()}`,
    ],
    ["Flexure / Strain", `${stairClauses.flexure()}; ${stairClauses.strain()}`],
    ["One-Way Shear", stairClauses.shear()],
    [
      "Minimum Steel / Spacing / Cracking",
      `${stairClauses.minimumSteel()}; ${stairClauses.spacing()}; ${stairClauses.crack()}`,
    ],
    [
      "Thickness / Deflection",
      `${stairClauses.minimumThickness()}; ${stairClauses.deflection()}`,
    ],
    [
      "Development / Hooks",
      `${stairClauses.development()}; ${stairClauses.hook()}`,
    ],
    [
      "Seismic / Geometry (Advisory)",
      `${stairClauses.seismic()}; ${stairClauses.geometry()}`,
    ],
  ]);
  return safeReport({
    module: "Stairs",
    title,
    code: i.code,
    basis: stairCalculationBasis(i),
    project,
    policy,
    remarks,
    summary,
    figures: stairFigures(i, r, snapshot3d),
    checks,
    sections: extra,
    references,
    criticalNotes: r.warnings.filter((w) =>
      /uplift|settlement|unstable/i.test(w),
    ),
    limitations: [...r.warnings, ...r.notes, ...(q && !q.error ? q.notes : [])],
    generatedAt: new Date().toISOString(),
    estimate,
    scopeNote: `${dog ? "Dog-leg stair, two flights sharing the mid-landing support" : `Single-span stair, ${i.flights.length} flight${i.flights.length > 1 ? "s" : ""}`}; 2-D frame per 1 m strip; ${full ? `full flight width ${i.flightWidth} mm` : "1 m design strip"}; ${i.bottomSupport.onGround ? (i.bottomSupport.footing.design ? "bottom on ground with strip footing designed" : "bottom on ground, footing by others") : "suspended supports"}.`,
  });
}
