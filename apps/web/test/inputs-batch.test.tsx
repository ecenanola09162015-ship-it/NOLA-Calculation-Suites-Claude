import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  columnHookGeometry,
  defaultColumnQuantity,
  defaultColumnTieDesign,
  defaultDesignCheckPolicy,
  designColumnTransverse,
  estimateColumnQuantity,
  missingJudgmentRemarks,
  type ColumnTieDesignInput,
  type DesignCheck,
  type RectangularColumnInput,
} from "@nola/calc-core";
import { RectangularColumnWorkspace } from "../src/components/rectangular-column-workspace";
import { DesignReviewPanel } from "../src/components/design-review-panel";
import {
  composeRemark,
  GENERAL_REASONS,
  GROUP_REASONS,
  parseRemark,
  reasonGroup,
  reasonsFor,
} from "../src/lib/judgment-reasons";
import { crossTieHookPath } from "../src/lib/column-tie-layout";

const fresh = () =>
  renderToStaticMarkup(
    <RectangularColumnWorkspace cloudReady={false} onSaved={() => {}} />,
  );

describe("Materials: diameter left, grade right", () => {
  it("orders the four steel fields and uses the new label", () => {
    const html = fresh();
    const pairs = html.slice(html.indexOf("rcSteelPairs"));
    const order = [
      "Longitudinal Bar Diameter",
      "Longitudinal steel grade (fy)",
      "Tie Diameter",
      "Tie steel grade (fyt)",
    ].map((t) => pairs.indexOf(t));
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).not.toContain("Main bar size");
  });
});

describe("Calculate in both places and default shear", () => {
  it("has a Calculate button in the toolbar and under the load table", () => {
    const html = fresh();
    const note = html.indexOf("Pasting multiple cells");
    const below = html.indexOf("Calculate section", note);
    expect(html.indexOf("Calculate section")).toBeLessThan(note);
    expect(below).toBeGreaterThan(note);
    expect(html.indexOf("rcCalculateBar")).toBeGreaterThan(note);
  });
  it("a new calculation starts with Vux = Vuy = 400 kN on every combination", () => {
    const html = fresh();
    const table = html.slice(html.indexOf("Vux (kN)"), html.indexOf("Pasting multiple cells"));
    expect(table.match(/value="400"/g)?.length).toBe(10);
  });
  it("a reopened draft keeps its blank shears", () => {
    const html = renderToStaticMarkup(
      <RectangularColumnWorkspace
        cloudReady={false}
        onSaved={() => {}}
        draft={{
          id: "d",
          projectId: "p",
          moduleSlug: "rc-column",
          title: "Old",
          verificationStatus: "verification-required",
          updatedAt: "2026-10-01",
          payload: {
            kind: "rc-column",
            version: 1,
            scopeConfirmed: true,
            input: {
              code: "ACI 318-19",
              width: 400,
              depth: 400,
              fc: 28,
              fy: 420,
              es: 200000,
              cover: 40,
              tieDiameter: 10,
              bars: [
                [-130, -130],
                [-130, 130],
                [130, -130],
                [130, 130],
              ].map(([x, y]) => ({ x, y, diameter: 25 })),
              loads: [
                { id: "LC1", description: "", pu: 1000, mx: 50, my: 20, included: true },
              ],
            },
          },
        }}
      />,
    );
    const table = html.slice(html.indexOf("Vux (kN)"), html.indexOf("Pasting multiple cells"));
    expect(table).not.toContain('value="400"');
    expect(table.match(/placeholder="blank"/g)?.length).toBe(2);
  });
});

describe("135° + 90° crosstie hook basis (ACI 318-14 / NSCP 2015)", () => {
  it("hand calculation: hook extensions and cut lengths", () => {
    // D10: seismic end max(6·10, 76.2) = 76.2; 90° end 6·10 = 60.
    const g10 = columnHookGeometry(10, "aci14x90");
    expect(g10.crossTieEnds).toEqual([76.2, 60]);
    expect(g10.extension).toBe(76.2); // hoops stay 135°
    expect(g10.crossTieSecondAngle).toBe(90);
    // D16: 96 + 96; D20: 120 + 120; inside bend 4db / 6db (Table 25.3.3).
    expect(columnHookGeometry(16, "aci14x90").crossTieEnds).toEqual([96, 96]);
    expect(columnHookGeometry(20, "aci14x90").crossTieEnds).toEqual([120, 120]);
    expect(columnHookGeometry(20, "aci14x90").insideBend).toBe(120);
    expect(() => columnHookGeometry(25, "aci14x90")).toThrow("D10–D20");
    // 600 × 800, cover 40, D10 cross-tie ∥ X: core 600 − 80 − 10 = 510;
    // 510 + 76.2 + 60 = 646.2 mm (vs 510 + 2·76.2 = 662.4 with 135° both ends).
    const section: RectangularColumnInput = {
      code: "ACI 318-19",
      width: 600,
      depth: 800,
      fc: 28,
      fy: 420,
      es: 200000,
      cover: 40,
      tieDiameter: 10,
      bars: [-245, -82, 82, 245].flatMap((x) =>
        [-345, -172.5, 0, 172.5, 345].map((y) => ({ x, y, diameter: 25 })),
      ),
      loads: [{ id: "U", description: "", pu: 1000, mx: 0, my: 0, included: true }],
    };
    const q = { ...defaultColumnQuantity(10), enabled: true, hookBasis: "aci14x90" as const };
    q.zones = q.zones.map((z) => ({ ...z, legsX: 3, legsY: 3 }));
    const est = estimateColumnQuantity(section, q)!;
    const crossX = est.rows.find((r) => r.piece === "Cross-tie parallel X")!;
    expect(crossX.length).toBeCloseTo(0.6462, 9); // m
    const hoop = est.rows.find((r) => r.piece === "Closed hoop")!;
    expect(hoop.length).toBeCloseTo((2 * (510 + 710) + 2 * 76.2) / 1000, 9);
  });
  it("is not permitted in SMF when Pu > 0.3Ag f′c (ACI 318-19 18.7.5.2(f))", () => {
    const input: RectangularColumnInput = {
      code: "ACI 318-19",
      width: 500,
      depth: 500,
      fc: 28,
      fy: 420,
      es: 200000,
      cover: 40,
      tieDiameter: 10,
      bars: [-187.5, 187.5].flatMap((x) => [-187.5, 187.5].map((y) => ({ x, y, diameter: 25 }))),
      loads: [{ id: "U", description: "", pu: 2500, mx: 50, my: 50, included: true }],
    };
    const base = defaultColumnTieDesign(input, 3000);
    const tie = (pu: number, basis: "aci135" | "aci14x90"): ColumnTieDesignInput => ({
      ...base,
      confinement: { ...base.confinement, enabled: true, frame: "SMF" },
      tie: { ...base.tie, hookBasis: basis },
    });
    // 0.3·Ag·f′c = 0.3 · 250 000 · 28 / 1000 = 2100 kN < 2500 kN
    const high = designColumnTransverse(input, tie(2500, "aci14x90"));
    const flag = high.checks.find((c) => c.id === "smf:crosstie-hooks")!;
    expect(flag.dcr).toBe(Infinity);
    expect(flag.invalidLabel).toBe("Not Permitted");
    expect(designColumnTransverse(input, tie(2500, "aci135")).checks.some((c) => c.id === "smf:crosstie-hooks")).toBe(false);
    const low = designColumnTransverse(
      { ...input, loads: [{ ...input.loads[0]!, pu: 1500 }] },
      tie(1500, "aci14x90"),
    );
    expect(low.checks.some((c) => c.id === "smf:crosstie-hooks")).toBe(false);
    expect(low.notes.join(" ")).toContain("135° + 90°");
  });
  it("draws one 90° end, alternating end for end", () => {
    const a = crossTieHookPath(0, 100, 0, 10, 20, { ext: 60, at: "b" });
    expect(a).toContain("L 110 -60"); // 90° tail straight along the face at b
    const b = crossTieHookPath(0, 100, 0, 10, 20, { ext: 60, at: "a" });
    expect(b.startsWith("M -10 -60")).toBe(true);
  });
});

describe("tickable engineering-judgment reasons", () => {
  const amber: DesignCheck[] = [
    { id: "tie:shear:end:y", label: "Shear Vuy · lo zone (LC1)", dcr: 1.03, detail: "", clause: "22.5" },
    { id: "tie:shear:mid:y", label: "Shear Vuy · mid-height (LC1)", dcr: 1.02, detail: "", clause: "22.5" },
    { id: "tie:smf:grade", label: "Grade 420 not weldable", dcr: 1.05, detail: "", clause: "20.2.2.5" },
  ];
  it("maps checks to the approved reason groups", () => {
    expect(reasonGroup("tie:shear:end:y")).toBe("shear");
    expect(reasonGroup("tie:smf:grade")).toBe("grade");
    expect(reasonGroup("tie:smf:scwb:x")).toBe("scwb");
    expect(reasonGroup("tie:ash:x")).toBe("confinement");
    expect(reasonGroup("LC1:slender-x")).toBe("slenderness");
    expect(reasonGroup("LC1:biaxial3d")).toBe("flexure");
    expect(reasonGroup("A:flexure", "slab")).toBe("slab");
    expect(reasonsFor("shear")).toEqual([...GENERAL_REASONS, ...GROUP_REASONS.shear]);
  });
  it("stores ticks as the remark text and restores them; old free text becomes the note", () => {
    const opts = reasonsFor("shear");
    const text = composeRemark([opts[0]!, opts[3]!], "See calc sheet 12");
    expect(parseRemark(text, opts)).toEqual({ ticked: [opts[0], opts[3]], note: "See calc sheet 12" });
    expect(parseRemark("Reviewed with the EOR.", opts)).toEqual({ ticked: [], note: "Reviewed with the EOR." });
    expect(composeRemark([], "")).toBe("");
  });
  it("one tick satisfies the remark requirement; an empty selection does not", () => {
    const p = defaultDesignCheckPolicy;
    expect(missingJudgmentRemarks(amber, p, {}).length).toBe(3);
    const one = { [amber[0]!.id]: composeRemark([GENERAL_REASONS[0]], "") };
    expect(missingJudgmentRemarks(amber, p, one).map((c) => c.id)).not.toContain(amber[0]!.id);
  });
  it("renders the checklist, 'Other' without a box until ticked, and apply-to-group", () => {
    const html = renderToStaticMarkup(
      <DesignReviewPanel
        checks={amber}
        policy={defaultDesignCheckPolicy}
        remarks={{ [amber[0]!.id]: composeRemark([GROUP_REASONS.shear[0]!], "") }}
        onChange={() => {}}
      />,
    );
    const esc = (t: string) => t.replaceAll("'", "&#x27;");
    expect(html).toContain(esc(GROUP_REASONS.shear[0]!));
    expect(html).toContain(esc(GROUP_REASONS.grade[0]!));
    expect(html).toContain("Other (write a reason)");
    expect(html).not.toContain("<textarea");
    // Shear rows share a group: apply-to-all offered on the completed one.
    expect(html).toContain("Apply these reasons to all 2 amber shear checks");
    const withNote = renderToStaticMarkup(
      <DesignReviewPanel
        checks={amber}
        policy={defaultDesignCheckPolicy}
        remarks={{ [amber[2]!.id]: "Legacy remark text" }}
        onChange={() => {}}
      />,
    );
    expect(withNote).toContain("<textarea");
    expect(withNote).toContain("Legacy remark text");
  });
});
