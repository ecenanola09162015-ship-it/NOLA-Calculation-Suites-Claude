"use client";
import { useState } from "react";
import {
  defaultDesignCheckPolicy,
  type DesignCheckPolicy,
} from "@nola/calc-core";
import type { ProjectRecord } from "@/lib/projects";
export const projectInformationFields = [
  ["name", "Project Name"],
  ["buildingName", "Building Name"],
  ["location", "Location"],
  ["preparedBy", "Prepared By"],
  ["checkedBy", "Checked By"],
  ["approvedBy", "Approved By"],
] as const;
export function ProjectContext({
  project,
  moduleName,
  onEdit,
}: {
  project?: ProjectRecord;
  moduleName: string;
  onEdit: () => void;
}) {
  return (
    <header className="activeProjectHeader" aria-label="Active Project">
      <nav aria-label="Project Breadcrumb">
        <span>{project?.name ?? "No Project Selected"}</span>
        <span aria-hidden="true"> › </span>
        <span>{project?.buildingName ?? "Building"}</span>
        <span aria-hidden="true"> › </span>
        <strong>{moduleName}</strong>
      </nav>
      <div className="activeProjectDetails">
        <dl>
          {projectInformationFields.map(([key, label]) => (
            <div key={key}>
              <dt>{label}:</dt>
              <dd>{project?.[key] || "Not Set"}</dd>
            </div>
          ))}
          <div>
            <dt>Module Type:</dt>
            <dd>{moduleName}</dd>
          </div>
        </dl>
        {project ? (
          <button
            type="button"
            className="suiteSecondary"
            aria-label="Edit Project Information"
            onClick={onEdit}
          >
            ✎ Edit
          </button>
        ) : null}
      </div>
    </header>
  );
}
export function ProjectEditor({
  project,
  busy,
  message,
  cloudReady,
  onSave,
  onCancel,
}: {
  project: ProjectRecord;
  busy: boolean;
  message: string;
  cloudReady: boolean;
  onSave: (form: FormData) => Promise<void>;
  onCancel: () => void;
}) {
  const [policy, setPolicy] = useState<DesignCheckPolicy>(
    project.designCheckPolicy ?? defaultDesignCheckPolicy,
  );
  return (
    <aside
      className="suiteDrawer projectEditor"
      aria-labelledby="edit-project-title"
    >
      <h2 id="edit-project-title">Edit Project Information</h2>
      <form action={onSave}>
        {projectInformationFields.map(([key, label]) => (
          <label key={key}>
            {label}
            <input
              name={key}
              required
              maxLength={100}
              defaultValue={project[key]}
            />
          </label>
        ))}
        <input
          name="designCheckPolicy"
          type="hidden"
          value={JSON.stringify(policy)}
        />
        <details>
          <summary>Design Check Status Settings</summary>
          <p>
            Shared By All Modules In This Project. Saved Calculations Retain A
            Policy Snapshot.
          </p>
          {(
            [
              ["optimizeBelow", "Optimization Boundary"],
              ["passThrough", "Pass Limit"],
              ["judgmentThrough", "Engineering Judgment Limit"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={Number.isFinite(policy[key]) ? policy[key] : ""}
                onChange={(e) =>
                  setPolicy({ ...policy, [key]: Number(e.target.value) })
                }
              />
            </label>
          ))}
          {(["optimize", "pass", "judgment", "improve"] as const).map((key) => (
            <div key={key}>
              <label>
                {key} Label
                <input
                  maxLength={100}
                  required
                  value={policy.bands[key].label}
                  onChange={(e) =>
                    setPolicy({
                      ...policy,
                      bands: {
                        ...policy.bands,
                        [key]: { ...policy.bands[key], label: e.target.value },
                      },
                    })
                  }
                />
              </label>
              <label>
                {key} Color
                <input
                  type="color"
                  value={policy.bands[key].color}
                  onChange={(e) =>
                    setPolicy({
                      ...policy,
                      bands: {
                        ...policy.bands,
                        [key]: { ...policy.bands[key], color: e.target.value },
                      },
                    })
                  }
                />
              </label>
            </div>
          ))}
        </details>
        <p role="status">{message}</p>
        <button
          type="submit"
          className="suitePrimary"
          disabled={busy || !cloudReady}
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          className="suiteSecondary"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </button>
      </form>
    </aside>
  );
}
