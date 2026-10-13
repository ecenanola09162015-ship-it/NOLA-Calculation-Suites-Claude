import type { SlabLocalLoadKind } from "@nola/calc-core";

/**
 * One colour and one symbol per local-load type, shared by the 2D plan, the
 * PDF figures and the 3D view. Shapes differ too, so black-and-white prints
 * and colour-blind readers can still tell them apart.
 */
export const loadStyles: Record<
  SlabLocalLoadKind,
  { label: string; stroke: string; fill: string; text: string; symbol: string }
> = {
  point: {
    label: "Point load",
    stroke: "#c0392b",
    fill: "#e74c3c",
    text: "#8e2a1f",
    symbol: "filled square",
  },
  line: {
    label: "Line load",
    stroke: "#1f5fbf",
    fill: "#3b7dd8",
    text: "#163f80",
    symbol: "thick bar with end ticks",
  },
  area: {
    label: "Area load",
    stroke: "#2e8b3e",
    fill: "#4caf50",
    text: "#1e5e29",
    symbol: "hatched rectangle",
  },
};
