/**
 * RC Column adopts the shared save / run actions (17 Oct 2026): Save changes
 * (green) + Run calculation in the toolbar and at the end of panels 01–03;
 * Save to project copies into another project. Engine flow is unchanged.
 */
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { analyzeRectangularColumn, columnDraftSchema } from "@nola/calc-core";
import { RectangularColumnWorkspace } from "../src/components/rectangular-column-workspace";
import { fmt } from "../src/components/column-ui";
import { columnSaveRunFixture } from "./browser/column-save-run-fixture";

const fresh = () =>
  renderToStaticMarkup(
    <RectangularColumnWorkspace cloudReady={false} onSaved={() => {}} />,
  );

describe("RC Column save / run actions", () => {
  it("Save changes + Run calculation in the toolbar and panels 01–03, in order", () => {
    const html = fresh();
    const bars = [
      "Calculation",
      "Section &amp; Materials",
      "Reinforcement Layout",
      "Factored Load Combinations",
    ].map((s) => html.indexOf(`aria-label="${s}: save and run"`));
    expect(
      bars.every((i) => i > -1),
      JSON.stringify(bars),
    ).toBe(true);
    expect([...bars].sort((a, b) => a - b)).toEqual(bars);
    expect(html.match(/>Save changes</g)).toHaveLength(4);
    expect(html.match(/>Run calculation</g)?.length).toBeGreaterThanOrEqual(4);
    // Panel bars sit after their panel heading.
    expect(bars[1]).toBeGreaterThan(
      html.indexOf("01 · Section &amp; Materials"),
    );
    expect(bars[2]).toBeGreaterThan(html.indexOf("02 · Reinforcement Layout"));
    expect(bars[3]).toBeGreaterThan(
      html.indexOf("03 · Factored Load Combinations"),
    );
  });
  it("Save to project… replaces the old in-project button; no Calculate section text", () => {
    const html = fresh();
    expect(html).toContain("Save to project…");
    expect(html).not.toContain("Calculate section");
    expect(html).not.toContain(">Save to project<");
    expect(html).toContain("Run calculation to enable export");
  });
  it("without a project Save changes is disabled and says why", () => {
    expect(fresh()).toMatch(
      /<button[^>]*disabled=""[^>]*title="Create or select a project to save this calculation\."[^>]*>Save changes/,
    );
  });
  it("fixture is a valid saved draft", () => {
    expect(
      columnDraftSchema.safeParse({
        kind: "rc-column",
        version: 1,
        input: columnSaveRunFixture,
        scopeConfirmed: true,
      }).success,
    ).toBe(true);
  });
});

const CHROME = [
  process.env.CHROMIUM_PATH,
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
].find((p): p is string => !!p && existsSync(p));
describe("RC Column save / run in the browser", () => {
  it.skipIf(!CHROME)(
    "Run shows engine results; an edit clears them; Save changes updates the same file",
    async () => {
      const expected = analyzeRectangularColumn(columnSaveRunFixture);
      const out = await build({
        entryPoints: [
          new URL("./browser/column-save-run-entry.tsx", import.meta.url)
            .pathname,
        ],
        bundle: true,
        write: false,
        outdir: "/tmp/column-save-run-test",
        format: "esm",
        jsx: "automatic",
        define: { "process.env.NODE_ENV": '"production"' },
        logLevel: "silent",
        alias: { "@": new URL("../src", import.meta.url).pathname },
      });
      const js = out.outputFiles.find((f) => f.path.endsWith(".js"))!.text;
      const css = out.outputFiles
        .filter((f) => f.path.endsWith(".css"))
        .map((f) => f.text)
        .join("\n");
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
        await page.getByText("Column Dimensions").waitFor();
        const bar = (s: string) =>
          page.getByRole("group", { name: `${s}: save and run` });
        // Not run yet: out of date; nothing to save on a just-opened file.
        expect(
          await page.getByText("Results out of date").count(),
        ).toBeGreaterThan(0);
        expect(
          await bar("Section & Materials")
            .getByRole("button", { name: "Save changes" })
            .isEnabled(),
        ).toBe(false);
        await bar("Factored Load Combinations")
          .getByRole("button", { name: "Run calculation" })
          .click();
        const stat = (label: string) =>
          page
            .locator(".rcStats > div", { hasText: label })
            .locator("strong")
            .textContent();
        await page.locator(".rcStats").waitFor();
        expect(await stat("Steel area Ast")).toBe(
          `${fmt(expected.steelArea)} mm²`,
        );
        expect(await stat("φPn,max")).toBe(`${fmt(expected.axialCap)} kN`);
        expect(await stat("Governing combination")).toBe(
          expected.governing?.load.id ?? "—",
        );
        expect(await page.getByText("Results out of date").count()).toBe(0);
        // Edit: results cleared, flagged, Save changes enabled everywhere.
        await page.getByLabel("Depth h").fill("650");
        await page.getByText("Results Workspace").waitFor();
        expect(
          await page.getByText("Results out of date").count(),
        ).toBeGreaterThan(0);
        await bar("Reinforcement Layout")
          .getByRole("button", { name: "Save changes" })
          .click();
        await page.getByText("Changes saved.").waitFor();
        const posts = await page.evaluate(
          () => (window as unknown as { posts: unknown[] }).posts,
        );
        expect(posts).toEqual([{ id: "saved", projectId: "p1" }]);
        expect(
          await bar("Calculation")
            .getByRole("button", { name: "Save changes" })
            .isEnabled(),
        ).toBe(false);
        expect(errors).toEqual([]);
      } finally {
        await browser.close();
      }
    },
    60000,
  );
});
