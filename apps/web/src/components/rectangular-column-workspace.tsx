"use client";
import { useMemo, useRef, useState } from "react";
import {
  analyzeRectangularColumn,
  defaultDesignCheckPolicy,
  columnDesignChecks,
  missingJudgmentRemarks,
  type DesignRemarks,
  parseColumnLoads,
  columnDraftSchema,
  defaultColumnQuantity,
  defaultColumnTieDesign,
  defaultColumnStorey,
  effectiveColumnQuantity,
  migrateColumnStorey,
  rebarDesignation,
  syncColumnQuantityTies,
  designColumnTransverse,
  adoptTieDesignToQuantity,
  type ColumnTieDesignInput,
  type ColumnQuantityInput,
  type RectangularColumnInput,
  type RectangularColumnResult,
  type ColumnLoad,
} from "@nola/calc-core";
import { DesignReviewPanel, DesignStatus } from "./design-review-panel";
import type { ProjectRecord, CalculationDraftRecord } from "@/lib/projects";
import {
  ColumnSection,
  ColumnPMPlot,
  ColumnBiaxialContourPlot,
} from "./column-diagrams";
import { ReportExportControls } from "./report-export-controls";
import {
  DuplicateSavePrompt,
  type DraftDuplicate,
} from "./duplicate-save-prompt";
import { ColumnQuantityPanel } from "./column-quantity-panel";
import { StoreyGeometryFields } from "./column-storey-panel";
import {
  ConcreteStrengthFields,
  DesignCodeFields,
} from "./column-materials-fields";
import { ColumnSectionDrawingButton } from "./column-section-drawing-button";
import dynamic from "next/dynamic";
// Three.js loads only when results are shown.
const ColumnInteraction3D = dynamic(
  () => import("./column-interaction-3d").then((m) => m.ColumnInteraction3D),
  {
    ssr: false,
    loading: () => (
      <section className="rcPanel interaction3d">
        <h3>3D Interaction Surface (P–Mx–My)</h3>
        <p className="rcMuted">Loading 3D view…</p>
      </section>
    ),
  },
);
import { NumberField, fmt } from "./column-ui";
import {
  RebarGradeSelect,
  RebarSizeSelect,
  RebarStandardSelect,
} from "./rebar-select";
import {
  ColumnConfinementPanel,
  ColumnShearPanel,
  ColumnTieDesignSummary,
  confinementReviewChecks,
  shearReviewChecks,
} from "./column-transverse-panel";
import {
  ColumnSlendernessInputs,
  ColumnSlendernessResults,
} from "./column-slenderness-panel";
/** New calculations start with Vux = Vuy = 400 kN (user decision); imports stay as pasted. */
export const DEFAULT_SHEAR = 400;
const initial: RectangularColumnInput = {
  storey: defaultColumnStorey(),
  code: "ACI 318-19",
  width: 600,
  depth: 800,
  // 5000 psi → 34.47 MPa exact → 34.5 MPa (decision sheet D7–D10).
  fcPsi: 5000,
  fc: 34.5,
  fy: 420,
  es: 200000,
  cover: 40,
  tieDiameter: 10,
  bars: [
    [-250, -350, 25],
    [250, -350, 25],
    [-250, 350, 25],
    [250, 350, 25],
    [0, -350, 20],
    [-250, 0, 20],
    [250, 0, 20],
    [0, 350, 20],
    [-125, -350, 20],
    [125, -350, 20],
    [-125, 350, 20],
    [125, 350, 20],
  ].map(([x, y, diameter]) => ({ x, y, diameter })),
  loads: [
    {
      id: "LC1",
      description: "1.2D + 1.6L",
      pu: 2400,
      mx: 150,
      my: 80,
      vx: DEFAULT_SHEAR,
      vy: DEFAULT_SHEAR,
      included: true,
    },
    {
      id: "LC2",
      description: "1.2D + 1.6L + 0.5Wx",
      pu: 3200,
      mx: 200,
      my: 120,
      vx: DEFAULT_SHEAR,
      vy: DEFAULT_SHEAR,
      included: true,
    },
    {
      id: "LC3",
      description: "1.2D + 1.6L - 0.5Wx",
      pu: 2800,
      mx: -180,
      my: 100,
      vx: DEFAULT_SHEAR,
      vy: DEFAULT_SHEAR,
      included: true,
    },
    {
      id: "LC4",
      description: "1.2D + 1.6L + 0.5Wy",
      pu: 3000,
      mx: 100,
      my: 180,
      vx: DEFAULT_SHEAR,
      vy: DEFAULT_SHEAR,
      included: true,
    },
    {
      id: "LC5",
      description: "1.2D + 1.6L - 0.5Wy",
      pu: 3000,
      mx: -120,
      my: -150,
      vx: DEFAULT_SHEAR,
      vy: DEFAULT_SHEAR,
      included: true,
    },
  ],
};
/** Column Dimensions, in the order of the decision sheet (D12): h, b, cover. */
const dimensionFields = [
  ["depth", "Depth h", "mm"],
  ["width", "Width b", "mm"],
  ["cover", "Clear cover to ties", "mm"],
] as const;
/** ACI 318-19 20.2.2.2: Es = 200 000 MPa; another value is a designer override. */
const ES_DEFAULT = 200000;
export function RectangularColumnWorkspace({
  project,
  draft,
  cloudReady,
  onSaved,
}: {
  project?: ProjectRecord;
  draft?: CalculationDraftRecord;
  cloudReady: boolean;
  onSaved: (draft: CalculationDraftRecord) => void;
}) {
  const restored = columnDraftSchema.safeParse(draft?.payload);
  const editVersion = useRef(0);
  // Drafts saved before storey geometry are migrated without changing their
  // numbers (typed ℓu → override; differing confinement ℓu → manual).
  const [migrated] = useState(() =>
    restored.success
      ? migrateColumnStorey(
          restored.data.input,
          restored.data.quantity,
          restored.data.tieDesign,
        )
      : null,
  );
  const [input, setInput] = useState<RectangularColumnInput>(() =>
    migrated ? migrated.input : structuredClone(initial),
  );
  const [quantity, setQuantity] = useState<ColumnQuantityInput>(() =>
    restored.success && restored.data.quantity
      ? restored.data.quantity
      : defaultColumnQuantity(initial.tieDiameter),
  );
  const [tieDesign, setTieDesign] = useState<ColumnTieDesignInput>(() =>
    migrated?.tie
      ? migrated.tie
      : defaultColumnTieDesign(
          restored.success ? restored.data.input : initial,
          restored.success && restored.data.quantity
            ? restored.data.quantity.height - restored.data.quantity.beamDepth
            : 2500,
        ),
  );
  const [scope, setScope] = useState(
    restored.success ? restored.data.scopeConfirmed : false,
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
  const [title, setTitle] = useState(draft?.title ?? "C1 · Ground floor");
  const [id, setId] = useState(draft?.id);
  const [result, setResult] = useState<RectangularColumnResult | null>(null);
  const [selected, setSelected] = useState("");
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(Boolean(restored.success));
  const [busy, setBusy] = useState(false);
  const [duplicate, setDuplicate] = useState<DraftDuplicate | null>(null);
  const [paste, setPaste] = useState("");
  const [preview, setPreview] = useState<ColumnLoad[] | null>(null);
  const [pasteError, setPasteError] = useState("");
  const [nX, setNX] = useState(4),
    [nY, setNY] = useState(4);
  const standard = input.rebarStandard ?? "PNS49";
  // Longitudinal bar diameter: Materials value, else the most common bar in the layout.
  const diameter =
    input.barDiameter ??
    (() => {
      const counts = new Map<number, number>();
      for (const b of input.bars)
        counts.set(b.diameter, (counts.get(b.diameter) ?? 0) + 1);
      return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 25;
    })();
  const tieSteel = {
    diameter: input.tieDiameter,
    fy: input.tieFyt ?? tieDesign.tie.fyt ?? 420,
    gradeId:
      input.tieFyt === undefined ? tieDesign.tie.gradeId : input.tieGradeId,
  };
  // Shear/confinement design always uses the Materials tie.
  const effectiveTie: ColumnTieDesignInput = {
    ...tieDesign,
    tie: {
      ...tieDesign.tie,
      diameter: tieSteel.diameter,
      fyt: tieSteel.fy,
      gradeId: tieSteel.gradeId ?? null,
      // One hook basis for the estimate, drawings and the 18.7.5.2(f) check.
      hookBasis: quantity.hookBasis,
    },
  };
  // Estimate height / joint follow storey geometry unless overridden there.
  const quantityEff = effectiveColumnQuantity(input, quantity);
  function changeQuantity(next: ColumnQuantityInput, tie = tieSteel) {
    setQuantity(syncColumnQuantityTies(next, tie));
  }
  function update(next: RectangularColumnInput) {
    editVersion.current++;
    setInput(next);
    if (
      next.tieDiameter !== input.tieDiameter ||
      next.tieFyt !== input.tieFyt ||
      next.tieGradeId !== input.tieGradeId
    )
      changeQuantity(quantity, {
        diameter: next.tieDiameter,
        fy: next.tieFyt ?? tieSteel.fy,
        gradeId: next.tieFyt === undefined ? tieSteel.gradeId : next.tieGradeId,
      });
    setResult(null);
    setSaved(false);
    setMessage("Inputs changed. Calculate again to update results.");
  }
  function updateLoad(
    index: number,
    key: keyof ColumnLoad,
    value: string | number | boolean,
  ) {
    update({
      ...input,
      loads: input.loads.map((load, i) =>
        i === index ? { ...load, [key]: value } : load,
      ),
    });
  }
  function readPaste(text: string) {
    setPaste(text);
    try {
      setPreview(parseColumnLoads(text));
      setPasteError("");
    } catch (error) {
      setPreview(null);
      setPasteError(
        error instanceof Error ? error.message : "Could not read cells.",
      );
    }
  }
  function applyPaste(append: boolean) {
    if (!preview) return;
    const loads = append ? [...input.loads, ...preview] : preview;
    if (
      loads.length > 500 ||
      new Set(loads.map((load) => load.id)).size !== loads.length
    ) {
      setPasteError(
        "Use at most 500 combinations with unique labels. Existing loads were not changed.",
      );
      return;
    }
    update({ ...input, loads });
    setPreview(null);
    setPaste("");
    setPasteError("");
    setMessage(
      `${preview.length} combinations ${append ? "appended" : "imported"}. Calculate to refresh results.`,
    );
  }
  function generateBars() {
    if (
      !Number.isInteger(nX) ||
      !Number.isInteger(nY) ||
      nX < 2 ||
      nY < 2 ||
      2 * nX + 2 * (nY - 2) > 80 ||
      !Number.isFinite(diameter) ||
      diameter <= 0
    ) {
      setMessage(
        "Use integer counts ≥2 on each face, at most 80 total bars, and a positive diameter.",
      );
      return;
    }
    const x = input.width / 2 - input.cover - input.tieDiameter - diameter / 2,
      y = input.depth / 2 - input.cover - input.tieDiameter - diameter / 2;
    if (x <= 0 || y <= 0) {
      setMessage(
        "Section is too small for the declared cover, tie, and bar diameter.",
      );
      return;
    }
    // Coordinates to 0.1 mm; rounding is symmetric so central symmetry holds.
    const r1 = (v: number) =>
      (Math.sign(v) * Math.round(Math.abs(v) * 10)) / 10;
    const bars = [];
    for (let i = 0; i < nX; i++)
      for (const sign of [-1, 1])
        bars.push({
          x: r1(-x + (2 * x * i) / (nX - 1)),
          y: r1(sign * y),
          diameter,
        });
    for (let i = 1; i < nY - 1; i++)
      for (const sign of [-1, 1])
        bars.push({
          x: r1(sign * x),
          y: r1(-y + (2 * y * i) / (nY - 1)),
          diameter,
        });
    update({ ...input, bars });
  }
  /** fromBottom: the button under the load table scrolls to the results. */
  function calculate(fromBottom = false) {
    setMessage("");
    try {
      if (!scope)
        throw new Error(
          input.slenderness?.enabled
            ? "Confirm that the entered demands are factored analysis results for this column."
            : "Confirm that demands are suitable for a section-strength check, or turn on slenderness in panel 04.",
        );
      const parsed = columnDraftSchema.safeParse({
        kind: "rc-column",
        version: 1,
        input,
        scopeConfirmed: scope,
        quantity,
        tieDesign: effectiveTie,
      });
      if (!parsed.success)
        throw new Error(
          parsed.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join(" · "),
        );
      const next = analyzeRectangularColumn(parsed.data.input);
      setResult(next);
      if (fromBottom)
        requestAnimationFrame(() =>
          document
            .getElementById("column-results")
            ?.scrollIntoView({ behavior: "smooth", block: "start" }),
        );
      setSelected(next.governing?.load.id ?? "");
      setMessage(
        "Development calculation updated. Review all warnings before using these results.",
      );
    } catch (error) {
      setResult(null);
      setMessage(
        error instanceof Error ? error.message : "Calculation failed.",
      );
    }
  }
  /** opts.overwrite: confirmed in the duplicate prompt; opts.title: save-as name. */
  async function save(opts: { overwrite?: boolean; title?: string } = {}) {
    if (!project) return;
    const saveTitle = opts.title ?? title;
    const saveVersion = editVersion.current;
    setBusy(true);
    setMessage("");
    try {
      const payload = {
        kind: "rc-column",
        version: 1,
        input,
        scopeConfirmed: scope,
        quantity,
        tieDesign: effectiveTie,
        designPolicy: policy,
        remarks,
        reviewCompleted: !!result,
      };
      const parsed = columnDraftSchema.safeParse(payload);
      if (!parsed.success)
        throw new Error(
          "Complete valid numerical inputs and unique combination labels before saving.",
        );
      if (result && missingRemarksMessage("Saving"))
        throw Error(missingRemarksMessage("Saving"));
      const response = await fetch("/api/calculations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          projectId: project.id,
          moduleSlug: "rc-column",
          title: saveTitle,
          overwrite: opts.overwrite === true,
          payload: parsed.data,
        }),
      });
      const body = await response.json();
      if (response.status === 409 && body.duplicate) {
        setDuplicate(body.duplicate);
        setMessage("");
        return;
      }
      setDuplicate(null);
      if (opts.title) setTitle(opts.title);
      if (!response.ok)
        throw new Error(body.error ?? "Could not save calculation.");
      setId(body.draft.id);
      setSaved(
        editVersion.current === saveVersion && livePolicy.current === policyKey,
      );
      setSavedPolicy(policyKey);
      onSaved(body.draft);
      setMessage(
        editVersion.current === saveVersion
          ? "Column inputs saved to this project. Reopen from the explorer to recalculate."
          : "Earlier inputs were saved. Your newer edits remain unsaved; save again to keep them.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }
  const check = result?.checks.find((c) => c.load.id === selected);
  const transverse = useMemo(() => {
    if (!result || (!tieDesign.shear.enabled && !tieDesign.confinement.enabled))
      return { design: null, error: "" };
    try {
      return { design: designColumnTransverse(input, effectiveTie), error: "" };
    } catch (e) {
      return {
        design: null,
        error:
          e instanceof Error && !e.message.startsWith("[")
            ? e.message
            : "Complete valid tie inputs: diameter 6–40 mm, fyt 200–700 MPa, ℓu ≥ 300 mm, whole cross-tie counts.",
      };
    }
    // effectiveTie is derived from input and tieDesign.
  }, [result, input, tieDesign]);
  // Flexure & axial review sits under the results; shear and confinement
  // checks are reviewed in panels 05 / 06. Save / export validate all three.
  const flexureChecks = result ? columnDesignChecks(result) : [];
  const shearChecks = result ? shearReviewChecks(transverse.design) : [];
  const confinementChecks = result
    ? confinementReviewChecks(transverse.design)
    : [];
  const reviewGroups = [
    {
      label: "Flexure & axial",
      panel: "Results",
      checks: flexureChecks,
    },
    { label: "Shear", panel: "Panel 05", checks: shearChecks },
    {
      label: "Confinement & detailing",
      panel: "Panel 06",
      checks: confinementChecks,
    },
  ];
  const missingRemarksMessage = (verb: string) => {
    const where = reviewGroups
      .filter((g) => missingJudgmentRemarks(g.checks, policy, remarks).length)
      .map(
        (g) =>
          `${g.panel === "Results" ? "Flexure & Axial Review" : g.panel} (${missingJudgmentRemarks(g.checks, policy, remarks).length})`,
      );
    return where.length
      ? `Record Engineering Judgment Remarks Before ${verb}: ${where.join(", ")}.`
      : "";
  };
  const changeRemarks = (next: DesignRemarks) => {
    editVersion.current++;
    setSaved(false);
    setRemarks(next);
  };
  const drawingAction = (
    <ColumnSectionDrawingButton
      input={input}
      tie={effectiveTie}
      design={transverse.design ?? null}
      hookBasis={quantity.hookBasis}
      title={title}
      projectName={project?.name}
    />
  );
  // Vux / Vuy are always shown and pasted, with or without shear design.
  const showShear = true;
  function updateTie(next: ColumnTieDesignInput) {
    editVersion.current++;
    setTieDesign(next);
    setSaved(false);
  }
  return (
    <div className="rcWorkspace">
      <div className="rcToolbar">
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
        <span>
          {saved && savedPolicy === policyKey
            ? "Saved inputs"
            : "Unsaved inputs"}
        </span>
        <button
          className="suiteSecondary"
          disabled={!project || !cloudReady || busy || !title.trim()}
          onClick={() => save()}
        >
          {busy ? "Saving…" : "Save to project"}
        </button>
        <button className="suitePrimary" onClick={() => calculate()}>
          Calculate section
        </button>
        <ReportExportControls
          moduleName="RC Column"
          disabled={!result}
          disabledReason="Calculate section to enable export. Results clear whenever an input changes."
          hint={missingRemarksMessage("Exporting")}
          onData={async () => {
            if (!result) throw Error("Calculate The Column First.");
            if (missingRemarksMessage("Exporting"))
              throw Error(missingRemarksMessage("Exporting"));
            const { columnReportData } = await import("../lib/reports/data");
            return columnReportData(
              project,
              title,
              input,
              result,
              quantityEff,
              policy,
              remarks,
              effectiveTie,
              transverse.design,
            );
          }}
        />
      </div>
      {!project && (
        <p className="rcAlert">
          Create or select a project to save your column calculation.
        </p>
      )}
      {duplicate ? (
        <DuplicateSavePrompt
          duplicate={duplicate}
          busy={busy}
          onOverwrite={() => save({ overwrite: true })}
          onSaveAs={(t) => save({ title: t })}
          onCancel={() => setDuplicate(null)}
        />
      ) : null}
      <p className="rcFeedback" role="status" aria-live="polite">
        {message}
      </p>
      <div className="rcGrid">
        <section className="rcPanel">
          <h2>01 · Section & Materials</h2>
          <DesignCodeFields input={input} onChange={update} />
          <h3 className="rcSubhead">Column Dimensions</h3>
          <div className="rcFields rcDimFields">
            {dimensionFields.map(([key, label, unit]) => (
              <NumberField
                key={key}
                label={label}
                unit={unit}
                value={input[key]}
                onChange={(value) => update({ ...input, [key]: value })}
              />
            ))}
          </div>
          <h3 className="rcSubhead">Concrete Strength</h3>
          <ConcreteStrengthFields input={input} onChange={update} />
          <h3 className="rcSubhead">Rebar Information</h3>
          {/* Standard | Es, then each diameter (left) with its grade (right). */}
          <div className="rcFields rcSteelPairs">
            <RebarStandardSelect
              value={standard}
              onChange={(rebarStandard) => update({ ...input, rebarStandard })}
            />
            <label className={input.es !== ES_DEFAULT ? "isOverride" : ""}>
              Steel Es
              <span className="rcUnit">MPa</span>
              <input
                type="number"
                step="any"
                value={Number.isFinite(input.es) ? input.es : ""}
                onChange={(e) =>
                  update({
                    ...input,
                    es: e.target.value === "" ? NaN : Number(e.target.value),
                  })
                }
              />
              {input.es !== ES_DEFAULT && (
                <em className="overrideBadge">
                  Override · ACI 20.2.2.2 default 200,000
                </em>
              )}
            </label>
            <RebarSizeSelect
              label="Longitudinal Bar Diameter"
              standard={standard}
              value={diameter}
              onChange={(d) =>
                update({
                  ...input,
                  barDiameter: d,
                  // Bars of the previous main size follow; other sizes stay.
                  bars: input.bars.map((b) =>
                    b.diameter === diameter ? { ...b, diameter: d } : b,
                  ),
                })
              }
            />
            <RebarGradeSelect
              label="Longitudinal steel grade (fy)"
              standard={standard}
              fy={input.fy}
              gradeId={input.gradeId}
              maxFy={550}
              onChange={(fy, gradeId) => update({ ...input, fy, gradeId })}
            />
            <RebarSizeSelect
              label="Tie Diameter"
              standard={standard}
              value={input.tieDiameter}
              min={6}
              max={40}
              onChange={(tieDiameter) => update({ ...input, tieDiameter })}
            />
            <RebarGradeSelect
              label="Tie steel grade (fyt)"
              standard={standard}
              fy={tieSteel.fy}
              gradeId={tieSteel.gradeId}
              maxFy={700}
              onChange={(tieFyt, tieGradeId) =>
                update({ ...input, tieFyt, tieGradeId })
              }
            />
          </div>
          <StoreyGeometryFields input={input} onChange={update} />
          <label className="rcCheckbox">
            <input
              type="checkbox"
              checked={scope}
              onChange={(e) => {
                editVersion.current++;
                setScope(e.target.checked);
                setResult(null);
                setSaved(false);
              }}
            />
            <span>
              {input.slenderness?.enabled
                ? "Entered demands are factored analysis results for this column; slenderness is checked in panel 04."
                : "I have assessed slenderness and second-order effects separately. Entered demands are suitable for a section-strength check."}
            </span>
          </label>
          <p className="rcMuted">
            Compression Pu is positive. Mux and Muy retain their signs. No load
            factors or combinations are generated here.
          </p>
        </section>
        <section className="rcPanel">
          <h2>02 · Reinforcement Layout</h2>
          <ColumnSection input={input} />
          <p className="rcMuted">
            Initial values reproduce your workbook example. Bar coordinates are
            retained; cover and steel-ratio issues appear in results.
          </p>
          <details>
            <summary>Generate A Uniform Perimeter Layout</summary>
            <div className="rcFields">
              <NumberField
                label="Bars Across b (Including Corners)"
                value={nX}
                onChange={setNX}
              />
              <NumberField
                label="Bars Along h (Including Corners)"
                value={nY}
                onChange={setNY}
              />
              <p className="rcMuted">
                Bar size: {rebarDesignation(standard, diameter)} from Section
                &amp; Materials.
              </p>
            </div>
            <button className="suiteSecondary" onClick={generateBars}>
              Replace bar layout
            </button>
          </details>
        </section>
      </div>
      <details className="rcPanel">
        <summary>Edit individual bars · {input.bars.length} bars</summary>
        <p className="rcMuted">
          Coordinates in mm from the section centroid: x right, y upward.
          Editing positions changes the interaction curves.
        </p>
        <div className="rcTableWrap">
          <table className="rcInputTable">
            <thead>
              <tr>
                <th>Bar</th>
                <th>x (mm)</th>
                <th>y (mm)</th>
                <th>Bar size</th>
                <th>Remove</th>
              </tr>
            </thead>
            <tbody>
              {input.bars.map((bar, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  {(["x", "y"] as const).map((key) => (
                    <td key={key}>
                      <input
                        aria-label={`Bar ${i + 1} ${key}`}
                        type="number"
                        step="any"
                        value={Number.isFinite(bar[key]) ? bar[key] : ""}
                        onChange={(e) =>
                          update({
                            ...input,
                            bars: input.bars.map((b, j) =>
                              j === i
                                ? {
                                    ...b,
                                    [key]:
                                      e.target.value === ""
                                        ? NaN
                                        : Number(e.target.value),
                                  }
                                : b,
                            ),
                          })
                        }
                      />
                    </td>
                  ))}
                  <td>
                    <RebarSizeSelect
                      ariaLabel={`Bar ${i + 1} diameter`}
                      standard={standard}
                      value={bar.diameter}
                      onChange={(d) =>
                        update({
                          ...input,
                          bars: input.bars.map((b, j) =>
                            j === i ? { ...b, diameter: d } : b,
                          ),
                        })
                      }
                    />
                  </td>
                  <td>
                    <button
                      aria-label={`Remove bar ${i + 1}`}
                      onClick={() =>
                        update({
                          ...input,
                          bars: input.bars.filter((_, j) => j !== i),
                        })
                      }
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          className="suiteSecondary"
          disabled={input.bars.length >= 80}
          onClick={() =>
            update({
              ...input,
              bars: [...input.bars, { x: 0, y: 0, diameter }],
            })
          }
        >
          ＋ Add bar
        </button>
      </details>
      <section className="rcPanel">
        <div className="rcPanelHeading">
          <h2>03 · Factored Load Combinations</h2>
          <button
            className="suiteSecondary"
            disabled={input.loads.length >= 500}
            onClick={() => {
              let n = input.loads.length + 1;
              while (input.loads.some((l) => l.id === `LC${n}`)) n++;
              update({
                ...input,
                loads: [
                  ...input.loads,
                  {
                    id: `LC${n}`,
                    description: "",
                    pu: 0,
                    mx: 0,
                    my: 0,
                    vx: DEFAULT_SHEAR,
                    vy: DEFAULT_SHEAR,
                    included: true,
                  },
                ],
              });
            }}
          >
            ＋ Add combination
          </button>
        </div>
        <details className="rcPaste">
          <summary>Paste From Excel</summary>
          <p>
            Copy Excel cells and paste below. Values must be in{" "}
            <strong>kN and kN·m</strong>. Supports Pu / Mux / Muy; Label / Pu /
            Mux / Muy; or LC No / Description / Pu / Mux / Muy / Include.
            Workbook headers are accepted. With headers, optional Vux / Vuy and
            M1x / M1y columns are read; ETABS V2 / V3 and M2 / M3 map to Vux /
            Vuy and Mux / Muy for the default column orientation (local 2 =
            global X). ETABS P is not read: enter Pu with compression positive.
          </p>
          <label>
            Excel cells
            <textarea
              rows={4}
              value={paste}
              placeholder={
                "LC No\tDescription\tPu (kN)\tMux (kN·m)\tMuy (kN·m)\tInclude\n1\t1.2D + 1.6L\t2400\t150\t80\tYes"
              }
              onChange={(e) => readPaste(e.target.value)}
            />
          </label>
          <p className="rcAlert" role="status">
            {pasteError}
          </p>
          {preview && (
            <>
              <p>
                {preview.length} combinations ready. First: {preview[0]?.id}, Pu{" "}
                {fmt(preview[0]?.pu ?? 0)} kN, Mux {fmt(preview[0]?.mx ?? 0)},
                Muy {fmt(preview[0]?.my ?? 0)} kN·m
                {preview.some((l) => l.vx != null || l.vy != null)
                  ? `, Vux ${fmt(preview[0]?.vx ?? null)}, Vuy ${fmt(preview[0]?.vy ?? null)} kN`
                  : " (no Vux / Vuy columns found)"}
                .
              </p>
              <div className="rcActions">
                <button
                  className="suitePrimary"
                  onClick={() => applyPaste(false)}
                >
                  Replace loads with pasted cells
                </button>
                <button
                  className="suiteSecondary"
                  onClick={() => applyPaste(true)}
                >
                  Append pasted cells
                </button>
              </div>
            </>
          )}
        </details>
        <div
          className="rcTableWrap"
          onPaste={(e) => {
            const text = e.clipboardData.getData("text/plain");
            if (text.includes("\t")) {
              e.preventDefault();
              readPaste(text);
              const details =
                e.currentTarget.parentElement?.querySelector("details");
              if (details) details.open = true;
            }
          }}
        >
          <table className="rcInputTable">
            <thead>
              <tr>
                <th>Use</th>
                <th>Label</th>
                <th>Description</th>
                <th>Pu (kN)</th>
                <th>Mux (kN·m)</th>
                <th>Muy (kN·m)</th>
                {showShear ? (
                  <>
                    <th>Vux (kN)</th>
                    <th>Vuy (kN)</th>
                  </>
                ) : null}
                {input.slenderness?.enabled ? (
                  <>
                    <th>M1x (kN·m)</th>
                    <th>M1y (kN·m)</th>
                  </>
                ) : null}
                <th>Remove</th>
              </tr>
            </thead>
            <tbody>
              {input.loads.map((load, i) => (
                <tr key={i}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Include combination ${i + 1}`}
                      checked={load.included}
                      onChange={(e) =>
                        updateLoad(i, "included", e.target.checked)
                      }
                    />
                  </td>
                  {(["id", "description"] as const).map((key) => (
                    <td key={key}>
                      <input
                        aria-label={`Combination ${i + 1} ${key}`}
                        value={load[key]}
                        maxLength={key === "id" ? 100 : 300}
                        onChange={(e) => updateLoad(i, key, e.target.value)}
                      />
                    </td>
                  ))}
                  {(["pu", "mx", "my"] as const).map((key) => (
                    <td key={key}>
                      <input
                        type="number"
                        step="any"
                        aria-label={`Combination ${i + 1} ${key}`}
                        value={Number.isFinite(load[key]) ? load[key] : ""}
                        onChange={(e) =>
                          updateLoad(
                            i,
                            key,
                            e.target.value === ""
                              ? NaN
                              : Number(e.target.value),
                          )
                        }
                      />
                    </td>
                  ))}
                  {[
                    ...(showShear ? (["vx", "vy"] as const) : []),
                    ...(input.slenderness?.enabled
                      ? (["m1x", "m1y"] as const)
                      : []),
                  ].map((key) => (
                    <td key={key}>
                      <input
                        type="number"
                        step="any"
                        aria-label={`Combination ${i + 1} ${key}`}
                        placeholder="blank"
                        value={
                          typeof load[key] === "number" &&
                          Number.isFinite(load[key])
                            ? (load[key] as number)
                            : ""
                        }
                        onChange={(e) =>
                          update({
                            ...input,
                            loads: input.loads.map((l, j) =>
                              j === i
                                ? {
                                    ...l,
                                    [key]:
                                      e.target.value === ""
                                        ? null
                                        : Number(e.target.value),
                                  }
                                : l,
                            ),
                          })
                        }
                      />
                    </td>
                  ))}
                  <td>
                    <button
                      aria-label={`Remove combination ${i + 1}`}
                      onClick={() =>
                        update({
                          ...input,
                          loads: input.loads.filter((_, j) => j !== i),
                        })
                      }
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="rcMuted">
          Pasting multiple cells into the table opens an import preview. Loads
          change only when you choose Replace or Append. File upload (.xlsx) is
          not included in this build.
        </p>
        <div className="rcCalculateBar">
          <button
            className="suitePrimary"
            onClick={() => calculate(true)}
          >
            Calculate section
          </button>
          <span className="rcMuted">
            {!scope
              ? "Tick the demand confirmation in panel 01 before calculating."
              : "Results clear whenever an input changes."}
          </span>
        </div>
      </section>
      <ColumnSlendernessInputs input={input} onChange={update} />
      {result ? (
        <section className="rcResults" id="column-results">
          <div className="rcReportHeader">
            <p>ÑOLA Calculation Suites · RC column · Development report v0.1</p>
            <h2>{title}</h2>
            <p>
              {project?.name ?? "Unsaved project"} ·{" "}
              {project?.buildingName ?? ""} · {project?.location ?? ""}
            </p>
            <p>
              Prepared by: {project?.preparedBy ?? "—"} · Checked by:{" "}
              {project?.checkedBy ?? "—"} · Approved by:{" "}
              {project?.approvedBy ?? "—"}
            </p>
            <p>
              Project standard: {input.code} · Calculation basis:{" "}
              {result.calculationBasis} · Rectangular tied column · SI units ·
              Independent review pending
            </p>
          </div>
          <DesignReviewPanel
            title="Flexure & Axial Review"
            checks={flexureChecks}
            primaryPrefixes={[`${result.governing?.load.id ?? ""}:`]}
            policy={policy}
            remarks={remarks}
            onChange={changeRemarks}
          />
          <div className="rcStats">
            {[
              ["Gross area Ag", `${fmt(result.grossArea, 0)} mm²`],
              ["Steel area Ast", `${fmt(result.steelArea)} mm²`],
              ["Steel ratio", `${fmt(result.steelRatio * 100)}%`],
              ["Nominal P₀", `${fmt(result.p0)} kN`],
              ["φPn,max", `${fmt(result.axialCap)} kN`],
              ["Governing combination", result.governing?.load.id ?? "—"],
            ].map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <div className="rcAlert">
            <strong>
              Review required · These are section-strength screening results.
            </strong>
            <ul>
              {result.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
          <ColumnInteraction3D input={input} result={result} policy={policy} />
          <div className="rcGrid">
            <section className="rcPanel">
              <h3>P–Mx Interaction</h3>
              <ColumnPMPlot axis="x" result={result} selected={selected} />
            </section>
            <section className="rcPanel">
              <h3>P–My Interaction</h3>
              <ColumnPMPlot axis="y" result={result} selected={selected} />
            </section>
          </div>
          <p className="rcLegend">
            Solid teal / purple: reduced design strength · Dashed gray: nominal
            strength · Dotted amber: axial cap · Points: factored demands
          </p>
          <section className="rcPanel">
            <h3>Combination Screening</h3>
            <p>Select a combination to highlight its demand in the diagrams.</p>
            <div className="rcTableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Combination</th>
                    <th>Pu (kN)</th>
                    <th>Mux (kN·m)</th>
                    <th>Muy (kN·m)</th>
                    {result.checks.some((c) => c.slenderness) ? (
                      <>
                        <th>Mcx (kN·m)</th>
                        <th>Mcy (kN·m)</th>
                      </>
                    ) : null}
                    <th>φMnx (kN·m)</th>
                    <th>φMny (kN·m)</th>
                    <th>Axial DCR</th>
                    <th>Biaxial 3D DCR</th>
                    <th>Bresler DCR</th>
                    <th>Linear screen</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {result.checks.map((c) => (
                    <tr
                      key={c.load.id}
                      className={selected === c.load.id ? "rcSelected" : ""}
                    >
                      <td>
                        <button
                          className="rcLink"
                          onClick={() => setSelected(c.load.id)}
                        >
                          {c.load.id}
                        </button>
                      </td>
                      <td>{fmt(c.load.pu)}</td>
                      <td>{fmt(c.load.mx)}</td>
                      <td>{fmt(c.load.my)}</td>
                      {c.slenderness ? (
                        <>
                          <td>{fmt(c.mux)}</td>
                          <td>{fmt(c.muy)}</td>
                        </>
                      ) : null}
                      <td>{fmt(c.capacityX)}</td>
                      <td>{fmt(c.capacityY)}</td>
                      <td>{c.load.included ? fmt(c.axialRatio, 3) : "—"}</td>
                      <td>{fmt(c.biaxialRatio, 3)}</td>
                      <td>
                        {c.bresler.applicable
                          ? fmt(c.bresler.ratio, 3)
                          : c.load.included
                            ? "n/a"
                            : "—"}
                      </td>
                      <td>{fmt(c.interaction, 3)}</td>
                      <td>
                        {c.load.included ? (
                          <DesignStatus
                            dcr={Math.max(
                              c.axialRatio,
                              c.biaxialRatio ?? Infinity,
                            )}
                            policy={policy}
                          />
                        ) : (
                          "Excluded"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="rcMuted">
              Result uses the axial DCR and the 3D biaxial DCR (governing).
              Bresler and the linear screen are references. “—” indicates no
              available capacity or an excluded combination.
            </p>
          </section>
          <div className="rcGrid">
            <section className="rcPanel">
              <h3>Biaxial Check · {selected}</h3>
              <p>
                φMnx–φMny contour at Pu = {fmt(check?.load.pu ?? null)} kN by 3D
                strain compatibility (rotated neutral axis).
              </p>
              <ColumnBiaxialContourPlot
                input={input}
                result={result}
                check={check}
              />
              {check && check.load.included ? (
                <dl className="rcBasis">
                  <div>
                    <dt>3D: |Mu| / φMn on load ray</dt>
                    <dd>
                      {fmt(Math.hypot(check.mux, check.muy))} /{" "}
                      {fmt(check.biaxial?.capacity ?? null)} ={" "}
                      <strong>{fmt(check.biaxialRatio, 3)}</strong>
                      {check.biaxial
                        ? ` · c = ${fmt(check.biaxial.c, 0)} mm, φ = ${fmt(check.biaxial.phi, 3)}`
                        : ""}
                    </dd>
                  </div>
                  <div>
                    <dt>Bresler: Pu / φPni</dt>
                    <dd>
                      {check.bresler.applicable ? (
                        <>
                          φPnx {fmt(check.bresler.pnx, 0)}, φPny{" "}
                          {fmt(check.bresler.pny, 0)}, φPo{" "}
                          {fmt(check.bresler.po, 0)} → φPni{" "}
                          {fmt(check.bresler.pni, 0)} kN; DCR{" "}
                          <strong>{fmt(check.bresler.ratio, 3)}</strong>
                        </>
                      ) : (
                        check.bresler.note
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Linear screen (reference)</dt>
                    <dd>{fmt(check.interaction, 3)}</dd>
                  </div>
                </dl>
              ) : null}
            </section>
            <section className="rcPanel">
              <h3>Calculation Basis · {result.calculationBasis}</h3>
              <dl className="rcBasis">
                <div>
                  <dt>Concrete ultimate strain</dt>
                  <dd>0.003</dd>
                </div>
                <div>
                  <dt>β₁</dt>
                  <dd>{fmt(result.beta1, 3)}</dd>
                </div>
                <div>
                  <dt>Steel yield strain fy / Es</dt>
                  <dd>{fmt(input.fy / input.es, 5)}</dd>
                </div>
                <div>
                  <dt>Tied-column φ</dt>
                  <dd>0.65 to 0.90, strain dependent</dd>
                </div>
                <div>
                  <dt>Axial compression cap</dt>
                  <dd>0.80 × 0.65 × P₀</dd>
                </div>
                <div>
                  <dt>Biaxial (governing)</dt>
                  <dd>3D strain compatibility, radial at constant Pu</dd>
                </div>
                <div>
                  <dt>Bresler (reference)</dt>
                  <dd>1/φPni = 1/φPnx + 1/φPny − 1/φPo</dd>
                </div>
                <div>
                  <dt>Linear screen (reference)</dt>
                  <dd>|Mux| / φMnx(Pu) + |Muy| / φMny(Pu) ≤ 1</dd>
                </div>
              </dl>
              <p className="rcMuted">
                ACI 318-19: 22.2.1–22.2.2 (section assumptions, rotated neutral
                axis), Table 22.2.2.4.3 (β₁), Table 21.2.2 (φ), Table 22.4.2.1
                (axial cap). Verified against StructurePoint ACI 318-19 biaxial
                examples. Slenderness: 6.2.5 and 6.6.4.
              </p>
            </section>
          </div>
          <ColumnSlendernessResults check={check} />
        </section>
      ) : (
        <section className="rcPanel rcEmptyResult">
          <h2>Results Workspace</h2>
          <p>
            Confirm the section-check scope, review inputs, then choose
            Calculate section. Results are cleared when engineering inputs
            change.
          </p>
        </section>
      )}
      {result ? (
        <>
          <ColumnShearPanel
            input={input}
            value={effectiveTie}
            onChange={updateTie}
            design={transverse.design}
            error={transverse.error}
            policy={policy}
            remarks={remarks}
            onRemarksChange={changeRemarks}
          />
          <ColumnConfinementPanel
            input={input}
            value={effectiveTie}
            onChange={updateTie}
            design={transverse.design}
            error={transverse.error}
            policy={policy}
            remarks={remarks}
            onRemarksChange={changeRemarks}
          />
          <ColumnTieDesignSummary
            policy={policy}
            groups={reviewGroups
              .filter((g) => g.checks.length)
              .map((g) => {
                const d = g.checks
                  .map((c) => c.dcr)
                  .filter((v): v is number => v !== null && !Number.isNaN(v));
                return {
                  label: g.label,
                  panel: g.panel,
                  dcr: d.length ? Math.max(...d) : null,
                };
              })}
            value={effectiveTie}
            onChange={updateTie}
            design={transverse.design}
            quantity={quantityEff}
            drawingAction={drawingAction}
            onAdopt={() => {
              if (!transverse.design) return;
              editVersion.current++;
              changeQuantity(
                adoptTieDesignToQuantity(
                  { ...quantityEff, enabled: true },
                  effectiveTie.tie,
                  transverse.design,
                ),
              );
              setSaved(false);
              setMessage(
                "Adopted tie design written to the Quantity Estimate. Checked cut lengths were cleared.",
              );
              document
                .getElementById("column-quantity")
                ?.scrollIntoView({ behavior: "smooth" });
            }}
          />
        </>
      ) : null}
      {result ? (
        <ColumnQuantityPanel
          section={input}
          value={quantityEff}
          drawingAction={drawingAction}
          onChange={(next) => {
            editVersion.current++;
            changeQuantity(next);
            setSaved(false);
          }}
        />
      ) : null}
    </div>
  );
}
