"use client";
import { useDeferredValue, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  barAreaPerMetre,
  defaultDesignCheckPolicy,
  defaultRetainingWallInput,
  defaultRetainingWallQuantity,
  designRetainingWall,
  estimateRetainingWallQuantity,
  retainingWallQuantityLimitations,
  missingJudgmentRemarks,
  rebarDesignation,
  retainingWallCombinationPreset,
  retainingWallDesignChecks,
  retainingWallDraftSchema,
  retainingWallInputSchema,
  retainingWallStatus,
  type CombinationSet,
  type DesignRemarks,
  type RetainingWallCombination,
  type RetainingWallInput,
  type RetainingWallQuantityInput,
} from "@nola/calc-core";
import type { ProjectRecord, CalculationDraftRecord } from "@/lib/projects";
import { DesignReviewPanel, DesignStatus } from "./design-review-panel";
import { ReportExportControls } from "./report-export-controls";
import { DuplicateSavePrompt, type DraftDuplicate } from "./duplicate-save-prompt";
import { ConcreteStrengthFields } from "./concrete-strength-fields";
import { DesignCodeFields } from "./column-materials-fields";
import { RebarGradeSelect, RebarSizeSelect, RebarStandardSelect } from "./rebar-select";
import { retainingWallSectionSvg, retainingWallStemSvg } from "@/lib/retaining-wall-drawing";
import styles from "./retaining-wall-workspace.module.css";

// three.js is only downloaded when the 3D tab is opened (client-only).
const RetainingWall3DView = dynamic(() => import("./retaining-wall-3d-view"), {
  ssr: false,
  loading: () => <p className="slabMuted">Loading 3D view…</p>,
});

const fmt = (n: number | null | undefined, p = 2) =>
  n === null || n === undefined || !Number.isFinite(n)
    ? "—"
    : n.toLocaleString("en-US", { minimumFractionDigits: p, maximumFractionDigits: p });

function Numeric({
  label,
  value,
  onChange,
  unit,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  unit?: string;
  disabled?: boolean;
}) {
  return (
    <label className="slabNumeric">
      <span>
        {label} {unit && <small>({unit})</small>}
      </span>
      <input
        type="number"
        step="any"
        disabled={disabled}
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value))}
      />
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
  ["stemBack", "Stem back face, vertical (main)"],
  ["stemFront", "Stem front face, vertical"],
  ["stemHorizontal", "Stem horizontal, each face"],
  ["toeBottom", "Footing bottom (toe main)"],
  ["heelTop", "Footing top (heel main)"],
  ["footingDistribution", "Footing distribution, each face"],
] as const;
type BarKey = (typeof barRows)[number][0];

const sameCombos = (a: RetainingWallCombination[], b: RetainingWallCombination[]) =>
  JSON.stringify(a) === JSON.stringify(b);

export function RetainingWallWorkspace({
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
  const restored = useMemo(() => retainingWallDraftSchema.safeParse(draft?.payload), [draft]);
  const [input, setInput] = useState<RetainingWallInput>(() =>
    restored.success ? restored.data.input : defaultRetainingWallInput(),
  );
  const policy =
    project?.designCheckPolicy ?? (restored.success ? restored.data.designPolicy : undefined) ?? defaultDesignCheckPolicy;
  const [quantity, setQuantity] = useState<RetainingWallQuantityInput>(() =>
    restored.success ? (restored.data.quantity ?? defaultRetainingWallQuantity()) : defaultRetainingWallQuantity(),
  );
  const [remarks, setRemarks] = useState<DesignRemarks>(restored.success ? (restored.data.remarks ?? {}) : {});
  const [title, setTitle] = useState(draft?.title ?? "Retaining Wall — RW-01");
  const [id, setId] = useState<string | undefined>(restored.success ? draft?.id : undefined);
  const [tab, setTab] = useState<"section" | "stem" | "3d">("section");
  const [layers, setLayers] = useState({ pressures: true, bars: true, bearing: true, dimensions: true });
  const [snapshot3d, setSnapshot3d] = useState<string | null>(null);
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [duplicate, setDuplicate] = useState<DraftDuplicate | null>(null),
    [saved, setSaved] = useState(!!restored.success);
  const editVersion = useRef(0);
  const analysed = useDeferredValue(input);
  const analysis = useMemo(() => {
    const parsed = retainingWallInputSchema.safeParse(analysed);
    if (!parsed.success)
      return {
        result: null,
        error: `Check inputs: ${parsed.error.issues
          .slice(0, 3)
          .map((x) => `${x.path.join(".") || "input"} — ${x.message}`)
          .join("; ")}`,
      };
    try {
      return { result: designRetainingWall(parsed.data), error: "" };
    } catch (e) {
      return { result: null, error: e instanceof Error ? e.message : "Check numerical inputs." };
    }
  }, [analysed]);
  const r = analysis.result;
  const checks = useMemo(() => (r ? retainingWallDesignChecks(r) : []), [r]);
  const missing = r ? missingJudgmentRemarks(checks, policy, remarks).length : 0;
  const status = r ? retainingWallStatus(r, input.dcrLimit) : null;
  const std = input.rebarStandard ?? "PNS49";
  const basement = input.wallType === "basement";
  const seismicOn = input.seismic.method !== "none";

  function update(next: RetainingWallInput) {
    editVersion.current++;
    setInput(next);
    setSaved(false);
    setMessage("");
  }
  /** Copy-on-write edit of the input. */
  function patch(fn: (d: RetainingWallInput) => void) {
    const d = structuredClone(input);
    fn(d);
    update(d);
  }
  /** Seismic method or combination set changed: refresh untouched presets. */
  function changePreset(fn: (d: RetainingWallInput) => void) {
    const before = retainingWallCombinationPreset(input.combinationSet, input.seismic.method !== "none");
    patch((d) => {
      fn(d);
      if (sameCombos(input.strength, before.strength) && sameCombos(input.service, before.service))
        Object.assign(d, retainingWallCombinationPreset(d.combinationSet, d.seismic.method !== "none"));
    });
  }
  async function save(opts: { overwrite?: boolean; title?: string } = {}) {
    if (!project) return;
    const saveTitle = opts.title ?? title;
    const version = editVersion.current;
    setBusy(true);
    setMessage("");
    try {
      const parsed = retainingWallDraftSchema.safeParse({
        kind: "retaining-wall",
        version: 1,
        input,
        quantity,
        designPolicy: policy,
        remarks,
        reviewCompleted: !!r,
      });
      if (!parsed.success || !title.trim()) throw new Error("Complete valid inputs and a calculation title before saving.");
      if (missing) throw Error("Add Remarks For Each Amber Design Check Before Saving.");
      const response = await fetch("/api/calculations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          projectId: project.id,
          moduleSlug: "retaining-wall",
          title: saveTitle,
          overwrite: opts.overwrite === true,
          payload: parsed.data,
        }),
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
      setMessage(
        version === editVersion.current
          ? "Retaining wall saved. Reopen it from the project explorer."
          : "Earlier inputs saved; newer edits remain unsaved.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  const sectionSvg = useMemo(
    () => (r ? retainingWallSectionSvg(analysed, r, layers) : ""),
    [r, analysed, layers],
  );
  const estimate = useMemo(() => {
    if (!quantity.enabled || !r) return null;
    try {
      return estimateRetainingWallQuantity(analysed, quantity);
    } catch {
      return null;
    }
  }, [quantity, r, analysed]);
  const stemSvg = useMemo(() => (r ? retainingWallStemSvg(analysed, r) : ""), [r, analysed]);
  const comboTable = (key: "strength" | "service", rows: RetainingWallCombination[]) => (
    <div className="slabTableWrap">
      <table className="slabBars" aria-label={`${key} combinations`}>
        <thead>
          <tr>
            <th>Use</th>
            <th>Label</th>
            <th>D</th>
            <th>H</th>
            <th>L</th>
            <th>E</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((c, k) => (
            <tr key={k}>
              <td>
                <input
                  type="checkbox"
                  aria-label={`Include ${c.id}`}
                  checked={c.included}
                  onChange={(e) => patch((d) => (d[key][k]!.included = e.target.checked))}
                />
              </td>
              <td>
                <input
                  aria-label={`${key} combination ${k + 1} label`}
                  value={c.id}
                  maxLength={100}
                  onChange={(e) => patch((d) => (d[key][k]!.id = e.target.value))}
                />
              </td>
              {(["d", "h", "l", "e"] as const).map((f) => (
                <td key={f}>
                  <input
                    aria-label={`${c.id} ${f.toUpperCase()} factor`}
                    type="number"
                    step="0.1"
                    className={styles.factor}
                    value={Number.isFinite(c[f]) ? c[f] : ""}
                    onChange={(e) => patch((d) => (d[key][k]![f] = e.target.value === "" ? NaN : Number(e.target.value)))}
                  />
                </td>
              ))}
              <td>
                <button
                  type="button"
                  className="slabMode"
                  disabled={rows.length <= 1}
                  onClick={() => patch((d) => d[key].splice(k, 1))}
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        className="suiteSecondary"
        onClick={() =>
          patch((d) => {
            let n = d[key].length + 1;
            while (d[key].some((c) => c.id === `${key === "strength" ? "U" : "S"}${n}`)) n++;
            d[key].push({ id: `${key === "strength" ? "U" : "S"}${n}`, d: 1, h: 1, l: 1, e: 0, included: true });
          })
        }
      >
        Add combination
      </button>
    </div>
  );

  const govService = r?.stability?.reduce<null | NonNullable<typeof r.stability>[number]>((b, s) => {
    if (!b) return s;
    const worse = Math.max(s.fsOverturningRequired / s.fsOverturning, s.fsSlidingRequired / s.fsSliding, s.bearing.qMax / s.allowable);
    const prev = Math.max(b.fsOverturningRequired / b.fsOverturning, b.fsSlidingRequired / b.fsSliding, b.bearing.qMax / b.allowable);
    return worse > prev ? s : b;
  }, null);
  const minFs = (f: (s: NonNullable<NonNullable<typeof r>["stability"]>[number]) => number) =>
    r?.stability?.length ? Math.min(...r.stability.map(f)) : null;

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
          {busy ? "Saving…" : saved ? "Saved" : "Save wall"}
        </button>
        <ReportExportControls
          moduleName="Concrete Retaining Wall"
          disabled={!r}
          disabledReason="Complete valid wall inputs to enable export."
          hint={missing ? `Record Engineering Judgment Remarks Before Exporting (${missing}).` : undefined}
          onData={async () => {
            if (!r) throw Error("Complete Valid Wall Inputs First.");
            if (missing) throw Error("Record Engineering Judgment Remarks Before Exporting.");
            const { retainingWallReportData } = await import("../lib/reports/retaining-wall-report");
            return retainingWallReportData(project, title, analysed, r, policy, remarks, snapshot3d, quantity);
          }}
        />
      </div>
      <p className="slabPilot">
        Development pilot · Calculation basis: ACI 318-19
        {input.code === "NSCP 2015" ? "; project standard NSCP 2015 (combinations Sec. 203, stability Sec. 307, seismic Sec. 208)" : ""}. 1 m strip
        analysis. Independent engineering review required.
      </p>
      {!project && <p>Create or select a project to save this calculation.</p>}
      {duplicate ? (
        <DuplicateSavePrompt
          duplicate={duplicate}
          busy={busy}
          onOverwrite={() => save({ overwrite: true })}
          onSaveAs={(t) => save({ title: t })}
          onCancel={() => setDuplicate(null)}
        />
      ) : null}
      {(message || analysis.error) && (
        <p className={analysis.error ? "slabError" : "slabFeedback"} role="status">
          {analysis.error || message}
        </p>
      )}
      <div className="slabGrid">
        <aside className="slabInputs slabPanel">
          <h2>01 · Wall Type & Code</h2>
          <DesignCodeFields input={input} onChange={update} engine="slab" />
          <label>
            Wall type
            <select
              value={input.wallType}
              onChange={(e) =>
                changePreset((d) => {
                  d.wallType = e.target.value as RetainingWallInput["wallType"];
                  if (d.wallType === "basement" && d.soil.theory !== "at-rest") d.soil.theory = "at-rest";
                  if (d.wallType === "propped") d.prop.height = Math.min(d.prop.height, d.height);
                })
              }
            >
              <option value="cantilever">Cantilever (base fixed, top free)</option>
              <option value="propped">Propped cantilever (prop / strut)</option>
              <option value="basement">Basement wall (top and base slabs)</option>
            </select>
          </label>
          <label>
            Analysis
            <select value="strip" onChange={() => undefined}>
              <option value="strip">1 m strip</option>
              <option value="full" disabled>
                Full width (plate) — Phase 2
              </option>
            </select>
          </label>
          {input.wallType === "propped" && (
            <div className="slabFieldGrid">
              <Numeric label="Prop height above footing" unit="m" value={input.prop.height} onChange={(v) => patch((d) => (d.prop.height = v))} />
              <Check label="Rigid prop" value={input.prop.rigid} onChange={(v) => patch((d) => (d.prop.rigid = v))} />
              {!input.prop.rigid && (
                <Numeric label="Prop stiffness" unit="kN/m per m" value={input.prop.stiffness} onChange={(v) => patch((d) => (d.prop.stiffness = v))} />
              )}
            </div>
          )}
          {basement && (
            <div className="slabFieldGrid">
              {(["top", "base"] as const).map((k) => (
                <label key={k}>
                  {k === "top" ? "Top slab restraint" : "Base slab restraint"}
                  <select value={input.basement[k]} onChange={(e) => patch((d) => (d.basement[k] = e.target.value as "fixed" | "pinned"))}>
                    <option value="pinned">Pinned</option>
                    <option value="fixed">Fixed</option>
                  </select>
                </label>
              ))}
            </div>
          )}

          <h2>02 · Geometry</h2>
          <div className="slabFieldGrid">
            <Numeric label={basement ? "Clear wall height" : "Stem height above footing"} unit="m" value={input.height} onChange={(v) => patch((d) => (d.height = v))} />
            <Numeric label="Stem thickness, top" unit="m" value={input.stemTop} onChange={(v) => patch((d) => (d.stemTop = v))} />
            <Numeric label="Stem thickness, base" unit="m" value={input.stemBase} onChange={(v) => patch((d) => (d.stemBase = v))} />
            {input.stemBase > input.stemTop && (
              <label>
                Battered face
                <select value={input.batter} onChange={(e) => patch((d) => (d.batter = e.target.value as "front" | "back"))}>
                  <option value="front">Front (back face vertical)</option>
                  <option value="back">Back (front face vertical)</option>
                </select>
              </label>
            )}
            {!basement && (
              <>
                <Numeric label="Toe" unit="m" value={input.toe} onChange={(v) => patch((d) => (d.toe = v))} />
                <Numeric label="Heel" unit="m" value={input.heel} onChange={(v) => patch((d) => (d.heel = v))} />
              </>
            )}
            <Numeric label={basement ? "Base slab thickness" : "Footing thickness"} unit="m" value={input.footing} onChange={(v) => patch((d) => (d.footing = v))} />
          </div>
          {!basement && (
            <details>
              <summary>Shear key {input.key.enabled ? "· on" : ""}</summary>
              <Check label="Provide shear key" value={input.key.enabled} onChange={(v) => patch((d) => (d.key.enabled = v))} />
              <div className="slabFieldGrid">
                <Numeric label="Key depth" unit="m" value={input.key.depth} disabled={!input.key.enabled} onChange={(v) => patch((d) => (d.key.depth = v))} />
                <Numeric label="Key width" unit="m" value={input.key.width} disabled={!input.key.enabled} onChange={(v) => patch((d) => (d.key.width = v))} />
                <Numeric label="Offset from toe edge" unit="m" value={input.key.offset} disabled={!input.key.enabled} onChange={(v) => patch((d) => (d.key.offset = v))} />
              </div>
              <p className="slabMuted">The key adds the passive depth in front of it; switch on passive in panel 04.</p>
            </details>
          )}

          <h2>03 · Backfill, Surcharge & Water</h2>
          <label>
            Earth pressure
            <select value={input.soil.theory} onChange={(e) => patch((d) => (d.soil.theory = e.target.value as RetainingWallInput["soil"]["theory"]))}>
              <option value="rankine">Rankine active (sloping backfill)</option>
              <option value="coulomb">Coulomb active (wall friction δ)</option>
              <option value="at-rest">At-rest K0 = (1 − sinφ)·OCR^sinφ</option>
              <option value="user">User K</option>
            </select>
          </label>
          <div className="slabFieldGrid">
            <Numeric label="φ′ backfill" unit="deg" value={input.soil.phi} onChange={(v) => patch((d) => (d.soil.phi = v))} />
            <Numeric label="γ moist" unit="kN/m³" value={input.soil.gamma} onChange={(v) => patch((d) => (d.soil.gamma = v))} />
            <Numeric label="γ saturated" unit="kN/m³" value={input.soil.gammaSat} onChange={(v) => patch((d) => (d.soil.gammaSat = v))} />
            <Numeric label="Backfill slope β" unit="deg" value={input.soil.beta} onChange={(v) => patch((d) => (d.soil.beta = v))} />
            {input.soil.theory === "coulomb" && <Numeric label="Wall friction δ" unit="deg" value={input.soil.delta} onChange={(v) => patch((d) => (d.soil.delta = v))} />}
            {input.soil.theory === "at-rest" && <Numeric label="OCR" value={input.soil.ocr} onChange={(v) => patch((d) => (d.soil.ocr = v))} />}
            {input.soil.theory === "user" && <Numeric label="K (horizontal)" value={input.soil.userK} onChange={(v) => patch((d) => (d.soil.userK = v))} />}
            <Numeric label="Surcharge, dead" unit="kPa" value={input.surcharge.dead} onChange={(v) => patch((d) => (d.surcharge.dead = v))} />
            <Numeric label="Surcharge, live" unit="kPa" value={input.surcharge.live} onChange={(v) => patch((d) => (d.surcharge.live = v))} />
          </div>
          {r && (
            <p className="slabMuted">
              K = {fmt(r.coefficients.k, 4)} (horizontal {fmt(r.coefficients.kh, 4)}, thrust at {fmt(r.coefficients.inclination, 1)}°)
              {!basement && ` · Kp toe = ${fmt(r.coefficients.kp, 3)}`}
            </p>
          )}
          <Check label="Groundwater" value={input.water.enabled} onChange={(v) => patch((d) => (d.water.enabled = v))} />
          {input.water.enabled && (
            <div className="slabFieldGrid">
              <Numeric label="Water level behind, above footing underside" unit="m" value={input.water.back} onChange={(v) => patch((d) => (d.water.back = v))} />
              {!basement && (
                <Numeric label="Water level in front, above footing underside" unit="m" value={input.water.front} onChange={(v) => patch((d) => (d.water.front = v))} />
              )}
            </div>
          )}

          {!basement && (
            <>
              <h2>04 · Toe Soil, Base & Stability</h2>
              <div className="slabFieldGrid">
                <Numeric label="Soil cover over toe" unit="m" value={input.toeSoil.cover} onChange={(v) => patch((d) => (d.toeSoil.cover = v))} />
                <Numeric label="γ toe soil" unit="kN/m³" value={input.toeSoil.gamma} onChange={(v) => patch((d) => (d.toeSoil.gamma = v))} />
                <Numeric label="φ′ toe soil" unit="deg" value={input.toeSoil.phi} onChange={(v) => patch((d) => (d.toeSoil.phi = v))} />
              </div>
              <Check label="Include toe soil weight" value={input.toeSoil.includeWeight} onChange={(v) => patch((d) => (d.toeSoil.includeWeight = v))} />
              <Check label="Passive resistance at toe (geotechnical approval)" value={input.toeSoil.passive} onChange={(v) => patch((d) => (d.toeSoil.passive = v))} />
              {input.toeSoil.passive && (
                <Numeric label="Passive mobilisation factor" unit="0–1" value={input.toeSoil.mobilization} onChange={(v) => patch((d) => (d.toeSoil.mobilization = v))} />
              )}
              <div className="slabFieldGrid">
                <Numeric label="Base friction μ" value={input.base.mu} onChange={(v) => patch((d) => (d.base.mu = v))} />
                <Numeric label="Allowable bearing qa" unit="kPa" value={input.base.allowable} onChange={(v) => patch((d) => (d.base.allowable = v))} />
                {seismicOn && (
                  <Numeric label="qa increase, seismic" unit="×" value={input.base.seismicIncrease} onChange={(v) => patch((d) => (d.base.seismicIncrease = v))} />
                )}
                <Numeric label="FS overturning" value={input.stability.overturning} onChange={(v) => patch((d) => (d.stability.overturning = v))} />
                <Numeric label="FS sliding" value={input.stability.sliding} onChange={(v) => patch((d) => (d.stability.sliding = v))} />
                {seismicOn && <Numeric label="FS with seismic" value={input.stability.seismic} onChange={(v) => patch((d) => (d.stability.seismic = v))} />}
              </div>
            </>
          )}

          <h2>05 · Seismic</h2>
          <label>
            Seismic earth pressure
            <select value={input.seismic.method} onChange={(e) => changePreset((d) => (d.seismic.method = e.target.value as RetainingWallInput["seismic"]["method"]))}>
              <option value="none">None</option>
              <option value="mononobe-okabe">Mononobe-Okabe (yielding wall)</option>
              <option value="wood">Wood (non-yielding wall)</option>
            </select>
          </label>
          {seismicOn && (
            <>
              <div className="slabFieldGrid">
                <Numeric label="kh" value={input.seismic.kh} onChange={(v) => patch((d) => (d.seismic.kh = v))} />
                <Numeric label="kv" value={input.seismic.kv} onChange={(v) => patch((d) => (d.seismic.kv = v))} />
              </div>
              <Check label="Wall inertia (kh × concrete weight)" value={input.seismic.inertia} onChange={(v) => patch((d) => (d.seismic.inertia = v))} />
              <p className="slabMuted">Use the geotechnical report value of kh where given (ASCE 7-16 11.8.3); kh = Ca/2 (NSCP 2015 Sec. 208) is a common yielding-wall estimate.</p>
            </>
          )}

          <h2>06 · Materials & Cover</h2>
          <div className="slabFieldGrid">
            <ConcreteStrengthFields value={input} onChange={({ fc, fcPsi }) => update({ ...input, fc, fcPsi })} />
          </div>
          <div className="slabFieldGrid">
            <div className="slabRebarRow">
              <RebarStandardSelect value={std} onChange={(rebarStandard) => update({ ...input, rebarStandard })} />
              <RebarGradeSelect label="Steel grade (fy)" standard={std} fy={input.fy} gradeId={input.gradeId} maxFy={550} onChange={(fy, gradeId) => update({ ...input, fy, gradeId })} />
            </div>
            <Numeric label="Concrete unit weight" unit="kN/m³" value={input.concreteWeight} onChange={(v) => patch((d) => (d.concreteWeight = v))} />
            <Numeric label="Cover, stem earth face" unit="mm" value={input.cover.stemBack} onChange={(v) => patch((d) => (d.cover.stemBack = v))} />
            <Numeric label="Cover, stem exposed face" unit="mm" value={input.cover.stemFront} onChange={(v) => patch((d) => (d.cover.stemFront = v))} />
            <Numeric label={basement ? "Cover, base slab" : "Cover, footing bottom (cast on earth)"} unit="mm" value={input.cover.footingBottom} onChange={(v) => patch((d) => (d.cover.footingBottom = v))} />
            {!basement && <Numeric label="Cover, footing top" unit="mm" value={input.cover.footingTop} onChange={(v) => patch((d) => (d.cover.footingTop = v))} />}
          </div>
          <p className="slabMuted">ACI 318-19 Table 20.5.1.3.1: 75 mm cast against earth; 50 mm (Ø19+) / 40 mm (Ø16 and smaller) exposed to earth or weather.</p>

          <h2>07 · Reinforcement</h2>
          <div className="slabTableWrap">
            <table className="slabBars" aria-label="Reinforcement">
              <thead>
                <tr>
                  <th>Bars</th>
                  <th>Size</th>
                  <th>Spacing mm</th>
                  <th>As mm²/m</th>
                </tr>
              </thead>
              <tbody>
                {barRows
                  .filter(([k]) => !basement || !["toeBottom", "heelTop", "footingDistribution"].includes(k))
                  .map(([k, label]) => (
                    <tr key={k}>
                      <th>{label}</th>
                      <td>
                        <RebarSizeSelect
                          standard={std}
                          ariaLabel={`${label} size`}
                          value={input.bars[k as BarKey].diameter}
                          onChange={(v) => patch((d) => (d.bars[k as BarKey].diameter = v))}
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`${label} spacing`}
                          type="number"
                          step="25"
                          value={Number.isFinite(input.bars[k as BarKey].spacing) ? input.bars[k as BarKey].spacing : ""}
                          onChange={(e) => patch((d) => (d.bars[k as BarKey].spacing = e.target.value === "" ? NaN : Number(e.target.value)))}
                        />
                      </td>
                      <td>{fmt(barAreaPerMetre(input.bars[k as BarKey]), 0)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <Check
            label="Stop alternate back-face bars (spacing doubles above)"
            value={input.bars.stemCut.enabled}
            onChange={(v) => patch((d) => (d.bars.stemCut.enabled = v))}
          />
          {input.bars.stemCut.enabled && (
            <Numeric label="Cut-off height above footing" unit="m" value={input.bars.stemCut.height} onChange={(v) => patch((d) => (d.bars.stemCut.height = v))} />
          )}

          <h2>08 · Load Combinations</h2>
          <label>
            Combination set
            <select value={input.combinationSet} onChange={(e) => changePreset((d) => (d.combinationSet = e.target.value as CombinationSet))}>
              <option value="NSCP 2015">NSCP 2015 Sec. 203 (H per ACI 318-19 5.3.8)</option>
              <option value="ASCE 7-16">ASCE 7-16 2.3 / 2.4</option>
            </select>
          </label>
          <button
            type="button"
            className="suiteSecondary"
            onClick={() => patch((d) => Object.assign(d, retainingWallCombinationPreset(d.combinationSet, d.seismic.method !== "none")))}
          >
            Reset to preset
          </button>
          <h3 className="rcSubhead">Strength (member design)</h3>
          {comboTable("strength", input.strength)}
          <h3 className="rcSubhead">Service (stability, with FS)</h3>
          {comboTable("service", input.service)}
          <p className="slabMuted">
            D: self-weight, soil weight and dead surcharge · H: lateral earth pressure and groundwater · L: live surcharge (driving only for
            overturning and sliding) · E: seismic increment and inertia.
          </p>
          <Numeric label="DCR limit" value={input.dcrLimit} onChange={(v) => patch((d) => (d.dcrLimit = v))} />
        </aside>

        <div className="slabCenter">
          <div className="slabTabs" role="tablist" aria-label="Retaining wall view">
            {(
              [
                ["section", "Section view"],
                ["stem", "Stem actions"],
                ["3d", "3D view"],
              ] as const
            ).map(([k, t]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
                {t}
              </button>
            ))}
          </div>
          {tab === "section" && (
            <section className="slabPanel">
              <div className="slabViewButtons">
                {(["pressures", "bars", "bearing", "dimensions"] as const).map((k) => (
                  <label key={k} className="slab3dToggle">
                    <input type="checkbox" checked={layers[k]} onChange={(e) => setLayers({ ...layers, [k]: e.target.checked })} />{" "}
                    {k[0]!.toUpperCase() + k.slice(1)}
                  </label>
                ))}
              </div>
              {r ? (
                <div className={styles.drawing} role="img" aria-label="Retaining wall section" dangerouslySetInnerHTML={{ __html: sectionSvg }} />
              ) : (
                <p className="slabMuted">Complete valid inputs to draw the section.</p>
              )}
              <p className="slabMuted">
                True scale. Pressure diagrams act on the vertical plane through the heel (service, unfactored); bearing shows the service case
                with the largest pressure. Bars are schematic: hook direction, laps and bar marks need detailing review.
              </p>
            </section>
          )}
          {tab === "stem" && (
            <section className="slabPanel">
              {r ? <div className={styles.drawing} dangerouslySetInnerHTML={{ __html: stemSvg }} /> : <p className="slabMuted">Complete valid inputs.</p>}
              <p className="slabMuted">Factored envelopes over the strength combinations; φMn steps where alternate back bars stop.</p>
            </section>
          )}
          {tab === "3d" && r && (
            <section className="slabPanel slab3dPanel">
              <RetainingWall3DView input={analysed} result={r} onSnapshot={setSnapshot3d} />
              {snapshot3d && (
                <p className="slabMuted">
                  A 3D snapshot will be included in the Complete PDF report. <button onClick={() => setSnapshot3d(null)}>Remove snapshot</button>
                </p>
              )}
            </section>
          )}
        </div>

        <aside className="slabPanel slabSummary">
          <h2>Design Checks</h2>
          <div className="slabStatus">
            <DesignStatus dcr={status?.worst ?? null} policy={policy} />
            <span>Governing DCR {fmt(status?.worst, 3)}</span>
          </div>
          {r && (
            <dl>
              {!basement && (
                <>
                  <div>
                    <dt>Active thrust (plane)</dt>
                    <dd>{fmt(r.lateral.reduce((s, l) => s + (l.kind === "E" ? 0 : l.force), 0), 1)} kN/m</dd>
                  </div>
                  <div>
                    <dt>FS overturning (min)</dt>
                    <dd>{fmt(minFs((s) => s.fsOverturning))}</dd>
                  </div>
                  <div>
                    <dt>FS sliding (min)</dt>
                    <dd>{fmt(minFs((s) => s.fsSliding))}</dd>
                  </div>
                  <div>
                    <dt>Bearing q max / qa</dt>
                    <dd>
                      {fmt(govService?.bearing.qMax, 1)} / {fmt(govService?.allowable, 0)} kPa
                    </dd>
                  </div>
                  <div>
                    <dt>Eccentricity</dt>
                    <dd>
                      {fmt(govService?.bearing.e, 3)} m (B/6 = {fmt(r.geometry.width / 6, 3)})
                    </dd>
                  </div>
                </>
              )}
              {r.flexure
                .filter((f) => f.id.startsWith("stem"))
                .map((f) => (
                  <div key={f.id}>
                    <dt>{f.label}</dt>
                    <dd>
                      Mu {fmt(f.mu, 1)} / φMn {fmt(f.phiMn, 1)} kN·m/m
                    </dd>
                  </div>
                ))}
              {r.stem.serviceReactions.prop !== null && (
                <div>
                  <dt>Prop reaction (service)</dt>
                  <dd>{fmt(r.stem.serviceReactions.prop, 1)} kN/m</dd>
                </div>
              )}
              {r.stem.serviceReactions.top !== null && (
                <div>
                  <dt>Top slab reaction (service)</dt>
                  <dd>{fmt(r.stem.serviceReactions.top, 1)} kN/m</dd>
                </div>
              )}
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

      {r && (
        <section className="slabPanel slabCalc">
          <h2>Calculations</h2>
          {!basement && (
            <>
              <h3>Loads per metre (service)</h3>
              <div className="slabTableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Type</th>
                      <th>Force kN/m</th>
                      <th>Lever arm m</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.weights.map((w) => (
                      <tr key={w.id}>
                        <th>{w.label}</th>
                        <td>{w.kind} · vertical</td>
                        <td>{fmt(w.weight)}</td>
                        <td>x = {fmt(w.x)}</td>
                      </tr>
                    ))}
                    {r.verticalThrust.map((w) => (
                      <tr key={w.id}>
                        <th>{w.label}</th>
                        <td>{w.kind} · vertical</td>
                        <td>{fmt(w.weight)}</td>
                        <td>x = {fmt(w.x)}</td>
                      </tr>
                    ))}
                    {r.lateral.map((l) => (
                      <tr key={l.id}>
                        <th>{l.label}</th>
                        <td>{l.kind} · horizontal</td>
                        <td>{fmt(l.force)}</td>
                        <td>y = {fmt(l.arm)}</td>
                      </tr>
                    ))}
                    {r.uplift.force > 0 && (
                      <tr>
                        <th>Uplift</th>
                        <td>H · upward</td>
                        <td>{fmt(r.uplift.force)}</td>
                        <td>x = {fmt(r.uplift.x)}</td>
                      </tr>
                    )}
                    {r.passive.force > 0 && (
                      <tr>
                        <th>Passive at toe (mobilised)</th>
                        <td>resisting</td>
                        <td>{fmt(r.passive.force)}</td>
                        <td>depth {fmt(r.passive.depth)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="slabMuted">x from the toe edge; y above the footing underside. Thrust on the plane through the heel, height {fmt(r.plane.height)} m.</p>
              <h3>Stability (service)</h3>
              <div className="slabTableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>Case</th>
                      <th>ΣV − U kN/m</th>
                      <th>FS OT</th>
                      <th>FS sliding</th>
                      <th>e m</th>
                      <th>q toe / heel kPa</th>
                      <th>Contact</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.stability?.map((s) => (
                      <tr key={s.id}>
                        <th>{s.id}</th>
                        <td>{fmt(s.vertical - s.uplift, 1)}</td>
                        <td>
                          {fmt(s.fsOverturning)} ≥ {fmt(s.fsOverturningRequired, 1)}
                        </td>
                        <td>
                          {fmt(s.fsSliding)} ≥ {fmt(s.fsSlidingRequired, 1)}
                        </td>
                        <td>{fmt(s.bearing.e, 3)}</td>
                        <td>
                          {fmt(s.bearing.qToe, 1)} / {fmt(s.bearing.qHeel, 1)}
                        </td>
                        <td>{s.bearing.shape === "triangle" ? `${fmt(s.bearing.contact)} m` : s.bearing.shape === "unstable" ? "unstable" : "full"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <h3>Member strength (factored)</h3>
          <div className="slabTableWrap">
            <table>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Combination · location</th>
                  <th>Demand</th>
                  <th>Capacity</th>
                  <th>DCR</th>
                </tr>
              </thead>
              <tbody>
                {r.flexure.map((f) => (
                  <tr key={f.id}>
                    <th>{f.label}</th>
                    <td>
                      {f.combo} · {f.location}
                    </td>
                    <td>Mu {fmt(f.mu, 1)}</td>
                    <td>
                      φMn {fmt(f.phiMn, 1)} (As {fmt(f.as, 0)}, d {fmt(f.d, 0)})
                    </td>
                    <td>
                      <DesignStatus dcr={f.phiMn > 0 ? f.mu / f.phiMn : null} policy={policy} />
                    </td>
                  </tr>
                ))}
                {r.shear.map((v) => (
                  <tr key={v.id}>
                    <th>{v.label}</th>
                    <td>
                      {v.combo} · {v.location}
                    </td>
                    <td>Vu {fmt(v.vu, 1)}</td>
                    <td>
                      φVc {fmt(v.phiVc, 1)} (λs {fmt(v.lambdaS, 3)})
                    </td>
                    <td>
                      <DesignStatus dcr={v.vu / v.phiVc} policy={policy} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="slabMuted">
            Stem dowels: hooked ldh {fmt(r.development.ldh, 0)} mm vs {fmt(r.development.available, 0)} mm available in the{" "}
            {basement ? "base slab" : "footing"}; straight ld {fmt(r.development.ld, 0)} mm; Class B lap above the base{" "}
            {fmt(r.development.lap, 0)} mm ({rebarDesignation(std, input.bars.stemBack.diameter)}).
          </p>
        </section>
      )}
      {r && (
        <section className="slabPanel slabCalc" aria-label="Quantity estimate">
          <h2>Quantity Estimate</h2>
          <Check
            label="Enable quantity estimate"
            value={quantity.enabled}
            onChange={(v) => {
              editVersion.current++;
              setSaved(false);
              setQuantity({ ...quantity, enabled: v });
            }}
          />
          {quantity.enabled && (
            <>
              <div className="slabFieldGrid">
                <Numeric
                  label="Wall length"
                  unit="m"
                  value={quantity.length}
                  onChange={(v) => {
                    editVersion.current++;
                    setSaved(false);
                    setQuantity({ ...quantity, length: v });
                  }}
                />
                <Check
                  label="End formwork at both ends"
                  value={quantity.endForms}
                  onChange={(v) => {
                    editVersion.current++;
                    setSaved(false);
                    setQuantity({ ...quantity, endForms: v });
                  }}
                />
              </div>
              {estimate ? (
                <>
                  <dl className={styles.totals}>
                    <div>
                      <dt>Concrete</dt>
                      <dd>
                        {fmt(estimate.concrete.total)} m³ (stem {fmt(estimate.concrete.stem)}
                        {basement ? "" : `, footing ${fmt(estimate.concrete.footing)}`}
                        {estimate.concrete.key > 0 ? `, key ${fmt(estimate.concrete.key)}` : ""})
                      </dd>
                    </div>
                    <div>
                      <dt>Formwork</dt>
                      <dd>{fmt(estimate.formwork.total, 1)} m²</dd>
                    </div>
                    <div>
                      <dt>Reinforcement</dt>
                      <dd>
                        {fmt(estimate.steel, 0)} kg ({fmt(estimate.ratio, 0)} kg/m³)
                      </dd>
                    </div>
                  </dl>
                  <div className="slabTableWrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Mark</th>
                          <th>Bars</th>
                          <th>Size @ spacing</th>
                          <th>No.</th>
                          <th>Length m</th>
                          <th>Weight kg</th>
                        </tr>
                      </thead>
                      <tbody>
                        {estimate.bars.map((b) => (
                          <tr key={b.label}>
                            <td>{b.mark}</td>
                            <th>{b.label}</th>
                            <td>
                              {rebarDesignation(std, b.diameter)} @ {b.spacing}
                            </td>
                            <td>{b.count}</td>
                            <td>{fmt(b.length)}</td>
                            <td>{fmt(b.weight, 1)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <ul className="slabWarnings">
                    {retainingWallQuantityLimitations.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="slabMuted">Enter a valid wall length.</p>
              )}
            </>
          )}
        </section>
      )}
      {r ? (
        <DesignReviewPanel
          module="slab"
          checks={checks}
          policy={policy}
          remarks={remarks}
          onChange={(next) => {
            editVersion.current++;
            setSaved(false);
            setRemarks(next);
          }}
        />
      ) : null}
    </section>
  );
}
