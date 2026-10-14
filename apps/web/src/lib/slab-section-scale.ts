import {
  slabBeamSizes,
  slabSpans,
  type SlabDirection,
  type SlabInput,
} from "@nola/calc-core";

/**
 * Proportional geometry for slab sections A–A (short) and B–B (long), shared
 * by the screen drawing and the PDF so both sections use:
 * - one horizontal scale (px/m): the longer total length (clear span + beam
 *   widths) fills the drawing width, the other is proportionally shorter;
 * - one vertical scale (px/m): slab thickness and beam depths in true ratio,
 *   exaggerated relative to the horizontal by `ratio` (stated on the drawing).
 */
export interface SlabSectionGeometry {
  direction: SlabDirection;
  /** Clear span, m. */
  span: number;
  near: { width: number; depth: number } | null;
  far: { width: number; depth: number } | null;
  /** Left end of the clear span, px. */
  x0: number;
  spanPx: number;
  nearWidthPx: number;
  farWidthPx: number;
  /** Slab thickness, px. */
  slabPx: number;
  /** Beam downstand below the soffit, px. */
  nearDropPx: number;
  farDropPx: number;
}
export interface SlabSectionScale {
  /** Horizontal and vertical scales, px per m. */
  sH: number;
  sV: number;
  /** Vertical exaggeration sV / sH (≥ 1). */
  ratio: number;
  /** Deepest member (slab or beam) on either section, px. */
  depthPx: number;
  short: SlabSectionGeometry;
  long: SlabSectionGeometry;
}
export interface SlabSectionFrame {
  /** Drawing width available for the longest section, px. */
  width: number;
  left: number;
  /** Deepest member drawn at this height, px. */
  maxDepthPx: number;
  /** Slab drawn at least this thick when beams are very deep, px … */
  minSlabPx: number;
  /** … unless the deepest member would exceed this, px. */
  maxTotalPx: number;
}
export const screenSectionFrame: SlabSectionFrame = {
  width: 660,
  left: 70,
  maxDepthPx: 140,
  minSlabPx: 28,
  maxTotalPx: 260,
};
export const pdfSectionFrame: SlabSectionFrame = {
  width: 226,
  left: 12,
  maxDepthPx: 40,
  minSlabPx: 8,
  maxTotalPx: 52,
};

export function slabSectionScale(
  i: SlabInput,
  frame: SlabSectionFrame = screenSectionFrame,
): SlabSectionScale {
  const spans = slabSpans(i),
    beams = slabBeamSizes(i),
    h = i.h / 1000;
  const raw = (["short", "long"] as const).map((direction) => {
    const span = direction === "short" ? spans.primary : spans.secondary,
      alongX = (direction === "short") === spans.primaryX,
      near = beams[alongX ? "west" : "south"],
      far = beams[alongX ? "east" : "north"],
      total = span + ((near?.width ?? 0) + (far?.width ?? 0)) / 1000;
    return { direction, span, near, far, total };
  });
  let sH = frame.width / Math.max(...raw.map((r) => r.total));
  const deepest =
    Math.max(
      i.h,
      ...raw.flatMap((r) => [r.near?.depth ?? 0, r.far?.depth ?? 0]),
    ) / 1000;
  let sV = frame.maxDepthPx / deepest;
  if (h * sV < frame.minSlabPx)
    sV = Math.min(frame.minSlabPx / h, frame.maxTotalPx / deepest);
  // Never compress the vertical below the horizontal scale.
  sV = Math.max(sV, sH);
  // Very short spans with deep beams: shrink both scales to stay in frame.
  const fit = Math.min(1, frame.maxTotalPx / (deepest * sV));
  sH *= fit;
  sV *= fit;
  const geometry = (r: (typeof raw)[number]): SlabSectionGeometry => {
    const nearWidthPx = ((r.near?.width ?? 0) / 1000) * sH,
      farWidthPx = ((r.far?.width ?? 0) / 1000) * sH,
      start = frame.left + (frame.width - r.total * sH) / 2,
      drop = (b: { depth: number } | null) =>
        b ? Math.max(0, b.depth / 1000 - h) * sV : 0;
    return {
      direction: r.direction,
      span: r.span,
      near: r.near,
      far: r.far,
      x0: start + nearWidthPx,
      spanPx: r.span * sH,
      nearWidthPx,
      farWidthPx,
      slabPx: h * sV,
      nearDropPx: drop(r.near),
      farDropPx: drop(r.far),
    };
  };
  return {
    sH,
    sV,
    ratio: sV / sH,
    depthPx: deepest * sV,
    short: geometry(raw[0]),
    long: geometry(raw[1]),
  };
}

/** "Vertical scale ×2.8 of horizontal" or "True scale (H = V)". */
export function slabSectionScaleNote(ratio: number) {
  return ratio < 1.02
    ? "True scale (H = V)"
    : `Vertical scale ×${ratio.toFixed(1)} of horizontal`;
}

/** Slab + beam outline path (beam tops flush with the slab top). */
export function slabSectionOutline(g: SlabSectionGeometry, top: number) {
  const soffit = top + g.slabPx,
    l = g.x0 - g.nearWidthPx,
    r = g.x0 + g.spanPx + g.farWidthPx;
  return [
    `M ${l} ${top}`,
    `H ${r}`,
    `V ${soffit + g.farDropPx}`,
    `H ${g.x0 + g.spanPx}`,
    `V ${soffit}`,
    `H ${g.x0}`,
    `V ${soffit + g.nearDropPx}`,
    `H ${l}`,
    "Z",
  ].join(" ");
}
