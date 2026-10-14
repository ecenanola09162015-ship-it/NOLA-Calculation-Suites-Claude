"use client";
/**
 * "Drawing Section": preview of the column section drawing, then download as
 * DXF (AutoCAD 2007 / AC1021). The DXF writer loads only on download.
 */
import { useMemo, useState } from "react";
import type {
  ColumnQuantityInput,
  ColumnTieDesignInput,
  RectangularColumnInput,
  TransverseResult,
} from "@nola/calc-core";
import { columnSectionDrawing } from "../lib/cad/column-section-drawing";
import { sectionDrawingToSvg } from "../lib/cad/section-svg";

export function ColumnSectionDrawingButton({
  input,
  tie,
  design,
  hookBasis,
  title,
  projectName,
}: {
  input: RectangularColumnInput;
  tie: ColumnTieDesignInput;
  design: TransverseResult | null;
  hookBasis: ColumnQuantityInput["hookBasis"];
  title: string;
  projectName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [colour, setColour] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const drawing = useMemo(
    () =>
      open && design
        ? columnSectionDrawing({
            input,
            tie,
            design,
            hookBasis,
            title: title.trim() || "COLUMN",
            projectName,
          })
        : null,
    [open, input, tie, design, hookBasis, title, projectName],
  );
  if (!design) return null;
  return (
    <div className="sectionDrawing">
      <button
        type="button"
        className="suiteSecondary"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "Close Drawing Section" : "Drawing Section"}
      </button>
      {open && drawing ? (
        <div className="sectionDrawingPreview">
          <div className="sectionDrawingBar">
            <strong>{drawing.fileName}</strong>
            <label className="rcCheckbox">
              <input
                type="checkbox"
                checked={colour}
                onChange={(e) => setColour(e.target.checked)}
              />
              <span>Layer colours</span>
            </label>
            <button
              type="button"
              className="suitePrimary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const { sectionDrawingToDxf } = await import(
                    "../lib/cad/section-dxf"
                  );
                  const text = sectionDrawingToDxf(drawing);
                  const url = URL.createObjectURL(
                    new Blob([text], { type: "application/dxf" }),
                  );
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = drawing.fileName;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  setTimeout(() => URL.revokeObjectURL(url), 30000);
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : "The DXF file could not be created.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Preparing…" : "Download DXF"}
            </button>
          </div>
          {error ? <p className="rcAlert">{error}</p> : null}
          <div
            className="sectionDrawingSvg"
            role="img"
            aria-label={`Section drawing ${drawing.title}`}
            dangerouslySetInnerHTML={{
              __html: sectionDrawingToSvg(drawing, { colour }),
            }}
          />
          <p className="rcMuted">
            AutoCAD 2007 DXF (AC1021), mm, plot scale 1:20, layers S-CONC,
            S-REBR-MAIN / TIES / XTIE, S-DIMS, S-ANNO… (colour by layer).
            Hooks per the estimate&apos;s hook basis; bend radii per ACI 318-19
            Table 25.3.3. Preview shown monochrome as plotted.
          </p>
        </div>
      ) : null}
    </div>
  );
}
