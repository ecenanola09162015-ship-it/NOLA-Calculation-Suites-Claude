/**
 * Retaining Wall adopts the standard save / run actions (17 Oct 2026): Save
 * changes + Run calculation in the toolbar and in each input section, Save
 * to project, explicit run (results out of date after edits) and the
 * unsaved-changes guard.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import {
  defaultRetainingWallInput,
  designRetainingWall,
  retainingWallStatus,
} from "@nola/calc-core";
import { RetainingWallWorkspace } from "../src/components/retaining-wall-workspace";

const fmt3 = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

describe("retaining wall: save and run actions", () => {
  it("shows Save changes + Run calculation in the toolbar and each input section", () => {
    const html = renderToStaticMarkup(<RetainingWallWorkspace cloudReady={false} onSaved={() => {}} />);
    for (const section of ["Calculation", "Geometry", "Soil and water", "Materials and reinforcement", "Loads"])
      expect(html).toContain(`aria-label="${section}: save and run"`);
    expect(html.match(/>Save changes</g)).toHaveLength(5);
    expect(html.match(/>Run calculation</g)).toHaveLength(5);
    expect(html).toContain("Save to project…");
    expect(html).not.toContain("Save wall");
    // Geometry bar sits after 02 Geometry, loads bar after 08 Load Combinations.
    expect(html.indexOf('aria-label="Geometry: save and run"')).toBeGreaterThan(html.indexOf("02 · Geometry"));
    expect(html.indexOf('aria-label="Geometry: save and run"')).toBeLessThan(html.indexOf("03 · Backfill"));
    expect(html.indexOf('aria-label="Loads: save and run"')).toBeGreaterThan(html.indexOf("08 · Load Combinations"));
  });
  it("runs once on open: results shown, not out of date", () => {
    const html = renderToStaticMarkup(<RetainingWallWorkspace cloudReady={false} onSaved={() => {}} />);
    const i = defaultRetainingWallInput();
    const worst = retainingWallStatus(designRetainingWall(i), i.dcrLimit).worst;
    expect(html).toContain(`Governing DCR ${fmt3(worst)}`);
    expect(html).not.toContain("Results out of date");
    expect(html).toContain("Retaining wall section");
  });
  it("without a project, Save changes is disabled and says why", () => {
    const html = renderToStaticMarkup(<RetainingWallWorkspace cloudReady={false} onSaved={() => {}} />);
    expect(html).toMatch(/title="Create or select a project to save this calculation\."[^>]*>Save changes/);
  });

  const CHROME = [process.env.CHROMIUM_PATH, "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"].find(
    (p): p is string => !!p && existsSync(p),
  );
  it.skipIf(!CHROME)(
    "edit → out of date and guard armed → Run → results equal the engine on the edited input",
    async () => {
      const out = await build({
        entryPoints: [new URL("./browser/rw-save-run-entry.tsx", import.meta.url).pathname],
        bundle: true,
        write: false,
        outdir: "/tmp/rw-save-run-test",
        format: "esm",
        jsx: "automatic",
        define: { "process.env.NODE_ENV": '"production"' },
        logLevel: "silent",
        alias: { "@": new URL("../src", import.meta.url).pathname },
        loader: { ".webp": "empty", ".png": "empty" },
      });
      const js = out.outputFiles.find((f) => f.path.endsWith(".js"))!.text;
      const moduleCss = out.outputFiles.find((f) => f.path.endsWith(".css"))?.text ?? "";
      const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
      const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
      try {
        const page = await browser.newPage();
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await page.setContent(
          `<!doctype html><html><head><meta charset="utf-8"><style>${css}${moduleCss}</style></head><body><div id="root"></div></body></html>`,
        );
        await page.addScriptTag({ content: js, type: "module" });
        await page.getByText("02 · Geometry").waitFor();
        const leaveBlocked = () =>
          page.evaluate(() => {
            const e = new Event("beforeunload", { cancelable: true });
            window.dispatchEvent(e);
            return e.defaultPrevented;
          });
        const i = defaultRetainingWallInput();
        const before = fmt3(retainingWallStatus(designRetainingWall(i), i.dcrLimit).worst);
        await page.getByText(`Governing DCR ${before}`).first().waitFor();
        expect(await leaveBlocked()).toBe(false);
        // Edit the heel: results withheld, flagged out of date, guard armed.
        const heel = i.heel + 0.4;
        await page.getByRole("spinbutton", { name: "Heel (m)", exact: true }).fill(String(heel));
        await page.getByText("Inputs changed since the last run").waitFor();
        expect(await page.getByText(`Governing DCR ${before}`).count()).toBe(0);
        expect(await page.getByText("Results out of date").count()).toBe(5);
        await page.waitForFunction(() => (window as unknown as { dirty: boolean[] }).dirty.at(-1) === true);
        expect(await leaveBlocked()).toBe(true);
        // Geometry drawing stays live (like the other modules): a preview of
        // the edited wall, pressures and bearing hidden until Run.
        await page.getByText("Preview of the edited geometry. Pressures and bearing show after Run calculation.").waitFor();
        expect(await page.locator('[aria-label="Retaining wall section"] svg').count()).toBe(1);
        // Run from the Geometry section.
        await page
          .getByRole("group", { name: "Geometry: save and run" })
          .getByRole("button", { name: "Run calculation" })
          .click();
        const after = fmt3(retainingWallStatus(designRetainingWall({ ...i, heel }), i.dcrLimit).worst);
        await page.getByText(`Governing DCR ${after}`).first().waitFor();
        expect(await page.getByText("Results out of date").count()).toBe(0);
        expect(await page.getByText("Preview of the edited geometry").count()).toBe(0);
        expect(errors).toEqual([]);
      } finally {
        await browser.close();
      }
    },
    90000,
  );
});
