/**
 * Panel 01 Section & Materials layout (decision sheet, 14 Oct 2026, D1–D19).
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  analyzeRectangularColumn,
  columnDraftSchema,
  defaultColumnQuantity,
  defaultDesignCheckPolicy,
  type RectangularColumnInput,
} from "@nola/calc-core";
import { RectangularColumnWorkspace } from "../src/components/rectangular-column-workspace";
import { columnReportData } from "../src/lib/reports/data";

const fresh = () =>
  renderToStaticMarkup(
    <RectangularColumnWorkspace cloudReady={false} onSaved={() => {}} />,
  );
const panel01 = (html: string) =>
  html.slice(html.indexOf("01 · Section"), html.indexOf("02 · Reinforcement"));

describe("panel 01 layout", () => {
  it("code block, then h | b | cover, concrete, rebar information in order", () => {
    const html = panel01(fresh());
    const order = [
      "Primary Design Code",
      "Other Codes*",
      "Documentation only",
      "Column Dimensions",
      "Depth h",
      "Width b",
      "Clear cover to ties",
      "Concrete Strength",
      "Concrete f′c",
      "Rebar Information",
      "Rebar standard",
      "Steel Es",
      "Longitudinal Bar Diameter",
      "Longitudinal steel grade (fy)",
      "Tie Diameter",
      "Tie steel grade (fyt)",
      "Storey Geometry",
    ].map((t) => html.indexOf(t));
    expect(order.every((i) => i > -1), JSON.stringify(order)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
  it("Primary Design Code: ACI 318-19 only, others Future Development (17 Oct 2026)", () => {
    const html = panel01(fresh());
    expect(html).toContain('<option value="ACI 318-19" selected="">ACI 318-19');
    expect(html).not.toContain("NSCP 2015 project");
    expect(html).toContain("NSCP 2015 (Vol. 1) — Future Development");
    expect(html).toContain("BS EN 1992-1-1 (Eurocode 2) — Future Development");
    expect(html).toContain("AS 3600 — Future Development");
  });
  it("new calculation starts at 5000 psi = 34.5 MPa; Es 200 000 not flagged", () => {
    const html = panel01(fresh());
    expect(html).toMatch(/<option value="5000" selected="">5,000 psi<\/option>/);
    expect(html).toContain('value="34.5"');
    expect(html).not.toContain("Override · ACI 20.2.2.2");
  });
});

const input: RectangularColumnInput = {
  code: "ACI 318-19",
  width: 600,
  depth: 800,
  fc: 34.5,
  fcPsi: 5000,
  fy: 420,
  es: 200000,
  cover: 40,
  tieDiameter: 10,
  bars: [-250, 250].flatMap((x) => [-350, 350].map((y) => ({ x, y, diameter: 25 }))),
  loads: [{ id: "U", description: "", pu: 2000, mx: 100, my: 50, included: true }],
  otherCodes: "NSCP 2015; ASCE 7-16",
};

describe("drafts and report", () => {
  it("drafts store otherCodes and fcPsi; older drafts without them still load", () => {
    const draft = { kind: "rc-column", version: 1, scopeConfirmed: true, input };
    expect(columnDraftSchema.parse(draft).input.fcPsi).toBe(5000);
    const { otherCodes, fcPsi, ...old } = input;
    void otherCodes;
    void fcPsi;
    expect(columnDraftSchema.safeParse({ ...draft, input: { ...old, fc: 28 } }).success).toBe(true);
  });
  it("Other Codes print in Code References only; f′c prints psi and exact MPa (D5, D11)", () => {
    const data = columnReportData(
      undefined,
      "C1",
      input,
      analyzeRectangularColumn(input),
      defaultColumnQuantity(),
      defaultDesignCheckPolicy,
      {},
    );
    const refs = data.references.rows.map((r) => r.join(" | "));
    expect(refs[0]).toBe("Other Codes (Reference Only) | NSCP 2015; ASCE 7-16");
    const summary = JSON.stringify(data.summary);
    expect(summary).not.toContain("ASCE 7-16");
    expect(summary).toContain("fc = 34.5 MPa (5000 psi; exact 34.47 MPa)");
    const plain = columnReportData(
      undefined,
      "C1",
      { ...input, fcPsi: undefined, otherCodes: "", fc: 28 },
      analyzeRectangularColumn({ ...input, fc: 28 }),
      defaultColumnQuantity(),
      defaultDesignCheckPolicy,
      {},
    );
    expect(JSON.stringify(plain.summary)).toContain("fc = 28.00 MPa;");
    expect(plain.references.rows.some((r) => String(r[0]).startsWith("Other Codes"))).toBe(false);
  });
});
