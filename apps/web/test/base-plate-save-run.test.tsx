/**
 * Base Plate adopts the standard save / run actions (17 Oct 2026): Save
 * changes + Run calculation in the toolbar and in each input section, Save
 * to project…, explicit run (results out of date after edits) and the
 * unsaved-changes guard.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import {
  analyzeBasePlate,
  basePlateDesignChecks,
  defaultBasePlateInput,
  table14_2,
} from "@nola/calc-core";
import { BasePlateWorkspace } from "../src/components/base-plate-workspace";

const sections = [
  "Calculation",
  "Code & column",
  "Plate, grout & pedestal",
  "Anchor rods",
  "Shear, weld & seismic",
  "Loads",
];
const fmt3 = (n: number) =>
  n.toLocaleString("en-US", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });

describe("base plate save / run actions (static)", () => {
  const html = renderToStaticMarkup(
    <BasePlateWorkspace cloudReady={false} onSaved={() => {}} />,
  );
  it("has Save changes + Run calculation in the toolbar and each input section", () => {
    for (const s of sections)
      expect(html).toContain(
        `aria-label="${s.replace("&", "&amp;")}: save and run"`,
      );
    expect(html.match(/>Save changes</g)).toHaveLength(sections.length);
    expect(html.match(/>Run calculation</g)).toHaveLength(sections.length);
    expect(html).toContain("Save to project…");
    expect(html).not.toContain("Save base plate");
  });
  it("runs once on open: results shown, not out of date", () => {
    expect(html).toContain("Results by Combination");
    expect(html).not.toContain("Results out of date");
  });
});

const CHROME = [
  process.env.CHROMIUM_PATH,
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
].find((p): p is string => !!p && existsSync(p));

describe.skipIf(!CHROME)("base plate save / run in a real browser", () => {
  it("edit → out of date (drawings live) → Run → engine results; guard armed", async () => {
    // Expected after Run: the engine on the same edited input.
    const edited = defaultBasePlateInput();
    edited.plate = { ...edited.plate, tp: 32 };
    const r = analyzeBasePlate(edited, table14_2(edited.anchors.da).hole);
    const maxDcr = Math.max(
      ...basePlateDesignChecks(edited, r).map((c) => c.dcr ?? 0),
    );
    const out = await build({
      entryPoints: [
        new URL("./browser/base-plate-save-run-entry.tsx", import.meta.url)
          .pathname,
      ],
      bundle: true,
      write: false,
      outdir: "/tmp/base-plate-save-run-test",
      format: "iife",
      jsx: "automatic",
      define: { "process.env.NODE_ENV": '"production"' },
      alias: { "@": new URL("../src", import.meta.url).pathname },
      logLevel: "silent",
    });
    const js = out.outputFiles.find((f) => f.path.endsWith(".js"))!.text;
    const css =
      readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8") +
      (out.outputFiles.find((f) => f.path.endsWith(".css"))?.text ?? "");
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
        `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div id="root"></div></body></html>`,
      );
      await page.addScriptTag({ content: js });
      await page.waitForSelector(".bpDrawing svg");
      const leaveBlocked = () =>
        page.evaluate(() => {
          const e = new Event("beforeunload", { cancelable: true });
          window.dispatchEvent(e);
          return e.defaultPrevented;
        });
      expect(await leaveBlocked()).toBe(false);
      expect(await page.getByText("Results out of date").count()).toBe(0);
      // Edit: results withheld, drawings stay, guard armed.
      await page.getByLabel("Thickness tp").fill("32");
      await page.getByText("Results out of date").first().waitFor();
      expect(await page.locator(".bpComboBar").count()).toBe(0);
      expect(
        await page.getByText("Inputs changed since the last run").count(),
      ).toBe(1);
      expect(await page.locator(".bpDrawing svg").count()).toBe(3);
      await page.waitForFunction(
        () => (window as unknown as { dirty: boolean[] }).dirty.at(-1) === true,
      );
      expect(await leaveBlocked()).toBe(true);
      // Run from a section bar: results match the engine on the same input.
      await page
        .getByRole("group", { name: "Plate, grout & pedestal: save and run" })
        .getByRole("button", { name: "Run calculation" })
        .click();
      await page.locator(".bpComboBar").waitFor();
      const bar = (await page.locator(".bpComboBar").textContent()) ?? "";
      expect(bar).toContain(`Max DCR ${fmt3(maxDcr)}`);
      expect(bar).toContain(
        `tp,req ${r.governing.tp.value.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`,
      );
      expect(await page.getByText("Results out of date").count()).toBe(0);
      // Saving needs a cloud project here.
      expect(
        await page
          .getByRole("group", { name: "Calculation: save and run" })
          .getByRole("button", { name: "Save changes" })
          .isDisabled(),
      ).toBe(true);
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
    }
  }, 120000);
});
