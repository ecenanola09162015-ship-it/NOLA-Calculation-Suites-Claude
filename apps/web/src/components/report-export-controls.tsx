"use client";
import { useEffect, useState } from "react";
import type { ReportData } from "../lib/reports/data";
import { REPORT_NOLA_LOGO_PATH } from "../lib/reports/logos";

const loadPdf = () => import("../lib/reports/pdf");
const loadData = () => import("../lib/reports/data");

/** Fetched once per page load and reused by every export. */
let logoPromise: Promise<string> | null = null;
async function fetchLogo(): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(REPORT_NOLA_LOGO_PATH);
      if (!response.ok) throw Error();
      const blob = await response.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(Error());
        reader.readAsDataURL(blob);
      });
    } catch {
      /* retry once */
    }
  }
  throw Error("The Ñola Logo Could Not Be Loaded.");
}
function nolaLogo() {
  logoPromise ??= fetchLogo().catch((e) => {
    logoPromise = null;
    throw e;
  });
  return logoPromise;
}

/**
 * A deploy replaces the hashed script files. A page opened before it then
 * cannot load the report code it has not fetched yet.
 */
export function isStaleBuildError(error: unknown) {
  const text =
    error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /ChunkLoadError|Loading chunk|dynamically imported module|Importing a module script failed|error loading dynamically/i.test(
    text,
  );
}

/** File name: date_title_module_type_paper[_RevX].pdf */
export function reportFileName(
  data: Pick<ReportData, "title" | "module" | "project">,
  type: "simple" | "complete",
  paper: "A4" | "Letter",
  now = new Date(),
) {
  const date = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Manila",
  })
    .format(now)
    .replaceAll("-", "");
  const safe = (v: string) => v.replace(/[^\p{L}\p{N}_-]+/gu, "_");
  const name = safe(data.title + "_" + data.module).slice(0, 90);
  const rev = String(data.project?.reportSettings?.revision ?? "").trim();
  return (
    [date, name, type, paper].join("_") +
    (rev ? "_Rev" + safe(rev).slice(0, 12) : "") +
    ".pdf"
  );
}

type Problem =
  | { kind: "error"; text: string }
  | { kind: "too-long"; text: string }
  | { kind: "stale"; text: string };

export function ReportExportControls({
  disabled,
  disabledReason,
  hint,
  onData,
  moduleName,
}: {
  disabled: boolean;
  /** Why the button is disabled (shown under it). */
  disabledReason?: string;
  /** Non-blocking notice, e.g. remarks still required. */
  hint?: string;
  moduleName: "RC Column" | "Slab Design" | "Base Plate" | "Stairs" | "Concrete Retaining Wall";
  onData: () => Promise<ReportData>;
}) {
  const [type, setType] = useState<"simple" | "complete">("simple"),
    [paper, setPaper] = useState<"A4" | "Letter">("A4"),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [problem, setProblem] = useState<Problem | null>(null);
  // Load the report code and logo with the page, so a later deploy cannot
  // leave this page without them.
  useEffect(() => {
    const t = setTimeout(() => {
      loadPdf().catch(() => {});
      loadData().catch(() => {});
      nolaLogo().catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, []);
  async function download(kind = type) {
    setBusy(true);
    setProblem(null);
    setMessage("Generating PDF…");
    try {
      const data = await onData();
      const { generateCalculationPdf } = await loadPdf();
      // The Ñola logo is permanent on every report and cannot be replaced.
      const logo = await nolaLogo();
      const result = await generateCalculationPdf(data, {
        type: kind,
        paper,
        nolaLogo: logo,
      });
      const blob = new Blob([new Uint8Array(result.bytes)], {
          type: "application/pdf",
        }),
        url = URL.createObjectURL(blob),
        link = document.createElement("a");
      link.href = url;
      link.download = reportFileName(data, kind, paper);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      setMessage(
        `${moduleName} · ` +
          result.pageCount +
          " Page" +
          (result.pageCount === 1 ? "" : "s") +
          " Exported." +
          (result.warnings?.length ? " " + result.warnings.join(" ") : ""),
      );
    } catch (error) {
      setMessage("");
      if (isStaleBuildError(error))
        setProblem({
          kind: "stale",
          text: "The site was updated after this page was opened. Save your work, then reload the page to export.",
        });
      else if (error instanceof Error && error.name === "ReportTooLongError")
        setProblem({ kind: "too-long", text: error.message });
      else
        setProblem({
          kind: "error",
          text: error instanceof Error ? error.message : "PDF Export Failed.",
        });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="reportExportControls">
      <label>
        Report Type
        <select
          value={type}
          onChange={(e) => setType(e.target.value as typeof type)}
        >
          <option value="simple">
            {moduleName !== "Slab Design"
              ? "Simple Report — Up To Three Pages"
              : "Simple Report — Up To Two Pages"}
          </option>
          <option value="complete">Complete Report</option>
        </select>
      </label>
      <label>
        Paper Size
        <select
          value={paper}
          onChange={(e) => setPaper(e.target.value as typeof paper)}
        >
          <option>A4</option>
          <option>Letter</option>
        </select>
      </label>
      <button
        type="button"
        className="suiteSecondary"
        disabled={disabled || busy}
        onClick={() => download()}
      >
        {busy ? "Generating…" : "Download Project PDF Report"}
      </button>
      {disabled && disabledReason ? (
        <p className="reportExportHint">{disabledReason}</p>
      ) : !disabled && hint ? (
        <p className="reportExportHint">{hint}</p>
      ) : null}
      {problem ? (
        <div className="reportExportError" role="alert">
          <p>{problem.text}</p>
          {problem.kind === "too-long" ? (
            <button
              type="button"
              className="suiteSecondary"
              disabled={busy}
              onClick={() => {
                setType("complete");
                download("complete");
              }}
            >
              Export Complete Report Instead
            </button>
          ) : problem.kind === "stale" ? (
            <button
              type="button"
              className="suiteSecondary"
              onClick={() => window.location.reload()}
            >
              Reload Page
            </button>
          ) : null}
        </div>
      ) : null}
      <p role="status">{message}</p>
    </div>
  );
}
