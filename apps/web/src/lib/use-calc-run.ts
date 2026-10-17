"use client";
/**
 * Explicit "Run calculation" (decision 17 Oct 2026). Results belong to the
 * inputs of the last run; after any edit they are withheld (`result` null,
 * `stale` true) until the user runs again, so screens, reports and exports
 * never show numbers that do not match the inputs on screen.
 *
 * A calculation opened from a project, or a new one with defaults, is run
 * once on open. Only inputs passed here mark results out of date; inputs that
 * do not feed the engine (title, report settings, estimates) do not.
 */
import { useCallback, useMemo, useRef, useState } from "react";

export interface CalculationRun<I, R> {
  /** Result of the last run, or null while out of date or failed. */
  result: R | null;
  /** Engine error of the last run ("" when out of date or successful). */
  error: string;
  /** Inputs changed since the last run. */
  stale: boolean;
  /** Run the engine on the current inputs. */
  run: () => void;
  /** Inputs of the last run. */
  ranInput: I;
}

export function useCalculationRun<I, R>(
  input: I,
  analyse: (input: I) => R,
  errorMessage = "Check numerical inputs.",
): CalculationRun<I, R> {
  const analyseRef = useRef(analyse);
  analyseRef.current = analyse;
  const [ranInput, setRanInput] = useState<I>(input);
  const inputKey = useMemo(() => JSON.stringify(input), [input]);
  const ranKey = useMemo(() => JSON.stringify(ranInput), [ranInput]);
  const stale = inputKey !== ranKey;
  const analysis = useMemo(() => {
    try {
      return { result: analyseRef.current(ranInput), error: "" };
    } catch (e) {
      return {
        result: null,
        error: e instanceof Error && e.message ? e.message : errorMessage,
      };
    }
  }, [ranInput, errorMessage]);
  const latest = useRef(input);
  latest.current = input;
  const run = useCallback(() => setRanInput(latest.current), []);
  return {
    result: stale ? null : analysis.result,
    error: stale ? "" : analysis.error,
    stale,
    run,
    ranInput,
  };
}
