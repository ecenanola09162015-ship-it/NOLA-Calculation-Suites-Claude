import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  analyzeStairs,
  defaultStairsInput,
  type StairsInput,
} from "@nola/calc-core";
import { StairWorkspace } from "../src/components/stair-workspace";
import {
  StairForceDiagrams,
  StairPlan,
  StairSection,
} from "../src/components/stair-diagrams";
import { uiCatalogue } from "../src/lib/ui-catalogue";

const dogLeg = (): StairsInput => ({
  ...defaultStairsInput(),
  stairType: "dog-leg",
  topLanding: { length: 0, thickness: 200, width: 0 },
  flights: [
    {
      risers: 9,
      landingAfter: {
        length: 1300,
        thickness: 200,
        width: 0,
        startSupport: "None",
        endSupport: "Pinned",
      },
    },
    { risers: 9, landingAfter: null },
  ],
});

describe("stairs workspace", () => {
  it("is a Pilot card", () => {
    expect(uiCatalogue.find((m) => m.slug === "stairs")?.pilot).toBe(true);
  });
  it("asks the decision-sheet questions and renders results without NaN", () => {
    const html = renderToStaticMarkup(
      <StairWorkspace cloudReady={false} onSaved={() => {}} />,
    );
    for (const text of [
      "Stair type",
      "Single span (straight, landings optional)",
      "Dog-leg (two flights + mid landing)",
      "Design width",
      "1 m strip",
      "Full flight width",
      "Bottom landing",
      "Top landing",
      "Bottom support rests on",
      "Suspended (beam / slab)",
      "Ground",
      "Top support",
      "Calculation basis: ACI 318-19.",
      "ACI 318-14 — Future Development",
      "DCR-Based Design Checks",
      "Quantity Estimate · per 1 m strip",
      "Bar schedule",
      "LONGITUDINAL SECTION",
      "PLAN",
      "3D view with loads",
      "+ Add intermediate landing and flight",
    ])
      expect(html).toContain(text);
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("Infinity");
  });
  it("asks for the footing and bearing capacity when the bottom rests on ground", () => {
    const i = defaultStairsInput();
    i.bottomSupport.onGround = true;
    i.bottomSupport.footing.design = true;
    const html = renderToStaticMarkup(
      <StairWorkspace
        cloudReady={false}
        onSaved={() => {}}
        draft={
          {
            id: "00000000-0000-4000-8000-000000000001",
            projectId: "00000000-0000-4000-8000-000000000002",
            moduleSlug: "stairs",
            title: "ST-02",
            payload: { kind: "stairs", version: 1, input: i },
            createdAt: "2026-10-16T00:00:00Z",
            updatedAt: "2026-10-16T00:00:00Z",
          } as never
        }
      />,
    );
    expect(html).toContain("Design the footing?");
    expect(html).toContain("Allowable bearing qa");
    expect(html).toContain("Footing q,max / qa");
    expect(html).toContain("Concrete · strip footing");
  });
  it("restores a dog-leg draft with the mid landing and two flights", () => {
    const html = renderToStaticMarkup(
      <StairWorkspace
        cloudReady={false}
        onSaved={() => {}}
        draft={
          {
            id: "00000000-0000-4000-8000-000000000003",
            projectId: "00000000-0000-4000-8000-000000000002",
            moduleSlug: "stairs",
            title: "ST-03",
            payload: {
              kind: "stairs",
              version: 1,
              input: { ...dogLeg(), code: "NSCP 2015" },
            },
            createdAt: "2026-10-16T00:00:00Z",
            updatedAt: "2026-10-16T00:00:00Z",
          } as never
        }
      />,
    );
    expect(html).toContain("Mid landing (turn)");
    expect(html).toContain("Mid-landing support (far edge)");
    expect(html).toContain(
      "Project standard: NSCP 2015. Calculation basis: ACI 318-19.",
    );
    expect(html).toContain("SECTION · FLIGHT 2 STRIP");
    expect(html).not.toContain("NaN");
  });
  it("draws crossed bars at knees, supports and the 1 m strip band", () => {
    const i = defaultStairsInput();
    const section = renderToStaticMarkup(<StairSection input={i} />);
    expect(section).toContain('data-bar="bottom"');
    expect(section).toContain('data-bar="topKnee"');
    expect(section).toContain('data-bar="distribution"');
    expect(section).toContain('data-support="Pinned"');
    expect(
      (section.match(/data-bar="bottom"/g) ?? []).length,
    ).toBeGreaterThanOrEqual(2);
    const plan = renderToStaticMarkup(<StairPlan input={i} />);
    expect(plan).toContain("UP · Flight 1 · 10R");
    expect(plan).toContain("dashed: 1 m design strip");
    const r = analyzeStairs(i);
    const forces = renderToStaticMarkup(
      <StairForceDiagrams strip={r.strips[0]} />,
    );
    expect(forces).toContain("Mu envelope");
    expect(forces).toContain("Nu envelope");
  });
});
