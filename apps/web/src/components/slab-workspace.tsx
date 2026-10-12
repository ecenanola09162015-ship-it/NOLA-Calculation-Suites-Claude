"use client";
import { useMemo, useRef, useState } from "react";
import {
  analyzeSlab,
  defaultDesignCheckPolicy,
  slabDesignChecks,
  missingJudgmentRemarks,
  type DesignRemarks,
  defaultSlabQuantity,
  type SlabQuantityInput,
  defaultSlabInput,
  parseSlabLoads,
  resolveSlabBars,
  slabBarElevation,
  slabDraftSchema,
  slabLayers,
  type SlabInput,
  type SlabLayer,
  type SlabResult,
} from "@nola/calc-core";
import { DesignReviewPanel, DesignStatus } from "./design-review-panel";
import type { ProjectRecord, CalculationDraftRecord } from "@/lib/projects";
import { SlabQuantityPanel } from "./slab-quantity-panel";
import { SlabPlan, SlabSection } from "./slab-diagrams";
const fmt = (n: number | null | undefined, p = 2) =>
  n === null || n === undefined || !Number.isFinite(n)
    ? "—"
    : n.toLocaleString("en-US", {
        minimumFractionDigits: p,
        maximumFractionDigits: p,
      });
const layerLabel = (layer: SlabLayer) => layer.replace("-", " · ");
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
        onChange={(e) =>
          onChange(e.target.value === "" ? NaN : Number(e.target.value))
        }
      />
    </label>
  );
}
export function SlabWorkspace({
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
    () => slabDraftSchema.safeParse(draft?.payload),
    [draft],
  );
  const [input, setInput] = useState<SlabInput>(() =>
    restored.success ? restored.data.input : defaultSlabInput(),
  );
  const [quantity, setQuantity] = useState<SlabQuantityInput>(() =>
    restored.success
      ? (restored.data.quantity ??
        defaultSlabQuantity(restored.data.input.supportWidth))
      : defaultSlabQuantity(),
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
  const [title, setTitle] = useState(draft?.title ?? "Slab Design — SL-01");
  const [id, setId] = useState<string | undefined>(
    restored.success ? draft?.id : undefined,
  );
  const [tab, setTab] = useState<"layout" | "calculations">("layout");
  const [view, setView] = useState<"both" | "bottom" | "top">("both");
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(!!restored.success);
  const [paste, setPaste] = useState(""),
    [loadPreview, setLoadPreview] = useState<SlabInput["loads"] | null>(null),
    [pasteError, setPasteError] = useState("");
  const [recommendations, setRecommendations] = useState<
    SlabResult["recommendations"]
  >([]);
  const editVersion = useRef(0);
  const analysis = useMemo(() => {
    try {
      return { result: analyzeSlab(input, false), error: "" };
    } catch (e) {
      return {
        result: null,
        error: e instanceof Error ? e.message : "Check numerical inputs.",
      };
    }
  }, [input]);
  const bars = useMemo(() => {
    try {
      return resolveSlabBars(input);
    } catch {
      return [];
    }
  }, [input]);
  const r = analysis.result,
    oneWay = Math.max(input.lx, input.ly) / Math.min(input.lx, input.ly) >= 2;
  function update(next: SlabInput) {
    editVersion.current++;
    setInput(next);
    setSaved(false);
    setRecommendations([]);
    setMessage("");
  }
  function change(key: keyof SlabInput, value: number) {
    update({ ...input, [key]: value });
  }
  function editBar(
    group: "main" | "extra",
    layer: SlabLayer,
    key: "spacing" | "diameter" | "elevation" | "enabled",
    value: number | null | boolean,
  ) {
    update({
      ...input,
      [group]: {
        ...input[group],
        [layer]: { ...input[group][layer], [key]: value },
      },
    });
  }
  function barTable(group: "main" | "extra") {
    return (
      <div className="slabTableWrap">
        <table className="slabBars">
          <caption
            className={group === "main" ? "slabMainLabel" : "slabExtraLabel"}
          >
            {group === "main"
              ? "MAIN BARS · Continuous"
              : "EXTRA BARS · Cut off, full distribution width"}
          </caption>
          <thead>
            <tr>
              <th>Layer</th>
              <th>Ø mm</th>
              <th>Spacing mm</th>
              <th>Elevation z mm</th>
              <th>Mode</th>
            </tr>
          </thead>
          <tbody>
            {slabLayers.map((layer) => {
              const b = input[group][layer],
                excluded =
                  group === "extra" && oneWay && layer.startsWith("long");
              const elevation =
                b.elevation === null
                  ? slabBarElevation(input, group, layer)
                  : b.elevation;
              return (
                <tr key={layer} className={excluded ? "slabExcluded" : ""}>
                  <th scope="row">
                    {group === "extra" && (
                      <input
                        type="checkbox"
                        aria-label={`Enable extra ${layerLabel(layer)}`}
                        checked={b.enabled}
                        disabled={excluded}
                        onChange={(e) =>
                          editBar(group, layer, "enabled", e.target.checked)
                        }
                      />
                    )}{" "}
                    {layerLabel(layer)}
                    {excluded && <small>One-way: excluded</small>}
                  </th>
                  <td>
                    <input
                      aria-label={`${group} ${layer} diameter`}
                      type="number"
                      min="6"
                      max="40"
                      value={Number.isFinite(b.diameter) ? b.diameter : ""}
                      disabled={excluded}
                      onChange={(e) =>
                        editBar(
                          group,
                          layer,
                          "diameter",
                          e.target.value === "" ? NaN : Number(e.target.value),
                        )
                      }
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`${group} ${layer} spacing`}
                      type="number"
                      min="20"
                      value={Number.isFinite(b.spacing) ? b.spacing : ""}
                      disabled={excluded}
                      onChange={(e) =>
                        editBar(
                          group,
                          layer,
                          "spacing",
                          e.target.value === "" ? NaN : Number(e.target.value),
                        )
                      }
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`${group} ${layer} elevation from soffit`}
                      type="number"
                      value={
                        Number.isFinite(elevation)
                          ? Number(elevation.toFixed(2))
                          : ""
                      }
                      disabled={excluded || b.elevation === null}
                      onChange={(e) =>
                        editBar(
                          group,
                          layer,
                          "elevation",
                          e.target.value === "" ? NaN : Number(e.target.value),
                        )
                      }
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="slabMode"
                      disabled={excluded || !Number.isFinite(elevation)}
                      onClick={() =>
                        editBar(
                          group,
                          layer,
                          "elevation",
                          b.elevation === null
                            ? slabBarElevation(input, group, layer)
                            : null,
                        )
                      }
                    >
                      {b.elevation === null ? "Auto" : "Override"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }
  async function save() {
    if (!project) return;
    const version = editVersion.current;
    setBusy(true);
    setMessage("");
    try {
      const parsed = slabDraftSchema.safeParse({
        kind: "slab",
        version: 1,
        input,
        quantity,
        designPolicy: policy,
        remarks,
        reviewCompleted: !!r,
      });
      if (!parsed.success || !title.trim())
        throw new Error(
          "Complete valid inputs and a calculation title before saving.",
        );
      if (
        r &&
        missingJudgmentRemarks(slabDesignChecks(input, r), policy, remarks)
          .length
      )
        throw Error("Add Remarks For Each Amber Design Check Before Saving.");
      const response = await fetch("/api/calculations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          projectId: project.id,
          moduleSlug: "slab",
          title,
          payload: parsed.data,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Save failed.");
      setId(body.draft.id);
      setSaved(
        version === editVersion.current && livePolicy.current === policyKey,
      );
      setSavedPolicy(policyKey);
      onSaved(body.draft);
      setMessage(
        version === editVersion.current
          ? "Slab inputs saved. Reopen this calculation from the project explorer."
          : "Earlier inputs saved; newer edits remain unsaved.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }
  function previewLoads(text: string) {
    setPaste(text);
    try {
      setLoadPreview(parseSlabLoads(text));
      setPasteError("");
    } catch (e) {
      setLoadPreview(null);
      setPasteError(e instanceof Error ? e.message : "Invalid loads.");
    }
  }
  function importLoads(append: boolean) {
    if (!loadPreview) return;
    const loads = append ? [...input.loads, ...loadPreview] : loadPreview;
    if (
      loads.length > 100 ||
      new Set(loads.map((l) => l.id)).size !== loads.length
    ) {
      setPasteError(
        "Use at most 100 unique combination labels. Existing loads are unchanged.",
      );
      return;
    }
    update({ ...input, loads });
    setLoadPreview(null);
    setPaste("");
    setPasteError("");
    setMessage("Load combinations imported. Results updated.");
  }
  const maxDcr = r
    ? Math.max(...slabDesignChecks(input, r).map((c) => c.dcr ?? Infinity))
    : null;
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
              setSaved(false);
            }}
          />
        </label>
        <label>
          Project code
          <select
            value={input.code}
            onChange={(e) =>
              update({ ...input, code: e.target.value as SlabInput["code"] })
            }
          >
            <option>ACI 318-19</option>
            <option value="NSCP 2015">NSCP 2015</option>
            <option disabled>BS EN 1992 — Future Development</option>
            <option disabled>AS 3600 — Future Development</option>
          </select>
        </label>
        <button
          className="suitePrimary"
          onClick={save}
          disabled={busy || !project || !cloudReady || !r}
        >
          {busy
            ? "Saving…"
            : saved && savedPolicy === policyKey
              ? "Saved"
              : "Save slab"}
        </button>
        <button
          className="suiteSecondary"
          disabled={!r}
          onClick={() => window.print()}
        >
          Print / PDF report
        </button>
      </div>
      <p className="slabPilot">
        Development pilot ·{" "}
        {input.code === "NSCP 2015"
          ? "Project standard: NSCP 2015. Calculation basis: ACI 318-19."
          : "Calculation basis: ACI 318-19."}{" "}
        Independent engineering review required.
      </p>
      {!project && <p>Create or select a project to save this calculation.</p>}
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
          <h2>Slab Inputs</h2>
          <div className="slabFieldGrid">
            <Numeric
              label="Span X"
              value={input.lx}
              unit="m"
              onChange={(v) => change("lx", v)}
            />
            <Numeric
              label="Span Y"
              value={input.ly}
              unit="m"
              onChange={(v) => change("ly", v)}
            />
            <Numeric
              label="Slab Thickness"
              value={input.h}
              onChange={(v) => change("h", v)}
            />
            <Numeric
              label="Top Clear Cover"
              value={input.topCover}
              onChange={(v) => change("topCover", v)}
            />
            <Numeric
              label="Bottom Clear Cover"
              value={input.bottomCover}
              onChange={(v) => change("bottomCover", v)}
            />
            <Numeric
              label="Side Clear Cover"
              value={input.sideCover}
              onChange={(v) => change("sideCover", v)}
            />
            <Numeric
              label="Concrete f′c"
              value={input.fc}
              unit="MPa"
              onChange={(v) => change("fc", v)}
            />
            <Numeric
              label="Steel fy"
              value={input.fy}
              unit="MPa"
              onChange={(v) => change("fy", v)}
            />
          </div>
          <p className="slabClassification">
            Auto: {r?.type.toUpperCase() ?? "CHECK INPUTS"} · Long/short{" "}
            {fmt(r?.ratio)} · Short span {r?.shortAxis ?? "—"}
          </p>
          <p className="slabMuted">
            Spans are the designer-selected analysis spans. Verify effective
            span and support idealization; no multi-panel continuity is
            inferred.
          </p>
          <div className="slabSupportGrid">
            {(["west", "east", "south", "north"] as const).map((edge) => (
              <label key={edge}>
                {edge.toUpperCase()} support
                <select
                  value={input.supports[edge]}
                  onChange={(e) =>
                    update({
                      ...input,
                      supports: { ...input.supports, [edge]: e.target.value },
                    })
                  }
                >
                  <option>Fixed</option>
                  <option>Pinned</option>
                </select>
              </label>
            ))}
          </div>
          {barTable("main")}
          {barTable("extra")}
          <p className="slabMuted">
            Elevation z is the bar centerline above the soffit. Auto gives
            short-span steel the larger effective depth. Click Override to edit;
            click Auto to restore. Inactive extra layers do not contribute.
            Entered spacing is a maximum; bar grids fit the width and extra bars
            are staggered between main bars. Actual pitch and counts are listed
            in the report.
          </p>
          <details open>
            <summary id="slab-cutoffs">Extra-Bar Cutoff Lengths</summary>
            <p className="slabMuted">
              Fractions of the span along each bar. Distribution covers the full
              transverse width. Top extras are credited at Fixed supports only.
            </p>
            <div className="slabFieldGrid">
              <Numeric
                label="Bottom Start / L"
                unit=""
                value={input.cutoffs.bottomStart}
                onChange={(v) =>
                  update({
                    ...input,
                    cutoffs: { ...input.cutoffs, bottomStart: v },
                  })
                }
              />
              <Numeric
                label="Bottom End / L"
                unit=""
                value={input.cutoffs.bottomEnd}
                onChange={(v) =>
                  update({
                    ...input,
                    cutoffs: { ...input.cutoffs, bottomEnd: v },
                  })
                }
              />
              {(["west", "east", "south", "north"] as const).map((edge) => (
                <Numeric
                  key={edge}
                  label={`${edge} top extension / L`}
                  unit=""
                  value={input.cutoffs[edge]}
                  onChange={(v) =>
                    update({
                      ...input,
                      cutoffs: { ...input.cutoffs, [edge]: v },
                    })
                  }
                />
              ))}
            </div>
          </details>
          <details>
            <summary>Detailing & Serviceability Settings</summary>
            <div className="slabFieldGrid">
              <Numeric
                label="Maximum Aggregate"
                value={input.aggregate}
                onChange={(v) => change("aggregate", v)}
              />
              <Numeric
                label="Support Width (Diagram)"
                value={input.supportWidth}
                onChange={(v) => change("supportWidth", v)}
              />
              <Numeric
                label="DCR Criterion"
                value={input.dcrLimit}
                unit=""
                onChange={(v) => change("dcrLimit", v)}
              />
              <Numeric
                label="Immediate Limit L /"
                value={input.deflectionDivisor}
                unit=""
                onChange={(v) => change("deflectionDivisor", v)}
              />
              <Numeric
                label="Poisson Ratio"
                value={input.nu}
                unit=""
                onChange={(v) => change("nu", v)}
              />
              <Numeric
                label="Steel Es"
                value={input.es}
                unit="MPa"
                onChange={(v) => change("es", v)}
              />
              <Numeric
                label="Concrete Unit Weight"
                value={input.unitWeight}
                unit="kN/m³"
                onChange={(v) => change("unitWeight", v)}
              />
            </div>
          </details>
        </aside>
        <div className="slabCenter">
          <div
            className="slabTabs"
            role="tablist"
            aria-label="Slab workspace view"
          >
            <button
              role="tab"
              aria-selected={tab === "layout"}
              onClick={() => setTab("layout")}
            >
              Reinforcement layout
            </button>
            <button
              role="tab"
              aria-selected={tab === "calculations"}
              onClick={() => setTab("calculations")}
            >
              Calculations & loads
            </button>
          </div>
          <section
            className={`slabPanel slabDrawing ${tab === "layout" ? "" : "slabScreenHidden"}`}
          >
            <div className="slabLegend">
              <span className="slabMainLabel">━ MAIN BARS · Continuous</span>
              <span className="slabExtraLabel">━ EXTRA BARS · Cut off</span>
            </div>
            <div className="slabViewButtons">
              {(["bottom", "top", "both"] as const).map((v) => (
                <button
                  key={v}
                  aria-pressed={view === v}
                  onClick={() => setView(v)}
                >
                  {v === "both" ? "Both plans" : `${v} plan`}
                </button>
              ))}
            </div>
            <div className="slabPlans">
              {(view === "both" || view === "bottom") && (
                <SlabPlan input={input} bars={bars} face="bottom" />
              )}
              {(view === "both" || view === "top") && (
                <SlabPlan input={input} bars={bars} face="top" />
              )}
            </div>
            <SlabSection input={input} bars={bars} direction="short" />
            <SlabSection input={input} bars={bars} direction="long" />
            <p className="slabMuted">
              Main bars are continuous; extras have limited lengths and repeat
              across the full distribution width. Dashed extra lines in sections
              distinguish coincident elevations. End anchorage is not depicted
              as verified detailing.
            </p>
          </section>
          <section
            className={`slabPanel slabLoads ${tab === "calculations" ? "" : "slabScreenHidden"}`}
          >
            <h2>Uniform Loads & Combinations</h2>
            <div className="slabFieldGrid">
              <Numeric
                label="Superimposed Dead"
                value={input.sdl}
                unit="kPa"
                onChange={(v) => change("sdl", v)}
              />
              <Numeric
                label="Partition Dead"
                value={input.partition}
                unit="kPa"
                onChange={(v) => change("partition", v)}
              />
              <Numeric
                label="Live Load"
                value={input.live}
                unit="kPa"
                onChange={(v) => change("live", v)}
              />
            </div>
            <p>
              D = self-weight + SDL + partitions ={" "}
              <strong>{fmt(r?.dead)} kPa</strong>. Factored load = γD × D + γL ×
              L.
            </p>
            <div className="slabTableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Use</th>
                    <th>ID</th>
                    <th>γD</th>
                    <th>γL</th>
                    <th>Service L factor</th>
                    <th>wu kPa</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {input.loads.map((l, k) => (
                    <tr key={k}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Include ${l.id}`}
                          checked={l.included}
                          onChange={(e) =>
                            update({
                              ...input,
                              loads: input.loads.map((a, n) =>
                                n === k
                                  ? { ...a, included: e.target.checked }
                                  : a,
                              ),
                            })
                          }
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`Combination ${k + 1} ID`}
                          value={l.id}
                          onChange={(e) =>
                            update({
                              ...input,
                              loads: input.loads.map((a, n) =>
                                n === k ? { ...a, id: e.target.value } : a,
                              ),
                            })
                          }
                        />
                      </td>
                      {(
                        [
                          "deadFactor",
                          "liveFactor",
                          "serviceLiveFactor",
                        ] as const
                      ).map((key) => (
                        <td key={key}>
                          <input
                            aria-label={`${l.id} ${key}`}
                            type="number"
                            step="any"
                            value={Number.isFinite(l[key]) ? l[key] : ""}
                            onChange={(e) =>
                              update({
                                ...input,
                                loads: input.loads.map((a, n) =>
                                  n === k
                                    ? {
                                        ...a,
                                        [key]:
                                          e.target.value === ""
                                            ? NaN
                                            : Number(e.target.value),
                                      }
                                    : a,
                                ),
                              })
                            }
                          />
                        </td>
                      ))}
                      <td>
                        {fmt(
                          r
                            ? l.deadFactor * r.dead + l.liveFactor * input.live
                            : null,
                        )}
                      </td>
                      <td>
                        <button
                          disabled={input.loads.length === 1}
                          onClick={() =>
                            update({
                              ...input,
                              loads: input.loads.filter((_, n) => n !== k),
                            })
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
              className="suiteSecondary"
              disabled={input.loads.length >= 100}
              onClick={() => {
                let n = input.loads.length + 1;
                while (input.loads.some((l) => l.id === `LC${n}`)) n++;
                update({
                  ...input,
                  loads: [
                    ...input.loads,
                    {
                      id: `LC${n}`,
                      deadFactor: 1.2,
                      liveFactor: 1.6,
                      serviceLiveFactor: 1,
                      included: true,
                    },
                  ],
                });
              }}
            >
              ＋ Combination
            </button>
            <details className="slabPaste">
              <summary>Paste From Excel</summary>
              <p>
                Copy cells with a header:{" "}
                <code>ID · DeadFactor · LiveFactor · ServiceLiveFactor</code>.
                Factors—not already factored loads. Self-weight is included once
                in D.
              </p>
              <textarea
                aria-label="Excel load combinations"
                value={paste}
                onChange={(e) => previewLoads(e.target.value)}
                placeholder={
                  "ID\tDeadFactor\tLiveFactor\tServiceLiveFactor\nLC1\t1.2\t1.6\t1"
                }
              />
              <p role="status">
                {pasteError ||
                  (loadPreview
                    ? `${loadPreview.length} valid combinations ready for review.`
                    : "")}
              </p>
              {loadPreview && (
                <div className="slabTableWrap">
                  <table>
                    <tbody>
                      {loadPreview.map((l) => (
                        <tr key={l.id}>
                          <td>{l.id}</td>
                          <td>
                            {l.deadFactor} D + {l.liveFactor} L
                          </td>
                          <td>Service L: {l.serviceLiveFactor}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <button
                disabled={!loadPreview}
                onClick={() => importLoads(false)}
              >
                Replace combinations
              </button>{" "}
              <button disabled={!loadPreview} onClick={() => importLoads(true)}>
                Append combinations
              </button>
            </details>
            {r && (
              <>
                <h3>Analysis Method</h3>
                <p>{r.method}</p>
                <p>
                  Moments = α × wu × Lshort². Deflection = β × ws × Lshort⁴ /
                  rigidity.
                </p>
                <dl className="slabCoefficients">
                  {Object.entries(r.coefficients).map(([key, v]) => (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>{fmt(v, 6)}</dd>
                    </div>
                  ))}
                </dl>
                <p className="slabMuted">
                  One-way strips use beam EI; two-way plates use D = Ec h³ /
                  [12(1−ν²)]. Ec = 4700√f′c. No rounded coefficient lookup.
                </p>
              </>
            )}
          </section>
        </div>
        <aside className="slabPanel slabSummary">
          <h2>Design Checks</h2>
          <div className="slabStatus">
            <DesignStatus dcr={maxDcr} policy={policy} />
            <span>Governing Strength DCR {fmt(maxDcr, 3)}</span>
          </div>
          {r && (
            <>
              <dl>
                <div>
                  <dt>Minimum steel</dt>
                  <dd>
                    {r.regions.every((v) => v.minimumOk)
                      ? "OK"
                      : "Detailing Review Required"}
                  </dd>
                </div>
                <div>
                  <dt>Spacing</dt>
                  <dd>
                    {r.regions.every((v) => v.spacingOk)
                      ? "OK"
                      : "Detailing Review Required"}
                  </dd>
                </div>
                <div>
                  <dt>Tension control</dt>
                  <dd>
                    {r.regions.every((v) => v.tensionControlled)
                      ? "OK"
                      : "Detailing Review Required"}
                  </dd>
                </div>
                <div>
                  <dt>Layer fit / cutoffs</dt>
                  <dd>
                    {r.detailing.ok ? "SCREEN OK" : "Detailing Review Required"}
                  </dd>
                </div>
                <div>
                  <dt>Immediate δ</dt>
                  <dd>
                    {fmt(r.deflection.immediate)} / {fmt(r.deflection.limit)} mm
                  </dd>
                </div>
                <div>
                  <dt>Full serviceability</dt>
                  <dd>REVIEW REQUIRED</dd>
                </div>
                <div>
                  <dt>Support anchorage</dt>
                  <dd>REVIEW REQUIRED</dd>
                </div>
              </dl>
              <h3>Suggested Design</h3>
              <p>
                Largest practical main-bar spacing on a 25 mm grid, keeping the
                entered diameter and extra bars.
              </p>
              <button
                className="suiteSecondary"
                onClick={() => {
                  try {
                    setRecommendations(
                      analyzeSlab(input, true).recommendations,
                    );
                  } catch (e) {
                    setMessage(
                      e instanceof Error
                        ? e.message
                        : "Cannot suggest spacing.",
                    );
                  }
                }}
              >
                Suggest spacing
              </button>
              {recommendations.map((rec) => (
                <div className="slabRecommendation" key={rec.layer}>
                  <strong>{layerLabel(rec.layer)}</strong>
                  <span>
                    Ø{rec.diameter} @ {rec.spacing ?? "—"} mm
                  </span>
                  <small>{rec.reason}</small>
                </div>
              ))}
              <p className="slabMuted">
                Your inputs remain unchanged. Recheck the full design after any
                manual change.
              </p>
            </>
          )}
        </aside>
      </div>
      {r && (
        <section className="slabPanel slabResults">
          <header className="slabReportHeader">
            <h2>{title} · Calculation Report</h2>
            <p>
              {project?.name ?? "Unsaved project"} ·{" "}
              {project?.buildingName ?? "—"} · {project?.location ?? "—"}
            </p>
            <p>
              Prepared by: {project?.preparedBy ?? "—"} · Checked by:{" "}
              {project?.checkedBy ?? "—"} · Approved by:{" "}
              {project?.approvedBy ?? "—"}
            </p>
            <p>
              {input.code} · {r.method} · {r.engineVersion}
              {" · "}
              <DesignStatus
                dcr={Math.max(
                  ...slabDesignChecks(input, r).map((c) => c.dcr ?? Infinity),
                )}
                policy={policy}
              />
            </p>
          </header>
          <h3>Resolved Reinforcement Schedule</h3>
          <div className="slabTableWrap">
            <table>
              <thead>
                <tr>
                  <th>Group / layer</th>
                  <th>Ø mm</th>
                  <th>Entered max pitch mm</th>
                  <th>Actual pitch mm</th>
                  <th>Bars across width*</th>
                  <th>z mm</th>
                  <th>As mm²/m</th>
                </tr>
              </thead>
              <tbody>
                {r.bars.map((b) => (
                  <tr key={`${b.group}-${b.layer}`}>
                    <th
                      className={
                        b.group === "main" ? "slabMainLabel" : "slabExtraLabel"
                      }
                    >
                      {b.group.toUpperCase()} · {layerLabel(b.layer)}
                    </th>
                    <td>{b.diameter}</td>
                    <td>{b.spacing}</td>
                    <td>
                      {fmt(
                        b.positions.length > 1
                          ? b.positions[1] - b.positions[0]
                          : null,
                        1,
                      )}
                    </td>
                    <td>{b.positions.length}</td>
                    <td>{fmt(b.z, 1)}</td>
                    <td>{fmt(b.as, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="slabMuted">
            *Distribution count per bar group/zone, not a fabrication quantity.
            Top extra groups repeat at each eligible fixed edge. Detailed
            lengths, hooks and wastage are not scheduled.
          </p>
          <h3>Governing Flexural Checks · One-Metre Strips</h3>
          <p className="slabMuted">
            MAIN BARS And EXTRA BARS Work Together Where EXTRA BARS Are Present.
            Combined Strength Uses Each Group’s Actual Elevation. Beyond The
            Cutoffs, Only Continuous MAIN BARS Are Credited.
          </p>
          <div className="slabTableWrap">
            <table>
              <thead>
                <tr>
                  <th>Region</th>
                  <th>Combo</th>
                  <th>Location x/L</th>
                  <th>Mu kN·m/m</th>
                  <th>As required* mm²/m</th>
                  <th className="slabMainLabel">MAIN As mm²/m</th>
                  <th className="slabExtraLabel">EXTRA As Used mm²/m</th>
                  <th>Total Active As mm²/m</th>
                  <th>d mm</th>
                  <th>ϕ</th>
                  <th>εt</th>
                  <th>ϕMn kN·m/m</th>
                  <th>DCR</th>
                  <th>Spacing / min steel</th>
                </tr>
              </thead>
              <tbody>
                {r.regions.map((v) => (
                  <tr key={v.id}>
                    <th>{v.label}</th>
                    <td>{v.combination}</td>
                    <td>
                      {fmt(v.position, 3)}
                      <br />
                      {v.extraActive ? "MAIN + EXTRA" : "MAIN Only"}
                    </td>
                    <td>{fmt(v.mu)}</td>
                    <td>{fmt(v.requiredAs, 0)}</td>
                    <td className="slabMainLabel">{fmt(v.mainAs, 0)}</td>
                    <td className="slabExtraLabel">{fmt(v.extraAs, 0)}</td>
                    <td>{fmt(v.as, 0)}</td>
                    <td>{fmt(v.d, 1)}</td>
                    <td>{fmt(v.phi, 3)}</td>
                    <td>{fmt(v.strain, 5)}</td>
                    <td>{fmt(v.phiMn)}</td>
                    <td>
                      {fmt(v.dcr, 3)}
                      <br />
                      <DesignStatus dcr={v.dcr} policy={policy} />
                    </td>
                    <td>
                      {v.spacingOk && v.minimumOk
                        ? "OK"
                        : "Detailing Review Required"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="slabMuted">
            *Equivalent single-layer required area at the entered MAIN BARS
            depth, including 0.0018 bh minimum. Capacity uses the active
            main/extra layers and strain equilibrium at the governing location.
            DCR checks include both sides of each cutoff. Maximum spacing at
            critical two-way sections: min(2h,450); one-way main: min(3h,450);
            distribution: min(5h,450). Minimum clear spacing:
            max(25,db,4dagg/3).
          </p>
          <h3>Combined Reinforcement By Location</h3>
          <p className="slabMuted">
            Each Row Shows The Governing Demand Within That Zone. x/L Is
            Measured From The West Or South Edge Along The Reinforcement
            Direction. MAIN And EXTRA Capacities Are Not Added Separately.
          </p>
          <div className="slabTableWrap">
            <table>
              <thead>
                <tr>
                  <th>Region / Location</th>
                  <th>Combo / x/L</th>
                  <th className="slabMainLabel">MAIN As mm²/m</th>
                  <th className="slabExtraLabel">EXTRA As Used mm²/m</th>
                  <th>Total Active As mm²/m</th>
                  <th>Mu kN·m/m</th>
                  <th>Combined ϕMn kN·m/m</th>
                  <th>DCR / Status</th>
                </tr>
              </thead>
              <tbody>
                {r.regions.flatMap((region) =>
                  region.zones.map((zone) => (
                    <tr key={`${region.id}-${zone.id}`}>
                      <th scope="row">
                        {region.label}
                        <br />
                        {zone.label}
                      </th>
                      <td>
                        {zone.combination}
                        <br />
                        {fmt(zone.position, 3)}
                      </td>
                      <td className="slabMainLabel">{fmt(zone.mainAs, 0)}</td>
                      <td className="slabExtraLabel">{fmt(zone.extraAs, 0)}</td>
                      <td>{fmt(zone.as, 0)}</td>
                      <td>{fmt(zone.mu)}</td>
                      <td>{fmt(zone.phiMn)}</td>
                      <td>
                        {fmt(zone.dcr, 3)}
                        <br />
                        <DesignStatus dcr={zone.dcr} policy={policy} />
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
          <h3>One-Way Shear Checks At d From Idealized Support Line</h3>
          <div className="slabTableWrap">
            <table>
              <thead>
                <tr>
                  <th>Edge</th>
                  <th>Combo</th>
                  <th>Vu kN/m</th>
                  <th>d mm</th>
                  <th>ρw</th>
                  <th>λs</th>
                  <th>ϕVc kN/m</th>
                  <th>DCR</th>
                </tr>
              </thead>
              <tbody>
                {r.shear.map((v) => (
                  <tr key={v.edge}>
                    <th>{v.edge}</th>
                    <td>{v.combination}</td>
                    <td>{fmt(v.vu)}</td>
                    <td>{fmt(v.d, 1)}</td>
                    <td>{fmt(v.rho, 5)}</td>
                    <td>{fmt(v.lambdaS, 3)}</td>
                    <td>{fmt(v.phiVc)}</td>
                    <td>
                      {fmt(v.dcr, 3)}
                      <br />
                      <DesignStatus dcr={v.dcr} policy={policy} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="slabMuted">
            Normal-weight concrete, no shear reinforcement or axial load. ACI
            318-19 Table 22.5.5.1(c): Vc = 0.66λsρw^(1/3)√f′c bwd, limited to
            0.42√f′c bwd; ϕ = 0.75. Only main steel is credited in ρw. λs =
            min(1,√[2/(1+0.004d)]).
          </p>
          <h3>Detailing & Serviceability Review</h3>
          <p>
            Immediate uncracked δ = {fmt(r.deflection.immediate)} mm; selected
            limit = {fmt(r.deflection.limit)} mm; service combination{" "}
            {r.deflection.combination}. This does not establish long-term
            deflection compliance.
          </p>
          <div className="slabTableWrap">
            <table>
              <thead>
                <tr>
                  <th>Extra layer</th>
                  <th>Straight ld mm</th>
                  <th>Available extension mm</th>
                  <th>Screen</th>
                </tr>
              </thead>
              <tbody>
                {r.detailing.development.map((v) => (
                  <tr key={v.layer}>
                    <th>{layerLabel(v.layer)}</th>
                    <td>{fmt(v.ld, 0)}</td>
                    <td>{fmt(v.extension, 0)}</td>
                    <td>{v.ok ? "SCREEN OK" : "Detailing Review Required"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {r.detailing.messages.length > 0 && (
            <ul className="slabError">
              {r.detailing.messages.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}
          <ul className="slabWarnings">
            {r.warnings.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </section>
      )}
      {r ? (
        <DesignReviewPanel
          checks={slabDesignChecks(input, r)}
          policy={policy}
          remarks={remarks}
          onChange={(next) => {
            editVersion.current++;
            setSaved(false);
            setRemarks(next);
          }}
        />
      ) : null}
      {r ? (
        <SlabQuantityPanel
          input={input}
          value={quantity}
          onChange={(q) => {
            editVersion.current++;
            setSaved(false);
            setQuantity(q);
          }}
          onResetCutoffs={() =>
            update({
              ...input,
              cutoffs: {
                bottomStart: 0.25,
                bottomEnd: 0.75,
                west: 1 / 3,
                east: 1 / 3,
                south: 1 / 3,
                north: 1 / 3,
              },
            })
          }
        />
      ) : null}
    </section>
  );
}
