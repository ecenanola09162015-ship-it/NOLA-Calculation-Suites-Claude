/**
 * Concrete f′c — shared Column / Slab fields (fc_psi_Range_Decisions F1–F11).
 * Hand calculations: MPa = psi × 0.006894757 (NIST SP 811), rounded to 0.1.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CONCRETE_PSI_OPTIONS,
  MPA_PER_PSI,
  analyzeRectangularColumn,
  analyzeSlab,
  columnDraftSchema,
  concreteStrengthNotes,
  defaultColumnQuantity,
  defaultDesignCheckPolicy,
  defaultSlabInput,
  defaultSlabQuantity,
  fcFromPsi,
  psiFromMpa,
  psiToMpaExact,
  slabInputSchema,
  type RectangularColumnInput,
} from "@nola/calc-core";
import {
  ConcreteStrengthFields,
  concretePsiState,
} from "../src/components/concrete-strength-fields";
import { RectangularColumnWorkspace } from "../src/components/rectangular-column-workspace";
import { SlabWorkspace } from "../src/components/slab-workspace";
import { columnReportData, slabReportData, fcText } from "../src/lib/reports/data";

describe("psi → MPa hand calculations", () => {
  it("29 options, 1000–15000 psi in 500 psi steps", () => {
    expect(CONCRETE_PSI_OPTIONS).toHaveLength(29);
    expect(CONCRETE_PSI_OPTIONS[0]).toBe(1000);
    expect(CONCRETE_PSI_OPTIONS.at(-1)).toBe(15000);
    expect(MPA_PER_PSI).toBe(0.006894757);
  });
  it("conversions", () => {
    // 1000 × 0.006894757 = 6.894757 → 6.9
    expect(fcFromPsi(1000)).toBe(6.9);
    // 3000 → 20.684271 → 20.7 (< 21 MPa SMF minimum)
    expect(fcFromPsi(3000)).toBe(20.7);
    // 4000 → 27.579028 → 27.6 ; 5000 → 34.473785 → 34.5
    expect(fcFromPsi(4000)).toBe(27.6);
    expect(psiToMpaExact(5000)).toBeCloseTo(34.473785, 9);
    expect(fcFromPsi(5000)).toBe(34.5);
    // 8000 → 55.158056 → 55.2 (β1 = 0.65) ; 10000 → 68.94757 → 68.9 (> 68.89)
    expect(fcFromPsi(8000)).toBe(55.2);
    expect(fcFromPsi(10000)).toBe(68.9);
    // 15000 → 103.421355 → 103.4
    expect(fcFromPsi(15000)).toBe(103.4);
    expect(psiFromMpa(28)).toBe(4061);
  });
});

describe("notes: nothing blocked, code basis cited (F5–F9)", () => {
  const levels = (fc: number, smf = false) =>
    concreteStrengthNotes(fc, { smf }).map((n) => n.level);
  it("thresholds", () => {
    expect(levels(6.9)).toEqual(["warning"]); // < 17 (Table 19.2.1.1)
    expect(levels(17.2)).toEqual([]);
    expect(levels(17.2, true)).toEqual(["warning"]); // < 21 SMF
    expect(levels(20.7, true)).toEqual(["warning"]);
    expect(levels(24.1, true)).toEqual([]);
    expect(levels(51.7)).toEqual([]);
    expect(levels(55.2)).toEqual(["info"]); // β1 = 0.65
    expect(levels(65.5)).toEqual(["info"]);
    expect(levels(68.9)).toEqual(["caution", "caution"]); // √f′c cap + ACI 363R
    const smf = concreteStrengthNotes(75.8, { smf: true }).map((n) => n.text).join(" ");
    expect(smf).toContain("18.7.5.2(f)");
    expect(smf).toContain("ACI 363R");
    expect(concreteStrengthNotes(68.9, { smf: true })[0]!.text).not.toContain("18.7.5.2(f)");
  });
});

const column: RectangularColumnInput = {
  code: "ACI 318-19",
  width: 400,
  depth: 400,
  fc: 34.5,
  fcPsi: 5000,
  fy: 420,
  es: 200000,
  cover: 40,
  tieDiameter: 10,
  bars: [-150, 150].flatMap((x) => [-150, 150].map((y) => ({ x, y, diameter: 25 }))),
  loads: [{ id: "U", description: "", pu: 1000, mx: 50, my: 20, included: true }],
};

describe("engine range 1000–15000 psi (F4)", () => {
  it("column: P0 hand check at 1000 and 15000 psi", () => {
    for (const psi of [1000, 15000]) {
      const fc = fcFromPsi(psi);
      const r = analyzeRectangularColumn({ ...column, fc, fcPsi: psi });
      // P0 = 0.85 f′c (Ag − As) + fy As; Ag = 160000, As = 4 × 490.874 = 1963.50
      const as = 4 * (Math.PI * 25 ** 2) / 4;
      expect(r.p0).toBeCloseTo((0.85 * fc * (160000 - as) + 420 * as) / 1000, 6);
    }
    // 1000 psi: 0.85·6.9·158036.5 + 420·1963.5 = 926,884 + 824,668 = 1751.55 kN
    expect(analyzeRectangularColumn({ ...column, fc: 6.9 }).p0).toBeCloseTo(1751.55, 1);
    expect(() => analyzeRectangularColumn({ ...column, fc: 104 })).toThrow("1000–15000 psi");
    expect(columnDraftSchema.shape.input.safeParse({ ...column, fc: 103.4, fcPsi: 15000 }).success).toBe(true);
    expect(columnDraftSchema.shape.input.safeParse({ ...column, fc: 6.9, fcPsi: 1000 }).success).toBe(true);
  });
  it("slab: accepts 6.9 and 103.4 MPa; notes in warnings", () => {
    const low = analyzeSlab({ ...defaultSlabInput(), fc: 6.9, fcPsi: 1000 });
    expect(low.warnings.join(" ")).toContain("Table 19.2.1.1");
    const high = analyzeSlab({ ...defaultSlabInput(), fc: 103.4, fcPsi: 15000 });
    expect(high.warnings.join(" ")).toContain("ACI 363R");
    expect(slabInputSchema.safeParse({ ...defaultSlabInput(), fc: 103.4, fcPsi: 15000 }).success).toBe(true);
  });
});

describe("shared fields: same markup for Column and Slab (F1)", () => {
  const block = (html: string) => {
    const i = html.indexOf('class="fcPair"');
    return html.slice(i, html.indexOf("</div>", html.indexOf("rcDerived", i)));
  };
  it("psi dropdown left, read-only MPa right, option tags", () => {
    const html = renderToStaticMarkup(
      <ConcreteStrengthFields value={{ fc: 34.5, fcPsi: 5000 }} onChange={() => {}} />,
    );
    expect(html.indexOf('aria-label="Concrete f′c (psi)"')).toBeLessThan(html.indexOf("rcDerived"));
    expect(html).toContain('value="34.5"');
    expect(html).toContain("readOnly");
    expect(html).toContain("1,000 psi — below ACI minimum");
    expect(html).toContain("8,000 psi — β1 = 0.65");
    expect(html).toContain("15,000 psi — high strength");
    expect(html).toContain("Custom (type psi)");
    const smf = renderToStaticMarkup(
      <ConcreteStrengthFields value={{ fc: 20.7, fcPsi: 3000 }} smf onChange={() => {}} />,
    );
    expect(smf).toContain("3,000 psi — below SMF minimum");
    expect(smf).toContain('class="fcNote warning"');
  });
  it("Column and Slab render the same f′c block; new slab starts at 4000 psi", () => {
    const col = renderToStaticMarkup(<RectangularColumnWorkspace cloudReady={false} onSaved={() => {}} />);
    const slab = renderToStaticMarkup(<SlabWorkspace cloudReady={false} onSaved={() => {}} />);
    expect(block(col)).toContain('<option value="5000" selected="">5,000 psi</option>');
    expect(block(slab)).toContain('<option value="4000" selected="">4,000 psi</option>');
    expect(block(slab)).toContain('value="27.6"');
    const strip = (h: string) => h.replace(/ selected=""/g, "").replace(/value="[\d.]+"/g, "");
    expect(strip(block(col))).toBe(strip(block(slab)));
  });
  it("old drafts open unchanged (exact-MPa slab draft, typed-MPa column draft)", () => {
    expect(concretePsiState({ fc: 27.579028 })).toEqual({ psi: 4000, option: 4000 });
    expect(concretePsiState({ fc: 28 })).toEqual({ psi: 4061, option: "custom" });
    expect(concretePsiState({ fc: 34.5 })).toEqual({ psi: 5000, option: 5000 });
  });
});

describe("report (F11): same f′c line; notes in Assumptions / Limitations", () => {
  it("column and slab", () => {
    expect(fcText({ fc: 34.5, fcPsi: 5000 })).toBe("34.5 MPa (5000 psi; exact 34.47 MPa)");
    expect(fcText({ fc: 28 })).toBe("28.00 MPa");
    const c = columnReportData(
      undefined, "C1", { ...column, fc: 6.9, fcPsi: 1000 },
      analyzeRectangularColumn({ ...column, fc: 6.9 }),
      defaultColumnQuantity(), defaultDesignCheckPolicy, {},
    );
    expect(JSON.stringify(c.summary)).toContain("fc = 6.9 MPa (1000 psi; exact 6.89 MPa)");
    expect(c.limitations[0]).toContain("assessment only");
    const si = { ...defaultSlabInput(), fc: 103.4, fcPsi: 15000 };
    const s = slabReportData(undefined, "S1", si, analyzeSlab(si), { ...defaultSlabQuantity(), enabled: false }, defaultDesignCheckPolicy, {});
    expect(JSON.stringify(s.summary)).toContain("fc = 103.4 MPa (15000 psi; exact 103.42 MPa)");
    expect(s.limitations.join(" ")).toContain("ACI 363R");
  });
});
