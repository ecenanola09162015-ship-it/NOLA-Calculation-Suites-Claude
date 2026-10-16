/**
 * Retaining wall report data for the shared PDF renderer (Simple and
 * Complete). The report reads the evaluated result only; it never
 * recalculates. Code basis: ACI 318-19 first, NSCP 2015 second.
 */
import {
  designCheckStatus,
  rebarDesignation,
  rebarGradeLabel,
  retainingWallDesignChecks,
  retainingWallStatus,
  barAreaPerMetre,
  type DesignCheckPolicy,
  type DesignRemarks,
  type RetainingWallInput,
  type RetainingWallResult,
} from "@nola/calc-core";
import type { ProjectRecord } from "../projects";
import { retainingWallSectionSvg, retainingWallStemSvg } from "../retaining-wall-drawing";
import { f, fcText, type Cell, type ReportData, type ReportSection } from "./data";

const section = (title: string, rows: (string | Cell)[][], columns = ["Item", "Value"]): ReportSection => ({
  title,
  columns,
  rows,
});
function status(dcr: number | null, policy: DesignCheckPolicy, remark?: string): Cell {
  const s = designCheckStatus(dcr, policy);
  return {
    text: s.label + (s.id === "judgment" ? " | Remarks: " + (remark?.trim() || "Not Recorded") : ""),
    color: s.color,
  };
}
const dcrCell = (dcr: number | null, policy: DesignCheckPolicy, remarks: DesignRemarks, id: string): Cell => ({
  text: `DCR ${f(dcr, 3)} | ${status(dcr, policy, remarks[id]).text}`,
  color: designCheckStatus(dcr, policy).color,
});
const typeLabel = {
  cantilever: "Cantilever (base fixed, top free)",
  propped: "Propped cantilever",
  basement: "Basement wall (top and base slabs)",
} as const;
const theoryLabel = {
  rankine: "Rankine active",
  coulomb: "Coulomb active",
  "at-rest": "At-rest K0",
  user: "User K",
} as const;

export function retainingWallReportData(
  project: ProjectRecord | undefined,
  title: string,
  i: RetainingWallInput,
  r: RetainingWallResult,
  policy: DesignCheckPolicy,
  remarks: DesignRemarks,
  snapshot3d?: string | null,
): ReportData {
  const std = i.rebarStandard ?? "PNS49";
  const basement = i.wallType === "basement";
  const checks = retainingWallDesignChecks(r);
  const bar = (b: { diameter: number; spacing: number }) =>
    `${rebarDesignation(std, b.diameter)} @ ${b.spacing} mm (${f(barAreaPerMetre(b), 0)} mm²/m)`;
  const c = r.coefficients;
  const governing = retainingWallStatus(r, i.dcrLimit);

  const wall = section("Wall, Materials And Reinforcement", [
    ["Wall Type", `${typeLabel[i.wallType]}; 1 m strip`],
    [
      "Geometry",
      basement
        ? `Clear height ${f(i.height)} m; wall ${f(i.stemTop * 1000, 0)}–${f(i.stemBase * 1000, 0)} mm; top ${i.basement.top}, base ${i.basement.base}`
        : `Stem H ${f(i.height)} m, ${f(i.stemTop * 1000, 0)}–${f(i.stemBase * 1000, 0)} mm (${i.batter} batter); toe ${f(i.toe)} m, heel ${f(i.heel)} m, footing ${f(i.footing)} m; B = ${f(r.geometry.width)} m${i.key.enabled ? `; key ${f(i.key.width)} × ${f(i.key.depth)} m` : ""}`,
    ],
    ...(i.wallType === "propped"
      ? [["Prop", `At ${f(i.prop.height)} m above footing; ${i.prop.rigid ? "rigid" : `spring ${f(i.prop.stiffness, 0)} kN/m per m`}`]]
      : []),
    ["Concrete / Steel", `f′c = ${fcText(i)}; ${rebarGradeLabel(std, i.fy, i.gradeId)}, fy = ${f(i.fy, 0)} MPa; Es = ${f(i.es, 0)} MPa`],
    [
      "Cover",
      `Stem earth face ${i.cover.stemBack} mm, exposed face ${i.cover.stemFront} mm; ${basement ? "base slab" : "footing bottom"} ${i.cover.footingBottom} mm${basement ? "" : `, top ${i.cover.footingTop} mm`}`,
    ],
    ["Stem Bars", `Back ${bar(i.bars.stemBack)}${i.bars.stemCut.enabled ? `, alternate bars stop at ${f(i.bars.stemCut.height)} m` : ""}; front ${bar(i.bars.stemFront)}; horizontal ${bar(i.bars.stemHorizontal)} each face`],
    ...(basement
      ? []
      : [["Footing Bars", `Bottom ${bar(i.bars.toeBottom)}; top ${bar(i.bars.heelTop)}; distribution ${bar(i.bars.footingDistribution)} each face`]]),
  ]);
  const soil = section("Soil, Water And Loads", [
    [
      "Earth Pressure",
      `${theoryLabel[i.soil.theory]}: K = ${f(c.k, 4)}, horizontal ${f(c.kh, 4)} (thrust at ${f(c.inclination, 1)}°); φ′ ${f(i.soil.phi, 0)}°, γ ${f(i.soil.gamma, 1)} kN/m³, β ${f(i.soil.beta, 0)}°${i.soil.theory === "coulomb" ? `, δ ${f(i.soil.delta, 0)}°` : ""}${i.soil.theory === "at-rest" && i.soil.ocr > 1 ? `, OCR ${f(i.soil.ocr, 1)}` : ""}`,
    ],
    ["Surcharge", `Dead ${f(i.surcharge.dead, 1)} kPa; live ${f(i.surcharge.live, 1)} kPa (live is driving only for overturning and sliding)`],
    [
      "Groundwater",
      i.water.enabled
        ? `Behind ${f(i.water.back)} m${basement ? "" : `, in front ${f(i.water.front)} m`} above the footing underside; γsat ${f(i.soil.gammaSat, 1)} kN/m³${r.uplift.force > 0 ? `; uplift ${f(r.uplift.force, 1)} kN/m` : ""}`
        : "Drained (no water pressure)",
    ],
    [
      "Seismic",
      i.seismic.method === "none"
        ? "Not included"
        : `${i.seismic.method === "wood" ? "Wood (non-yielding)" : `Mononobe-Okabe, KAE ${f(c.kae, 4)}`}; kh ${f(i.seismic.kh, 3)}, kv ${f(i.seismic.kv, 3)}; increment at 0.6H${i.seismic.inertia ? "; wall inertia included" : ""}`,
    ],
    ["Combinations", `${i.combinationSet}: ${i.strength.filter((x) => x.included).map((x) => x.id).join("; ")}`],
  ]);
  const stabilityRows: (string | Cell)[][] = [];
  const stabilitySimple: (string | Cell)[][] = [];
  if (r.stability) {
    for (const s of r.stability) {
      for (const [k, label] of [
        ["ot", "Overturning FS"],
        ["sl", "Sliding FS"],
        ["bp", "Bearing"],
        ["ec", "Eccentricity"],
      ] as const) {
        const chk = checks.find((x) => x.id === `${k}:${s.id}`);
        if (!chk) continue;
        const value =
          k === "ot"
            ? `${f(s.fsOverturning)} ≥ ${f(s.fsOverturningRequired, 1)}`
            : k === "sl"
              ? `${f(s.fsSliding)} ≥ ${f(s.fsSlidingRequired, 1)}`
              : k === "bp"
                ? `q max ${f(s.bearing.qMax, 1)} ≤ ${f(s.allowable, 0)} kPa (${s.bearing.shape === "triangle" ? `contact ${f(s.bearing.contact)} m` : "full contact"})`
                : `e ${f(s.bearing.e, 3)} m; B/6 ${f(r.geometry.width / 6, 3)}, B/3 ${f(r.geometry.width / 3, 3)}`;
        stabilityRows.push([`${s.id} · ${label}`, value, dcrCell(chk.dcr, policy, remarks, chk.id)]);
      }
    }
    // Simple report: the governing row of each kind.
    for (const k of ["ot", "sl", "bp", "ec"] as const) {
      const all = checks.filter((x) => x.id.startsWith(`${k}:`));
      const g = all.reduce<(typeof all)[number] | null>((b, x) => ((x.dcr ?? -1) > (b?.dcr ?? -1) ? x : b), null);
      const row = g && stabilityRows.find((row) => row[0] === g.label.replace(" · Bearing pressure", " · Bearing"));
      if (row) stabilitySimple.push(row);
      else if (g) stabilitySimple.push([g.label, g.detail ?? "", dcrCell(g.dcr, policy, remarks, g.id)]);
    }
  }
  const stability: ReportSection = {
    ...section("External Stability (Service)", stabilityRows, ["Check", "Value", "Status"]),
    simpleRows: stabilitySimple,
  };
  const memberRows: (string | Cell)[][] = [
    ...r.flexure.map((x) => [
      `${x.label} · flexure`,
      `Mu ${f(x.mu, 1)} vs φMn ${f(x.phiMn, 1)} kN·m/m; ${x.combo}; ${x.location}`,
      dcrCell(x.phiMn > 0 ? x.mu / x.phiMn : Infinity, policy, remarks, `fl:${x.id}`),
    ]),
    ...r.shear.map((x) => [
      x.label,
      `Vu ${f(x.vu, 1)} vs φVc ${f(x.phiVc, 1)} kN/m; ${x.combo}; ${x.location}`,
      dcrCell(x.vu / x.phiVc, policy, remarks, `sh:${x.id}`),
    ]),
  ];
  const member = section("Member Design (Strength)", memberRows, ["Check", "Value", "Status"]);
  const overall = section("Overall", [
    ["Governing DCR", { text: `${f(governing.worst, 3)} | ${designCheckStatus(governing.worst, policy).label}`, color: designCheckStatus(governing.worst, policy).color }],
    ["Basis", "ACI 318-19 (calculation basis); NSCP 2015 project standard for combinations (Sec. 203), stability (Sec. 307) and seismic (Sec. 208)"],
  ]);

  const loads = section(
    "Loads Per Metre (Service)",
    [
      ...r.weights.map((w) => [w.label, `${w.kind} vertical`, f(w.weight), `x = ${f(w.x)} m`]),
      ...r.verticalThrust.map((w) => [w.label, `${w.kind} vertical`, f(w.weight), `x = ${f(w.x)} m`]),
      ...r.lateral.map((l) => [l.label, `${l.kind} horizontal`, f(l.force), `y = ${f(l.arm)} m`]),
      ...(r.uplift.force > 0 ? [["Uplift", "H upward", f(r.uplift.force), `x = ${f(r.uplift.x)} m`]] : []),
      ...(r.passive.force > 0 ? [["Passive at toe (mobilised)", "resisting", f(r.passive.force), `depth ${f(r.passive.depth)} m`]] : []),
    ],
    ["Item", "Type", "kN/m", "Position"],
  );
  const equations = section(
    "Method And Equations",
    [
      ["Earth Pressure", `p(z) = Kh σ′v(z) + Kh q + γw(z − zw) + Δp_E; σ′v with γ above and γsat − γw below the water table; thrust on the plane through the heel (H′ = ${f(r.plane.height)} m)`, "Das Ch. 12–13"],
      ["Rankine / Coulomb / K0", "Ka = cosβ(cosβ − √(cos²β − cos²φ))/(cosβ + √…); Coulomb with δ, vertical back; K0 = (1 − sinφ)·OCR^sinφ", "Rankine; Coulomb; Jaky; Mayne & Kulhawy"],
      ["Seismic", "M-O: θ = atan(kh/(1 − kv)); ΔP = [(1 − kv)KAE − Ka] cos i (½γH′² + qH′); Wood: ΔP = kh(γH′² + qH′); resultant at 0.6H′", "Mononobe-Okabe; Seed & Whitman; Wood"],
      ["Overturning / Sliding", "FS_OT = ΣM_R/ΣM_O about the toe (uplift and inertia overturning; passive ignored); FS_SL = [μ(ΣV − U) + Pp + prop]/ΣP_H", "NSCP 2015 Sec. 307; IBC 1807.2.3"],
      ["Bearing", "e = B/2 − (ΣM_R − ΣM_O)/(ΣV − U); e ≤ B/6: q = V/B(1 ± 6e/B); e > B/6: q max = 2V/(3a), a = B/2 − e", "Das Ch. 13"],
      ["Stem", "Euler–Bernoulli member with tapered EI; moments by statics from the support reactions; envelopes over the strength combinations", "ACI 318-19 13.3.7"],
      ["Footing", "Factored bearing from the factored resultant; toe and heel cantilevers from the stem faces; uplift and soil weight included", "ACI 318-19 13.2.7"],
      ["Flexure", "Strain compatibility, rectangular block, φ from εt", "ACI 318-19 22.2, 22.3, Table 21.2.2"],
      ["Shear", "φVc = 0.75 · 0.66 λs ρw^(1/3) √f′c bw d ≤ 0.75 · 0.42 √f′c bw d; λs = √(2/(1 + 0.004d)) on the stem, 1.0 on the footing", "ACI 318-19 Table 22.5.5.1(c); 13.2.6.2"],
      ["Development", `Hooked ldh ${f(r.development.ldh, 0)} mm vs ${f(r.development.available, 0)} mm available; straight ld ${f(r.development.ld, 0)} mm; Class B lap ${f(r.development.lap, 0)} mm`, "ACI 318-19 25.4.3.1, 25.4.2.4, 25.5.2.1"],
    ],
    ["Item", "Equation / Basis", "Reference"],
  );
  const stemRows = section(
    "Stem Actions (Factored Envelope)",
    r.stem.stations
      .filter((_, k) => k % 4 === 0)
      .map((s) => [f(s.y), f(s.t * 1000, 0), f(s.mBack, 1), f(s.mFront, 1), f(s.v, 1), f(s.phiMnBack, 1), f(s.phiMnFront, 1)]),
    ["y m", "t mm", "Mu back", "Mu front", "Vu", "φMn back", "φMn front"],
  );
  const references = section("Code References — ACI 318-19 First, NSCP 2015 Second", [
    ...(i.otherCodes?.trim() ? [["Other Codes (Reference Only)", i.otherCodes.trim()]] : []),
    ["Retaining Walls", "ACI 318-19 13.3.7 (stem as one-way slab; critical section at the stem–footing interface)"],
    ["Flexure / Shear", "22.2, 22.3, Table 21.2.2; Table 22.5.5.1, 22.5.3.1; footings 13.2.6.2, 13.2.7"],
    ["Minimum Steel / Spacing", "Table 7.6.1.1, 24.4.3.2; wall Table 11.6.1; 7.7.2.3, 11.7.3.1; crack control 24.3.2"],
    ["Cover / Development", "Table 20.5.1.3.1; 25.4.2.4, 25.4.3.1, 25.5.2.1; cut-off 7.7.3.3 / 9.7.3.3"],
    ["Load Combinations", `${i.combinationSet === "NSCP 2015" ? "NSCP 2015 Sec. 203.3 / 203.4" : "ASCE 7-16 2.3 / 2.4"}; H per ACI 318-19 5.3.8`],
    ["Stability / Seismic", "NSCP 2015 Sec. 307, IBC 1807.2.3; ASCE 7-16 11.8.3; NSCP 2015 Sec. 208"],
  ]);
  const fails = r.checks.filter((x) => (x.dcr ?? 0) > i.dcrLimit);
  return {
    module: "Concrete Retaining Wall",
    title,
    code: i.code,
    basis: "ACI 318-19",
    project,
    policy,
    remarks,
    summary: [overall, wall, soil, ...(basement ? [] : [stability]), member],
    figures: [
      { title: "Section With Pressures, Bearing And Reinforcement", svg: retainingWallSectionSvg(i, r) },
      { title: "Stem Moment And Shear Envelopes", svg: retainingWallStemSvg(i, r), completeOnly: true },
      ...(snapshot3d ? [{ title: "3D View (snapshot)", svg: "", png: snapshot3d, completeOnly: true }] : []),
    ],
    checks: section(
      "DCR Design Checks And Engineering Remarks",
      checks.map((x) => [x.label, x.clause, f(x.dcr, 3), status(x.dcr, policy, remarks[x.id])]),
      ["Check", "Code Reference", "DCR", "Status / Remarks"],
    ),
    sections: [loads, equations, stemRows],
    references,
    criticalNotes: fails.map((x) => `REVISE: ${x.label} (DCR ${f(x.dcr, 3)}).`),
    limitations: [
      ...r.warnings,
      "1 m strip analysis; full-width plate behaviour, buttresses and end restraints are not considered (Phase 2).",
      "SCREENING PASS covers only the implemented checks and does not establish complete code compliance.",
      "Drawings are schematic; bar marks, laps, hook directions and construction joints need detailing review.",
    ],
    generatedAt: new Date().toISOString(),
    scopeNote: `${typeLabel[i.wallType]} · 1 m strip · ACI 318-19 calculation basis`,
  };
}
