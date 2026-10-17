/**
 * 17 Oct 2026: (1) Complete report equations table reflects the transverse
 * design actually performed; (2) unsaved-changes guard.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import {
  analyzeRectangularColumn,
  defaultColumnQuantity,
  defaultColumnTieDesign,
  defaultDesignCheckPolicy,
  designColumnTransverse,
  type RectangularColumnInput,
} from "@nola/calc-core";
import { columnReportData } from "../src/lib/reports/data";
import { UNSAVED_MESSAGE, confirmLeave } from "../src/lib/unsaved";

const input: RectangularColumnInput = {
  code: "ACI 318-19",
  width: 600,
  depth: 600,
  fc: 34.5,
  fy: 420,
  es: 200000,
  cover: 40,
  tieDiameter: 12,
  bars: [-245, -82, 82, 245].flatMap((x) => [-245, 245].map((y) => ({ x, y, diameter: 25 }))),
  loads: [{ id: "U", description: "", pu: 2000, mx: 150, my: 80, vx: 300, vy: 300, included: true }],
};
const eq = (data: ReturnType<typeof columnReportData>) =>
  data.sections.find((s) => s.title.startsWith("Section Strength"))!.rows.map((r) => r.map(String).join(" | "));

describe("Complete report equations table: no stale 'not evaluated' rows", () => {
  it("without transverse design: says not evaluated, general 1–8% only", () => {
    const rows = eq(columnReportData(undefined, "C", input, analyzeRectangularColumn(input), defaultColumnQuantity(), defaultDesignCheckPolicy, {}));
    expect(rows.find((r) => r.startsWith("Shear / Seismic Ties"))).toContain("Not Evaluated: shear and confinement design not enabled");
    const lim = rows.find((r) => r.startsWith("Reinforcement Limits"))!;
    expect(lim).toContain("general columns 1–8% (10.6.1.1)");
    expect(lim).not.toContain("18.7.4.1");
    expect(lim).not.toContain("require separate review");
  });
  it("with SMF shear + confinement: reports what was designed and the governing check", () => {
    const base = defaultColumnTieDesign(input, 2500);
    const tie = { ...base, shear: { enabled: true }, confinement: { ...base.confinement, enabled: true, frame: "SMF" as const } };
    const t = designColumnTransverse(input, tie);
    const rows = eq(columnReportData(undefined, "C", input, analyzeRectangularColumn(input), defaultColumnQuantity(), defaultDesignCheckPolicy, {}, tie, t));
    const st = rows.find((r) => r.startsWith("Shear / Seismic Ties"))!;
    expect(st).not.toContain("Not Evaluated In This Build");
    expect(st).toContain("Shear designed");
    expect(st).toContain(`SMF confinement designed: lo ${t.adopted.lo} mm @ ${t.adopted.sEnd} mm`);
    expect(st).toContain("governing");
    expect(st).toContain("18.7.5");
    // ρg = 8 × 490.87 / 360 000 = 1.09 %: SMF limit 18.7.4.1 is checked.
    expect(rows.find((r) => r.startsWith("Reinforcement Limits"))).toContain("SMF 1–6% (18.7.4.1) checked");
  });
});

describe("unsaved-changes guard", () => {
  it("confirmLeave asks only when there are unsaved edits", () => {
    const ask = vi.fn(() => false);
    expect(confirmLeave(false, ask)).toBe(true);
    expect(ask).not.toHaveBeenCalled();
    expect(confirmLeave(true, ask)).toBe(false);
    expect(ask).toHaveBeenCalledWith(UNSAVED_MESSAGE);
    expect(confirmLeave(true, () => true)).toBe(true);
  });
  const CHROME = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome"].find(existsSync);
  it.skipIf(!CHROME)("an edit marks the workspace dirty and arms the leave-page warning", async () => {
    const out = await build({
      entryPoints: [new URL("./browser/unsaved-entry.tsx", import.meta.url).pathname],
      bundle: true,
      write: false,
      // The workspace imports a CSS module (calc-actions): JS + CSS outputs.
      outdir: "/tmp/unsaved-test",
      format: "esm",
      jsx: "automatic",
      define: { "process.env.NODE_ENV": '"production"' },
      logLevel: "silent",
      alias: { "@": new URL("../src", import.meta.url).pathname },
    });
    const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
    const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
    try {
      const page = await browser.newPage();
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div id="root"></div></body></html>`);
      await page.addScriptTag({ content: out.outputFiles.find((f) => f.path.endsWith(".js"))!.text, type: "module" });
      await page.getByText("Column Dimensions").waitFor();
      const leaveBlocked = () =>
        page.evaluate(() => {
          const e = new Event("beforeunload", { cancelable: true });
          window.dispatchEvent(e);
          return e.defaultPrevented;
        });
      expect(await leaveBlocked()).toBe(false); // freshly opened: nothing to lose
      await page.getByLabel("Depth h").fill("750");
      await page.waitForFunction(() => (window as unknown as { dirty: boolean[] }).dirty.at(-1) === true);
      expect(await leaveBlocked()).toBe(true);
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
    }
  }, 60000);
});
