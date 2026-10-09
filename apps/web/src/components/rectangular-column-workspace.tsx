"use client";
import { useRef, useState } from "react";
import {
  analyzeRectangularColumn,
  parseColumnLoads,
  columnDraftSchema,
  defaultColumnQuantity,
  type ColumnQuantityInput,
  type RectangularColumnInput,
  type RectangularColumnResult,
  type ColumnLoad,
} from "@nola/calc-core";
import type { ProjectRecord, CalculationDraftRecord } from "@/lib/projects";
import {
  ColumnSection,
  ColumnPMPlot,
  ColumnBiaxialPlot,
} from "./column-diagrams";
import { ColumnQuantityPanel } from "./column-quantity-panel";
const initial: RectangularColumnInput = {
  code: "ACI 318-19",
  width: 600,
  depth: 800,
  fc: 35,
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
      included: true,
    },
    {
      id: "LC2",
      description: "1.2D + 1.6L + 0.5Wx",
      pu: 3200,
      mx: 200,
      my: 120,
      included: true,
    },
    {
      id: "LC3",
      description: "1.2D + 1.6L - 0.5Wx",
      pu: 2800,
      mx: -180,
      my: 100,
      included: true,
    },
    {
      id: "LC4",
      description: "1.2D + 1.6L + 0.5Wy",
      pu: 3000,
      mx: 100,
      my: 180,
      included: true,
    },
    {
      id: "LC5",
      description: "1.2D + 1.6L - 0.5Wy",
      pu: 3000,
      mx: -120,
      my: -150,
      included: true,
    },
  ],
};
const fields = [
  ["width", "Width b", "mm"],
  ["depth", "Depth h", "mm"],
  ["fc", "Concrete f′c", "MPa"],
  ["fy", "Steel fy", "MPa"],
  ["es", "Steel Es", "MPa"],
  ["cover", "Clear cover to ties", "mm"],
  ["tieDiameter", "Tie diameter", "mm"],
] as const;
const fmt = (n: number | null, places = 2) =>
  n === null || !Number.isFinite(n)
    ? "—"
    : n.toLocaleString("en-US", {
        maximumFractionDigits: places,
        minimumFractionDigits: places,
      });
function NumberField({
  label,
  value,
  onChange,
  unit,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  unit?: string;
}) {
  return (
    <label>
      {label}
      {unit && <span className="rcUnit">{unit}</span>}
      <input
        type="number"
        step="any"
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) =>
          onChange(e.target.value === "" ? NaN : Number(e.target.value))
        }
      />
    </label>
  );
}
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
  const [input, setInput] = useState<RectangularColumnInput>(() =>
    restored.success ? restored.data.input : structuredClone(initial),
  );
  const [quantity, setQuantity] = useState<ColumnQuantityInput>(() =>
    restored.success && restored.data.quantity
      ? restored.data.quantity
      : defaultColumnQuantity(initial.tieDiameter),
  );
  const [scope, setScope] = useState(
    restored.success ? restored.data.scopeConfirmed : false,
  );
  const [title, setTitle] = useState(draft?.title ?? "C1 · Ground floor");
  const [id, setId] = useState(draft?.id);
  const [result, setResult] = useState<RectangularColumnResult | null>(null);
  const [selected, setSelected] = useState("");
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(Boolean(restored.success));
  const [busy, setBusy] = useState(false);
  const [paste, setPaste] = useState("");
  const [preview, setPreview] = useState<ColumnLoad[] | null>(null);
  const [pasteError, setPasteError] = useState("");
  const [nX, setNX] = useState(4),
    [nY, setNY] = useState(4),
    [diameter, setDiameter] = useState(25);
  function update(next: RectangularColumnInput) {
    editVersion.current++;
    setInput(next);
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
    const bars = [];
    for (let i = 0; i < nX; i++)
      for (const sign of [-1, 1])
        bars.push({ x: -x + (2 * x * i) / (nX - 1), y: sign * y, diameter });
    for (let i = 1; i < nY - 1; i++)
      for (const sign of [-1, 1])
        bars.push({ x: sign * x, y: -y + (2 * y * i) / (nY - 1), diameter });
    update({ ...input, bars });
  }
  function calculate() {
    setMessage("");
    try {
      if (!scope)
        throw new Error(
          "Confirm that demands are suitable for a section-strength check. Slenderness and second-order effects are not calculated here.",
        );
      const parsed = columnDraftSchema.safeParse({
        kind: "rc-column",
        version: 1,
        input,
        scopeConfirmed: scope,
        quantity,
      });
      if (!parsed.success)
        throw new Error(
          parsed.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join(" · "),
        );
      const next = analyzeRectangularColumn(parsed.data.input);
      setResult(next);
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
  async function save() {
    if (!project) return;
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
      };
      const parsed = columnDraftSchema.safeParse(payload);
      if (!parsed.success)
        throw new Error(
          "Complete valid numerical inputs and unique combination labels before saving.",
        );
      const response = await fetch("/api/calculations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          projectId: project.id,
          moduleSlug: "rc-column",
          title,
          payload: parsed.data,
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "Could not save calculation.");
      setId(body.draft.id);
      setSaved(editVersion.current === saveVersion);
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
              setSaved(false);
            }}
          />
        </label>
        <label className="cqQuickToggle">
          <input
            type="checkbox"
            checked={quantity.enabled}
            onChange={(e) => {
              editVersion.current++;
              setQuantity({ ...quantity, enabled: e.target.checked });
              setSaved(false);
            }}
          />{" "}
          <span>
            <strong>Enable Quantity Estimate</strong>
            <small>
              {quantity.enabled
                ? "ON · Steel & concrete quantities"
                : "OFF · Optional steel & concrete quantities"}
            </small>
          </span>
        </label>
        <a className="suiteSecondary cqJump" href="#column-quantity">
          Open estimate ↓
        </a>
        <span className="suiteBadge isPilot">Rectangular · Tied · SI</span>
        <span>{saved ? "Saved inputs" : "Unsaved inputs"}</span>
        <button
          className="suiteSecondary"
          disabled={!project || !cloudReady || busy || !title.trim()}
          onClick={save}
        >
          {busy ? "Saving…" : "Save to project"}
        </button>
        <button className="suitePrimary" onClick={calculate}>
          Calculate section
        </button>
        <button
          className="suiteSecondary"
          disabled={!result}
          onClick={() => window.print()}
        >
          Print / PDF
        </button>
      </div>
      {!project && (
        <p className="rcAlert">
          Create or select a project to save your column calculation.
        </p>
      )}
      <p className="rcFeedback" role="status" aria-live="polite">
        {message}
      </p>
      <div className="rcGrid">
        <section className="rcPanel">
          <h2>01 · Section & Materials</h2>
          <label>
            Design code
            <select
              value={input.code}
              onChange={(e) =>
                update({
                  ...input,
                  code: e.target.value as RectangularColumnInput["code"],
                })
              }
            >
              <option>ACI 318-19</option>
              <option value="NSCP 2015">
                NSCP 2015 project — ACI 318-19 calculation basis
              </option>
              <option disabled>BS EN 1992 — Future Development</option>
              <option disabled>AS 3600 — Future Development</option>
            </select>
          </label>
          {input.code === "NSCP 2015" && (
            <p className="rcAlert">
              Project standard: NSCP 2015. Calculation basis: ACI 318-19. This
              option uses the same ACI section-strength engine; it does not
              confirm compliance with every NSCP 2015 provision.
            </p>
          )}
          <div className="rcFields">
            {fields.map(([key, label, unit]) => (
              <NumberField
                key={key}
                label={label}
                unit={unit}
                value={input[key]}
                onChange={(value) => update({ ...input, [key]: value })}
              />
            ))}
          </div>
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
              I have assessed slenderness and second-order effects separately.
              Entered demands are suitable for a section-strength check.
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
              <NumberField
                label="Bar Diameter"
                unit="mm"
                value={diameter}
                onChange={setDiameter}
              />
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
          <table>
            <thead>
              <tr>
                <th>Bar</th>
                <th>x (mm)</th>
                <th>y (mm)</th>
                <th>Diameter (mm)</th>
                <th>Remove</th>
              </tr>
            </thead>
            <tbody>
              {input.bars.map((bar, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  {(["x", "y", "diameter"] as const).map((key) => (
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
              bars: [...input.bars, { x: 0, y: 0, diameter: 25 }],
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
            Workbook headers are accepted.
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
                Muy {fmt(preview[0]?.my ?? 0)} kN·m.
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
          <table>
            <thead>
              <tr>
                <th>Use</th>
                <th>Label</th>
                <th>Description</th>
                <th>Pu (kN)</th>
                <th>Mux (kN·m)</th>
                <th>Muy (kN·m)</th>
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
      </section>
      <ColumnQuantityPanel
        section={input}
        value={quantity}
        onChange={(next) => {
          editVersion.current++;
          setQuantity(next);
          setSaved(false);
        }}
      />
      {result ? (
        <section className="rcResults">
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
                    <th>φMnx (kN·m)</th>
                    <th>φMny (kN·m)</th>
                    <th>Axial ratio</th>
                    <th>Linear interaction</th>
                    <th>Screening result</th>
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
                      <td>{fmt(c.capacityX)}</td>
                      <td>{fmt(c.capacityY)}</td>
                      <td>{c.load.included ? fmt(c.axialRatio, 3) : "—"}</td>
                      <td>{fmt(c.interaction, 3)}</td>
                      <td
                        className={
                          c.outcome === "outside-screening-envelope"
                            ? "rcOutside"
                            : ""
                        }
                      >
                        {c.outcome === "not-checked"
                          ? "Excluded"
                          : c.outcome === "outside-screening-envelope"
                            ? "Outside envelope"
                            : "Within envelope"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="rcMuted">
              Within envelope does not confirm code compliance. “—” indicates no
              available capacity or an excluded combination.
            </p>
          </section>
          <div className="rcGrid">
            <section className="rcPanel">
              <h3>Linear Biaxial Screen · {selected}</h3>
              <p>
                At Pu = {fmt(check?.load.pu ?? null)} kN, use capacities from
                the applicable signed branches.
              </p>
              <ColumnBiaxialPlot check={check} />
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
                  <dt>Linear screen</dt>
                  <dd>|Mux| / φMnx(Pu) + |Muy| / φMny(Pu) ≤ 1</dd>
                </div>
              </dl>
              <p className="rcMuted">
                ACI 318-19: 22.2.2 (section assumptions), Table 22.2.2.4.3 (β₁),
                Table 21.2.2 (φ), Table 22.4.2.1 (axial cap). Linear biaxial
                screening follows your workbook and is not represented as a
                complete ACI biaxial design check.
              </p>
            </section>
          </div>
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
    </div>
  );
}
