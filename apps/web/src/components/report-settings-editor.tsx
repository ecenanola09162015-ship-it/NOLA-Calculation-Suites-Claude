"use client";
import type { Dispatch, SetStateAction } from "react";
import { type ProjectReportSettings } from "@nola/calc-core";
export async function readReportLogo(file: File): Promise<string> {
  if (!["image/png", "image/jpeg"].includes(file.type) || file.size > 5_000_000)
    throw Error("Choose A PNG Or JPEG Logo Smaller Than 5 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    let scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
    for (let attempt = 0; attempt < 5; attempt++) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw Error("Logo Preview Is Not Available In This Browser.");
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL("image/png");
      if (data.length <= 180000) return data;
      scale *= 0.7;
    }
    throw Error("Choose A Smaller Logo Image.");
  } finally {
    bitmap.close();
  }
}
export function ReportSettingsEditor({
  value,
  busy,
  onChange,
  onWorking,
  onError,
}: {
  value: ProjectReportSettings;
  busy: boolean;
  onChange: Dispatch<SetStateAction<ProjectReportSettings>>;
  onWorking: (v: boolean) => void;
  onError: (v: string) => void;
}) {
  return (
    <details>
      <summary>Project PDF Report Settings</summary>
      {(
        [
          ["ownerClient", "Owner / Client"],
          ["buildingDescription", "Building Description"],
          ["revision", "Revision No."],
          ["companyName", "Company Name"],
        ] as const
      ).map(([key, label]) => (
        <label key={key}>
          {label}
          <input
            name={key}
            value={value[key]}
            maxLength={
              key === "buildingDescription"
                ? 300
                : key === "revision"
                  ? 20
                  : 100
            }
            onChange={(e) => onChange({ ...value, [key]: e.target.value })}
          />
        </label>
      ))}
      {(["companyLogo", "nolaLogo"] as const).map((key) => (
        <div key={key}>
          <label>
            {key === "companyLogo" ? "Company Logo" : "Ñola Logo"}
            <input
              type="file"
              disabled={busy}
              accept="image/png,image/jpeg"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                onWorking(true);
                onError("");
                try {
                  const data = await readReportLogo(file);
                  onChange((previous) => ({ ...previous, [key]: data }));
                } catch (error) {
                  onError(
                    error instanceof Error
                      ? error.message
                      : "Logo Upload Failed.",
                  );
                } finally {
                  onWorking(false);
                  e.target.value = "";
                }
              }}
            />
          </label>
          <p>
            {value[key]
              ? "Custom Logo Ready"
              : key === "nolaLogo"
                ? "Uses The Supplied Ñola Logo"
                : "No Company Logo Selected"}
          </p>
          {value[key] ? (
            <button
              type="button"
              onClick={() => onChange({ ...value, [key]: null })}
            >
              Remove / Reset Logo
            </button>
          ) : null}
        </div>
      ))}
      <label>
        Footer Title
        <input
          value={value.style.footerTitle}
          maxLength={120}
          onChange={(e) =>
            onChange({
              ...value,
              style: { ...value.style, footerTitle: e.target.value },
            })
          }
        />
      </label>
      <label>
        PDF Font
        <select
          value={value.style.pdfFallbackFont}
          onChange={(e) =>
            onChange({
              ...value,
              style: {
                ...value.style,
                pdfFallbackFont: e.target
                  .value as ProjectReportSettings["style"]["pdfFallbackFont"],
              },
            })
          }
        >
          {["Helvetica", "TimesRoman", "Courier"].map((font) => (
            <option key={font}>{font}</option>
          ))}
        </select>
      </label>
      <p>
        Century Gothic Remains The Interface Font. PDF Text Uses The Selected
        Standard PDF Font.
      </p>
      <details>
        <summary>Report Style Configuration</summary>
        {Object.entries(value.style.colors).map(([key, color]) => (
          <label key={key}>
            {key} Color
            <input
              type="color"
              value={color}
              onChange={(e) =>
                onChange({
                  ...value,
                  style: {
                    ...value.style,
                    colors: { ...value.style.colors, [key]: e.target.value },
                  },
                })
              }
            />
          </label>
        ))}
        {(
          [
            "sectionTitleFontSize",
            "tableHeaderFontSize",
            "headerValueFontSize",
            "descriptionFontSize",
            "diagramFontSize",
            "lineGapPt",
            "tablePaddingPt",
            "simpleFontSize",
            "completeFontSize",
            "minimumFontSize",
            "labelFontSize",
            "footerFontSize",
            "marginMm",
            "gapPt",
            "headerHeightPt",
            "footerHeightPt",
          ] as const
        ).map((key) => (
          <label key={key}>
            {key}
            <input
              type="number"
              step="0.5"
              value={value.style[key]}
              onChange={(e) =>
                onChange({
                  ...value,
                  style: { ...value.style, [key]: Number(e.target.value) },
                })
              }
            />
          </label>
        ))}
      </details>
      <input
        type="hidden"
        name="reportSettings"
        value={JSON.stringify(value)}
      />
    </details>
  );
}
