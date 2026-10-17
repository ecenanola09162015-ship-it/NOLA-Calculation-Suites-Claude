"use client";
/**
 * Standard save / run actions for every calculation module (17 Oct 2026):
 *
 * - <SaveRunBar>: green "Save changes" (update this calculation file) next
 *   to "Run calculation". Placed in each section where inputs change often
 *   (geometry, materials, loads); every instance saves the whole file.
 * - <SaveToProject>: "Save to project…" saves changes, then copies the
 *   calculation into another project of the same account.
 *
 * The project list and the explorer update come from <CalcSuiteProvider>
 * (suite-workspace.tsx), so module workspaces do not pass them around.
 */
import {
  createContext,
  useContext,
  useId,
  useState,
  type ReactNode,
} from "react";
import type { CalculationDraftRecord, ProjectRecord } from "@/lib/projects";
import { copyCalculationToProject } from "@/lib/calc-save";
import styles from "./calc-actions.module.css";

type SuiteValue = {
  projects: ProjectRecord[];
  /** A copy was created in another project: add it to the explorer. */
  onCopied: (draft: CalculationDraftRecord) => void;
};
const CalcSuiteContext = createContext<SuiteValue>({
  projects: [],
  onCopied: () => {},
});
export function CalcSuiteProvider({
  projects,
  onCopied,
  children,
}: SuiteValue & { children: ReactNode }) {
  return (
    <CalcSuiteContext.Provider value={{ projects, onCopied }}>
      {children}
    </CalcSuiteContext.Provider>
  );
}

const savedTime = (iso?: string) => {
  if (!iso || Number.isNaN(Date.parse(iso))) return "";
  return new Intl.DateTimeFormat("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Manila",
  }).format(new Date(iso));
};

export function SaveRunBar({
  dirty,
  busy,
  canSave,
  saveBlockedReason,
  savedAt,
  onSave,
  stale,
  onRun,
  runLabel = "Run calculation",
  section,
}: {
  /** Unsaved edits since the file was opened or last saved. */
  dirty: boolean;
  busy: boolean;
  /** Project selected, cloud ready, title present. */
  canSave: boolean;
  /** Shown as the button tooltip when saving is not possible. */
  saveBlockedReason?: string;
  /** ISO time of the last save in this session or of the opened file. */
  savedAt?: string;
  onSave: () => void;
  /** Inputs changed since the last run. */
  stale: boolean;
  onRun: () => void;
  runLabel?: string;
  /** Section name for accessible labels, e.g. "Geometry". */
  section?: string;
}) {
  const time = savedTime(savedAt);
  const status = busy
    ? "Saving…"
    : dirty
      ? "Unsaved changes"
      : time
        ? `Saved ${time}`
        : "No changes";
  return (
    <div
      className={styles.bar}
      role="group"
      aria-label={section ? `${section}: save and run` : "Save and run"}
    >
      <button
        type="button"
        className={styles.save}
        disabled={busy || !canSave || !dirty}
        title={!canSave ? saveBlockedReason : undefined}
        onClick={onSave}
      >
        {busy ? "Saving…" : "Save changes"}
      </button>
      <button
        type="button"
        className={`${styles.run} ${stale ? styles.runStale : ""}`}
        onClick={onRun}
      >
        {runLabel}
      </button>
      <span className={styles.status} aria-live="polite">
        {status}
        {stale ? (
          <span className={styles.stalePill}>Results out of date</span>
        ) : null}
      </span>
    </div>
  );
}

/** Placeholder where results would show while they are out of date. */
export function StaleResultsNotice({ onRun }: { onRun: () => void }) {
  return (
    <div className={styles.notice} role="status">
      <p>
        Inputs changed since the last run. Run the calculation to update
        results, drawings of results and reports.
      </p>
      <button type="button" className={styles.run} onClick={onRun}>
        Run calculation
      </button>
    </div>
  );
}

export function SaveToProject({
  currentProjectId,
  moduleSlug,
  title,
  canCopy,
  buildPayload,
  saveChanges,
}: {
  currentProjectId?: string;
  moduleSlug: string;
  title: string;
  /** Valid inputs and cloud ready. */
  canCopy: boolean;
  /** Validated payload of the current inputs; throws with a message if invalid. */
  buildPayload: () => unknown;
  /** Saves changes to this file first; resolves false if that save failed. */
  saveChanges: () => Promise<boolean>;
}) {
  const { projects, onCopied } = useContext(CalcSuiteContext);
  const others = projects.filter((p) => p.id !== currentProjectId);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const selectId = useId();
  const chosen = others.find((p) => p.id === target) ?? others[0];
  async function copy() {
    if (!chosen) return;
    setBusy(true);
    setMessage("");
    try {
      const payload = buildPayload();
      if (!(await saveChanges())) return;
      const result = await copyCalculationToProject({
        projectId: chosen.id,
        moduleSlug,
        title: title.trim(),
        payload,
      });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      onCopied(result.draft);
      setMessage(
        `Changes saved. Copy saved to “${chosen.name}” as “${result.draft.title}”${result.renamed ? " (name already used there)" : ""}.`,
      );
      setOpen(false);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Copy failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={styles.copy}>
      <button
        type="button"
        className="suiteSecondary"
        disabled={!canCopy || busy}
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          setMessage("");
        }}
      >
        Save to project…
      </button>
      {open ? (
        <div
          className={styles.copyPanel}
          role="group"
          aria-label="Save to project"
        >
          {others.length ? (
            <>
              <label htmlFor={selectId}>Copy this calculation to</label>
              <select
                id={selectId}
                value={chosen?.id ?? ""}
                onChange={(e) => setTarget(e.target.value)}
              >
                {others.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.buildingName ? ` · ${p.buildingName}` : ""}
                  </option>
                ))}
              </select>
              <p className={styles.hint}>
                Saves changes to this file, then creates a copy titled “
                {title.trim()}” in the selected project.
              </p>
              <div className={styles.copyActions}>
                <button
                  type="button"
                  className={styles.save}
                  disabled={busy}
                  onClick={copy}
                >
                  {busy ? "Saving…" : "Save and copy"}
                </button>
                <button
                  type="button"
                  className="suiteSecondary"
                  disabled={busy}
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <p className={styles.hint}>
              Create another project first; the copy goes to a different
              project.
            </p>
          )}
        </div>
      ) : null}
      {message ? (
        <p className={styles.hint} role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
