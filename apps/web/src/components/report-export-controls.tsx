"use client";
import { useState } from "react";
import type { ReportData } from "../lib/reports/data";
export function ReportExportControls({
  disabled,
  onData,
  moduleName,
}: {
  disabled: boolean;
  moduleName: "RC Column" | "Slab Design";
  onData: () => Promise<ReportData>;
}) {
  const [type, setType] = useState<"simple" | "complete">("simple"),
    [paper, setPaper] = useState<"A4" | "Letter">("A4"),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function download() {
    setBusy(true);
    setMessage("Generating PDF…");
    try {
      const data = await onData();
      const { generateCalculationPdf } = await import("../lib/reports/pdf");
      const settings = data.project?.reportSettings;
      let nolaLogo = settings?.nolaLogo ?? undefined;
      if (!nolaLogo) {
        const response = await fetch("/brand/nola-logo.png");
        if (!response.ok) throw Error("The Ñola Logo Could Not Be Loaded.");
        const blob = await response.blob();
        nolaLogo = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(Error("Logo Could Not Be Read."));
          reader.readAsDataURL(blob);
        });
      }
      const result = await generateCalculationPdf(data, {
        type,
        paper,
        nolaLogo,
      });
      const date = new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        timeZone: "Asia/Manila",
      })
        .format(new Date())
        .replaceAll("-", "");
      const name = (data.title + "_" + data.module)
        .replace(/[^\p{L}\p{N}_-]+/gu, "_")
        .slice(0, 90);
      const blob = new Blob([new Uint8Array(result.bytes)], {
          type: "application/pdf",
        }),
        url = URL.createObjectURL(blob),
        link = document.createElement("a");
      link.href = url;
      link.download = date + "_" + name + "_" + type + "_" + paper + ".pdf";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      setMessage(
        result.pageCount +
          " Page" +
          (result.pageCount === 1 ? "" : "s") +
          " Exported.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "PDF Export Failed.");
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
            {moduleName === "Slab Design"
              ? "Simple Report — Up To Two Pages"
              : "Simple Report — One Page"}
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
        onClick={download}
      >
        {busy ? "Generating…" : "Download Project PDF Report"}
      </button>
      <p role="status">{message}</p>
    </div>
  );
}
