"use client";
/**
 * Underground tank "Drawing Section": preview of the section drawing model,
 * then download as DXF (AutoCAD 2007 / AC1021, mm, 1:20). The DXF writer
 * loads only on download; the drawing model is shared with the preview.
 */
import { useMemo, useState } from "react";
import type { TankInput, TankResult } from "@nola/calc-core";
import { tankSectionDrawing } from "../lib/cad/tank-section-drawing";
import { sectionDrawingToSvg } from "../lib/cad/section-svg";

export function TankDxfButton({ input, result, title }: { input: TankInput; result: TankResult | null; title: string }) {
  const [open, setOpen] = useState(false);
  const [colour, setColour] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const drawing = useMemo(
    () => (open && result ? tankSectionDrawing(input, result, (title.trim() || "UNDERGROUND TANK").toUpperCase()) : null),
    [open, input, result, title],
  );
  if (!result) return null;
  return (
    <div className="sectionDrawing">
      <button type="button" className="suiteSecondary" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {open ? "Close Drawing Section" : "Drawing Section (DXF)"}
      </button>
      {open && drawing ? (
        <div className="sectionDrawingPreview">
          <div className="sectionDrawingBar">
            <strong>{drawing.fileName}</strong>
            <label className="rcCheckbox">
              <input type="checkbox" checked={colour} onChange={(e) => setColour(e.target.checked)} />
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
                  const { sectionDrawingToDxf } = await import("../lib/cad/section-dxf");
                  const url = URL.createObjectURL(new Blob([sectionDrawingToDxf(drawing)], { type: "application/dxf" }));
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = drawing.fileName;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  setTimeout(() => URL.revokeObjectURL(url), 30000);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "The DXF file could not be created.");
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
            dangerouslySetInnerHTML={{ __html: sectionDrawingToSvg(drawing, { colour }) }}
          />
          <p className="rcMuted">
            AutoCAD 2007 DXF (AC1021), mm, plot scale 1:20, office layers (S-CONC, S-REBR-MAIN, S-DIMS, S-ANNO…). Bars as centrelines,
            section along the long side with the plan below; liquid and groundwater levels dashed. Detailing review required.
          </p>
        </div>
      ) : null}
    </div>
  );
}
