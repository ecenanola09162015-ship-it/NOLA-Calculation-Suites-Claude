/**
 * Underground tank report data for the shared PDF renderer (Simple and
 * Complete). Reads the evaluated result only. Basis ACI 350-20 first.
 */
import {
  designCheckStatus,
  tankBarArea,
  tankCheckSections,
  tankSectionTitles,
  tankStatus,
  type DesignCheckPolicy,
  type DesignRemarks,
  type TankBar,
  type TankInput,
  type TankResult,
} from "@nola/calc-core";
import type { ProjectRecord } from "../projects";
import { tankFaceLabels, tankPanelSvg, tankPlanSvg, tankSectionSvg } from "../tank-drawing";
import { f, type Cell, type ReportData, type ReportSection } from "./data";

const section = (title: string, rows: (string | Cell)[][], columns = ["Item", "Value"]): ReportSection => ({ title, columns, rows });
function status(dcr: number | null, policy: DesignCheckPolicy, remark?: string): Cell {
  const s = designCheckStatus(dcr, policy);
  return { text: s.label + (s.id === "judgment" ? " | Remarks: " + (remark?.trim() || "Not Recorded") : ""), color: s.color };
}
const panelNames = { long: "Long wall", short: "Short wall", base: "Base slab", roof: "Roof slab" } as const;

export function tankReportData(
  project: ProjectRecord | undefined,
  title: string,
  i: TankInput,
  r: TankResult,
  policy: DesignCheckPolicy,
  remarks: DesignRemarks,
  snapshot3d?: string | null,
): ReportData {
  const g = r.geometry;
  const bar = (b: TankBar) => `Ø${b.diameter} @ ${b.spacing} mm (${f(tankBarArea(b), 0)} mm²/m)`;
  const gov = tankStatus(r, i.dcrLimit);
  const fails = r.checks.filter((x) => (x.dcr ?? 0) > i.dcrLimit);
  const overall = section("Design Summary", [
    ["Overall", { text: `${gov.pass ? "SCREENING PASS" : "REVISE"} — governing DCR ${f(gov.worst, 3)} (limit ${f(i.dcrLimit, 2)})`, color: gov.pass ? "#1d7a46" : "#b42318" }],
    ["Flotation", r.flotation.uplift > 0 ? `FS ${f(r.flotation.fs)} ≥ ${f(r.flotation.required)} (W ${f(r.flotation.resisting, 0)} kN / U ${f(r.flotation.uplift, 0)} kN)` : "No groundwater uplift"],
    ["Bearing", `${f(r.bearing.q, 1)} kPa vs allowable ${f(r.bearing.allowable, 0)} kPa (full tank, service)`],
    ...r.panels.map((p) => [panelNames[p.id], `Governing flexure DCR ${f(p.peaks.reduce((m, x) => Math.max(m, x.dcr), 0), 3)} (Sd applied)`]),
  ]);
  const geometry = section("Tank, Materials And Reinforcement", [
    ["Plan", `Inside ${f(i.lx)} × ${f(i.ly)} m, clear height ${f(i.height)} m; outside ${f(g.outerX)} × ${f(g.outerY)} m; base ${f(g.baseX)} × ${f(g.baseY)} m (projection ${f(i.projection)} m)`],
    ["Members", `Walls ${f(i.wall * 1000, 0)} mm (base ${i.wallBase}, corners fixed); base slab ${f(i.base * 1000, 0)} mm (edges ${i.baseEdge}); ${i.roof.enabled ? `roof ${f(i.roof.thickness * 1000, 0)} mm (edges ${i.roof.edge}), cover ${f(i.roof.cover)} m, live ${f(i.roof.live, 1)} kPa` : "open top"}`],
    ["Concrete / Steel", `f′c ${f(i.fc, 0)} MPa; fy ${f(i.fy, 0)} MPa; cover ${i.cover} mm; exposure ${i.exposure}; joints @ ${f(i.jointSpacing, 1)} m`],
    ["Wall Bars", `Vertical inside ${bar(i.bars.verticalInside)}, outside ${bar(i.bars.verticalOutside)}; horizontal inside ${bar(i.bars.horizontalInside)}, outside ${bar(i.bars.horizontalOutside)}`],
    ["Slab Bars", `Base top ${bar(i.bars.baseTop)}, bottom ${bar(i.bars.baseBottom)}${i.roof.enabled ? `; roof bottom ${bar(i.bars.roofBottom)}, top ${bar(i.bars.roofTop)}` : ""} (each way)`],
  ]);
  const loads = section("Liquid, Soil And Load Cases", [
    ["Liquid", `Depth ${f(i.liquid.depth)} m, γ ${f(i.liquid.gamma, 2)} kN/m³ (leak test: full, no backfill)`],
    ["Soil", `${i.soil.theory === "at-rest" ? "At-rest" : "Rankine active"} K ${f(g.k, 4)}; φ′ ${f(i.soil.phi, 0)}°, γ ${f(i.soil.gamma, 1)} / γsat ${f(i.soil.gammaSat, 1)} kN/m³; ground ${f(i.soil.ground)} m above the base slab top; surcharge ${f(i.soil.surcharge, 1)} kPa`],
    ["Groundwater", i.soil.water > 0 ? `${f(i.soil.water)} m above the base underside` : "Drained"],
    ["Factors", `F ${i.factors.liquid}; H ${i.factors.earth}; D ${i.factors.dead} (resisting ${i.factors.deadMin}); L ${i.factors.live}; Sd = φfy/(γ fs,max) ≥ 1.0`],
  ]);
  const peaks = section(
    "Panel Design Moments (Wood–Armer, Sd)",
    r.panels.flatMap((p) =>
      p.peaks.map((pk) => [
        `${panelNames[p.id]} · ${tankFaceLabels[p.id][pk.face]}`,
        `${pk.case}; x ${f(pk.x)}, y ${f(pk.y)} m`,
        `Mu ${f(pk.mu, 1)} / Ms ${f(pk.ms, 1)}; fs,max ${f(pk.fsMax, 0)} MPa; Sd ${f(pk.sd, 2)}${pk.nu > 0 ? `; Nu ${f(pk.nu, 1)} kN/m` : ""}`,
        `${f(pk.sd * pk.mu, 1)} / ${f(pk.phiMn, 1)}`,
        f(pk.dcr, 3),
      ]),
    ),
    ["Panel · Bars", "Case · Point", "Actions", "Sd·Mu / φMn", "DCR"],
  );
  const flot = section(
    "Flotation (Empty Tank)",
    [...r.flotation.items.map((x) => [x.label, `${f(x.weight, 0)} kN`]), ["Uplift γw·hw·A", `${f(r.flotation.uplift, 0)} kN`], ["FS", `${f(r.flotation.fs)} (required ${f(r.flotation.required)})`]],
  );
  return {
    module: "Underground Tank",
    title,
    code: i.code,
    basis: "ACI 350-20",
    project,
    policy,
    remarks,
    summary: [overall, geometry, loads],
    figures: [
      { title: "Section Along The Long Side", svg: tankSectionSvg(i, r) },
      { title: "Plan", svg: tankPlanSvg(i, r), completeOnly: true },
      { title: "Long Wall — Vertical Moment, Outside Face", svg: tankPanelSvg(r, "long", "backY"), completeOnly: true },
      { title: "Long Wall — Horizontal Moment, Inside Face (Leak Test)", svg: tankPanelSvg(r, "long", "frontX"), completeOnly: true },
      { title: "Base Slab — Bottom Bars", svg: tankPanelSvg(r, "base", "backY"), completeOnly: true },
      ...(snapshot3d ? [{ title: "3D View (snapshot)", svg: "", png: snapshot3d, completeOnly: true }] : []),
    ],
    checks: section(
      "DCR Design Checks And Engineering Remarks",
      tankCheckSections(r).flatMap((sec) => [
        [{ text: `${tankSectionTitles[sec.title]} — governing DCR ${f(sec.governing, 3)}`, color: "#1f3864" }, "", "", ""],
        ...sec.checks.map((x) => [x.label, x.clause, f(x.dcr, 3), status(x.dcr, policy, remarks[x.id])]),
      ]),
      ["Check", "Code Reference", "DCR", "Status / Remarks"],
    ),
    sections: [
      peaks,
      flot,
      ...(r.seismic
        ? [
            section(
              `Seismic — ACI 350.3-20 (SDS ${f(r.seismic.sds, 3)}, SD1 ${f(r.seismic.sd1, 3)}, I ${i.seismic.importance}, Ri ${f(r.seismic.ri, 2)}, Rc ${f(r.seismic.rc, 1)})`,
              (
                [
                  ["Wi, Wc, kN (9.2.1)", (d) => `${f(d.wi, 0)}, ${f(d.wc, 0)} of WL ${f(d.wl, 0)}`],
                  ["hi, hc / hi′, hc′, m (9.2.2–9.2.3)", (d) => `${f(d.hi)}, ${f(d.hc)} / ${f(d.hiIbp)}, ${f(d.hcIbp)}`],
                  ["ε; Ti, Tc s; Ci, Cc", (d) => `${f(d.eps, 3)}; ${d.ti > 0 ? f(d.ti, 3) : "rigid"}, ${f(d.tc, 3)}; ${f(d.ci, 3)}, ${f(d.cc, 3)}`],
                  ["Pw, Pr, Pi, Pc, Peg, kN (4.1.1, R8.1)", (d) => `${f(d.pw, 1)}, ${f(d.pr, 1)}, ${f(d.pi, 1)}, ${f(d.pc, 1)}, ${f(d.peg, 1)}`],
                  ["V kN; Mb / Mo kN·m (4.1.2–4.1.3)", (d) => `${f(d.v, 1)}; ${f(d.mb, 1)} / ${f(d.mo, 1)}`],
                  ["d_max / freeboard, m (7.1a)", (d) => `${f(d.dmax, 3)} / ${f(d.freeboard, 3)}${d.kr > 0 ? `; R7.1 k_r ${f(d.kr, 3)}, roof uplift ${f(d.uplift, 1)} kPa over ${f(d.li)} m` : ""}`],
                ] as [string, (d: NonNullable<TankResult["seismic"]>["x"]) => string][]
              ).map(([label, fn]) => [label, fn(r.seismic!.x), fn(r.seismic!.y)]),
              ["Quantity", "Motion along Lx", "Motion along Ly"],
            ),
          ]
        : []),
    ],
    references: section("References", [
      ["ACI 350-20", "Code Requirements for Environmental Engineering Concrete Structures and Commentary (clause numbers marked † to be confirmed)"],
      ["ACI 318-19", "Strength provisions referenced by ACI 350-20"],
      ["ACI 350.3-20", "Code Requirements for Seismic Analysis and Design of Liquid-Containing Concrete Structures and Commentary"],
      ["Timoshenko & Woinowsky-Krieger", "Theory of Plates and Shells — plate benchmarks"],
      ["PCA", "Rectangular Concrete Tanks (moment coefficients, for comparison)"],
    ]),
    criticalNotes: fails.map((x) => `REVISE: ${x.label} (DCR ${f(x.dcr, 3)}).`),
    limitations: [
      ...r.warnings,
      "SCREENING PASS covers only the implemented checks and does not establish complete code compliance.",
      "Drawings are schematic; joints, waterstops, laps and corner details need review.",
    ],
    generatedAt: new Date().toISOString(),
    scopeNote: `Rectangular underground tank ${f(i.lx)} × ${f(i.ly)} × ${f(i.height)} m · ACI 350-20 calculation basis`,
  };
}
