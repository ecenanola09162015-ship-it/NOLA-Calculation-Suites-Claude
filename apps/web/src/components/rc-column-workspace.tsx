"use client";

import { calculateRcColumn, type ModuleDefinition } from "@nola/calc-core";
import Link from "next/link";
import { useMemo, useState } from "react";

import type { ProjectRecord } from "@/lib/projects";

type ColumnDraft = {
  title: string;
  code: "ACI 318-19" | "NSCP 2015";
  widthMm: number;
  depthMm: number;
  concreteStrengthMpa: number;
  steelYieldStrengthMpa: number;
  elasticModulusMpa: number;
  clearCoverMm: number;
  tieDiameterMm: number;
  barDiameterMm: number;
  barCount: number;
  unsupportedLengthMm: number;
  loadCase: string;
  axialDemandKn: number;
  momentXKnM: number;
  momentYKnM: number;
  designedBy: string;
  checkedBy: string;
};

const initialDraft: ColumnDraft = {
  title: "C1 · Ground floor",
  code: "ACI 318-19",
  widthMm: 450,
  depthMm: 450,
  concreteStrengthMpa: 28,
  steelYieldStrengthMpa: 420,
  elasticModulusMpa: 200000,
  clearCoverMm: 40,
  tieDiameterMm: 10,
  barDiameterMm: 25,
  barCount: 8,
  unsupportedLengthMm: 3000,
  loadCase: "1.2D + 1.0E + L",
  axialDemandKn: 1450,
  momentXKnM: 120,
  momentYKnM: 85,
  designedBy: "",
  checkedBy: "",
};

function Field({
  label,
  name,
  value,
  unit,
  onChange,
  min,
  step,
}: {
  label: string;
  name: keyof ColumnDraft;
  value: number | string;
  unit?: string;
  onChange: (name: keyof ColumnDraft, value: string) => void;
  min?: number;
  step?: number;
}) {
  const numeric = typeof value === "number";
  return (
    <label className="engineeringField">
      <span>{label}</span>
      <span className="inputWithUnit">
        <input
          name={name}
          type={numeric ? "number" : "text"}
          value={value}
          min={min}
          step={step}
          onChange={(event) => onChange(name, event.target.value)}
        />
        {unit ? <small>{unit}</small> : null}
      </span>
    </label>
  );
}

function ColumnSection({ draft }: { draft: ColumnDraft }) {
  const points = useMemo(() => {
    const count = Math.max(4, Math.min(20, Math.round(draft.barCount)));
    const perimeter: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < count; i += 1) {
      const t = i / count;
      const distance = t * 4;
      if (distance < 1) perimeter.push({ x: distance, y: 0 });
      else if (distance < 2) perimeter.push({ x: 1, y: distance - 1 });
      else if (distance < 3) perimeter.push({ x: 3 - distance, y: 1 });
      else perimeter.push({ x: 0, y: 4 - distance });
    }
    return perimeter;
  }, [draft.barCount]);
  const innerX = 62;
  const innerY = 42;
  const innerW = 176;
  const innerH = 176;
  return (
    <svg
      className="columnSection"
      viewBox="0 0 300 270"
      role="img"
      aria-label="Reinforced concrete column section preview"
    >
      <defs>
        <pattern
          id="concrete-grid"
          width="12"
          height="12"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 12 0 L 0 0 0 12"
            fill="none"
            stroke="#d9d1bf"
            strokeWidth="0.7"
          />
        </pattern>
      </defs>
      <rect
        x="40"
        y="20"
        width="220"
        height="220"
        rx="4"
        fill="#eee8dc"
        stroke="#62594a"
        strokeWidth="2"
      />
      <rect
        x="40"
        y="20"
        width="220"
        height="220"
        rx="4"
        fill="url(#concrete-grid)"
      />
      <rect
        x="55"
        y="35"
        width="190"
        height="190"
        rx="12"
        fill="none"
        stroke="#ba647c"
        strokeWidth="3"
      />
      {points.map((point, index) => (
        <circle
          key={index}
          cx={innerX + point.x * innerW}
          cy={innerY + point.y * innerH}
          r="8"
          fill="#355f73"
          stroke="#fff"
          strokeWidth="2"
        />
      ))}
      <path
        d="M40 255 H260 M40 249 V261 M260 249 V261"
        stroke="#6750a4"
        strokeWidth="1.5"
      />
      <text x="150" y="268" textAnchor="middle" fontSize="11" fill="#47327e">
        b = {draft.widthMm} mm
      </text>
      <text
        x="18"
        y="132"
        textAnchor="middle"
        fontSize="11"
        fill="#47327e"
        transform="rotate(-90 18 132)"
      >
        h = {draft.depthMm} mm
      </text>
    </svg>
  );
}

export function RcColumnWorkspace({
  module,
  projects,
}: {
  module: ModuleDefinition;
  projects: ProjectRecord[];
}) {
  const [draft, setDraft] = useState(initialDraft);
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [message, setMessage] = useState("Inputs have not been checked.");
  const [draftId, setDraftId] = useState<string>();
  const barArea = (Math.PI * draft.barDiameterMm ** 2) / 4;
  const steelArea = barArea * draft.barCount;
  const grossArea = draft.widthMm * draft.depthMm;
  const steelRatio = grossArea > 0 ? (steelArea / grossArea) * 100 : 0;

  function update(name: keyof ColumnDraft, value: string) {
    setDraft((current) => ({
      ...current,
      [name]: typeof current[name] === "number" ? Number(value) : value,
    }));
    setMessage("Inputs changed · run interface check before saving.");
  }

  function runInterfaceCheck() {
    try {
      const result = calculateRcColumn(
        {
          widthMm: draft.widthMm,
          depthMm: draft.depthMm,
          concreteStrengthMpa: draft.concreteStrengthMpa,
          steelYieldStrengthMpa: draft.steelYieldStrengthMpa,
          axialDemandKn: draft.axialDemandKn,
          momentXKnM: draft.momentXKnM,
          momentYKnM: draft.momentYKnM,
        },
        {
          family: draft.code.startsWith("NSCP")
            ? "NSCP"
            : "American / International",
          standard: draft.code.startsWith("NSCP") ? "NSCP" : "ACI 318",
          edition: draft.code.startsWith("NSCP") ? "2015" : "2019",
        },
      );
      setMessage(
        result.warnings[0]?.message ?? "Engineering verification is required.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Check the entered values.",
      );
    }
  }

  async function saveDraft() {
    if (!projectId) {
      setMessage("Create or select a cloud project before saving this draft.");
      return;
    }
    setMessage("Saving draft…");
    const response = await fetch("/api/calculations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: draftId,
        projectId,
        moduleSlug: "rc-column",
        title: draft.title,
        payload: draft,
      }),
    });
    const data = (await response.json()) as {
      draft?: { id: string };
      error?: string;
    };
    if (!response.ok || !data.draft) {
      setMessage(data.error ?? "Draft could not be saved.");
      return;
    }
    setDraftId(data.draft.id);
    setMessage(
      "Draft saved securely. Design results remain verification-locked.",
    );
  }

  return (
    <main className="designerShell">
      <header className="designerTopbar">
        <div>
          <Link href="/launcher" className="backLink">
            ← Launcher
          </Link>
          <h1>{module.name} Designer</h1>
        </div>
        <div className="designerActions">
          <span className="statusBadge">Interface-only</span>
          <button className="secondaryButton" type="button" onClick={saveDraft}>
            Save draft
          </button>
          <button
            className="primaryButton"
            type="button"
            onClick={runInterfaceCheck}
          >
            Run interface check
          </button>
        </div>
      </header>

      <section className="designerContext">
        <label>
          <span>Project</span>
          <select
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
          >
            <option value="">
              {projects.length
                ? "Select project"
                : "Create a project to enable cloud saves"}
            </option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <Field
          label="Calculation title"
          name="title"
          value={draft.title}
          onChange={update}
        />
        <label>
          <span>Design reference</span>
          <select
            value={draft.code}
            onChange={(event) => update("code", event.target.value)}
          >
            <option>ACI 318-19</option>
            <option>NSCP 2015</option>
          </select>
        </label>
      </section>

      <section className="designerGrid">
        <aside className="inputRail">
          <details open>
            <summary>01 · Section & materials</summary>
            <div className="fieldGrid">
              <Field
                label="Width, b"
                name="widthMm"
                value={draft.widthMm}
                unit="mm"
                min={1}
                onChange={update}
              />
              <Field
                label="Depth, h"
                name="depthMm"
                value={draft.depthMm}
                unit="mm"
                min={1}
                onChange={update}
              />
              <Field
                label="Concrete, f′c"
                name="concreteStrengthMpa"
                value={draft.concreteStrengthMpa}
                unit="MPa"
                min={1}
                onChange={update}
              />
              <Field
                label="Steel, fy"
                name="steelYieldStrengthMpa"
                value={draft.steelYieldStrengthMpa}
                unit="MPa"
                min={1}
                onChange={update}
              />
              <Field
                label="Steel modulus, Es"
                name="elasticModulusMpa"
                value={draft.elasticModulusMpa}
                unit="MPa"
                min={1}
                onChange={update}
              />
              <Field
                label="Unsupported length"
                name="unsupportedLengthMm"
                value={draft.unsupportedLengthMm}
                unit="mm"
                min={1}
                onChange={update}
              />
            </div>
          </details>
          <details open>
            <summary>02 · Reinforcement</summary>
            <div className="fieldGrid">
              <Field
                label="Clear cover"
                name="clearCoverMm"
                value={draft.clearCoverMm}
                unit="mm"
                min={1}
                onChange={update}
              />
              <Field
                label="Tie diameter"
                name="tieDiameterMm"
                value={draft.tieDiameterMm}
                unit="mm"
                min={1}
                onChange={update}
              />
              <Field
                label="Longitudinal bar"
                name="barDiameterMm"
                value={draft.barDiameterMm}
                unit="mm"
                min={1}
                onChange={update}
              />
              <Field
                label="Bar count"
                name="barCount"
                value={draft.barCount}
                unit="bars"
                min={4}
                step={1}
                onChange={update}
              />
            </div>
          </details>
          <details open>
            <summary>03 · Factored load</summary>
            <div className="fieldGrid">
              <Field
                label="Combination"
                name="loadCase"
                value={draft.loadCase}
                onChange={update}
              />
              <Field
                label="Axial, Pu"
                name="axialDemandKn"
                value={draft.axialDemandKn}
                unit="kN"
                onChange={update}
              />
              <Field
                label="Moment, Mux"
                name="momentXKnM"
                value={draft.momentXKnM}
                unit="kN·m"
                onChange={update}
              />
              <Field
                label="Moment, Muy"
                name="momentYKnM"
                value={draft.momentYKnM}
                unit="kN·m"
                onChange={update}
              />
            </div>
          </details>
          <details>
            <summary>04 · Report information</summary>
            <div className="fieldGrid">
              <Field
                label="Designed by"
                name="designedBy"
                value={draft.designedBy}
                onChange={update}
              />
              <Field
                label="Checked by"
                name="checkedBy"
                value={draft.checkedBy}
                onChange={update}
              />
            </div>
          </details>
        </aside>

        <section className="designCanvas">
          <div className="canvasHeader">
            <div>
              <p className="eyebrow">SECTION PREVIEW</p>
              <h2>{draft.title || "Untitled column"}</h2>
            </div>
            <span>SI units</span>
          </div>
          <div className="sectionStage">
            <ColumnSection draft={draft} />
          </div>
          <div className="metricStrip" aria-label="Input summaries">
            <div>
              <span>Gross area</span>
              <strong>{grossArea.toLocaleString()} mm²</strong>
            </div>
            <div>
              <span>Steel area</span>
              <strong>{steelArea.toFixed(0)} mm²</strong>
            </div>
            <div>
              <span>Input steel ratio</span>
              <strong>{steelRatio.toFixed(2)}%</strong>
            </div>
          </div>
          <p className="visualNote">
            Geometry is a schematic input preview, not a detailing drawing.
          </p>
        </section>

        <aside className="resultsRail">
          <div className="verificationBanner">
            <span>VERIFICATION GATE</span>
            <strong>Design capacities are locked</strong>
            <p>{message}</p>
          </div>
          <div className="resultBlock">
            <h2>Design check</h2>
            <div className="lockedMetric">
              <span>Governing DCR</span>
              <strong>—</strong>
            </div>
            <div className="lockedMetric">
              <span>Axial capacity</span>
              <strong>—</strong>
            </div>
            <div className="lockedMetric">
              <span>Biaxial interaction</span>
              <strong>—</strong>
            </div>
          </div>
          <div className="resultBlock">
            <h2>Release checklist</h2>
            <ul className="releaseChecklist">
              <li className="done">Input schema and units</li>
              <li className="done">Account-scoped draft record</li>
              <li>ACI 318-19 benchmark cases</li>
              <li>NSCP 2015 mapping review</li>
              <li>Independent engineer approval</li>
            </ul>
          </div>
          <div className="resultBlock provenance">
            <h2>Calculation provenance</h2>
            <dl>
              <div>
                <dt>Module</dt>
                <dd>RC Column</dd>
              </div>
              <div>
                <dt>Engine</dt>
                <dd>verification-locked</dd>
              </div>
              <div>
                <dt>Reference</dt>
                <dd>{draft.code}</dd>
              </div>
              <div>
                <dt>Record</dt>
                <dd>{draftId ? "Cloud draft" : "Unsaved draft"}</dd>
              </div>
            </dl>
          </div>
        </aside>
      </section>
    </main>
  );
}
