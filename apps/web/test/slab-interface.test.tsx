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
    expect(html.indexOf("Enable Quantity Estimate")).toBeGreaterThan(
      html.indexOf("DCR-Based Design Checks"),
    );
    expect(html).not.toContain("REVISE");
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
  it("shows combined reinforcement at supports and midspan without a false capacity warning", () => {
    const input = defaultSlabInput();
    for (const layer of Object.keys(
      input.extra,
    ) as (keyof typeof input.extra)[])
      input.extra[layer].enabled = true;
    const html = renderToStaticMarkup(
      <SlabWorkspace
        cloudReady={false}
        onSaved={() => {}}
        draft={{
          id: "saved",
          projectId: "project",
          moduleSlug: "slab",
          title: "Combined Slab",
          verificationStatus: "verification-required",
          updatedAt: "2026-10-12",
          payload: { kind: "slab", version: 1, input },
        }}
      />,
    );
    for (const text of [
      "Combined Reinforcement By Location",
      "MAIN As mm²/m",
      "EXTRA As Used mm²/m",
      "Total Active As mm²/m",
      "Midspan · MAIN + EXTRA BARS",
      "Support · MAIN + EXTRA BARS",
      "Outside Bottom Cutoff",
    ])
      expect(html).toContain(text);
    expect(html).not.toContain("No Available Capacity");
  });
});
describe("slab point loads", () => {
  it("shows point-load inputs, plan markers and the punching table", () => {
    const input = {
      ...defaultSlabInput(),
      lx: 5,
      ly: 5,
      h: 200,
      pointLoads: [
        {
          kind: "point" as const,
          id: "P1",
          x: 2.5,
          y: 2.5,
          bx: 300,
          by: 300,
          dead: 40,
          live: 20,
        },
      ],
    };
    const html = renderToStaticMarkup(
      <SlabWorkspace
        cloudReady={false}
        onSaved={() => {}}
        draft={{
          id: "saved",
          projectId: "project",
          moduleSlug: "slab",
          title: "Point Load Slab",
          verificationStatus: "verification-required",
          updatedAt: "2026-10-13",
          payload: { kind: "slab", version: 1, input },
        }}
      />,
    );
    for (const text of [
      "Point Loads",
      "＋ Point load",
      'aria-label="P1 bx"',
      "data-point-loads",
      "Punching Shear At Point Loads",
      "Punching",
      "Table 22.6.5.2",
    ])
      expect(html).toContain(text);
    expect(html).not.toContain("NaN");
  });
});
describe("cantilever slabs", () => {
  const draft = (
    supports: ReturnType<typeof defaultSlabInput>["supports"],
  ) => ({
    id: "saved",
    projectId: "project",
    moduleSlug: "slab",
    title: "Cantilever",
    verificationStatus: "verification-required" as const,
    updatedAt: "2026-10-13",
    payload: {
      kind: "slab" as const,
      version: 1 as const,
      input: { ...defaultSlabInput(), lx: 1.5, ly: 6, h: 180, supports },
    },
  });
  it("designs a cantilever and draws free edges without a support band", () => {
    const html = renderToStaticMarkup(
      <SlabWorkspace
        cloudReady={false}
        onSaved={() => {}}
        draft={draft({
          west: "Fixed",
          east: "Free",
          south: "Free",
          north: "Free",
        })}
      />,
    );
    for (const text of [
      "<option>Free</option>",
      "Auto: CANTILEVER",
      "Cantilever root negative / top",
      "EAST · Free",
      "past support face",
      "Ie at support 24.2.3.7",
    ])
      expect(html).toContain(text);
    expect(html).not.toContain("NaN");
  });
  it("blocks an unstable layout and offers to fix the pinned edge", () => {
    const html = renderToStaticMarkup(
      <SlabWorkspace
        cloudReady={false}
        onSaved={() => {}}
        draft={draft({
          west: "Pinned",
          east: "Free",
          south: "Free",
          north: "Free",
        })}
      />,
    );
    expect(html).toContain("Unstable supports");
    expect(html).toContain("Set west to Fixed");
  });
});
describe("line and area loads in the plan", () => {
  it("draws point, line and area loads with distinct symbols, colours and a legend", () => {
    const i = {
      ...defaultSlabInput(),
      lx: 5,
      ly: 4,
      pointLoads: [
        {
          kind: "point" as const,
          id: "P1",
          x: 1,
          y: 1,
          bx: 300,
          by: 300,
          dead: 10,
          live: 0,
        },
        {
          kind: "line" as const,
          id: "W1",
          x: 0,
          y: 2,
          direction: "X" as const,
          length: 5,
          thickness: 150,
          dead: 6,
          live: 0,
        },
        {
          kind: "area" as const,
          id: "A1",
          x: 3.5,
          y: 3,
          bx: 1500,
          by: 1000,
          dead: 2,
          live: 1,
        },
      ],
    };
    const plan = renderToStaticMarkup(
      <SlabPlan input={i} bars={resolveSlabBars(i)} face="bottom" />,
    );
    for (const text of [
      'data-load-kind="point"',
      'data-load-kind="line"',
      'data-load-kind="area"',
      "#c0392b",
      "#1f5fbf",
      "url(#area-hatch-bottom)",
      "data-load-legend",
      "Line load",
      "Area load",
    ])
      expect(plan).toContain(text);
    const html = renderToStaticMarkup(
      <SlabWorkspace
        cloudReady={false}
        onSaved={() => {}}
        draft={{
          id: "saved",
          projectId: "project",
          moduleSlug: "slab",
          title: "Local Loads",
          verificationStatus: "verification-required",
          updatedAt: "2026-10-13",
          payload: { kind: "slab", version: 1, input: i },
        }}
      />,
    );
    for (const text of [
      "＋ Line load",
      "＋ Area load",
      "wD kN/m",
      "qD kPa",
      'aria-label="W1 direction"',
    ])
      expect(html).toContain(text);
    expect(html).not.toContain("NaN");
  });
});
describe("bounding beams", () => {
  it("shows the beam-size switch and draws 250 × 500 beams in plan and section", () => {
    const i = defaultSlabInput();
    const html = renderToStaticMarkup(
      <SlabWorkspace cloudReady={false} onSaved={() => {}} />,
    );
    for (const text of [
      "Bounding beams",
      "Default 250 × 500 mm",
      "Custom (here)",
      "Bounding beam sizes",
      "Rebar standard",
      "1,000 psi = 6.89 MPa",
      "4,000 psi = 27.58 MPa",
      "15,000 psi = 103.42 MPa",
      "One-Way Shear Checks At d From Beam Face",
    ])
      expect(html).toContain(text);
    const bars = resolveSlabBars(i);
    expect(
      renderToStaticMarkup(
        <SlabSection input={i} bars={bars} direction="short" />,
      ),
    ).toContain('data-beams="250x500|250x500"');
    expect(
      renderToStaticMarkup(<SlabPlan input={i} bars={bars} face="bottom" />),
    ).toContain("data-plan-beams");
    // Cantilever: beam at the Fixed root only, free tip has none.
    const c = {
      ...i,
      lx: 1.5,
      ly: 6,
      supports: {
        west: "Fixed",
        east: "Free",
        south: "Free",
        north: "Free",
      } as const,
    };
    expect(
      renderToStaticMarkup(
        <SlabSection input={c} bars={resolveSlabBars(c)} direction="short" />,
      ),
    ).toContain('data-beams="250x500|free"');
  });
});
