/**
 * Stairs: standard save concept (17 Oct 2026). Save changes + Run calculation
 * in the toolbar and in each input section, Save to project, explicit Run
 * (results out of date after edits) and the unsaved-changes guard.
 */
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import {
  analyzeStairs,
  defaultStairsInput,
  fcFromPsi,
  stairsDesignChecks,
} from "@nola/calc-core";
import { StairWorkspace } from "../src/components/stair-workspace";

const governing = (waist?: number) => {
  const i = { ...defaultStairsInput(), fcPsi: 4000, fc: fcFromPsi(4000) };
  if (waist !== undefined) i.waist = waist;
  const dcr = Math.max(
    ...stairsDesignChecks(analyzeStairs(i)).map((c) => c.dcr ?? Infinity),
  );
  return dcr.toLocaleString("en-US", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
};

describe("stairs save / run actions", () => {
  const html = renderToStaticMarkup(
    <StairWorkspace cloudReady={false} onSaved={() => {}} />,
  );
  it("Save changes + Run calculation in the toolbar and every input section", () => {
    const groups = [
      ...html.matchAll(/aria-label="([^"]+): save and run"/g),
    ].map((m) => m[1]);
    expect(groups).toEqual([
      "Calculation",
      "Geometry",
      "Supports",
      "Materials",
      "Reinforcement",
      "Loads &amp; combinations",
      "Local loads",
    ]);
    expect(html.match(/>Save changes</g)).toHaveLength(7);
    expect(html.match(/>Run calculation</g)).toHaveLength(7);
    expect(html).not.toContain("Save stairs");
  });
  it("offers Save to project and cannot save without a project", () => {
    expect(html).toContain("Save to project…");
    expect(html).toContain(
      'title="Create or select a project to save this calculation."',
    );
  });
  it("runs once on open: results shown, not out of date", () => {
    expect(html).toContain(`Governing DCR ${governing()}`);
    expect(html).not.toContain("Results out of date");
  });
});

const CHROME = [
  process.env.CHROMIUM_PATH,
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
].find((p): p is string => !!p && existsSync(p));
describe("stairs save / run in the browser", () => {
  it.skipIf(!CHROME)(
    "edit → out of date + leave warning → Run = engine result → Save changes",
    async () => {
      const out = await build({
        entryPoints: [
          new URL("./browser/stair-save-entry.tsx", import.meta.url).pathname,
        ],
        bundle: true,
        write: false,
        outdir: "/tmp/stair-save-test",
        format: "esm",
        jsx: "automatic",
        define: { "process.env.NODE_ENV": '"production"' },
        logLevel: "silent",
        alias: { "@": new URL("../src", import.meta.url).pathname },
        loader: { ".woff2": "empty", ".webp": "empty" },
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
        await page
          .getByText(`Governing DCR ${governing()}`, { exact: true })
          .waitFor();
        const leaveBlocked = () =>
          page.evaluate(() => {
            const e = new Event("beforeunload", { cancelable: true });
            window.dispatchEvent(e);
            return e.defaultPrevented;
          });
        expect(await leaveBlocked()).toBe(false);
        // Edit the waist: results withheld and flagged; leave warning armed.
        await page.getByLabel(/Waist t/).fill("175");
        await page.getByText("Inputs changed since the last run").waitFor();
        expect(await page.getByText("Results out of date").count()).toBe(7);
        expect(
          await page.getByText("Governing DCR —", { exact: true }).count(),
        ).toBe(1);
        expect(await leaveBlocked()).toBe(true);
        expect(
          await page.evaluate(() =>
            (window as unknown as { dirty: boolean[] }).dirty.at(-1),
          ),
        ).toBe(true);
        // Run from the Geometry section: results equal the engine's.
        await page
          .getByRole("group", { name: "Geometry: save and run" })
          .getByRole("button", { name: "Run calculation" })
          .click();
        await page
          .getByText(`Governing DCR ${governing(175)}`, { exact: true })
          .waitFor();
        expect(await page.getByText("Results out of date").count()).toBe(0);
        // Save changes from the Materials section saves the whole file.
        await page
          .getByRole("group", { name: "Materials: save and run" })
          .getByRole("button", { name: "Save changes" })
          .click();
        await page.getByText("Saved 22:30").first().waitFor();
        const posts = await page.evaluate(
          () =>
            (window as unknown as { posts: Record<string, unknown>[] }).posts,
        );
        expect(posts).toHaveLength(1);
        const payload = posts[0]!.payload as {
          input: { waist: number };
          reviewCompleted: boolean;
        };
        expect(posts[0]!.moduleSlug).toBe("stairs");
        expect(payload.input.waist).toBe(175);
        expect(payload.reviewCompleted).toBe(true);
        expect(await leaveBlocked()).toBe(false);
        expect(errors).toEqual([]);
      } finally {
        await browser.close();
      }
    },
    90000,
  );
});
