/**
 * Shared save / run actions (decision 17 Oct 2026): Save changes (green) in
 * each input section, Run calculation beside it, results withheld while out
 * of date, and Save to project = save changes + copy into another project.
 */
import { existsSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import {
  SaveRunBar,
  SaveToProject,
  StaleResultsNotice,
} from "../src/components/calc-actions";
import {
  copyCalculationToProject,
  postCalculation,
} from "../src/lib/calc-save";

const bar = (over: Partial<Parameters<typeof SaveRunBar>[0]> = {}) =>
  renderToStaticMarkup(
    <SaveRunBar
      dirty={false}
      busy={false}
      canSave
      onSave={() => {}}
      stale={false}
      onRun={() => {}}
      {...over}
    />,
  );

describe("SaveRunBar", () => {
  it("shows Save changes next to Run calculation", () => {
    const html = bar({ section: "Geometry" });
    expect(html.indexOf("Save changes")).toBeGreaterThan(-1);
    expect(html.indexOf("Run calculation")).toBeGreaterThan(
      html.indexOf("Save changes"),
    );
    expect(html).toContain('aria-label="Geometry: save and run"');
  });
  it("Save changes is disabled with nothing to save, enabled with edits", () => {
    expect(bar()).toMatch(/<button[^>]*disabled=""[^>]*>Save changes/);
    expect(bar({ dirty: true })).not.toMatch(
      /<button[^>]*disabled=""[^>]*>Save changes/,
    );
    expect(bar({ dirty: true })).toContain("Unsaved changes");
  });
  it("cannot save without a project and says why", () => {
    const html = bar({
      dirty: true,
      canSave: false,
      saveBlockedReason: "Create or select a project first.",
    });
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Save changes/);
    expect(html).toContain('title="Create or select a project first."');
  });
  it("shows the save time (Manila) and the out-of-date flag", () => {
    expect(bar({ savedAt: "2026-10-17T14:24:00Z" })).toContain("Saved 22:24");
    expect(bar({ stale: true })).toContain("Results out of date");
    expect(bar()).not.toContain("Results out of date");
  });
  it("stale notice offers Run calculation", () => {
    const html = renderToStaticMarkup(<StaleResultsNotice onRun={() => {}} />);
    expect(html).toContain("Inputs changed since the last run");
    expect(html).toContain("Run calculation");
  });
  it("Save to project… starts closed", () => {
    const html = renderToStaticMarkup(
      <SaveToProject
        moduleSlug="slab"
        title="SL-01"
        canCopy
        buildPayload={() => ({})}
        saveChanges={async () => true}
      />,
    );
    expect(html).toContain("Save to project…");
    expect(html).toContain('aria-expanded="false"');
  });
});

describe("calc-save helpers", () => {
  afterEach(() => vi.unstubAllGlobals());
  const respond = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status });
  it("postCalculation returns the draft, or the duplicate on 409", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          respond(201, { draft: { id: "d1", title: "A" } }),
        )
        .mockResolvedValueOnce(
          respond(409, {
            error: "exists",
            duplicate: {
              id: "d0",
              title: "A",
              updatedAt: "",
              suggestion: "A (2)",
            },
          }),
        ),
    );
    const base = {
      projectId: "p",
      moduleSlug: "slab",
      title: "A",
      payload: {},
    };
    expect(await postCalculation(base)).toMatchObject({
      ok: true,
      draft: { id: "d1" },
    });
    expect(await postCalculation(base)).toMatchObject({
      ok: false,
      duplicate: { suggestion: "A (2)" },
    });
  });
  it("network failure keeps inputs and says retry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const r = await postCalculation({
      projectId: "p",
      moduleSlug: "slab",
      title: "A",
      payload: {},
    });
    expect(r).toMatchObject({ ok: false });
    expect(r.ok ? "" : r.error).toContain("retry saving");
  });
  it("copy never sends an id or overwrite; a taken title uses the suggested name once", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        respond(409, {
          duplicate: {
            id: "d0",
            title: "BP-01",
            updatedAt: "",
            suggestion: "BP-01 (2)",
          },
        }),
      )
      .mockResolvedValueOnce(
        respond(201, { draft: { id: "c1", title: "BP-01 (2)" } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const r = await copyCalculationToProject({
      projectId: "p2",
      moduleSlug: "base-plate",
      title: "BP-01",
      payload: { kind: "base-plate" },
    });
    expect(r).toMatchObject({
      ok: true,
      renamed: true,
      draft: { title: "BP-01 (2)" },
    });
    const bodies = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body));
    expect(
      bodies.map((b) => [b.projectId, b.title, b.id, b.overwrite]),
    ).toEqual([
      ["p2", "BP-01", undefined, false],
      ["p2", "BP-01 (2)", undefined, false],
    ]);
  });
});

const CHROME = [
  process.env.CHROMIUM_PATH,
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
].find((p): p is string => !!p && existsSync(p));
describe("save / run in the browser", () => {
  it.skipIf(!CHROME)(
    "edit → out of date → run; save to project saves first, then copies",
    async () => {
      const out = await build({
        entryPoints: [
          new URL("./browser/calc-actions-entry.tsx", import.meta.url).pathname,
        ],
        bundle: true,
        write: false,
        outdir: "/tmp/calc-actions-test",
        format: "esm",
        jsx: "automatic",
        define: { "process.env.NODE_ENV": '"production"' },
        logLevel: "silent",
        alias: { "@": new URL("../src", import.meta.url).pathname },
      });
      const js = out.outputFiles.find((f) => f.path.endsWith(".js"))!.text;
      const css =
        out.outputFiles.find((f) => f.path.endsWith(".css"))?.text ?? "";
      const browser = await chromium.launch({
        executablePath: CHROME,
        args: ["--no-sandbox"],
      });
      try {
        const page = await browser.newPage();
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await page.setContent(
          `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div id="root"></div></body></html>`,
        );
        await page.addScriptTag({ content: js, type: "module" });
        const result = page.locator("#result");
        // Run once on open.
        await expect.poll(() => result.textContent()).toBe("20");
        // Edit: results withheld, flagged, Save changes enabled.
        await page.locator("#a").fill("3");
        await expect.poll(() => result.textContent()).toBe("stale");
        expect(await page.getByText("Results out of date").count()).toBe(1);
        expect(
          await page.getByRole("button", { name: "Save changes" }).isEnabled(),
        ).toBe(true);
        const runsBefore = await page.evaluate(
          () => (window as unknown as { runs: number }).runs,
        );
        // Editing does not run the engine; Run does.
        await page.locator("#a").fill("4");
        expect(
          await page.evaluate(
            () => (window as unknown as { runs: number }).runs,
          ),
        ).toBe(runsBefore);
        await page
          .getByRole("group", { name: "Geometry: save and run" })
          .getByRole("button", { name: "Run calculation" })
          .click();
        await expect.poll(() => result.textContent()).toBe("40");
        expect(await page.getByText("Results out of date").count()).toBe(0);
        // Engine error after a run is shown, not hidden.
        await page.locator("#a").fill("-1");
        await page
          .getByRole("group", { name: "Geometry: save and run" })
          .getByRole("button", { name: "Run calculation" })
          .click();
        await expect.poll(() => result.textContent()).toBe("a must be ≥ 0");
        // Save to project: only other projects listed; saves, then copies.
        await page.getByRole("button", { name: "Save to project…" }).click();
        const options = await page.locator("select option").allTextContents();
        expect(options).toEqual(["Tower B"]);
        await page.getByRole("button", { name: "Save and copy" }).click();
        await page
          .getByText("Copy saved to “Tower B” as “BP-01 (2)”")
          .waitFor();
        const w = await page.evaluate(() => {
          const x = window as unknown as { posts: unknown[]; copied: string[] };
          return { posts: x.posts, copied: x.copied };
        });
        expect(w.posts).toEqual([
          { projectId: "p1", title: "BP-01", id: "own" },
          { projectId: "p2", title: "BP-01" },
          { projectId: "p2", title: "BP-01 (2)" },
        ]);
        expect(w.copied).toEqual(["p2:BP-01 (2)"]);
        expect(errors).toEqual([]);
      } finally {
        await browser.close();
      }
    },
    60000,
  );
});
