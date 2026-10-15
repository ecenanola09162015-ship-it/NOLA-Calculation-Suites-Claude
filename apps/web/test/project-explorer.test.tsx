import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { ProjectExplorer } from "../src/components/project-explorer";
import { explorerDrafts, explorerProjects } from "./browser/explorer-fixture";

const noop = () => {};
const markup = (projectId: string) =>
  renderToStaticMarkup(
    <ProjectExplorer
      projects={explorerProjects}
      drafts={explorerDrafts}
      projectId={projectId}
      draftId=""
      search=""
      onSearch={noop}
      onSelectProject={noop}
      onOpenDraft={noop}
      onNewProject={noop}
      onNewCalculation={noop}
      onProjectInfo={noop}
      onRename={async () => ({ ok: true })}
    />,
  );

describe("project explorer", () => {
  it("has a Projects heading, New project, and New calculation under the open project", () => {
    const html = markup("p1");
    expect(html).toContain("<h2>Projects</h2>");
    expect(html).toContain("New project");
    expect(html).toContain("New calculation");
  });
  it("nests Structural › Concrete › RC Column › calculation and hides empty levels", () => {
    const html = markup("p1");
    const order = [
      "Structural",
      "Concrete",
      "RC Column",
      "C1 · First floor",
      "Geotechnical",
      "Foundation &amp; soil",
      "SBC-01",
    ];
    let at = -1;
    for (const label of order) {
      const next = html.indexOf(label, at + 1);
      expect(next, label).toBeGreaterThan(at);
      at = next;
    }
    expect(html).not.toContain("<summary>Loads</summary>");
    expect(html).not.toContain("<summary>Steel</summary>");
  });
});

const CHROME = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome"].find(
  existsSync,
);
describe.skipIf(!CHROME)("project explorer in a real browser", () => {
  it("renames by right-click, F2 and ⋯; Esc cancels; duplicates offer a free name", async () => {
    const out = await build({
      entryPoints: [
        new URL("./browser/explorer-entry.tsx", import.meta.url).pathname,
      ],
      bundle: true,
      write: false,
      format: "esm",
      jsx: "automatic",
      define: { "process.env.NODE_ENV": '"production"' },
      logLevel: "silent",
    });
    const css = readFileSync(
      new URL("../src/app/globals.css", import.meta.url),
      "utf8",
    );
    const browser = await chromium.launch({
      executablePath: CHROME,
      args: ["--no-sandbox"],
    });
    try {
      const page = await browser.newPage({
        viewport: { width: 420, height: 900 },
      });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.setContent(
        `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div id="root"></div></body></html>`,
      );
      await page.addScriptTag({
        content: out.outputFiles[0]!.text,
        type: "module",
      });

      // right-click → Rename → Enter
      await page
        .getByRole("button", { name: "C1 · First floor", exact: true })
        .click({ button: "right" });
      await page.getByRole("menuitem", { name: "Rename" }).click();
      const input = page.getByLabel("Rename calculation");
      await input.fill("C1 · Second floor");
      await input.press("Enter");
      await page
        .getByRole("button", { name: "C1 · Second floor", exact: true })
        .waitFor();

      // F2 → Esc cancels without saving
      await page.getByRole("button", { name: "SL-01", exact: true }).focus();
      await page.keyboard.press("F2");
      await page.getByLabel("Rename calculation").fill("SL-99");
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "SL-01", exact: true }).waitFor();

      // ⋯ button → duplicate → use suggested name
      await page
        .getByRole("button", { name: "Actions for C1 · Second floor" })
        .click();
      await page.getByRole("menuitem", { name: "Rename" }).click();
      await page.getByLabel("Rename calculation").fill("c2 · ground floor");
      await page.getByLabel("Rename calculation").press("Enter");
      await page.getByText("already exists in this project").waitFor();
      await page
        .getByRole("button", { name: "Use “C2 · Ground floor (2)”" })
        .click();
      await page.getByLabel("Rename calculation").press("Enter");
      await page
        .getByRole("button", { name: "C2 · Ground floor (2)", exact: true })
        .waitFor();

      // the open calculation asks before reloading
      await page
        .getByRole("button", { name: "SBC-01", exact: true })
        .click({ button: "right" });
      await page.getByRole("menuitem", { name: "Rename" }).click();
      await page.getByLabel("Rename calculation").fill("SBC-02");
      await page.getByLabel("Rename calculation").press("Enter");
      await page.getByRole("button", { name: "Rename and reload" }).click();
      await page.getByRole("button", { name: "SBC-02", exact: true }).waitFor();

      // New calculation is offered under the project
      await page.getByRole("button", { name: "＋ New calculation" }).click();

      const result = await page.evaluate(() => ({
        renames: window.renames,
        newCalcs: window.newCalcs,
      }));
      expect(result.renames).toEqual([
        ["d1", "C1 · Second floor"],
        ["d1", "c2 · ground floor"],
        ["d1", "C2 · Ground floor (2)"],
        ["d4", "SBC-02"],
      ]);
      expect(result.newCalcs).toEqual(["p1"]);
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
    }
  }, 90000);
});
