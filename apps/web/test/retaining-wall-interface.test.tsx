import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { defaultRetainingWallInput, designRetainingWall } from "@nola/calc-core";

import { RetainingWallWorkspace } from "../src/components/retaining-wall-workspace";
import { retainingWallSectionSvg, retainingWallStemSvg } from "../src/lib/retaining-wall-drawing";
import { buildRetainingWall3DModel } from "../src/lib/retaining-wall-3d-model";
import { retainingWallReportData } from "../src/lib/reports/retaining-wall-report";
import { uiCatalogue } from "../src/lib/ui-catalogue";
import { defaultDesignCheckPolicy } from "@nola/calc-core";

describe("retaining wall workspace", () => {
  it("renders the eight input panels, the section view and the review", () => {
    const html = renderToStaticMarkup(<RetainingWallWorkspace cloudReady={false} onSaved={() => {}} />);
    for (const t of [
      "01 · Wall Type &amp; Code",
      "02 · Geometry",
      "03 · Backfill, Surcharge &amp; Water",
      "04 · Toe Soil, Base &amp; Stability",
      "05 · Seismic",
      "06 · Materials &amp; Cover",
      "07 · Reinforcement",
      "08 · Load Combinations",
      "Section view",
      "3D view",
      "Full width (plate): end walls, top slab, buttresses",
      "203-2: 1.2D + 1.6L + 1.6H",
      "Calculation basis: ACI 318-19",
    ])
      expect(html).toContain(t);
    expect(html).toContain("Retaining wall section");
    expect(html).not.toContain("NaN");
  });
  it("restores a saved basement wall draft", () => {
    const input = defaultRetainingWallInput();
    input.wallType = "basement";
    input.soil.theory = "at-rest";
    input.footing = 0.15;
    const html = renderToStaticMarkup(
      <RetainingWallWorkspace
        cloudReady={false}
        onSaved={() => {}}
        draft={{
          id: "00000000-0000-4000-8000-000000000001",
          projectId: "00000000-0000-4000-8000-000000000002",
          moduleSlug: "retaining-wall",
          title: "BW-01",
          payload: { kind: "retaining-wall", version: 1, input },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as never}
      />,
    );
    expect(html).toContain("Top slab restraint");
    expect(html).toContain("Top slab reaction (service)");
    expect(html).not.toContain("04 · Toe Soil");
  });
  it("is a Pilot card in the launcher", () => {
    expect(uiCatalogue.find((m) => m.slug === "retaining-wall")?.pilot).toBe(true);
  });
});

describe("retaining wall drawings, 3D model and report", () => {
  const i = defaultRetainingWallInput();
  const r = designRetainingWall(i);
  it("section SVG shows the plane pressure, bearing and bar call-outs", () => {
    const svg = retainingWallSectionSvg(i, r);
    // Ka γ (H + tf) = 0.333 × 18 × 4.1 = 24.6 kPa at the plane base.
    expect(svg).toContain("24.6 kPa");
    expect(svg).toContain("50.4 kN/m @ 1.37 m");
    expect(svg).toContain("72.4 kPa");
    expect(svg).toContain("D16 @ 100 back face");
    expect(svg).toContain("B = 2.70 m");
    expect(svg).not.toContain("NaN");
    const bare = retainingWallSectionSvg(i, r, { pressures: false, bars: false });
    expect(bare).not.toContain("kN/m @");
    expect(bare).not.toContain("back face");
  });
  it("stem SVG plots Mu against φMn", () => {
    const svg = retainingWallStemSvg(i, r);
    expect(svg).toContain("φMn back");
    expect(svg).toContain("87.8");
  });
  it("3D model extrudes the shared section and places pressure arrows", () => {
    const m = buildRetainingWall3DModel(i, r, 6);
    expect(m.prisms.map((p) => p.id)).toEqual(expect.arrayContaining(["stem", "footing", "backfill", "toe-soil"]));
    expect(m.prisms.every((p) => p.y1 - p.y0 > 0)).toBe(true);
    const soil = m.arrows.filter((a) => a.component === "soil");
    expect(soil).toHaveLength(8);
    // Arrows grow with depth (triangular pressure).
    expect(soil.at(0)!.length).toBeGreaterThan(soil.at(-1)!.length);
    const propped = defaultRetainingWallInput();
    propped.wallType = "propped";
    const pm = buildRetainingWall3DModel(propped, designRetainingWall(propped), 6);
    expect(pm.prisms.some((p) => p.kind === "prop")).toBe(true);
  });
  it("report lists stability, member design, clauses and limitations", async () => {
    const d = retainingWallReportData(undefined, "RW-01", i, r, defaultDesignCheckPolicy, {});
    expect(d.module).toBe("Concrete Retaining Wall");
    expect(d.basis).toBe("ACI 318-19");
    expect(d.summary.map((s) => s.title)).toContain("External Stability (Service)");
    const { retainingWallCheckSections } = await import("@nola/calc-core");
    expect(d.checks.rows.length).toBe(r.checks.length + retainingWallCheckSections(r).length);
    expect(String((d.checks.rows[0]![0] as { text: string }).text)).toContain("Stability Checks (Service, FS)");
    expect(d.criticalNotes.some((n) => n.includes("Bearing"))).toBe(true);
    expect(d.figures.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(d)).not.toContain("NaN");
  });
});

describe("retaining wall quantity estimate", () => {
  it("restores the estimate from a draft and adds it to the report", () => {
    const input = defaultRetainingWallInput();
    const html = renderToStaticMarkup(
      <RetainingWallWorkspace
        cloudReady={false}
        onSaved={() => {}}
        draft={{
          id: "00000000-0000-4000-8000-000000000003",
          projectId: "00000000-0000-4000-8000-000000000002",
          moduleSlug: "retaining-wall",
          title: "RW-Q",
          payload: { kind: "retaining-wall", version: 1, input, quantity: { enabled: true, length: 10, endForms: true } },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as never}
      />,
    );
    expect(html).toContain("Quantity Estimate");
    expect(html).toContain("19.50 m³");
    const d = retainingWallReportData(undefined, "RW-Q", input, designRetainingWall(input), defaultDesignCheckPolicy, {}, null, {
      enabled: true,
      length: 10,
      endForms: true,
    });
    expect(d.estimate?.title).toContain("10.0 m");
  });
});

describe("retaining wall PDF", () => {
  const png =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
  it.each(["simple", "complete"] as const)("generates the %s report", async (type) => {
    const { generateCalculationPdf } = await import("../src/lib/reports/pdf");
    const input = defaultRetainingWallInput();
    const d = retainingWallReportData(undefined, "RW-01", input, designRetainingWall(input), defaultDesignCheckPolicy, {}, png, {
      enabled: true,
      length: 10,
      endForms: true,
    });
    for (const fig of d.figures) fig.png = png;
    const out = await generateCalculationPdf(d, { type, paper: "A4", nolaLogo: png });
    expect(out.pageCount).toBeGreaterThan(0);
    if (type === "simple") expect(out.pageCount).toBeLessThanOrEqual(2);
  });
});

describe("UI polish batch", () => {
  it("review has four headed sections and the reinforcement table shows marks and lowercase units", () => {
    const i = defaultRetainingWallInput();
    i.key.enabled = true;
    const html = renderToStaticMarkup(
      <RetainingWallWorkspace
        cloudReady={false}
        onSaved={() => {}}
        draft={{
          id: "00000000-0000-4000-8000-000000000004",
          projectId: "00000000-0000-4000-8000-000000000002",
          moduleSlug: "retaining-wall",
          title: "RW-K",
          payload: { kind: "retaining-wall", version: 1, input: i },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as never}
      />,
    );
    const order = ["Stability Checks (Service, FS)", "Reinforcement Checks — Stem", "Reinforcement Checks — Footing", "Reinforcement Checks — Detailing"].map((t) => html.indexOf(t));
    expect(order.every((k) => k > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain("Spacing mm");
    expect(html).toContain("As mm²/m");
    for (const m of [1, 2, 3, 4, 5, 6, 7]) expect(html).toContain(`data-mark="${m}"`);
    expect(html).toContain("Shear key (bottom of footing)");
    expect(html).toContain("Under stem (centred)");
  });
  it("drawing shows surcharge rows, strip, line load, wind, slope angles and key bars", () => {
    const i = defaultRetainingWallInput();
    i.surcharge = { dead: 5, live: 10 };
    i.strip = { enabled: true, q: 20, distance: 1, width: 1, kind: "live" };
    i.axial = { enabled: true, dead: 10, live: 5, eccentricity: 0.05 };
    i.wind = { enabled: true, pressure: 1, height: 1 };
    i.soil.beta = 10;
    i.toeSoil.slope = 10;
    i.key = { ...i.key, enabled: true, position: "stem" };
    const svg = retainingWallSectionSvg(i, designRetainingWall(i));
    expect(svg).toContain("qD = 5.0 kPa uniform surcharge (dead)");
    expect(svg).toContain("qL = 10.0 kPa uniform surcharge (live)");
    expect(svg).toContain("strip 20.0 kPa (live)");
    expect(svg).toContain("P = 10.0 D + 5.0 L kN/m on stem top");
    expect(svg).toContain("W = wind 1.00 kPa");
    expect(svg).toContain("β = 10°");
    expect(svg).toContain("toe slope 10°");
    expect(svg).toMatch(/shear key [\d.]+ × [\d.]+ m under stem, front face/);
    expect(svg).toContain("under stem");
    expect(svg).not.toContain("NaN");
    const plain = retainingWallSectionSvg(defaultRetainingWallInput(), designRetainingWall(defaultRetainingWallInput()));
    expect(plain).not.toContain("uniform surcharge");
    const m = buildRetainingWall3DModel(i, designRetainingWall(i), 5);
    for (const k of ["surchargeDead", "surchargeLive", "strip", "axial", "wind"]) expect(m.loads.some((l) => l.kind === k)).toBe(true);
  });
});

import { retainingWallElevationSvg } from "../src/lib/retaining-wall-elevation";
describe("full-width plate UI (Phase 2)", () => {
  const input = defaultRetainingWallInput();
  input.analysis = "plate";
  input.plate = { ...input.plate, length: 8, left: "fixed", right: "pinned", buttresses: [{ x: 3, height: 3.8, width: 0.3 }] };
  const r = designRetainingWall(input);
  it("elevation SVG shows the field, restraints, buttress and governing point", () => {
    const svg = retainingWallElevationSvg(input, r, "backY");
    expect(svg).toContain("Vertical moment, back face");
    expect(svg).toContain("L = 8.00 m");
    expect(svg).toContain(">B1<");
    expect(svg).toMatch(/Mu [\d.]+ \/ φMn [\d.]+ · DCR [\d.]+/);
    expect(svg).toContain("left fixed, right pinned");
    expect(svg).not.toContain("NaN");
  });
  it("3D model uses the true length with end walls, buttresses and a moment map", () => {
    const m = buildRetainingWall3DModel(input, r, 5);
    expect(m.length).toBe(8);
    expect(m.prisms.map((p) => p.id)).toEqual(expect.arrayContaining(["end-left", "end-right", "buttress-0"]));
    expect(m.momentMap!.vmax).toBeGreaterThan(0);
  });
  it("workspace offers the plate panel and the Elevation tab; report adds elevation figures", () => {
    const html = renderToStaticMarkup(
      <RetainingWallWorkspace
        cloudReady={false}
        onSaved={() => {}}
        draft={{ id: "00000000-0000-4000-8000-000000000011", projectId: "00000000-0000-4000-8000-000000000002", moduleSlug: "retaining-wall", title: "P", payload: { kind: "retaining-wall", version: 1, input }, createdAt: "", updatedAt: "" } as never}
      />,
    );
    expect(html).toContain("Full-width stem (plate)");
    expect(html).toContain("Elevation");
    expect(html).toContain("Add buttress");
    const d = retainingWallReportData(undefined, "P", input, r, defaultDesignCheckPolicy, {});
    expect(d.figures.some((f) => f.title.includes("Elevation"))).toBe(true);
    expect(d.sections.some((s) => s.title.startsWith("Full-Width Plate"))).toBe(true);
    expect(d.checks.rows.some((row) => String(row[0]).startsWith("Plate ·"))).toBe(true);
  });
});
