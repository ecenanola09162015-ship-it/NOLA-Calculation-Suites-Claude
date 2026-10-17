"use client";
/**
 * Underground rectangular tank workspace (tank-0.1.0, ACI 350-20): inputs,
 * plan / section / panel contour views, design checks with remarks, save and
 * PDF report. The engine and drawings are shared with the report.
 */
import { useDeferredValue, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  defaultDesignCheckPolicy,
  defaultTankInput,
  designTank,
  missingJudgmentRemarks,
  tankBarArea,
  tankCheckSections,
  tankDesignChecks,
  tankDraftSchema,
  tankInputSchema,
  tankSectionTitles,
  tankStatus,
  type DesignRemarks,
  type TankBar,
  type TankFace,
  type TankInput,
  type TankPanelId,
  type TankSeismicDirection,
} from "@nola/calc-core";
import type { ProjectRecord, CalculationDraftRecord } from "@/lib/projects";
import { DesignReviewPanel, DesignStatus } from "./design-review-panel";
import { ReportExportControls } from "./report-export-controls";
import { DuplicateSavePrompt, type DraftDuplicate } from "./duplicate-save-prompt";
import { tankFaceLabels, tankPanelSvg, tankPlanSvg, tankSectionSvg } from "@/lib/tank-drawing";
import { TankDxfButton } from "./tank-dxf-button";
import styles from "./tank-workspace.module.css";

// three.js is only downloaded when the 3D tab is opened (client-only).
const Tank3DView = dynamic(() => import("./tank-3d-view"), { ssr: false, loading: () => <p className="slabMuted">Loading 3D view…</p> });

const fmt = (n: number | null | undefined, p = 2) =>
  n === null || n === undefined || !Number.isFinite(n) ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: p, maximumFractionDigits: p });

function Numeric({ label, value, onChange, unit }: { label: string; value: number; onChange: (n: number) => void; unit?: string }) {
  return (
    <label className="slabNumeric">
      <span>
        {label} {unit && <small>({unit})</small>}
      </span>
      <input type="number" step="any" value={Number.isFinite(value) ? value : ""} onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value))} />
    </label>
  );
}
function Check({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={styles.check}>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} /> {label}
    </label>
  );
}
const barRows = [
  ["verticalInside", "Walls · vertical, inside face"],
  ["verticalOutside", "Walls · vertical, outside face"],
  ["horizontalInside", "Walls · horizontal, inside face"],
  ["horizontalOutside", "Walls · horizontal, outside face"],
  ["baseTop", "Base slab · top, each way"],
  ["baseBottom", "Base slab · bottom, each way"],
  ["roofBottom", "Roof slab · bottom, each way"],
  ["roofTop", "Roof slab · top, each way"],
] as const;
const panelNames: Record<TankPanelId, string> = { long: "Long wall", short: "Short wall", base: "Base slab", roof: "Roof slab" };

export function TankWorkspace({
  project,
  draft,
  cloudReady,
  onSaved,
}: {
  project?: ProjectRecord;
  draft?: CalculationDraftRecord;
  cloudReady: boolean;
  onSaved: (d: CalculationDraftRecord) => void;
}) {
  const restored = useMemo(() => tankDraftSchema.safeParse(draft?.payload), [draft]);
  const [input, setInput] = useState<TankInput>(() => (restored.success ? restored.data.input : defaultTankInput()));
  const policy = project?.designCheckPolicy ?? (restored.success ? restored.data.designPolicy : undefined) ?? defaultDesignCheckPolicy;
  const [remarks, setRemarks] = useState<DesignRemarks>(restored.success ? (restored.data.remarks ?? {}) : {});
  const [title, setTitle] = useState(draft?.title ?? "Underground Tank — T-01");
  const [id, setId] = useState<string | undefined>(restored.success ? draft?.id : undefined);
  const [tab, setTab] = useState<"plan" | "section" | "panels" | "seismic" | "3d">("section");
  const [snapshot3d, setSnapshot3d] = useState<string | null>(null);
  const [panel, setPanel] = useState<TankPanelId>("long");
  const [face, setFace] = useState<TankFace>("backY");
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [duplicate, setDuplicate] = useState<DraftDuplicate | null>(null),
    [saved, setSaved] = useState(!!restored.success);
  const editVersion = useRef(0);
  const analysed = useDeferredValue(input);
  const analysis = useMemo(() => {
    const parsed = tankInputSchema.safeParse(analysed);
    if (!parsed.success)
      return {
        result: null,
        error: `Check inputs: ${parsed.error.issues
          .slice(0, 3)
          .map((x) => `${x.path.join(".") || "input"} — ${x.message}`)
          .join("; ")}`,
      };
    try {
      return { result: designTank(parsed.data), error: "" };
    } catch (e) {
      return { result: null, error: e instanceof Error ? e.message : "Check numerical inputs." };
    }
  }, [analysed]);
  const r = analysis.result;
  const checks = useMemo(() => (r ? tankDesignChecks(r) : []), [r]);
  const missing = r ? missingJudgmentRemarks(checks, policy, remarks).length : 0;
  const status = r ? tankStatus(r, input.dcrLimit) : null;

  function update(next: TankInput) {
    editVersion.current++;
    setInput(next);
    setSaved(false);
    setMessage("");
  }
  function patch(fn: (d: TankInput) => void) {
    const d = structuredClone(input);
    fn(d);
    update(d);
  }
  async function save(opts: { overwrite?: boolean; title?: string } = {}) {
    if (!project) return;
    const saveTitle = opts.title ?? title;
    const version = editVersion.current;
    setBusy(true);
    setMessage("");
    try {
      const parsed = tankDraftSchema.safeParse({ kind: "underground-tank", version: 1, input, designPolicy: policy, remarks, reviewCompleted: !!r });
      if (!parsed.success || !title.trim()) throw new Error("Complete valid inputs and a calculation title before saving.");
      if (missing) throw Error("Add Remarks For Each Amber Design Check Before Saving.");
      const response = await fetch("/api/calculations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, projectId: project.id, moduleSlug: "underground-tank", title: saveTitle, overwrite: opts.overwrite === true, payload: parsed.data }),
      });
      const body = await response.json();
      if (response.status === 409 && body.duplicate) {
        setDuplicate(body.duplicate);
        return;
      }
      setDuplicate(null);
      if (opts.title) setTitle(opts.title);
      if (!response.ok) throw new Error(body.error ?? "Save failed.");
      setId(body.draft.id);
      setSaved(version === editVersion.current);
      onSaved(body.draft);
      setMessage(version === editVersion.current ? "Tank saved. Reopen it from the project explorer." : "Earlier inputs saved; newer edits remain unsaved.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  const view = useMemo(() => {
    if (!r) return "";
    if (tab === "plan") return tankPlanSvg(analysed, r);
    if (tab === "section") return tankSectionSvg(analysed, r);
    if (tab === "seismic" || tab === "3d") return "";
    return tankPanelSvg(r, r.panels.some((p) => p.id === panel) ? panel : "long", face);
  }, [r, analysed, tab, panel, face]);
  const barField = (k: (typeof barRows)[number][0], f: keyof TankBar, v: number) => patch((d) => (d.bars[k][f] = v));

  return (
    <section className="slabWorkspace">
      <div className="slabToolbar">
        <label>
          Calculation Title
          <input
            value={title}
            maxLength={100}
            onChange={(e) => {
              editVersion.current++;
              setTitle(e.target.value);
              setDuplicate(null);
              setSaved(false);
            }}
          />
        </label>
        <button className="suitePrimary" onClick={() => save()} disabled={busy || !project || !cloudReady || !r}>
          {busy ? "Saving…" : saved ? "Saved" : "Save tank"}
        </button>
        <ReportExportControls
          moduleName="Underground Tank"
          disabled={!r}
          disabledReason="Complete valid tank inputs to enable export."
          hint={missing ? `Record Engineering Judgment Remarks Before Exporting (${missing}).` : undefined}
          onData={async () => {
            if (!r) throw Error("Complete Valid Tank Inputs First.");
            if (missing) throw Error("Record Engineering Judgment Remarks Before Exporting.");
            const { tankReportData } = await import("../lib/reports/tank-report");
            return tankReportData(project, title, analysed, r, policy, remarks, snapshot3d);
          }}
        />
      </div>
      <p className="slabPilot">
        Development pilot · Calculation basis: ACI 350-20 (environmental engineering concrete structures) with ACI 318-19 strength provisions
        {input.code === "NSCP 2015" ? "; project standard NSCP 2015" : ""}. Rectangular tanks, two-way panels. Independent engineering review required.
      </p>
      {duplicate ? (
        <DuplicateSavePrompt duplicate={duplicate} busy={busy} onOverwrite={() => save({ overwrite: true })} onSaveAs={(t) => save({ title: t })} onCancel={() => setDuplicate(null)} />
      ) : null}
      {(message || analysis.error) && (
        <p className={analysis.error ? "slabError" : "slabFeedback"} role="status">
          {analysis.error || message}
        </p>
      )}
      <div className="slabGrid">
        <aside className={`slabInputs slabPanel ${styles.inputs}`}>
          <h2>01 · Code & Exposure</h2>
          <label>
            Design code
            <select value={input.code} onChange={(e) => patch((d) => (d.code = e.target.value as TankInput["code"]))}>
              <option value="ACI 350-20">ACI 350-20</option>
              <option value="NSCP 2015">NSCP 2015 project (ACI 350-20 basis)</option>
            </select>
          </label>
          <label>
            Environmental exposure
            <select value={input.exposure} onChange={(e) => patch((d) => (d.exposure = e.target.value as "normal" | "severe"))}>
              <option value="normal">Normal</option>
              <option value="severe">Severe</option>
            </select>
          </label>
          <div className="slabFieldGrid">
            <Numeric label="Movement joint spacing" unit="m" value={input.jointSpacing} onChange={(v) => patch((d) => (d.jointSpacing = v))} />
            <Numeric label="Flotation FS required" value={input.flotationFS} onChange={(v) => patch((d) => (d.flotationFS = v))} />
          </div>

          <h2>02 · Geometry</h2>
          <div className="slabFieldGrid">
            <Numeric label="Inside length Lx" unit="m" value={input.lx} onChange={(v) => patch((d) => (d.lx = v))} />
            <Numeric label="Inside width Ly" unit="m" value={input.ly} onChange={(v) => patch((d) => (d.ly = v))} />
            <Numeric label="Clear height H" unit="m" value={input.height} onChange={(v) => patch((d) => (d.height = v))} />
            <Numeric label="Wall thickness" unit="m" value={input.wall} onChange={(v) => patch((d) => (d.wall = v))} />
            <Numeric label="Base slab thickness" unit="m" value={input.base} onChange={(v) => patch((d) => (d.base = v))} />
            <Numeric label="Base projection beyond walls" unit="m" value={input.projection} onChange={(v) => patch((d) => (d.projection = v))} />
          </div>
          <div className="slabFieldGrid">
            <label>
              Wall base
              <select value={input.wallBase} onChange={(e) => patch((d) => (d.wallBase = e.target.value as "fixed" | "pinned"))}>
                <option value="fixed">Fixed (monolithic)</option>
                <option value="pinned">Pinned (jointed)</option>
              </select>
            </label>
            <label>
              Base slab edges
              <select value={input.baseEdge} onChange={(e) => patch((d) => (d.baseEdge = e.target.value as "fixed" | "pinned"))}>
                <option value="fixed">Fixed into walls</option>
                <option value="pinned">Pinned</option>
              </select>
            </label>
          </div>
          <Check label="Roof slab (covered tank)" value={input.roof.enabled} onChange={(v) => patch((d) => (d.roof.enabled = v))} />
          {input.roof.enabled && (
            <div className="slabFieldGrid">
              <Numeric label="Roof thickness" unit="m" value={input.roof.thickness} onChange={(v) => patch((d) => (d.roof.thickness = v))} />
              <label>
                Roof edges
                <select value={input.roof.edge} onChange={(e) => patch((d) => (d.roof.edge = e.target.value as "pinned" | "fixed"))}>
                  <option value="pinned">Pinned on walls</option>
                  <option value="fixed">Fixed (monolithic)</option>
                </select>
              </label>
              <Numeric label="Soil cover on roof" unit="m" value={input.roof.cover} onChange={(v) => patch((d) => (d.roof.cover = v))} />
              <Numeric label="Roof live load" unit="kPa" value={input.roof.live} onChange={(v) => patch((d) => (d.roof.live = v))} />
            </div>
          )}

          <h2>03 · Liquid, Soil & Groundwater</h2>
          <div className="slabFieldGrid">
            <Numeric label="Liquid depth" unit="m" value={input.liquid.depth} onChange={(v) => patch((d) => (d.liquid.depth = v))} />
            <Numeric label="Liquid unit weight" unit="kN/m³" value={input.liquid.gamma} onChange={(v) => patch((d) => (d.liquid.gamma = v))} />
          </div>
          <label>
            Earth pressure
            <select value={input.soil.theory} onChange={(e) => patch((d) => (d.soil.theory = e.target.value as "at-rest" | "active"))}>
              <option value="at-rest">At-rest K0 (non-yielding walls)</option>
              <option value="active">Rankine active</option>
            </select>
          </label>
          <div className="slabFieldGrid">
            <Numeric label="φ′" unit="deg" value={input.soil.phi} onChange={(v) => patch((d) => (d.soil.phi = v))} />
            <Numeric label="γ moist" unit="kN/m³" value={input.soil.gamma} onChange={(v) => patch((d) => (d.soil.gamma = v))} />
            <Numeric label="γ saturated" unit="kN/m³" value={input.soil.gammaSat} onChange={(v) => patch((d) => (d.soil.gammaSat = v))} />
            {input.soil.theory === "at-rest" && <Numeric label="OCR" value={input.soil.ocr} onChange={(v) => patch((d) => (d.soil.ocr = v))} />}
            <Numeric label="Ground above base slab top" unit="m" value={input.soil.ground} onChange={(v) => patch((d) => (d.soil.ground = v))} />
            <Numeric label="Groundwater above base underside" unit="m" value={input.soil.water} onChange={(v) => patch((d) => (d.soil.water = v))} />
            <Numeric label="Surcharge (live)" unit="kPa" value={input.soil.surcharge} onChange={(v) => patch((d) => (d.soil.surcharge = v))} />
            <Numeric label="Allowable bearing" unit="kPa" value={input.soil.allowable} onChange={(v) => patch((d) => (d.soil.allowable = v))} />
          </div>
          {r && <p className="slabMuted">K = {fmt(r.geometry.k, 4)} · groundwater 0 = drained.</p>}

          <h2>04 · Materials & Factors</h2>
          <div className="slabFieldGrid">
            <Numeric label="f′c" unit="MPa" value={input.fc} onChange={(v) => patch((d) => (d.fc = v))} />
            <Numeric label="fy" unit="MPa" value={input.fy} onChange={(v) => patch((d) => (d.fy = v))} />
            <Numeric label="Cover" unit="mm" value={input.cover} onChange={(v) => patch((d) => (d.cover = v))} />
            <Numeric label="Concrete unit weight" unit="kN/m³" value={input.concreteWeight} onChange={(v) => patch((d) => (d.concreteWeight = v))} />
            <Numeric label="Liquid factor F" value={input.factors.liquid} onChange={(v) => patch((d) => (d.factors.liquid = v))} />
            <Numeric label="Earth / groundwater H" value={input.factors.earth} onChange={(v) => patch((d) => (d.factors.earth = v))} />
            <Numeric label="Dead D" value={input.factors.dead} onChange={(v) => patch((d) => (d.factors.dead = v))} />
            <Numeric label="Dead (resisting)" value={input.factors.deadMin} onChange={(v) => patch((d) => (d.factors.deadMin = v))} />
            <Numeric label="Live L" value={input.factors.live} onChange={(v) => patch((d) => (d.factors.live = v))} />
          </div>

          <h2>05 · Seismic (ACI 350.3-20)</h2>
          <Check label="Seismic design (rectangular tank, Type 1.1 / 1.2)" value={input.seismic.enabled} onChange={(v) => patch((d) => (d.seismic.enabled = v))} />
          {input.seismic.enabled && (
            <>
              <div className="slabFieldGrid">
                <Numeric label="Ss" unit="g" value={input.seismic.ss} onChange={(v) => patch((d) => (d.seismic.ss = v))} />
                <Numeric label="S1" unit="g" value={input.seismic.s1} onChange={(v) => patch((d) => (d.seismic.s1 = v))} />
                <Numeric label="Fa" value={input.seismic.fa} onChange={(v) => patch((d) => (d.seismic.fa = v))} />
                <Numeric label="Fv" value={input.seismic.fv} onChange={(v) => patch((d) => (d.seismic.fv = v))} />
                <Numeric label="TL" unit="s" value={input.seismic.tl} onChange={(v) => patch((d) => (d.seismic.tl = v))} />
                <Numeric label="Vertical ratio b" value={input.seismic.b} onChange={(v) => patch((d) => (d.seismic.b = v))} />
              </div>
              <label>
                Risk category / importance I (Table 4.1.1a)
                <select value={input.seismic.importance} onChange={(e) => patch((d) => (d.seismic.importance = Number(e.target.value)))}>
                  <option value={1}>I or II · I = 1.00</option>
                  <option value={1.25}>III (water / wastewater treatment) · I = 1.25</option>
                  <option value={1.5}>IV (essential, fire water, toxic) · I = 1.50</option>
                </select>
              </label>
              <Check label="Backfill can yield (active, 3/8 factor of R8.1a)" value={input.seismic.yielding} onChange={(v) => patch((d) => (d.seismic.yielding = v))} />
              <div className="slabFieldGrid">
                <Numeric label="Roof uplift coefficient C_LF" value={input.seismic.clf} onChange={(v) => patch((d) => (d.seismic.clf = v))} />
                <Numeric label="Seismic factor on F" value={input.seismic.factorF} onChange={(v) => patch((d) => (d.seismic.factorF = v))} />
                <Numeric label="Factor on E" value={input.seismic.factorE} onChange={(v) => patch((d) => (d.seismic.factorE = v))} />
                <Numeric label="Seismic factor on L" value={input.seismic.factorL} onChange={(v) => patch((d) => (d.seismic.factorL = v))} />
              </div>
              {r?.seismic && (
                <p className="slabMuted">
                  SDS {fmt(r.seismic.sds, 3)}, SD1 {fmt(r.seismic.sd1, 3)}; Ri {fmt(r.seismic.ri, 2)} (buried / on grade by the liquid level vs ground), Rc 1.0.
                </p>
              )}
            </>
          )}

          <h2>06 · Reinforcement</h2>
          <div className="slabTableWrap">
            <table className={`slabBars ${styles.bars}`} aria-label="Tank reinforcement">
              <thead>
                <tr>
                  <th>Bars</th>
                  <th>Ø mm</th>
                  <th>@ mm</th>
                  <th>mm²/m</th>
                </tr>
              </thead>
              <tbody>
                {barRows
                  .filter(([k]) => input.roof.enabled || !k.startsWith("roof"))
                  .map(([k, label]) => (
                    <tr key={k}>
                      <th>{label}</th>
                      {(["diameter", "spacing"] as const).map((f) => (
                        <td key={f}>
                          <input
                            aria-label={`${label} ${f}`}
                            type="number"
                            className={styles.factor}
                            value={Number.isFinite(input.bars[k][f]) ? input.bars[k][f] : ""}
                            onChange={(e) => barField(k, f, e.target.value === "" ? NaN : Number(e.target.value))}
                          />
                        </td>
                      ))}
                      <td>{fmt(tankBarArea(input.bars[k]), 0)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <p className="slabMuted">Walls: verticals are the outer layer. Slabs: x bars (along Lx) outer, y bars inside them.</p>
          <div className="slabFieldGrid">
            <Numeric label="Mesh divisions per panel" value={input.divisions} onChange={(v) => patch((d) => (d.divisions = Math.round(v)))} />
            <Numeric label="DCR limit" value={input.dcrLimit} onChange={(v) => patch((d) => (d.dcrLimit = v))} />
          </div>
        </aside>

        <div className="slabCenter">
          <div className="slabTabs" role="tablist" aria-label="Tank view">
            {(
              [
                ["section", "Section"],
                ["plan", "Plan"],
                ["panels", "Panel moments"],
                ["seismic", "Seismic"],
                ["3d", "3D view"],
              ] as const
            ).map(([k, t]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
                {t}
              </button>
            ))}
          </div>
          <section className="slabPanel">
            {tab === "panels" && r && (
              <>
                <div className="slabViewButtons">
                  {r.panels.map((p) => (
                    <button key={p.id} aria-pressed={panel === p.id} onClick={() => setPanel(p.id)}>
                      {panelNames[p.id]}
                    </button>
                  ))}
                </div>
                <div className="slabViewButtons">
                  {(["frontY", "backY", "frontX", "backX"] as const).map((k) => (
                    <button key={k} aria-pressed={face === k} onClick={() => setFace(k)}>
                      {tankFaceLabels[panel][k]}
                    </button>
                  ))}
                </div>
              </>
            )}
            {tab === "3d" && r ? (
              <>
                <Tank3DView input={analysed} result={r} onSnapshot={setSnapshot3d} />
                {snapshot3d && (
                  <p className="slabMuted">
                    A 3D snapshot will be included in the Complete PDF report. <button onClick={() => setSnapshot3d(null)}>Remove snapshot</button>
                  </p>
                )}
              </>
            ) : tab === "seismic" ? (
              r?.seismic ? (
                <div className="slabTableWrap">
                  <table aria-label="ACI 350.3-20 seismic results">
                    <thead>
                      <tr>
                        <th>ACI 350.3-20</th>
                        <th>Motion along Lx (short walls loaded)</th>
                        <th>Motion along Ly (long walls loaded)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(
                        [
                          ["L / B, m", (d: TankSeismicDirection) => `${fmt(d.L)} / ${fmt(d.B)}`],
                          ["WL, Wi, Wc, kN (9.2.1)", (d: TankSeismicDirection) => `${fmt(d.wl, 0)}, ${fmt(d.wi, 0)}, ${fmt(d.wc, 0)}`],
                          ["hi, hc (EBP) / hi′, hc′ (IBP), m (9.2.2–9.2.3)", (d: TankSeismicDirection) => `${fmt(d.hi)}, ${fmt(d.hc)} / ${fmt(d.hiIbp)}, ${fmt(d.hcIbp)}`],
                          ["ε (9.6.1)", (d: TankSeismicDirection) => fmt(d.eps, 3)],
                          ["Ti, Tc, s (9.2.4)", (d: TankSeismicDirection) => `${d.ti > 0 ? fmt(d.ti, 3) : "rigid"}, ${fmt(d.tc, 3)}`],
                          ["Ci, Cc, Ct (9.4)", (d: TankSeismicDirection) => `${fmt(d.ci, 3)}, ${fmt(d.cc, 3)}, ${fmt(d.ct, 3)}`],
                          ["ü_v (4.1.4)", (d: TankSeismicDirection) => fmt(d.uv, 3)],
                          ["Pw, Pw′, Pr, kN (4.1.1)", (d: TankSeismicDirection) => `${fmt(d.pw, 1)}, ${fmt(d.pwOne, 1)}, ${fmt(d.pr, 1)}`],
                          ["Pi, Pc, kN (4.1.1)", (d: TankSeismicDirection) => `${fmt(d.pi, 1)}, ${fmt(d.pc, 1)}`],
                          ["Peg, kN (R8.1)", (d: TankSeismicDirection) => fmt(d.peg, 1)],
                          ["Base shear V, kN (4.1.2)", (d: TankSeismicDirection) => fmt(d.v, 1)],
                          ["Mb (EBP) / Mo (IBP), kN·m (4.1.3)", (d: TankSeismicDirection) => `${fmt(d.mb, 1)} / ${fmt(d.mo, 1)}`],
                          ["d_max / freeboard, m (7.1a)", (d: TankSeismicDirection) => `${fmt(d.dmax, 3)} / ${fmt(d.freeboard, 3)}`],
                          ["R7.1: k_r, roof uplift kPa over Li m", (d: TankSeismicDirection) => (d.kr > 0 ? `${fmt(d.kr, 3)}, ${fmt(d.uplift, 1)} over ${fmt(d.li)}` : "adequate freeboard")],
                        ] as const
                      ).map(([label, f]) => (
                        <tr key={label}>
                          <th>{label}</th>
                          <td>{f(r.seismic!.x)}</td>
                          <td>{f(r.seismic!.y)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="slabMuted">
                    SDS {fmt(r.seismic.sds, 3)}, SD1 {fmt(r.seismic.sd1, 3)} (9.4.1d–e); Ri {fmt(r.seismic.ri, 2)}, Rc {fmt(r.seismic.rc, 1)} (Table 4.1.1b). Wall pressures
                    combine ½Pi, ½Pc, Pw′ and the vertical acceleration per 5.3.2 (R5.3.1 linear distributions); the trailing wall adds the dynamic earth
                    pressure, resultant at 0.6H (R8.1).
                  </p>
                </div>
              ) : (
                <p className="slabMuted">Switch on seismic design in panel 05.</p>
              )
            ) : r ? (
              <div className={styles.drawing} role="img" aria-label={`Tank ${tab}`} dangerouslySetInnerHTML={{ __html: view }} />
            ) : (
              <p className="slabMuted">Complete valid inputs to draw the tank.</p>
            )}
            {tab === "section" && <TankDxfButton input={analysed} result={r} title={title} />}
            {tab === "panels" && r && (
              <div className="slabTableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>Panel · bars</th>
                      <th>Case · point</th>
                      <th>Mu / Ms, kN·m/m</th>
                      <th>Sd</th>
                      <th>Nu, kN/m</th>
                      <th>Sd·Mu / φMn</th>
                      <th>DCR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.panels.flatMap((p) =>
                      p.peaks.map((pk) => (
                        <tr key={`${p.id}${pk.face}`}>
                          <th>
                            {panelNames[p.id]} · {tankFaceLabels[p.id][pk.face]}
                          </th>
                          <td>
                            {pk.case} · x {fmt(pk.x)}, y {fmt(pk.y)} m
                          </td>
                          <td>
                            {fmt(pk.mu, 1)} / {fmt(pk.ms, 1)}
                          </td>
                          <td>{fmt(pk.sd, 2)}</td>
                          <td>{pk.nu > 0 ? fmt(pk.nu, 1) : "—"}</td>
                          <td>
                            {fmt(pk.sd * pk.mu, 1)} / {fmt(pk.phiMn, 1)}
                          </td>
                          <td>
                            <DesignStatus dcr={pk.dcr} policy={policy} />
                          </td>
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
              </div>
            )}
            <p className="slabMuted">
              {tab === "panels"
                ? "Factored envelope over the load cases, Wood–Armer per face. Walls: x along the wall, y up; base and roof: x along Lx, y along Ly."
                : "True scale. Bars schematic; detailing, joints and waterstops need review."}
            </p>
          </section>
        </div>

        <aside className="slabPanel slabSummary">
          <h2>Design Checks</h2>
          <div className="slabStatus">
            <DesignStatus dcr={status?.worst ?? null} policy={policy} />
            <span>Governing DCR {fmt(status?.worst, 3)}</span>
          </div>
          {r && (
            <dl>
              <div>
                <dt>Flotation FS</dt>
                <dd>
                  {r.flotation.uplift > 0 ? fmt(r.flotation.fs) : "no groundwater"} (≥ {fmt(r.flotation.required)})
                </dd>
              </div>
              <div>
                <dt>Bearing q / qa</dt>
                <dd>
                  {fmt(r.bearing.q, 1)} / {fmt(r.bearing.allowable, 0)} kPa
                </dd>
              </div>
              {r.panels.map((p) => {
                const w = p.peaks.reduce((m, x) => Math.max(m, x.dcr), 0);
                return (
                  <div key={p.id}>
                    <dt>{panelNames[p.id]} flexure (Sd)</dt>
                    <dd>DCR {fmt(w, 3)}</dd>
                  </div>
                );
              })}
            </dl>
          )}
          {r && (
            <ul className="slabWarnings">
              {r.warnings.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}
        </aside>
      </div>
      {r ? (
        <section className={styles.review} aria-label="DCR-based design checks">
          <h2>DCR-Based Design Checks</h2>
          <p className="slabMuted">Workflow status bands do not waive mandatory code or detailing requirements. “Not Evaluated” does not mean pass.</p>
          {tankCheckSections(r).map((sec) => (
            <DesignReviewPanel
              key={sec.title}
              module="slab"
              compact
              title={`${tankSectionTitles[sec.title]} — governing DCR ${fmt(sec.governing, 3)}`}
              checks={sec.checks}
              policy={policy}
              remarks={remarks}
              onChange={(next) => {
                editVersion.current++;
                setSaved(false);
                setRemarks(next);
              }}
            />
          ))}
        </section>
      ) : null}
    </section>
  );
}
