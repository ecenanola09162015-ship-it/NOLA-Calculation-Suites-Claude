import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { defaultSlabInput, resolveSlabBars } from "@nola/calc-core";
import { SlabWorkspace } from "../src/components/slab-workspace";
import { SlabPlan, SlabSection } from "../src/components/slab-diagrams";
describe("slab workspace and diagrams", () => {
  it("renders code choices, separate covers, editable elevation modes and DCR-based reports", () => {
    const html = renderToStaticMarkup(
      <SlabWorkspace cloudReady={false} onSaved={() => {}} />,
    );
    expect(html).toContain("MAIN BARS");
    expect(html).toContain("EXTRA BARS");
    expect(html).toContain("Top Clear Cover");
    expect(html).toContain("Bottom Clear Cover");
    expect(html).toContain("Elevation z mm");
    expect(html).toContain("Auto");
    expect(html).toContain("DCR Criterion");
    expect(html).toContain("BS EN 1992 — Future Development");
    expect(html).toContain("AS 3600 — Future Development");
    expect(html).toContain("Paste From Excel");
    expect(html).toContain("Support anchorage");
    expect(html).toContain("REVIEW REQUIRED");
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("Infinity");
  });
  it("draws limited-length extra bars across the full width, preserves continuous main bars and correct A/B direction labels", () => {
    const i = defaultSlabInput();
    for (const layer of Object.keys(i.extra) as (keyof typeof i.extra)[])
      i.extra[layer].enabled = true;
    const bars = resolveSlabBars(i),
      plan = renderToStaticMarkup(
        <SlabPlan input={i} bars={bars} face="bottom" />,
      ),
      section = renderToStaticMarkup(
        <SlabSection input={i} bars={bars} direction="short" />,
      );
    expect(plan).toContain('data-bar-group="main"');
    expect(plan).toContain('data-bar-group="extra"');
    expect(plan).toContain('data-direction="short"');
    expect(plan).toContain("full transverse width");
    expect(section).toContain("SECTION A–A · Along short span");
    expect(section).toContain('stroke-dasharray="5 4"');
    expect(
      renderToStaticMarkup(
        <SlabSection input={i} bars={bars} direction="long" />,
      ),
    ).toContain("SECTION B–B · Along long span");
  });
  it("restores saved inputs, code and elevations without returning to defaults", () => {
    const input = defaultSlabInput();
    input.code = "NSCP 2015";
    input.topCover = 30;
    input.main["short-bottom"].elevation = 32;
    const html = renderToStaticMarkup(
      <SlabWorkspace
        cloudReady={false}
        onSaved={() => {}}
        draft={{
          id: "saved",
          projectId: "project",
          moduleSlug: "slab",
          title: "SL-02",
          payload: { kind: "slab", version: 1, input },
          verificationStatus: "verification-required",
          updatedAt: "2026-10-08",
        }}
      />,
    );
    expect(html).toContain('value="NSCP 2015" selected=""');
    expect(html).toContain("Override");
    expect(html).toContain('value="32"');
    expect(html).toContain("SL-02");
  });
});
