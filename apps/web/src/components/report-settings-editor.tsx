"use client";
import { squareLogoLayout } from "../lib/reports/logos";
import type { Dispatch, SetStateAction } from "react";
import { type ProjectReportSettings } from "@nola/calc-core";
export async function readReportLogo(
  file: File,
  options: { square?: boolean } = {},
): Promise<{ data: string; padded: boolean }> {
  if (!["image/png", "image/jpeg"].includes(file.type) || file.size > 5_000_000)
    throw Error("Choose A PNG Or JPEG Logo Smaller Than 5 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    let max = 512;
    for (let attempt = 0; attempt < 5; attempt++) {
      const fit = squareLogoLayout(bitmap.width, bitmap.height, max);
      const canvas = document.createElement("canvas");
      // Square logos are padded (transparent), never cropped or stretched.
      canvas.width = options.square ? fit.side : fit.width;
      canvas.height = options.square ? fit.side : fit.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw Error("Logo Preview Is Not Available In This Browser.");
      ctx.drawImage(
        bitmap,
        options.square ? fit.x : 0,
        options.square ? fit.y : 0,
        fit.width,
        fit.height,
      );
      const data = canvas.toDataURL("image/png");
      if (data.length <= 180000)
        return { data, padded: !!options.square && fit.padded };
      max *= 0.7;
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
      {(["companyLogo"] as const).map((key) => (
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
                  const { data, padded } = await readReportLogo(file, {
                    square: key === "companyLogo",
                  });
                  onChange((previous) => ({ ...previous, [key]: data }));
                  if (padded)
                    onError(
                      "Company Logo Was Not Square: It Was Padded To 1:1 Without Cropping. Upload A Square Logo For Best Results.",
                    );
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
          {key === "companyLogo" ? (
            <small className="logoHint">
              Use A Square Logo (1:1), PNG Or JPG, At Least 300 × 300 px.
              Printed Only In The Upper-Left Box Of The PDF Report Header.
              Non-Square Images Are Padded To A Square.
            </small>
          ) : null}
          {value[key] ? (
            <img
              className="logoPreview"
              src={value[key]!}
              alt="Company logo preview"
              width={64}
              height={64}
            />
          ) : null}
          <p>
            {value[key] ? "Company Logo Ready" : "No Company Logo Selected"}
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
