import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DuplicateSavePrompt } from "../src/components/duplicate-save-prompt";

describe("duplicate calculation prompt", () => {
  it("offers overwrite, save-as with the suggested name, and cancel", () => {
    const html = renderToStaticMarkup(
      <DuplicateSavePrompt
        duplicate={{
          id: "x",
          title: "C1 – Ground",
          updatedAt: "2026-10-13T07:40:00.000Z",
          suggestion: "C1 – Ground (2)",
        }}
        busy={false}
        onOverwrite={() => {}}
        onSaveAs={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(html).toContain("already exists in this project");
    expect(html).toContain("last saved");
    expect(html).toContain("Overwrite “C1 – Ground”");
    expect(html).toContain("Save as “C1 – Ground (2)”");
    expect(html).toContain("Cancel");
  });
});
