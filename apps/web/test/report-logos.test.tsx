import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { defaultProjectReportSettings } from "@nola/calc-core";
import {
  REPORT_NOLA_LOGO_PATH,
  squareLogoLayout,
} from "../src/lib/reports/logos";
import { ReportSettingsEditor } from "../src/components/report-settings-editor";

describe("report logos", () => {
  it("uses a dedicated square Ñola logo for the PDF only", () => {
    expect(REPORT_NOLA_LOGO_PATH).toBe("/brand/nola-report-logo.png");
    const png = readFileSync("public/brand/nola-report-logo.png");
    // PNG IHDR width/height at bytes 16–23.
    expect(png.readUInt32BE(16)).toBe(512);
    expect(png.readUInt32BE(20)).toBe(512);
    // The app's own brand file is untouched.
    expect(readFileSync("public/brand/nola-logo.png").readUInt32BE(16)).toBe(
      232,
    );
  });
  it("pads non-square company logos to 1:1 without cropping or stretching", () => {
    const wide = squareLogoLayout(1000, 400);
    expect(wide).toMatchObject({
      side: 512,
      width: 512,
      height: 205,
      x: 0,
      y: 154,
      padded: true,
    });
    expect(wide.width / wide.height).toBeCloseTo(1000 / 400, 1);
    const tall = squareLogoLayout(300, 600);
    expect(tall).toMatchObject({
      side: 512,
      width: 256,
      height: 512,
      x: 128,
      y: 0,
      padded: true,
    });
    expect(squareLogoLayout(400, 400)).toMatchObject({
      side: 400,
      padded: false,
    });
  });
  it("tells users to upload a square company logo for the report header", () => {
    const html = renderToStaticMarkup(
      <ReportSettingsEditor
        value={defaultProjectReportSettings}
        busy={false}
        onChange={() => {}}
        onWorking={() => {}}
        onError={() => {}}
      />,
    );
    expect(html).toContain("Use A Square Logo (1:1)");
    expect(html).toContain("Upper-Left Box Of The PDF Report Header");
  });
});

describe("Ñola logo is permanent", () => {
  it("offers only a company logo upload", () => {
    const html = renderToStaticMarkup(
      <ReportSettingsEditor
        value={defaultProjectReportSettings}
        busy={false}
        onChange={() => {}}
        onWorking={() => {}}
        onError={() => {}}
      />,
    );
    expect(html).toContain("Company Logo");
    expect(html).not.toContain("Ñola Logo");
    expect(html.match(/type="file"/g)).toHaveLength(1);
  });
  it("ignores a previously stored Ñola upload when building the PDF", async () => {
    const { generateCalculationPdf } = await import("../src/lib/reports/pdf");
    const { reportFixtures } = await import("./helpers/reports");
    const data = reportFixtures().column;
    const png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
    for (const f of data.figures) f.png = png;
    data.project!.reportSettings = {
      ...data.project!.reportSettings!,
      nolaLogo: "data:image/png;base64,AAAA",
    };
    // A broken stored Ñola upload must not be read at all.
    const r = await generateCalculationPdf(data, {
      type: "simple",
      paper: "A4",
      nolaLogo: png,
    });
    expect(r.pageCount).toBeGreaterThan(0);
  });
});
