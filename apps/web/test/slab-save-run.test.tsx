/**
 * Slab: standard save / run (decision 17 Oct 2026). Save changes + Run
 * calculation in the toolbar and in each input section; results withheld
 * after edits until Run; the run gives the same engine result as before.
 */
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import {
  analyzeSlab,
  defaultSlabInput,
  fcFromPsi,
  slabDesignChecks,
  type SlabInput,
} from "@nola/calc-core";
import { SlabWorkspace } from "../src/components/slab-workspace";

// New slabs start at 4000 psi (slab-workspace.tsx).
const fresh = (): SlabInput => ({
  ...defaultSlabInput(),
  fcPsi: 4000,
  fc: fcFromPsi(4000),
});
const governing = (i: SlabInput) =>
  Math.max(
    ...slabDesignChecks(i, analyzeSlab(i, false)).map((c) => c.dcr ?? Infinity),
  ).toLocaleString("en-US", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });

describe("slab save / run actions", () => {
  const html = renderToStaticMarkup(
    <SlabWorkspace cloudReady={false} onSaved={() => {}} />,
  );
  it("Save changes + Run calculation in the toolbar and each input section", () => {
    const groups = [
      ...html.matchAll(/aria-label="([^"]+): save and run"/g),
    ].map((m) => m[1]);
    expect(groups).toEqual([
      "Calculation",
      "Geometry &amp; materials",
      "Reinforcement",
      "Loads",
    ]);
    expect(html.match(/>Save changes</g)).toHaveLength(4);
    expect(html.match(/>Run calculation</g)).toHaveLength(4);
    expect(html).toContain("Save to project…");
    expect(html).not.toContain("Save slab");
  });
  it("runs once on open: same governing DCR as the engine", () => {
    expect(html).toContain(`Governing Strength DCR ${governing(fresh())}`);
    expect(html).not.toContain("Results out of date");
  });
});

const CHROME = [
  process.env.CHROMIUM_PATH,
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
].find((p): p is string => !!p && existsSync(p));
describe.skipIf(!CHROME)("slab save / run in a real browser", () => {
  it("edit → results out of date → Run → engine result for the new span", async () => {
    const out = await build({
      entryPoints: [
        new URL("./browser/slab-save-run-entry.tsx", import.meta.url).pathname,
      ],
      bundle: true,
      write: false,
      outdir: "/tmp/slab-save-run-test",
      format: "iife",
      jsx: "automatic",
      define: { "process.env.NODE_ENV": '"production"' },
      alias: { "@": new URL("../src", import.meta.url).pathname },
      logLevel: "silent",
    });
    const js = out.outputFiles.find((f) => f.path.endsWith(".js"))!.text;
    const browser = await chromium.launch({
      executablePath: CHROME,
      args: ["--no-sandbox"],
    });
    try {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
      });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.setContent(
        `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div></body></html>`,
      );
      await page.addScriptTag({ content: js });
      const status = page.locator(".slabStatus");
      await status.waitFor();
      expect(await status.textContent()).toContain(governing(fresh()));
      await page.getByLabel("Span X").fill("5.5");
      await page.getByText("Inputs changed since the last run").waitFor();
      expect(
        await page.getByText("Results out of date").count(),
      ).toBeGreaterThan(0);
      expect(await page.getByText("Calculation Report").count()).toBe(0);
      await page
        .getByRole("group", { name: "Geometry & materials: save and run" })
        .getByRole("button", { name: "Run calculation" })
        .click();
      await page.getByText("Calculation Report").first().waitFor();
      expect(await status.textContent()).toContain(
        governing({ ...fresh(), lx: 5.5 }),
      );
      expect(await page.getByText("Results out of date").count()).toBe(0);
      // Adopting a suggested spacing does not run: results out of date, the
      // suggestions and Undo stay on screen (decision 17 Oct 2026).
      await page.getByRole("button", { name: "Suggest spacing" }).click();
      const adopt = page.getByRole("button", {
        name: "Adopt Spacing to Main Bars",
      });
      await adopt.click();
      await page.getByText("Inputs changed since the last run").waitFor();
      expect(await page.getByText("Calculation Report").count()).toBe(0);
      await page.getByRole("button", { name: "Undo adopt" }).waitFor();
      expect(
        await page
          .getByText("Spacing adopted. Run calculation to update results.")
          .count(),
      ).toBe(1);
      await page
        .getByRole("group", { name: "Calculation: save and run" })
        .getByRole("button", { name: "Run calculation" })
        .click();
      await page.getByText("Calculation Report").first().waitFor();
      // No project in this harness: Save changes cannot save and says why.
      const saveBtn = page
        .getByRole("group", { name: "Loads: save and run" })
        .getByRole("button", { name: "Save changes" });
      expect(await saveBtn.isDisabled()).toBe(true);
      expect(await saveBtn.getAttribute("title")).toBe(
        "Create or select a project to save this calculation.",
      );
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
    }
  }, 90000);
});
