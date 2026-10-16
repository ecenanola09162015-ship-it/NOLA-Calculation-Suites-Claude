"use client";
/**
 * Stairs workspace (Pilot) — decision sheet 16 Oct 2026. Same structure as
 * the Slab workspace: inputs left, drawings / analysis / 3-D in the centre,
 * design checks right, then warnings, design review, quantities.
 */
import { useDeferredValue, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  analyzeStairs,
  defaultDesignCheckPolicy,
  defaultStairsInput,
  fcFromPsi,
  missingJudgmentRemarks,
  stairCodeBasisLabel,
  stairQuantities,
  stairBarMarks,
  STAIR_BEAM_DEPTH,
  stairsDesignChecks,
  stairsDesignCheckSections,
  stairOptimizeSpacing,
  STAIR_OPTIMIZE_TARGET,
  designCheckStatus,
  stairsDraftSchema,
  stairsInputSchema,
  type DesignRemarks,
  type StairLocalLoad,
  type StairsInput,
  type StairsResult,
} from "@nola/calc-core";
import type { ProjectRecord, CalculationDraftRecord } from "@/lib/projects";
import { DesignReviewPanel, DesignStatus } from "./design-review-panel";
import { ReportExportControls } from "./report-export-controls";
import {
  DuplicateSavePrompt,
  type DraftDuplicate,
} from "./duplicate-save-prompt";
import { ConcreteStrengthFields } from "./concrete-strength-fields";
import {
  RebarGradeSelect,
  RebarSizeSelect,
  RebarStandardSelect,
} from "./rebar-select";
import { StairForceDiagrams, StairPlan, StairSection } from "./stair-diagrams";
import styles from "./stair-workspace.module.css";
import { stairBarColors } from "@/lib/stair-bar-styles";

// three.js is only downloaded when the 3D tab is opened (client-only).
const Stair3DView = dynamic(() => import("./stair-3d-view"), {
  ssr: false,
  loading: () => <p className="slabMuted">Loading 3D view…</p>,
});

/** ACI 318-19 20.2.2.2. */
const ES_DEFAULT = 200000;
type Bars = StairsInput["bars"];
type BarKey = keyof Bars;
type TopKey = "topBottom" | "topTop" | "topKnee";
const barRows: { key: BarKey; label: string; ext: boolean }[] = [
  { key: "mainBottom", label: "Main bottom bars (along the run)", ext: false },
  { key: "topBottom", label: "Top bars · bottom support", ext: true },
  { key: "topTop", label: "Top bars · top support", ext: true },
  { key: "topKnee", label: "Top bars · knees / landing supports", ext: true },
  { key: "distribution", label: "Distribution bars (across)", ext: false },
];
const fmt = (n: number | null | undefined, p = 2) =>
  n === null || n === undefined || !Number.isFinite(n)
    ? "—"
    : n.toLocaleString("en-US", {
        minimumFractionDigits: p,
        maximumFractionDigits: p,
      });
const num = (v: string) => (v === "" ? NaN : Number(v));

function Numeric({
  label,
  value,
  onChange,
  unit = "mm",
  step = "any",
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  unit?: string;
  step?: string;
}) {
  return (
    <label className="slabNumeric">
      <span>
        {label} {unit && <small>({unit})</small>}
      </span>
      <input
        type="number"
        step={step}
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => onChange(num(e.target.value))}
      />
    </label>
  );
}
function Choice<T extends string>({
  question,
  value,
  options,
  onChange,
}: {
  question: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="group" aria-label={question}>
      <p className={styles.question}>{question}</p>
      <div className={styles.choice}>
        {options.map(([v, text]) => (
          <button
            key={v}
            type="button"
            aria-pressed={value === v}
            onClick={() => onChange(v)}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

const OPTIMIZE_TIP =
  "Keeps the bar size and tries 300 → 75 mm in 25 mm steps; enters the largest (most economical) spacing at which every check of this set stays below 1.0 and at or below the target DCR. Main bottom bars include calculated deflection; the minimum-thickness screen depends on h only.";

export function StairWorkspace({
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
  const restored = useMemo(
    () => stairsDraftSchema.safeParse(draft?.payload),
    [draft],
  );
  const [input, setInput] = useState<StairsInput>(() =>
    restored.success
      ? restored.data.input
      : { ...defaultStairsInput(), fcPsi: 4000, fc: fcFromPsi(4000) },
  );
  const policy =
    project?.designCheckPolicy ??
    (restored.success ? restored.data.designPolicy : undefined) ??
    defaultDesignCheckPolicy;
  const policyKey = JSON.stringify(policy);
  const livePolicy = useRef(policyKey);
  livePolicy.current = policyKey;
  const [savedPolicy, setSavedPolicy] = useState(
    restored.success
      ? JSON.stringify(restored.data.designPolicy ?? defaultDesignCheckPolicy)
      : policyKey,
  );
  const [remarks, setRemarks] = useState<DesignRemarks>(
    restored.success ? (restored.data.remarks ?? {}) : {},
  );
  const [title, setTitle] = useState(draft?.title ?? "Stairs — ST-01");
  const [id, setId] = useState<string | undefined>(
    restored.success ? draft?.id : undefined,
  );
  const [tab, setTab] = useState<"drawings" | "analysis" | "3d">("drawings");
  // V2: estimate off until the user enables it (saved with the draft).
  const [estimateOn, setEstimateOn] = useState(
    restored.success ? (restored.data.estimate?.enabled ?? false) : false,
  );
  // V3: bar set being edited, highlighted in the drawings and 3-D view.
  const [activeSet, setActiveSet] = useState<BarKey | null>(null);
  // 3-D snapshot for the Complete PDF report (session only).
  const [snapshot3d, setSnapshot3d] = useState<string | null>(null);
  // Optimize spacing target DCR (session setting).
  const [optimizeTarget, setOptimizeTarget] = useState(STAIR_OPTIMIZE_TARGET);
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [duplicate, setDuplicate] = useState<DraftDuplicate | null>(null),
    [saved, setSaved] = useState(!!restored.success);
  const editVersion = useRef(0);
  const analysed = useDeferredValue(input);
  const analysis = useMemo(() => {
    const parsed = stairsInputSchema.safeParse(analysed);
    if (!parsed.success)
      return {
        valid: null as StairsInput | null,
        result: null as StairsResult | null,
        error: `Check inputs: ${parsed.error.issues[0]?.path.join(" › ") || "value"} — ${parsed.error.issues[0]?.message ?? "invalid"}.`,
      };
    try {
      const r = analyzeStairs(parsed.data);
      return {
        valid: parsed.data,
        result: r.error ? null : r,
        error: r.error ?? "",
      };
    } catch (e) {
      return {
        valid: parsed.data,
        result: null,
        error: e instanceof Error ? e.message : "Check inputs.",
      };
    }
  }, [analysed]);
  const r = analysis.result,
    valid = analysis.valid;
  const checks = useMemo(() => (r ? stairsDesignChecks(r) : []), [r]);
  const sections = useMemo(() => (r ? stairsDesignCheckSections(r) : []), [r]);
  const quantity = useMemo(
    () => (estimateOn && valid && r ? stairQuantities(valid) : null),
    [estimateOn, valid, r],
  );
  const maxDcr = checks.length
    ? Math.max(...checks.map((c) => c.dcr ?? Infinity))
    : null;
  const missing = r ? missingJudgmentRemarks(checks, policy, remarks) : [];

  function update(next: StairsInput) {
    editVersion.current++;
    setInput(next);
    setSaved(false);
    setMessage("");
  }
  const set = <K extends keyof StairsInput>(k: K, v: StairsInput[K]) =>
    update({ ...input, [k]: v });
  const setBar = (
    k: BarKey,
    field: "diameter" | "spacing" | "extension",
    v: number,
  ) =>
    update({
      ...input,
      bars: { ...input.bars, [k]: { ...input.bars[k], [field]: v } },
    });
  const setLanding = (
    which: "bottomLanding" | "topLanding",
    patch: Partial<StairsInput["topLanding"]>,
  ) => update({ ...input, [which]: { ...input[which], ...patch } });
  const setFlights = (flights: StairsInput["flights"]) =>
    update({ ...input, flights });
  const setBottom = (patch: Partial<StairsInput["bottomSupport"]>) =>
    update({ ...input, bottomSupport: { ...input.bottomSupport, ...patch } });
  const setFooting = (
    patch: Partial<StairsInput["bottomSupport"]["footing"]>,
  ) => setBottom({ footing: { ...input.bottomSupport.footing, ...patch } });
  const newLanding = () => ({
    length: 1200,
    thickness: input.waist,
    width: 0,
    startSupport: "None" as const,
    endSupport: "None" as const,
  });

  function setStairType(t: StairsInput["stairType"]) {
    if (t === input.stairType) return;
    if (t === "dog-leg")
      update({
        ...input,
        stairType: t,
        flights: [
          {
            risers: input.flights[0].risers,
            landingAfter: {
              ...newLanding(),
              length: Math.max(1200, input.flightWidth),
              endSupport: "Pinned",
            },
          },
          {
            risers: input.flights[1]?.risers ?? input.flights[0].risers,
            landingAfter: null,
          },
        ],
      });
    else
      update({
        ...input,
        stairType: t,
        flights: input.flights.map((f, k, a) =>
          k === a.length - 1 ? { ...f, landingAfter: null } : f,
        ),
      });
  }
  function addFlight() {
    if (input.flights.length >= 3) return;
    const flights = input.flights.map((f, k, a) =>
      k === a.length - 1 ? { ...f, landingAfter: newLanding() } : f,
    );
    setFlights([
      ...flights,
      {
        risers: input.flights[input.flights.length - 1].risers,
        landingAfter: null,
      },
    ]);
  }
  function removeFlight(k: number) {
    if (input.flights.length <= 1) return;
    const flights = input.flights.filter((_, n) => n !== k);
    flights[flights.length - 1] = {
      ...flights[flights.length - 1],
      landingAfter: null,
    };
    setFlights(flights);
  }
  function editLocal(k: number, patch: Record<string, unknown>) {
    set(
      "localLoads",
      input.localLoads.map((l, n) =>
        n === k ? ({ ...l, ...patch } as StairLocalLoad) : l,
      ),
    );
  }
  function addLocal(kind: StairLocalLoad["kind"]) {
    const prefix = { point: "P", line: "W", area: "A" }[kind];
    let n = input.localLoads.filter((l) => l.kind === kind).length + 1;
    while (input.localLoads.some((l) => l.id === `${prefix}${n}`)) n++;
    const x = 1000;
    const next: StairLocalLoad =
      kind === "point"
        ? {
            kind,
            id: `${prefix}${n}`,
            strip: 1,
            case: "live",
            x,
            value: 5,
            width: 300,
          }
        : kind === "line"
          ? { kind, id: `${prefix}${n}`, strip: 1, case: "dead", x, value: 3 }
          : {
              kind,
              id: `${prefix}${n}`,
              strip: 1,
              case: "dead",
              x0: x,
              x1: x + 1000,
              value: 2,
              width: input.flightWidth,
            };
    set("localLoads", [...input.localLoads, next]);
  }
  function optimize(k: BarKey) {
    if (!valid || !Number.isFinite(optimizeTarget)) return;
    const res = stairOptimizeSpacing(valid, k, optimizeTarget);
    if (res.spacing !== null) setBar(k, "spacing", res.spacing);
    setMessage(res.message);
  }

  async function save(opts: { overwrite?: boolean; title?: string } = {}) {
    if (!project) return;
    const saveTitle = opts.title ?? title;
    const version = editVersion.current;
    setBusy(true);
    setMessage("");
    try {
      const parsed = stairsDraftSchema.safeParse({
        kind: "stairs",
        version: 1,
        input,
        designPolicy: policy,
        remarks,
        reviewCompleted: !!r,
        estimate: { enabled: estimateOn },
      });
      if (!parsed.success || !title.trim())
        throw new Error(
          "Complete valid inputs and a calculation title before saving.",
        );
      if (missing.length)
        throw Error("Add Remarks For Each Amber Design Check Before Saving.");
      const response = await fetch("/api/calculations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          projectId: project.id,
          moduleSlug: "stairs",
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
      setSaved(
        version === editVersion.current && livePolicy.current === policyKey,
      );
      setSavedPolicy(policyKey);
      onSaved(body.draft);
      setMessage(
        version === editVersion.current
          ? "Stair inputs saved. Reopen this calculation from the project explorer."
          : "Earlier inputs saved; newer edits remain unsaved.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  const dog = input.stairType === "dog-leg";
  /** Design width used for totals, m (1 m in strip mode). */
  const widthM = input.widthMode === "full" ? input.flightWidth / 1000 : 1;
  const barsAcross = (sp: number) =>
    Math.floor((widthM * 1000 - 2 * input.bottomCover) / sp) + 1;
  const full = input.widthMode === "full";
  const bs = input.bottomSupport;
  const flightDead = r?.loads.flight;
  const allSt = r ? r.strips.flatMap((s) => s.stations) : [];
  const allSpans = r ? r.strips.flatMap((s) => s.spans) : [];

  return (
    <section className="slabWorkspace stairWorkspace">
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
        <button
          className="suitePrimary"
          onClick={() => save()}
          disabled={busy || !project || !cloudReady || !r}
        >
          {busy
            ? "Saving…"
            : saved && savedPolicy === policyKey
              ? "Saved"
              : "Save stairs"}
        </button>
        <ReportExportControls
          moduleName="Stairs"
          disabled={!r || !valid}
          disabledReason="Complete valid stair inputs to enable export."
          hint={
            missing.length
              ? `Record Engineering Judgment Remarks Before Exporting (${missing.length}).`
              : undefined
          }
          onData={async () => {
            if (!r || !valid) throw Error("Complete Valid Stair Inputs First.");
            if (missing.length)
              throw Error(
                "Record Engineering Judgment Remarks Before Exporting.",
              );
            const { stairsReportData } =
              await import("../lib/reports/stair-data");
            return stairsReportData(
              project,
              title,
              valid,
              r,
              policy,
              remarks,
              estimateOn,
              snapshot3d,
            );
          }}
        />
      </div>
      <p className="slabPilot">
        Development pilot · {stairCodeBasisLabel(input)} Independent engineering
        review required.
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
        <p
          className={analysis.error ? "slabError" : "slabFeedback"}
          role="status"
        >
          {analysis.error || message}
        </p>
      )}
      <div className="slabGrid">
        <aside className="slabInputs slabPanel">
          <h2>01 · Stair Type & Geometry</h2>
          <div className="rcCodeBlock">
            <label>
              Primary Design Code
              <select
                value={input.code}
                onChange={(e) =>
                  set("code", e.target.value as StairsInput["code"])
                }
              >
                <option>ACI 318-19</option>
                <option value="NSCP 2015">
                  NSCP 2015 project — ACI 318-19 calculation basis
                </option>
                <option disabled>ACI 318-14 — Future Development</option>
                <option disabled>BS EN 1992 — Future Development</option>
              </select>
            </label>
            {input.code === "NSCP 2015" && (
              <p className="rcAlert">
                Project standard: NSCP 2015. Calculation basis: ACI 318-19. This
                option uses the same ACI stair design engine; it does not
                confirm compliance with every NSCP 2015 provision.
              </p>
            )}
            <label>
              Other Codes*
              <input
                type="text"
                maxLength={300}
                placeholder="e.g. NSCP 2015; ASCE 7-16"
                value={input.otherCodes ?? ""}
                onChange={(e) => set("otherCodes", e.target.value)}
              />
            </label>
            <p className="rcMuted rcCodeNote">
              *Documentation only — does not change the calculation basis.
            </p>
          </div>
          <Choice
            question="Stair type"
            value={input.stairType}
            options={[
              ["single", "Single span (straight, landings optional)"],
              ["dog-leg", "Dog-leg (two flights + mid landing)"],
            ]}
            onChange={setStairType}
          />
          <Choice
            question="Design width"
            value={input.widthMode}
            options={[
              ["strip", "1 m strip"],
              ["full", `Full flight width (${fmt(input.flightWidth, 0)} mm)`],
            ]}
            onChange={(v) => set("widthMode", v)}
          />
          <p className="slabMuted">
            Results are per metre in both modes. Full width multiplies reactions
            and quantities by the flight width and spreads point / area loads
            over an effective width; 1 m strip puts local loads wholly on the
            strip.
          </p>
          <h3 className="rcSubhead">Steps & Waist</h3>
          <div className="slabFieldGrid slabDimRow">
            <Numeric
              label="Riser R"
              value={input.riser}
              onChange={(v) => set("riser", v)}
            />
            <Numeric
              label="Going T"
              value={input.going}
              onChange={(v) => set("going", v)}
            />
            <Numeric
              label="Waist t (normal to soffit)"
              value={input.waist}
              onChange={(v) => set("waist", v)}
            />
          </div>
          <div className="slabFieldGrid slabDimRow">
            <Numeric
              label="Flight width B"
              value={input.flightWidth}
              onChange={(v) => set("flightWidth", v)}
            />
            {dog && (
              <Numeric
                label="Gap between flights"
                value={input.flightGap}
                onChange={(v) => set("flightGap", v)}
              />
            )}
          </div>
          <p className="slabClassification">
            θ = {r ? fmt(r.pitch.degrees, 1) : "—"}° · 2R + T ={" "}
            {fmt(2 * input.riser + input.going, 0)} mm
          </p>
          <h3 className="rcSubhead">Flights & Landings</h3>
          <label className={styles.inlineCheck}>
            <input
              type="checkbox"
              checked={input.bottomLanding.length > 0}
              onChange={(e) =>
                setLanding("bottomLanding", {
                  length: e.target.checked ? 1200 : 0,
                })
              }
            />
            Bottom landing (before the first riser)
          </label>
          {input.bottomLanding.length > 0 && (
            <div className="slabFieldGrid slabDimRow">
              <Numeric
                label="Length along run"
                value={input.bottomLanding.length}
                onChange={(v) => setLanding("bottomLanding", { length: v })}
              />
              <Numeric
                label="Thickness"
                value={input.bottomLanding.thickness}
                onChange={(v) => setLanding("bottomLanding", { thickness: v })}
              />
              <Numeric
                label="Width (0 = B)"
                value={input.bottomLanding.width}
                onChange={(v) => setLanding("bottomLanding", { width: v })}
              />
            </div>
          )}
          {input.flights.map((f, k) => {
            const last = k === input.flights.length - 1;
            const after = f.landingAfter;
            const supportOpts =
              dog && k === 0
                ? (["Fixed", "Pinned", "Sliding"] as const)
                : (["None", "Fixed", "Pinned", "Sliding"] as const);
            const setAfter = (
              patch: Partial<NonNullable<typeof after>> | null,
            ) =>
              setFlights(
                input.flights.map((x, n) =>
                  n === k
                    ? {
                        ...x,
                        landingAfter:
                          patch === null
                            ? null
                            : { ...(x.landingAfter ?? newLanding()), ...patch },
                      }
                    : x,
                ),
              );
            return (
              <div key={k} className={styles.flightCard}>
                <h4>
                  Flight {k + 1}
                  {!dog && input.flights.length > 1 && (
                    <button
                      type="button"
                      className="slabMode"
                      onClick={() => removeFlight(k)}
                      style={{ marginLeft: 8 }}
                    >
                      Remove
                    </button>
                  )}
                </h4>
                <div className="slabFieldGrid slabDimRow">
                  <Numeric
                    label="Number of risers"
                    unit=""
                    step="1"
                    value={f.risers}
                    onChange={(v) =>
                      setFlights(
                        input.flights.map((x, n) =>
                          n === k ? { ...x, risers: v } : x,
                        ),
                      )
                    }
                  />
                </div>
                {!last && after && (
                  <>
                    <p className={styles.question}>
                      {dog
                        ? "Mid landing (turn)"
                        : `Landing after ${f.risers} risers`}
                    </p>
                    <div className="slabFieldGrid slabDimRow">
                      <Numeric
                        label={
                          dog
                            ? "Depth (last riser → far edge)"
                            : "Length along run"
                        }
                        value={after.length}
                        onChange={(v) => setAfter({ length: v })}
                      />
                      <Numeric
                        label="Thickness"
                        value={after.thickness}
                        onChange={(v) => setAfter({ thickness: v })}
                      />
                      <Numeric
                        label={dog ? "Width (0 = 2B + gap)" : "Width (0 = B)"}
                        value={after.width}
                        onChange={(v) => setAfter({ width: v })}
                      />
                    </div>
                    <div className="slabSupportGrid">
                      <label>
                        Support at landing start edge
                        <select
                          value={after.startSupport}
                          onChange={(e) =>
                            setAfter({
                              startSupport: e.target
                                .value as typeof after.startSupport,
                            })
                          }
                        >
                          {(
                            ["None", "Fixed", "Pinned", "Sliding"] as const
                          ).map((o) => (
                            <option key={o}>{o}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        {dog
                          ? "Mid-landing support (far edge)"
                          : "Support at landing far edge"}
                        <select
                          value={after.endSupport}
                          onChange={(e) =>
                            setAfter({
                              endSupport: e.target
                                .value as typeof after.endSupport,
                            })
                          }
                        >
                          {supportOpts.map((o) => (
                            <option key={o}>{o}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </>
                )}
              </div>
            );
          })}
          {!dog && input.flights.length < 3 && (
            <button
              type="button"
              className="suiteSecondary"
              onClick={addFlight}
            >
              + Add intermediate landing and flight
            </button>
          )}
          <label className={styles.inlineCheck}>
            <input
              type="checkbox"
              checked={input.topLanding.length > 0}
              onChange={(e) =>
                setLanding("topLanding", {
                  length: e.target.checked ? 1200 : 0,
                })
              }
            />
            Top landing (after the last riser)
          </label>
          {input.topLanding.length > 0 && (
            <div className="slabFieldGrid slabDimRow">
              <Numeric
                label="Length along run"
                value={input.topLanding.length}
                onChange={(v) => setLanding("topLanding", { length: v })}
              />
              <Numeric
                label="Thickness"
                value={input.topLanding.thickness}
                onChange={(v) => setLanding("topLanding", { thickness: v })}
              />
              <Numeric
                label="Width (0 = B)"
                value={input.topLanding.width}
                onChange={(v) => setLanding("topLanding", { width: v })}
              />
            </div>
          )}

          <h2>02 · Supports</h2>
          <Choice
            question="Bottom support rests on"
            value={bs.onGround ? "ground" : "suspended"}
            options={[
              ["suspended", "Suspended (beam / slab)"],
              ["ground", "Ground"],
            ]}
            onChange={(v) =>
              setBottom({
                onGround: v === "ground",
                condition:
                  v === "ground" && bs.condition === "Sliding"
                    ? "Pinned"
                    : bs.condition,
              })
            }
          />
          <div className="slabSupportGrid">
            <label>
              Bottom support
              <select
                value={bs.condition}
                onChange={(e) =>
                  setBottom({
                    condition: e.target.value as typeof bs.condition,
                  })
                }
              >
                <option>Fixed</option>
                <option>Pinned</option>
                <option>Sliding</option>
              </select>
            </label>
            <Numeric
              label={bs.onGround ? "Bottom bearing width" : "Bottom beam width"}
              value={bs.bearing}
              onChange={(v) => setBottom({ bearing: v })}
            />
            {!bs.onGround && (
              <Numeric
                label="Bottom beam depth"
                value={bs.beamDepth ?? STAIR_BEAM_DEPTH}
                onChange={(v) => setBottom({ beamDepth: v })}
              />
            )}
          </div>
          {bs.onGround && (
            <>
              {bs.condition === "Fixed" && (
                <p className="rcAlert">
                  Fixed on ground: the footing must resist the end moment;
                  Pinned is usual on soil.
                </p>
              )}
              <Choice
                question="Design the footing?"
                value={bs.footing.design ? "yes" : "no"}
                options={[
                  ["yes", "Yes — design a strip footing"],
                  ["no", "No — existing / by others (report reactions)"],
                ]}
                onChange={(v) => setFooting({ design: v === "yes" })}
              />
              {bs.footing.design && (
                <div className="slabFieldGrid slabDimRow">
                  <Numeric
                    label="Allowable bearing qa"
                    unit="kPa"
                    value={bs.footing.qa}
                    onChange={(v) => setFooting({ qa: v })}
                  />
                  <Numeric
                    label="Footing width (along run)"
                    value={bs.footing.width}
                    onChange={(v) => setFooting({ width: v })}
                  />
                  <Numeric
                    label="Footing thickness"
                    value={bs.footing.thickness}
                    onChange={(v) => setFooting({ thickness: v })}
                  />
                  <Numeric
                    label="Soil cover above footing"
                    value={bs.footing.soilCover}
                    onChange={(v) => setFooting({ soilCover: v })}
                  />
                  <Numeric
                    label="Soil unit weight"
                    unit="kN/m³"
                    value={bs.footing.soilUnitWeight}
                    onChange={(v) => setFooting({ soilUnitWeight: v })}
                  />
                  <Numeric
                    label="Base friction μ"
                    unit=""
                    value={bs.footing.friction}
                    onChange={(v) => setFooting({ friction: v })}
                  />
                  <Numeric
                    label="Cover (cast on earth)"
                    value={bs.footing.cover}
                    onChange={(v) => setFooting({ cover: v })}
                  />
                  <label>
                    Footing bar Ø
                    <RebarSizeSelect
                      ariaLabel="Footing bar diameter"
                      standard={input.rebarStandard ?? "PNS49"}
                      value={bs.footing.bars.diameter}
                      min={6}
                      max={40}
                      onChange={(d) =>
                        setFooting({
                          bars: { ...bs.footing.bars, diameter: d },
                        })
                      }
                    />
                  </label>
                  <Numeric
                    label="Footing bar spacing"
                    value={bs.footing.bars.spacing}
                    onChange={(v) =>
                      setFooting({ bars: { ...bs.footing.bars, spacing: v } })
                    }
                  />
                </div>
              )}
            </>
          )}
          <div className="slabSupportGrid">
            <label>
              Top support
              <select
                value={input.topSupport.condition}
                onChange={(e) =>
                  set("topSupport", {
                    ...input.topSupport,
                    condition: e.target
                      .value as StairsInput["topSupport"]["condition"],
                  })
                }
              >
                <option>Fixed</option>
                <option>Pinned</option>
                <option>Sliding</option>
                <option>Free</option>
              </select>
            </label>
            <Numeric
              label="Top beam width"
              value={input.topSupport.bearing}
              onChange={(v) =>
                set("topSupport", { ...input.topSupport, bearing: v })
              }
            />
            <Numeric
              label="Top / landing beam depth"
              value={input.topSupport.beamDepth ?? STAIR_BEAM_DEPTH}
              onChange={(v) =>
                set("topSupport", { ...input.topSupport, beamDepth: v })
              }
            />
          </div>
          <p className="slabMuted">
            Beam tops are flush with the landing / floor finish; beams are drawn
            for detailing and quantities only and are not designed here.
          </p>
          <Choice
            question="Seismic connection"
            value={input.seismic.connection}
            options={[
              ["integral", "Integral with floors"],
              ["isolated", "Isolated (sliding end)"],
            ]}
            onChange={(v) => set("seismic", { connection: v })}
          />

          <h2>03 · Materials & Cover</h2>
          <div className="slabFieldGrid">
            <ConcreteStrengthFields
              value={input}
              onChange={({ fc, fcPsi }) => update({ ...input, fc, fcPsi })}
            />
          </div>
          <div className="slabFieldGrid">
            <div className="slabRebarRow">
              <RebarStandardSelect
                value={input.rebarStandard ?? "PNS49"}
                onChange={(rebarStandard) =>
                  update({ ...input, rebarStandard })
                }
              />
              <label
                className={`slabNumeric${input.es !== ES_DEFAULT ? " isOverride" : ""}`}
              >
                <span>
                  Steel Es <small>(MPa)</small>
                </span>
                <input
                  type="number"
                  step="any"
                  value={Number.isFinite(input.es) ? input.es : ""}
                  onChange={(e) => set("es", num(e.target.value))}
                />
                {input.es !== ES_DEFAULT && (
                  <em className="overrideBadge">
                    Override · ACI 20.2.2.2 default 200,000
                  </em>
                )}
              </label>
              <RebarGradeSelect
                label="Steel grade (fy)"
                standard={input.rebarStandard ?? "PNS49"}
                fy={input.fy}
                gradeId={input.gradeId}
                maxFy={420}
                onChange={(fy, gradeId) => update({ ...input, fy, gradeId })}
              />
            </div>
          </div>
          <div className="slabFieldGrid slabDimRow">
            <Numeric
              label="Top clear cover"
              value={input.topCover}
              onChange={(v) => set("topCover", v)}
            />
            <Numeric
              label="Bottom clear cover"
              value={input.bottomCover}
              onChange={(v) => set("bottomCover", v)}
            />
          </div>

          <h2>04 · Reinforcement</h2>
          <div className="slabTableWrap">
            <table className="slabBars">
              <thead>
                <tr>
                  <th>Bar set</th>
                  <th>Ø mm</th>
                  <th>Spacing mm</th>
                  <th>Extension mm</th>
                  <th>
                    {input.widthMode === "full"
                      ? `No. across ${fmt(input.flightWidth / 1000, 2)} m`
                      : "No. per 1 m"}
                  </th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {barRows.map((row) => {
                  const b = input.bars[row.key];
                  return (
                    <tr
                      key={row.key}
                      className={
                        activeSet === row.key ? styles.activeRow : undefined
                      }
                      onMouseEnter={() => setActiveSet(row.key)}
                      onMouseLeave={() => setActiveSet(null)}
                      onFocusCapture={() => setActiveSet(row.key)}
                      onBlurCapture={() => setActiveSet(null)}
                      data-set={row.key}
                    >
                      <th scope="row">
                        <span
                          className={styles.chip}
                          style={{ background: stairBarColors[row.key] }}
                          aria-hidden="true"
                        />
                        <b style={{ color: stairBarColors[row.key] }}>
                          {stairBarMarks[row.key]}
                        </b>{" "}
                        {row.label}
                      </th>
                      <td>
                        <RebarSizeSelect
                          ariaLabel={`${row.label} diameter`}
                          standard={input.rebarStandard ?? "PNS49"}
                          value={b.diameter}
                          min={6}
                          max={40}
                          onChange={(d) => setBar(row.key, "diameter", d)}
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`${row.label} spacing`}
                          type="number"
                          value={Number.isFinite(b.spacing) ? b.spacing : ""}
                          onChange={(e) =>
                            setBar(row.key, "spacing", num(e.target.value))
                          }
                        />
                      </td>
                      <td>
                        {row.ext ? (
                          <input
                            aria-label={`${row.label} extension`}
                            type="number"
                            value={
                              Number.isFinite((b as Bars[TopKey]).extension)
                                ? (b as Bars[TopKey]).extension
                                : ""
                            }
                            onChange={(e) =>
                              setBar(row.key, "extension", num(e.target.value))
                            }
                          />
                        ) : (
                          "—"
                        )}
                      </td>
                      <td data-across={row.key}>
                        {row.key === "distribution"
                          ? `@ ${b.spacing} along`
                          : Number.isFinite(b.spacing) && b.spacing > 0
                            ? `${barsAcross(b.spacing)} × Ø${b.diameter}`
                            : "—"}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="slabMode"
                          disabled={!valid}
                          onClick={() => optimize(row.key)}
                          title={OPTIMIZE_TIP}
                        >
                          Optimize spacing
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="slabFieldGrid">
            <Numeric
              label="Bottom bars past each knee"
              value={input.kneeExtension}
              onChange={(v) => set("kneeExtension", v)}
            />
            <Numeric
              label="Optimize target DCR"
              unit="≤ 1.00"
              value={optimizeTarget}
              onChange={(v) =>
                setOptimizeTarget(
                  Number.isFinite(v) ? Math.min(1, Math.max(0.5, v)) : v,
                )
              }
            />
          </div>
          <p className="slabMuted">
            Extension = horizontal length each side of the support or knee. Bars
            cross at re-entrant knees (no bar bent round an inside corner).
            Hover or edit a row to highlight that bar set (mark and colour) in
            the section, plan and 3D view. Optimize spacing keeps the bar size
            and picks the largest spacing (75–300 mm) whose checks for that set
            all stay below 1.0 and at or below the target DCR.
          </p>
          <details>
            <summary>Detailing & Serviceability Settings</summary>
            <div className="slabFieldGrid">
              <Numeric
                label="Maximum aggregate"
                value={input.aggregate}
                onChange={(v) => set("aggregate", v)}
              />
              <Numeric
                label="Concrete unit weight"
                unit="kN/m³"
                value={input.unitWeight}
                onChange={(v) => set("unitWeight", v)}
              />
              <Numeric
                label="Immediate live Δ limit ℓ /"
                unit=""
                value={input.deflection.immediateDivisor}
                onChange={(v) =>
                  set("deflection", {
                    ...input.deflection,
                    immediateDivisor: v,
                  })
                }
              />
              <Numeric
                label="Long-term + live Δ limit ℓ /"
                unit=""
                value={input.deflection.totalDivisor}
                onChange={(v) =>
                  set("deflection", { ...input.deflection, totalDivisor: v })
                }
              />
              <Numeric
                label="Riser max (advisory)"
                value={input.geometryLimits.riserMax}
                onChange={(v) =>
                  set("geometryLimits", {
                    ...input.geometryLimits,
                    riserMax: v,
                  })
                }
              />
              <Numeric
                label="Going min (advisory)"
                value={input.geometryLimits.goingMin}
                onChange={(v) =>
                  set("geometryLimits", {
                    ...input.geometryLimits,
                    goingMin: v,
                  })
                }
              />
              <Numeric
                label="2R + T min"
                value={input.geometryLimits.blondelMin}
                onChange={(v) =>
                  set("geometryLimits", {
                    ...input.geometryLimits,
                    blondelMin: v,
                  })
                }
              />
              <Numeric
                label="2R + T max"
                value={input.geometryLimits.blondelMax}
                onChange={(v) =>
                  set("geometryLimits", {
                    ...input.geometryLimits,
                    blondelMax: v,
                  })
                }
              />
            </div>
            <p className="slabMuted">
              Advisory limits default to IBC 2018 §1011.5.2; enter local PD 1096
              / RA 9514 values as required.
            </p>
          </details>
        </aside>

        <div className="slabCenter">
          <div
            className="slabTabs"
            role="tablist"
            aria-label="Stairs workspace view"
          >
            <button
              role="tab"
              aria-selected={tab === "drawings"}
              onClick={() => setTab("drawings")}
            >
              Section & plan
            </button>
            <button
              role="tab"
              aria-selected={tab === "analysis"}
              onClick={() => setTab("analysis")}
            >
              Loads & analysis
            </button>
            <button
              role="tab"
              aria-selected={tab === "3d"}
              onClick={() => setTab("3d")}
            >
              3D view with loads
            </button>
          </div>
          {tab === "3d" && (
            <section className="slabPanel slab3dPanel">
              {valid ? (
                <Stair3DView
                  input={valid}
                  highlight={activeSet}
                  onSnapshot={setSnapshot3d}
                />
              ) : (
                <p className="slabMuted">
                  Complete valid inputs to view the stair in 3D.
                </p>
              )}
            </section>
          )}
          <section
            className={`slabPanel slabDrawing ${tab === "drawings" ? "" : "slabScreenHidden"}`}
          >
            {valid ? (
              <>
                <StairSection input={valid} highlight={activeSet} />
                <StairPlan input={valid} highlight={activeSet} />
              </>
            ) : (
              <p className="slabMuted">
                Complete valid inputs to draw the stair.
              </p>
            )}
            <p className="slabMuted">
              True scale. Supports drawn at their centrelines with the bearing
              width; dimensions in mm. Bar ends and anchorage into supports are
              shown schematically — see the detailing checks.
            </p>
          </section>
          <section
            className={`slabPanel slabLoads ${tab === "analysis" ? "" : "slabScreenHidden"}`}
          >
            <h2>Uniform Loads & Combinations</h2>
            <div className="slabFieldGrid slabDimRow">
              <Numeric
                label="Finishes on plan"
                unit="kPa"
                value={input.finishes}
                onChange={(v) => set("finishes", v)}
              />
              <Numeric
                label="Soffit finish (sloping)"
                unit="kPa"
                value={input.soffitFinish}
                onChange={(v) => set("soffitFinish", v)}
              />
              <Numeric
                label="Live load"
                unit="kPa"
                value={input.live}
                onChange={(v) => set("live", v)}
              />
              <Numeric
                label="Sustained live fraction ψ"
                unit=""
                value={input.sustainedLiveFactor}
                onChange={(v) => set("sustainedLiveFactor", v)}
              />
            </div>
            <p className="slabMuted">
              Live load default 4.8 kPa (stairs and exits, NSCP 2015 Table 205-1
              / ASCE 7-16 Table 4.3-1) — confirm for the occupancy. Self-weight
              is computed: waist γt/cosθ + steps γR/2 on plan.
            </p>
            <div className="slabTableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Combination</th>
                    <th>D factor</th>
                    <th>L factor</th>
                    <th>Included</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {input.combinations.map((c, k) => (
                    <tr key={k}>
                      <td>
                        <input
                          aria-label={`Combination ${k + 1} label`}
                          value={c.id}
                          onChange={(e) =>
                            set(
                              "combinations",
                              input.combinations.map((x, n) =>
                                n === k ? { ...x, id: e.target.value } : x,
                              ),
                            )
                          }
                        />
                      </td>
                      {(["deadFactor", "liveFactor"] as const).map((f) => (
                        <td key={f}>
                          <input
                            aria-label={`Combination ${k + 1} ${f}`}
                            type="number"
                            step="any"
                            value={Number.isFinite(c[f]) ? c[f] : ""}
                            onChange={(e) =>
                              set(
                                "combinations",
                                input.combinations.map((x, n) =>
                                  n === k
                                    ? { ...x, [f]: num(e.target.value) }
                                    : x,
                                ),
                              )
                            }
                          />
                        </td>
                      ))}
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Include ${c.id}`}
                          checked={c.included}
                          onChange={(e) =>
                            set(
                              "combinations",
                              input.combinations.map((x, n) =>
                                n === k
                                  ? { ...x, included: e.target.checked }
                                  : x,
                              ),
                            )
                          }
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          disabled={input.combinations.length <= 1}
                          onClick={() =>
                            set(
                              "combinations",
                              input.combinations.filter((_, n) => n !== k),
                            )
                          }
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              className="suiteSecondary"
              onClick={() =>
                set("combinations", [
                  ...input.combinations,
                  {
                    id: `LC${input.combinations.length + 1}`,
                    deadFactor: 1.2,
                    liveFactor: 1.0,
                    included: true,
                  },
                ])
              }
            >
              + Add combination
            </button>
            <h2>Local Loads</h2>
            <p className="slabMuted">
              Position x is horizontal from the {dog ? "strip's" : "bottom"}{" "}
              support centreline (mm). Point and area widths are across the
              stair. Line loads act across the full width.
            </p>
            <div className={styles.choice}>
              {(["point", "line", "area"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => addLocal(k)}
                  disabled={input.localLoads.length >= 10}
                >
                  + {k[0].toUpperCase() + k.slice(1)} load
                </button>
              ))}
            </div>
            {input.localLoads.length > 0 && (
              <div className="slabTableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>Label</th>
                      <th>Type</th>
                      {dog && <th>Flight</th>}
                      <th>Case</th>
                      <th>x / x0 mm</th>
                      <th>x1 mm</th>
                      <th>Value</th>
                      <th>Width mm</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {input.localLoads.map((l, k) => (
                      <tr key={k}>
                        <td>
                          <input
                            aria-label={`Local load ${k + 1} label`}
                            value={l.id}
                            onChange={(e) =>
                              editLocal(k, { id: e.target.value })
                            }
                          />
                        </td>
                        <td>{l.kind}</td>
                        {dog && (
                          <td>
                            <select
                              aria-label={`Local load ${k + 1} flight`}
                              value={l.strip ?? 1}
                              onChange={(e) =>
                                editLocal(k, { strip: Number(e.target.value) })
                              }
                            >
                              <option value={1}>1</option>
                              <option value={2}>2</option>
                            </select>
                          </td>
                        )}
                        <td>
                          <select
                            aria-label={`Local load ${k + 1} case`}
                            value={l.case}
                            onChange={(e) =>
                              editLocal(k, { case: e.target.value })
                            }
                          >
                            <option value="dead">Dead</option>
                            <option value="live">Live</option>
                          </select>
                        </td>
                        <td>
                          <input
                            aria-label={`Local load ${k + 1} position`}
                            type="number"
                            value={
                              l.kind === "area"
                                ? Number.isFinite(l.x0)
                                  ? l.x0
                                  : ""
                                : Number.isFinite(l.x)
                                  ? l.x
                                  : ""
                            }
                            onChange={(e) =>
                              editLocal(
                                k,
                                l.kind === "area"
                                  ? { x0: num(e.target.value) }
                                  : { x: num(e.target.value) },
                              )
                            }
                          />
                        </td>
                        <td>
                          {l.kind === "area" ? (
                            <input
                              aria-label={`Local load ${k + 1} end`}
                              type="number"
                              value={Number.isFinite(l.x1) ? l.x1 : ""}
                              onChange={(e) =>
                                editLocal(k, { x1: num(e.target.value) })
                              }
                            />
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          <input
                            aria-label={`Local load ${k + 1} value`}
                            type="number"
                            step="any"
                            value={Number.isFinite(l.value) ? l.value : ""}
                            onChange={(e) =>
                              editLocal(k, { value: num(e.target.value) })
                            }
                          />{" "}
                          <small>
                            {l.kind === "point"
                              ? "kN"
                              : l.kind === "line"
                                ? "kN/m"
                                : "kPa"}
                          </small>
                        </td>
                        <td>
                          {l.kind === "line" ? (
                            "full"
                          ) : (
                            <input
                              aria-label={`Local load ${k + 1} width`}
                              type="number"
                              value={Number.isFinite(l.width) ? l.width : ""}
                              onChange={(e) =>
                                editLocal(k, { width: num(e.target.value) })
                              }
                            />
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            onClick={() =>
                              set(
                                "localLoads",
                                input.localLoads.filter((_, n) => n !== k),
                              )
                            }
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {r && (
              <>
                <h2>Analysis Results (per metre width)</h2>
                {r.strips.map((s) => (
                  <div key={s.geometry.index}>
                    <StairForceDiagrams strip={s} />
                    <div className="slabTableWrap">
                      <table className={styles.reaction}>
                        <caption>
                          Support reactions · {s.geometry.label} (kN per m width
                          = line load along the supporting beam, kN/m; + up / +
                          toward the run)
                        </caption>
                        <thead>
                          <tr>
                            <th>Support</th>
                            <th>V dead</th>
                            <th>V live</th>
                            <th>V service</th>
                            <th>H service</th>
                            <th>Vu max (combo)</th>
                            <th>Vu min</th>
                            <th>|Hu| max</th>
                            <th>|Mu| max kN·m/m</th>
                            {full && <th>V service × B (kN)</th>}
                            {full && <th>Vu max × B (kN)</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {s.reactions.map((x) => (
                            <tr key={x.support.id}>
                              <th>
                                {x.support.label} · {x.support.condition}
                              </th>
                              <td>{fmt(x.dead.v)}</td>
                              <td>{fmt(x.live.v)}</td>
                              <td>{fmt(x.service.v)}</td>
                              <td>{fmt(x.service.h)}</td>
                              <td>
                                {fmt(x.factored.vMax)} ({x.factored.combination}
                                )
                              </td>
                              <td>{fmt(x.factored.vMin)}</td>
                              <td>{fmt(x.factored.hAbsMax)}</td>
                              <td>{fmt(x.factored.mAbsMax)}</td>
                              {full && (
                                <td>{fmt(x.service.v * (x.widthM ?? 1))}</td>
                              )}
                              {full && (
                                <td>
                                  {fmt(x.factored.vMax * (x.widthM ?? 1))}
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="slabTableWrap">
                      <table>
                        <caption>Spans · thickness and deflection</caption>
                        <thead>
                          <tr>
                            <th>Span</th>
                            <th>ℓ developed mm</th>
                            <th>hmin / h mm</th>
                            <th>Ie/Ig</th>
                            <th>Δ live mm</th>
                            <th>Δ long-term + live mm</th>
                            <th>Limits mm</th>
                          </tr>
                        </thead>
                        <tbody>
                          {s.spans.map((sp) => (
                            <tr key={sp.label}>
                              <th>{sp.label}</th>
                              <td>{fmt(sp.developed, 0)}</td>
                              <td>
                                {fmt(sp.hmin, 0)} / {sp.hProvided}
                              </td>
                              <td>{fmt(sp.ieRatio, 3)}</td>
                              <td>{fmt(sp.immediateLive)}</td>
                              <td>{fmt(sp.total)}</td>
                              <td>
                                {fmt(sp.limitImmediate)} / {fmt(sp.limitTotal)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </>
            )}
          </section>
        </div>

        <aside className="slabPanel slabSummary">
          <h2>Design Checks</h2>
          <div className="slabStatus">
            <DesignStatus dcr={maxDcr} policy={policy} />
            <span>Governing DCR {fmt(maxDcr, 3)}</span>
          </div>
          {r && (
            <dl>
              <div>
                <dt>Pitch θ</dt>
                <dd>{fmt(r.pitch.degrees, 2)}°</dd>
              </div>
              <div>
                <dt>Flight dead load (plan)</dt>
                <dd>
                  {fmt(flightDead?.total)} kPa
                  <small>
                    {" "}
                    waist {fmt(flightDead?.waist)} + steps{" "}
                    {fmt(flightDead?.steps)} + finishes{" "}
                    {fmt(flightDead?.finishes)} + soffit{" "}
                    {fmt(flightDead?.soffit)}
                  </small>
                </dd>
              </div>
              {r.loads.landings.map((l) => (
                <div key={l.label}>
                  <dt>{l.label} dead load</dt>
                  <dd>{fmt(l.dead)} kPa</dd>
                </div>
              ))}
              {full && flightDead && (
                <div>
                  <dt>Flight line load (× B {fmt(widthM, 2)} m)</dt>
                  <dd>
                    D {fmt(flightDead.total * widthM)} · L{" "}
                    {fmt(input.live * widthM)} kN/m
                    <small> along the flight, on plan</small>
                  </dd>
                </div>
              )}
              {full &&
                r.strips.map((st) => {
                  const d = st.reactions.reduce((a, x) => a + x.dead.v, 0),
                    l = st.reactions.reduce((a, x) => a + x.live.v, 0);
                  return (
                    <div key={`tot${st.geometry.index}`}>
                      <dt>
                        Total load · {st.geometry.label.replace(" strip", "")}
                      </dt>
                      <dd>
                        D {fmt(d * widthM, 1)} + L {fmt(l * widthM, 1)} ={" "}
                        {fmt((d + l) * widthM, 1)} kN
                      </dd>
                    </div>
                  );
                })}
              <div>
                <dt>Mu+ / Mu− max</dt>
                <dd>
                  {fmt(Math.max(0, ...allSt.map((s) => s.mPos)))} /{" "}
                  {fmt(Math.min(0, ...allSt.map((s) => s.mNeg)))} kN·m/m
                  {full && (
                    <small>
                      {" "}
                      × B ={" "}
                      {fmt(
                        Math.max(0, ...allSt.map((s) => s.mPos)) * widthM,
                      )} /{" "}
                      {fmt(Math.min(0, ...allSt.map((s) => s.mNeg)) * widthM)}{" "}
                      kN·m
                    </small>
                  )}
                </dd>
              </div>
              <div>
                <dt>|Vu| max</dt>
                <dd>
                  {fmt(Math.max(0, ...allSt.map((s) => s.vu)))} kN/m
                  {full && (
                    <small>
                      {" "}
                      × B ={" "}
                      {fmt(Math.max(0, ...allSt.map((s) => s.vu)) * widthM)} kN
                    </small>
                  )}
                </dd>
              </div>
              <div>
                <dt>Long-term Δ max</dt>
                <dd>{fmt(Math.max(0, ...allSpans.map((s) => s.total)))} mm</dd>
              </div>
              {r.footing && (
                <div>
                  <dt>Footing q,max / qa</dt>
                  <dd>
                    {fmt(r.footing.qMax, 1)} / {fmt(r.footing.qa, 0)} kPa
                  </dd>
                </div>
              )}
            </dl>
          )}
          {r && (
            <ul className="slabWarnings">
              {checks
                .filter((c) => (c.dcr ?? Infinity) > policy.passThrough)
                .map((c) => (
                  <li key={c.id}>
                    {c.label}: DCR {fmt(c.dcr, 2)}
                  </li>
                ))}
            </ul>
          )}
        </aside>
      </div>

      {r && (r.warnings.length > 0 || r.notes.length > 0) && (
        <section className="slabPanel">
          <h2>Warnings & Notes</h2>
          <ul className="slabWarnings">
            {r.warnings.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          <ul className={styles.notes}>
            {r.notes.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </section>
      )}
      {r && (
        <h2 className={styles.reviewHeading}>
          DCR-Based Design Checks · by flight
        </h2>
      )}
      {r
        ? sections.map((sec, k) => (
            <div key={sec.title} data-section={sec.title}>
              <DesignReviewPanel
                module="slab"
                compact={k > 0}
                title={`${sec.title} · governing DCR ${fmt(sec.governing, 3)} · ${designCheckStatus(sec.governing, policy).label}`}
                checks={sec.checks}
                policy={policy}
                remarks={remarks}
                onChange={(next) => {
                  editVersion.current++;
                  setSaved(false);
                  setRemarks(next);
                }}
              />
            </div>
          ))
        : null}
      {r && (
        <section className="slabPanel">
          <h2>Quantity Estimate</h2>
          <button
            type="button"
            className={estimateOn ? "suiteSecondary" : "suitePrimary"}
            aria-pressed={estimateOn}
            onClick={() => {
              editVersion.current++;
              setSaved(false);
              setEstimateOn(!estimateOn);
            }}
          >
            {estimateOn
              ? "Disable Quantity Estimate"
              : "Enable Quantity Estimate"}
          </button>
          {!estimateOn && (
            <p className="slabMuted">
              Concrete, formwork and bar schedule for the selected design width.
              Off by default; the setting is saved with the calculation.
            </p>
          )}
        </section>
      )}
      {quantity && !quantity.error && (
        <section className="slabPanel">
          <h2>
            Quantity Estimate ·{" "}
            {input.widthMode === "full"
              ? `full flight width ${fmt(quantity.widthM, 3)} m`
              : "per 1 m strip"}
          </h2>
          <div className={styles.qtyTotals}>
            <div>
              <small>Concrete</small>
              <b>{fmt(quantity.totals.concrete, 3)} m³</b>
            </div>
            <div>
              <small>Formwork</small>
              <b>{fmt(quantity.totals.formwork, 2)} m²</b>
            </div>
            <div>
              <small>Reinforcement</small>
              <b>{fmt(quantity.totals.steel, 1)} kg</b>
            </div>
            <div>
              <small>Steel ratio</small>
              <b>{fmt(quantity.totals.steelRatio, 0)} kg/m³</b>
            </div>
          </div>
          <div className="slabTableWrap">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Part</th>
                  <th>Quantity</th>
                  <th>Basis</th>
                </tr>
              </thead>
              <tbody>
                {[...quantity.concrete, ...quantity.formwork].map((q, k) => (
                  <tr key={k}>
                    <th>{q.item}</th>
                    <td>{q.strip}</td>
                    <td>
                      {fmt(q.quantity, 3)} {q.unit}
                    </td>
                    <td>{q.basis}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="slabTableWrap">
            <table>
              <caption>Bar schedule</caption>
              <thead>
                <tr>
                  <th>Mark</th>
                  <th>Description</th>
                  <th>Part</th>
                  <th>Ø @ s</th>
                  <th>No.</th>
                  <th>Length mm</th>
                  <th>Mass kg</th>
                </tr>
              </thead>
              <tbody>
                {quantity.bars.map((b) => (
                  <tr key={b.mark}>
                    <th>{b.mark}</th>
                    <td>{b.label}</td>
                    <td>{b.strip}</td>
                    <td>
                      Ø{b.diameter} @ {b.spacing}
                    </td>
                    <td>{b.count}</td>
                    <td>{fmt(b.length, 0)}</td>
                    <td>{fmt(b.mass, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className={styles.notes}>
            {quantity.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
