"use client";
/**
 * Shown when a calculation title already exists in the same project and
 * module (API 409). Overwrite replaces that saved calculation in place, only
 * after this explicit confirmation.
 */
export type DraftDuplicate = {
  id: string;
  title: string;
  updatedAt: string;
  suggestion: string;
};

export function DuplicateSavePrompt({
  duplicate,
  busy,
  onOverwrite,
  onSaveAs,
  onCancel,
}: {
  duplicate: DraftDuplicate;
  busy: boolean;
  onOverwrite: () => void;
  onSaveAs: (title: string) => void;
  onCancel: () => void;
}) {
  const saved = Number.isNaN(Date.parse(duplicate.updatedAt))
    ? ""
    : new Intl.DateTimeFormat("en-PH", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Manila",
      }).format(new Date(duplicate.updatedAt));
  return (
    <div className="duplicatePrompt" role="alertdialog" aria-live="assertive">
      <p>
        “{duplicate.title}” already exists in this project
        {saved ? ` (last saved ${saved})` : ""}. Overwrite it, or save under a
        new name?
      </p>
      <button
        type="button"
        className="suitePrimary dangerAction"
        disabled={busy}
        onClick={onOverwrite}
      >
        Overwrite “{duplicate.title}”
      </button>
      <button
        type="button"
        className="suiteSecondary"
        disabled={busy}
        onClick={() => onSaveAs(duplicate.suggestion)}
      >
        Save as “{duplicate.suggestion}”
      </button>
      <button
        type="button"
        className="suiteSecondary"
        disabled={busy}
        onClick={onCancel}
      >
        Cancel
      </button>
    </div>
  );
}
