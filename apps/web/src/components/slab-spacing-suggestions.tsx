"use client";
/**
 * Suggested Design: main-only, extra-only and main + extra spacing
 * suggestions with Adopt buttons (per layer and all layers) and Undo.
 * Larger diameters are adopted only after the confirmation box is ticked.
 */
import { useState } from "react";
import {
  rebarDesignation,
  slabAdoptSpacing,
  type SlabBarSuggestion,
  type SlabExtraSuggestion,
  type SlabInput,
  type SlabLayer,
  type SlabRecommendation,
  type SlabSuggestionMode,
} from "@nola/calc-core";

const modes: { id: SlabSuggestionMode; label: string; note: string }[] = [
  {
    id: "main-only",
    label: "Main only",
    note: "Largest main spacing with the entered extra bars credited.",
  },
  {
    id: "extra-only",
    label: "Extra only",
    note: "Main bars as entered; extras only where needed, at 1×–3× the main spacing.",
  },
  {
    id: "combined",
    label: "Main + Extra",
    note: "Main bars for the moment outside the extra zones; extras where the moment is higher. Adopt both.",
  },
];
const layerLabel = (layer: SlabLayer) => layer.replace("-", " · ");

export function SlabSpacingSuggestions({
  input,
  recommendations,
  onSuggest,
  onAdopt,
  onUndo,
  canUndo,
  adoptedNote,
}: {
  input: SlabInput;
  recommendations: SlabRecommendation[];
  onSuggest: () => void;
  onAdopt: (next: SlabInput, note: string) => void;
  onUndo: () => void;
  canUndo: boolean;
  adoptedNote: string;
}) {
  const [mode, setMode] = useState<SlabSuggestionMode>("combined"),
    [allowUpsize, setAllowUpsize] = useState(false);
  const std = input.rebarStandard ?? "PNS49";
  const bar = (s: SlabBarSuggestion) => (
    <>
      {rebarDesignation(std, s.diameter)} @ {s.spacing} mm
      {s.upsized && (
        <em className="slabUpsized" title="Larger than the entered diameter">
          {" "}
          larger Ø — confirm
        </em>
      )}
    </>
  );
  const extraText = (e: SlabExtraSuggestion) =>
    e.status === "required" && e.suggestion ? (
      bar(e.suggestion)
    ) : (
      <span className="slabMutedInline">
        {e.status === "not-required"
          ? "Not required"
          : e.status === "not-applicable"
            ? "Not applicable"
            : "No arrangement"}
      </span>
    );
  const mainOf = (r: SlabRecommendation): SlabBarSuggestion | null =>
    mode === "main-only"
      ? r.spacing !== null
        ? { diameter: r.diameter, spacing: r.spacing, upsized: false }
        : r.mainUpsize
      : mode === "combined"
        ? (r.combined?.main ?? null)
        : null;
  const extraOf = (r: SlabRecommendation): SlabExtraSuggestion | null =>
    mode === "extra-only"
      ? r.extra
      : mode === "combined"
        ? (r.combined?.extra ?? null)
        : null;
  const adopt = (target: "main" | "extra", layers?: SlabLayer[]) => {
    const res = slabAdoptSpacing(
      input,
      recommendations,
      mode,
      target,
      layers,
      allowUpsize,
    );
    const what = target === "main" ? "Main" : "Extra";
    const note = res.adopted.length
      ? `${what} bars adopted (${modes.find((m) => m.id === mode)!.label}): ${res.adopted.map(layerLabel).join(", ")}.${res.skipped.length ? ` Unchanged: ${res.skipped.map(layerLabel).join(", ")}.` : ""}`
      : `No ${what.toLowerCase()} bars adopted${allowUpsize ? "" : " (larger diameters need the confirmation box)"}; layers left as entered.`;
    onAdopt(res.input, note);
  };
  const hasMain = mode !== "extra-only",
    hasExtra = mode !== "main-only";
  return (
    <div className="slabSuggest">
      <button className="suiteSecondary" onClick={onSuggest}>
        Suggest spacing
      </button>
      {recommendations.length > 0 && (
        <>
          <div
            className="slabSuggestModes"
            role="radiogroup"
            aria-label="Suggestion type"
          >
            {modes.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={mode === m.id}
                className={mode === m.id ? "isActive" : undefined}
                onClick={() => setMode(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="slabMuted">{modes.find((m) => m.id === mode)!.note}</p>
          {recommendations.map((r) => {
            const main = mainOf(r),
              extra = extraOf(r);
            return (
              <div className="slabRecommendation" key={r.layer}>
                <strong>{layerLabel(r.layer)}</strong>
                {hasMain && (
                  <span>
                    Main:{" "}
                    {main ? (
                      bar(main)
                    ) : (
                      <span className="slabMutedInline">No arrangement</span>
                    )}
                  </span>
                )}
                {hasExtra && (
                  <span>
                    Extra:{" "}
                    {extra ? (
                      extraText(extra)
                    ) : (
                      <span className="slabMutedInline">No arrangement</span>
                    )}
                  </span>
                )}
                <small>
                  {mode === "main-only"
                    ? r.reason
                    : mode === "extra-only"
                      ? r.extra.reason
                      : (r.combined?.reason ??
                        "No main + extra arrangement found up to three sizes larger.")}
                </small>
                <span className="slabSuggestLayerButtons">
                  {hasMain && main && (
                    <button
                      type="button"
                      onClick={() => adopt("main", [r.layer])}
                    >
                      Adopt main
                    </button>
                  )}
                  {hasExtra && extra?.status === "required" && (
                    <button
                      type="button"
                      onClick={() => adopt("extra", [r.layer])}
                    >
                      Adopt extra
                    </button>
                  )}
                </span>
              </div>
            );
          })}
          <label className="slabUpsizeConfirm">
            <input
              type="checkbox"
              checked={allowUpsize}
              onChange={(e) => setAllowUpsize(e.target.checked)}
            />
            Allow larger bar diameters (confirm Ø change; changes d, elevations
            and development length)
          </label>
          <div className="slabAdoptButtons">
            <button
              className="suitePrimary"
              disabled={!hasMain}
              onClick={() => adopt("main")}
            >
              Adopt Spacing to Main Bars
            </button>
            <button
              className="suitePrimary"
              disabled={!hasExtra}
              onClick={() => adopt("extra")}
            >
              Adopt Spacing to Extra Bars
            </button>
            {canUndo && (
              <button className="suiteSecondary" onClick={onUndo}>
                Undo adopt
              </button>
            )}
          </div>
        </>
      )}
      <p className="slabMuted" role="status">
        {adoptedNote
          ? `${adoptedNote} Adopted — recheck shear, anchorage and serviceability.`
          : "Your inputs remain unchanged. Recheck the full design after any manual change."}
      </p>
    </div>
  );
}
