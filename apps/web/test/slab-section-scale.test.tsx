import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { defaultSlabInput, resolveSlabBars } from "@nola/calc-core";
import {
  pdfSectionFrame,
  slabSectionScale,
  slabSectionScaleNote,
} from "../src/lib/slab-section-scale";
import { SlabSection } from "../src/components/slab-diagrams";

describe("proportional slab sections", () => {
  const i = defaultSlabInput();
  it("shares one horizontal scale: the long section fills the width", () => {
    const s = slabSectionScale(i),
      L = s.long,
      S = s.short;
    const total = (g: typeof L) => g.spanPx + g.nearWidthPx + g.farWidthPx;
    expect(Math.max(total(L), total(S))).toBeCloseTo(660, 6);
    // Clear-span pixel ratio equals the true span ratio.
    expect(S.spanPx / L.spanPx).toBeCloseTo(S.span / L.span, 9);
    // Beam widths at the horizontal scale: 250 mm.
    expect(S.nearWidthPx).toBeCloseTo(0.25 * s.sH, 9);
  });
  it("shares one vertical scale: slab and beam depth in true ratio", () => {
    const s = slabSectionScale(i),
      g = s.short;
    const beamPx = g.slabPx + g.nearDropPx;
    expect(beamPx / g.slabPx).toBeCloseTo(500 / i.h, 9);
    expect(s.depthPx).toBeCloseTo(140, 6);
    expect(s.ratio).toBeCloseTo(s.sV / s.sH, 12);
    expect(s.ratio).toBeGreaterThanOrEqual(1);
    expect(slabSectionScaleNote(s.ratio)).toMatch(
      /^Vertical scale ×\d+\.\d of horizontal$/,
    );
    expect(slabSectionScaleNote(1)).toBe("True scale (H = V)");
  });
  it("keeps the PDF within its frame and the slab visible for deep beams", () => {
    const deep = {
      ...i,
      h: 120,
      beams: {
        source: "custom" as const,
        sizes: {
          west: { width: 400, depth: 1200 },
          east: { width: 250, depth: 500 },
          south: { width: 250, depth: 500 },
          north: { width: 250, depth: 500 },
        },
      },
    };
    const p = slabSectionScale(deep, pdfSectionFrame);
    expect(p.depthPx).toBeLessThanOrEqual(pdfSectionFrame.maxTotalPx + 1e-9);
    const s = slabSectionScale(deep);
    // Slab enlarged from 14 px (1200 mm beam at 140 px) up to the 260 px cap.
    expect(s.depthPx).toBeCloseTo(260, 6);
    expect(s.short.slabPx).toBeCloseTo(26, 6);
  });
  it("renders both sections with the same scales and the stated exaggeration", () => {
    const bars = resolveSlabBars(i);
    const a = renderToStaticMarkup(
        <SlabSection input={i} bars={bars} direction="short" />,
      ),
      b = renderToStaticMarkup(
        <SlabSection input={i} bars={bars} direction="long" />,
      );
    const attr = (h: string, k: string) =>
      Number(h.match(new RegExp(`${k}="([\\d.]+)"`))![1]);
    expect(attr(a, "data-scale-h")).toBe(attr(b, "data-scale-h"));
    expect(attr(a, "data-scale-v")).toBe(attr(b, "data-scale-v"));
    expect(attr(a, "data-span-px")).toBeLessThan(attr(b, "data-span-px"));
    expect(a).toContain("Vertical scale ×");
    expect(a).not.toContain("not to scale");
  });
});
