"use client";
/**
 * Unsaved-changes guard (17 Oct 2026). A workspace is "dirty" from the first
 * edit after it opens or saves until the next successful save. While dirty,
 * closing/reloading the tab asks the browser's leave-page question, and the
 * suite asks before opening another calculation, module or project.
 */
import { useEffect } from "react";

export const UNSAVED_MESSAGE =
  "You have unsaved changes in this calculation. Leave without saving?";

export function useUnsavedGuard(
  dirty: boolean,
  onDirtyChange?: (dirty: boolean) => void,
) {
  useEffect(() => {
    onDirtyChange?.(dirty);
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = UNSAVED_MESSAGE; // required by some browsers
      return UNSAVED_MESSAGE;
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, onDirtyChange]);
  // A workspace that unmounts is no longer dirty for the suite.
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
}

/** true = go ahead (nothing unsaved, or the user confirmed leaving). */
export function confirmLeave(dirty: boolean, ask = window.confirm) {
  return !dirty || ask(UNSAVED_MESSAGE);
}
