/**
 * Panel 01 Section & Materials layout (decision sheet, 14 Oct 2026, D1–D19).
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CONCRETE_PSI_OPTIONS,
  MPA_PER_PSI,
  analyzeRectangularColumn,
  columnDraftSchema,
  defaultColumnQuantity,
  defaultDesignCheckPolicy,
  fcFromPsi,
  psiFromMpa,
  psiToMpaExact,
  type RectangularColumnInput,
} from "@nola/calc-core";
import { RectangularColumnWorkspace } from "../src/components/rectangular-column-workspace";
import {
  ConcreteStrengthFields,
  concretePsiState,
} from "../src/components/column-materials-fields";
import { columnReportData } from "../src/lib/reports/data";

const fresh = () =>
  renderToStaticMarkup(
    <RectangularColumnWorkspace cloudReady={false} onSaved={() => {}} />,
  );
const panel01 = (html: string) =>
  html.slice(html.indexOf("01 · Section"), html.indexOf("02 · Reinforcement"));

describe("concrete strength psi → MPa (exact factor, 0.1 MPa calculation value)", () => {
  it("hand calculation, 1 psi = 6894.757 Pa (NIST SP 811)", () => {
    expect(MPA_PER_PSI).toBe(0.006894757);
    // 5000 × 0.006894757 = 34.473785 MPa → 34.5 MPa
    expect(psiToMpaExact(5000)).toBeCloseTo(34.473785, 9);
    expect(fcFromPsi(5000)).toBe(34.5);
    // 4000 × 0.006894757 = 27.579028 → 27.6; 3000 → 20.684271 → 20.7
    expect(fcFromPsi(4000)).toBe(27.6);
    expect(fcFromPsi(3000)).toBe(20.7);
    // 2500 → 17.2368925 → 17.2 (≥ 17 MPa, ACI 318-19 Table 19.2.1.1)
    expect(fcFromPsi(2500)).toBe(17.2);
    expect(fcFromPsi(8000)).toBe(55.2);
    expect([...CONCRETE_PSI_OPTIONS]).toEqual([
      2500, 3000, 3500, 4000, 4500, 5000, 6000, 7000, 8000,
    ]);
    // Older MPa drafts: 28 MPa / 0.006894757 = 4061.0 psi → 28.0 MPa back.
    expect(psiFromMpa(28)).toBe(4061);
    expect(fcFromPsi(psiFromMpa(28))).toBe(28);
  });
  it("dropdown state for stored strengths (D18)", () => {
    expect(concretePsiState({ fc: 34.5, fcPsi: 5000 })).toEqual({ psi: 5000, option: 5000 });
    expect(concretePsiState({ fc: 34.5 })).toEqual({ psi: 5000, option: 5000 });
    expect(concretePsiState({ fc: 28 })).toEqual({ psi: 4061, option: "custom" });
    expect(concretePsiState({ fc: 36.5, fcPsi: 5300 })).toEqual({ psi: 5300, option: "custom" });
  });
  it("renders psi dropdown + Custom typed in psi, MPa read-only", () => {
    const base = { fc: 28 } as RectangularColumnInput;
    const custom = renderToStaticMarkup(
      <ConcreteStrengthFields input={base} onChange={() => {}} />,
    );
    expect(custom).toContain('aria-label="Custom concrete f′c (psi)"');
    expect(custom).toContain('value="4061"');
    expect(custom).toContain('value="28.0"');
    expect(custom).toContain("readOnly");
    expect(custom).toContain("Custom (type psi)");
  });
});

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
  it("Primary Design Code keeps NSCP 2015 and the future codes (D1)", () => {
    const html = panel01(fresh());
    expect(html).toContain("NSCP 2015 project — ACI 318-19 calculation basis");
    expect(html).toContain("BS EN 1992 — Future Development");
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
