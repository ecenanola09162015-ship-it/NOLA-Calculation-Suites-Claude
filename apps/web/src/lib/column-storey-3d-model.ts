/**
 * 3D storey model for the RC column (17 Oct 2026): column, upper slab,
 * N/S/E/W beams, drop panel / capital, lower slab and footing / tie-beam
 * offset, with ℓu,x / ℓu,y / H dimension lines. Pure geometry (metres),
 * engineering axes: x east (along b), y north (along h), z up; z = 0 at the
 * top of the lower slab. The view (three.js) only draws these boxes.
 */
import {
  STOREY_SIDES,
  storeyClearHeights,
  storeyDepths,
  storeySides,
  type ColumnStorey,
  type StoreySideId,
} from "@nola/calc-core";
import type { Box3 } from "./slab-3d-model";

export interface StoreyPiece {
  id: string;
  label: string;
  box: Box3;
  kind: "column" | "slab" | "beam" | "capital" | "lowerSlab" | "footing";
}
export interface StoreyDim {
  id: "H" | "luX" | "luY";
  label: string;
  /** Vertical line at plan point (x, y) from z0 to z1. */
  x: number;
  y: number;
  z0: number;
  z1: number;
  color: string;
}
export interface Storey3DModel {
  pieces: StoreyPiece[];
  dims: StoreyDim[];
  /** Half plan extent of slab drawn around the column, m. */
  reach: number;
  height: number;
  extent: number;
  assumedWidth: boolean;
}

const SIDE_LABEL: Record<StoreySideId, string> = {
  north: "N",
  south: "S",
  east: "E",
  west: "W",
};

export function buildStorey3DModel(
  storey: ColumnStorey,
  column: { width: number; depth: number },
): Storey3DModel {
  const m = (v: number) => v / 1000;
  const H = m(storey.height),
    b = m(column.width),
    h = m(column.depth);
  const { sides, slab, assumedWidth } = storeySides(storey);
  const t = m(slab);
  const reach = Math.max(b, h) / 2 + 1.2;
  const pieces: StoreyPiece[] = [];
  const zBot = m(storey.bottom ?? 0);
  pieces.push({
    id: "column",
    label: `Column ${column.width} × ${column.depth}`,
    kind: "column",
    // Column runs through the joint: its top is flush with the slab and
    // beam tops (top of slab = H), as built.
    box: { x0: -b / 2, x1: b / 2, y0: -h / 2, y1: h / 2, z0: zBot, z1: H },
  });
  pieces.push({
    id: "slab",
    label: `Slab ${slab} mm`,
    kind: "slab",
    box: { x0: -reach, x1: reach, y0: -reach, y1: reach, z0: H - t, z1: H },
  });
  pieces.push({
    id: "lowerSlab",
    label: "Lower slab",
    kind: "lowerSlab",
    box: { x0: -reach, x1: reach, y0: -reach, y1: reach, z0: -t, z1: 0 },
  });
  if (zBot > 0)
    pieces.push({
      id: "footing",
      label: `Footing / tie beam +${storey.bottom}`,
      kind: "footing",
      box: {
        x0: -b / 2 - 0.25,
        x1: b / 2 + 0.25,
        y0: -h / 2 - 0.25,
        y1: h / 2 + 0.25,
        z0: 0,
        z1: zBot,
      },
    });
  for (const k of STOREY_SIDES) {
    const s = sides[k];
    if (!s.beam) continue;
    const w = m(s.width) / 2,
      d = m(s.depth);
    const box: Box3 =
      k === "north"
        ? { x0: -w, x1: w, y0: h / 2, y1: reach, z0: H - d, z1: H }
        : k === "south"
          ? { x0: -w, x1: w, y0: -reach, y1: -h / 2, z0: H - d, z1: H }
          : k === "east"
            ? { x0: b / 2, x1: reach, y0: -w, y1: w, z0: H - d, z1: H }
            : { x0: -reach, x1: -b / 2, y0: -w, y1: w, z0: H - d, z1: H };
    pieces.push({
      id: k,
      label: `${SIDE_LABEL[k]} beam ${s.width} × ${s.depth}${assumedWidth ? " (width assumed)" : ""}`,
      kind: "beam",
      box,
    });
  }
  const cap = m(storey.capital ?? 0);
  if (cap > 0)
    pieces.push({
      id: "capital",
      label: `Drop panel / capital ${storey.capital}`,
      kind: "capital",
      box: {
        x0: -b / 2 - 0.3,
        x1: b / 2 + 0.3,
        y0: -h / 2 - 0.3,
        y1: h / 2 + 0.3,
        z0: H - t - cap,
        z1: H - t,
      },
    });
  const d = storeyDepths(storey),
    lu = storeyClearHeights(storey);
  const dims: StoreyDim[] = [
    {
      id: "H",
      label: `H = ${storey.height}`,
      x: -reach,
      y: -reach,
      z0: 0,
      z1: H,
      color: "#263d4d",
    },
    {
      id: "luX",
      label: `ℓu,x ${Math.round(lu.luX)}${storey.luOverrideX !== null ? " (override)" : ""}`,
      x: b / 2 + 0.35,
      y: -h / 2 - 0.35,
      z0: zBot,
      z1: H - m(d.ns) - cap,
      color: "#0f766e",
    },
    {
      id: "luY",
      label: `ℓu,y ${Math.round(lu.luY)}${storey.luOverrideY !== null ? " (override)" : ""}`,
      x: -b / 2 - 0.35,
      y: -h / 2 - 0.35,
      z0: zBot,
      z1: H - m(d.ew) - cap,
      color: "#b45309",
    },
  ];
  return {
    pieces,
    dims,
    reach,
    height: H,
    extent: Math.max(H + t, 2 * reach),
    assumedWidth,
  };
}
