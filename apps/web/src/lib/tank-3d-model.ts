/**
 * Underground tank 3D model (format-neutral boxes and coloured panel maps),
 * engineering axes: x along Lx, y along Ly, z up from the base slab underside;
 * origin at the corner of the base slab. Shared by the 3D view and its test.
 */
import type { TankInput, TankPanelId, TankResult } from "@nola/calc-core";

export type TankBoxKind = "concrete" | "roof" | "liquid" | "soil" | "water";
export interface TankBox {
  id: string;
  kind: TankBoxKind;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
}
export interface TankMap {
  panel: TankPanelId;
  /** Corner and two in-plane axes (unit vectors) of the coloured face, offset outward. */
  origin: [number, number, number];
  u: [number, number, number];
  v: [number, number, number];
  lu: number;
  lv: number;
  nu: number;
  nv: number;
  /** values[a][b] at (a/nu·lu, b/nv·lv). */
  values: number[][];
}
export interface Tank3DModel {
  boxes: TankBox[];
  maps: TankMap[];
  vmax: number;
  center: [number, number, number];
  extent: number;
}

export function buildTank3DModel(i: TankInput, r: TankResult): Tank3DModel {
  const g = r.geometry,
    p = i.projection,
    tw = i.wall,
    tb = i.base,
    H = i.height,
    tr = i.roof.enabled ? i.roof.thickness : 0;
  const boxes: TankBox[] = [];
  const add = (id: string, kind: TankBoxKind, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => {
    if (x1 - x0 > 1e-6 && y1 - y0 > 1e-6 && z1 - z0 > 1e-6) boxes.push({ id, kind, x0, x1, y0, y1, z0, z1 });
  };
  const ox = p,
    oy = p,
    X1 = p + g.outerX,
    Y1 = p + g.outerY,
    top = tb + H;
  add("base", "concrete", 0, g.baseX, 0, g.baseY, 0, tb);
  add("wall-s1", "concrete", ox, X1, oy, oy + tw, tb, top);
  add("wall-s2", "concrete", ox, X1, Y1 - tw, Y1, tb, top);
  add("wall-l1", "concrete", ox, ox + tw, oy + tw, Y1 - tw, tb, top);
  add("wall-l2", "concrete", X1 - tw, X1, oy + tw, Y1 - tw, tb, top);
  if (i.roof.enabled) add("roof", "roof", ox, X1, oy, Y1, top, top + tr);
  if (i.liquid.depth > 0) add("liquid", "liquid", ox + tw, X1 - tw, oy + tw, Y1 - tw, tb, tb + i.liquid.depth);
  // Soil around the tank to ground level, 1 m beyond the base, and the roof cover.
  const e = 1,
    gz = tb + i.soil.ground;
  add("soil-w", "soil", -e, ox, -e, g.baseY + e, 0, gz);
  add("soil-e", "soil", X1, g.baseX + e, -e, g.baseY + e, 0, gz);
  add("soil-s", "soil", ox, X1, -e, oy, 0, gz);
  add("soil-n", "soil", ox, X1, Y1, g.baseY + e, 0, gz);
  if (i.roof.enabled && i.roof.cover > 0) add("cover", "soil", ox, X1, oy, Y1, top + tr, top + tr + i.roof.cover);
  if (i.soil.water > 0) add("gwt", "water", -e, g.baseX + e, -e, g.baseY + e, 0, Math.min(i.soil.water, gz));
  // Factored outside-face vertical moment maps on the two visible outer walls.
  const maps: TankMap[] = [];
  let vmax = 0;
  const off = 0.01;
  const mapOf = (panel: TankPanelId, origin: [number, number, number], u: [number, number, number], v: [number, number, number], lu: number, lv: number) => {
    const pr = r.panels.find((x) => x.id === panel);
    if (!pr) return;
    const nu = 32,
      nv = 14,
      values: number[][] = [];
    for (let a = 0; a <= nu; a++) {
      const col: number[] = [];
      for (let b = 0; b <= nv; b++) {
        const val = pr.field("backY", (pr.length * a) / nu, (pr.height * b) / nv);
        col.push(val);
        vmax = Math.max(vmax, val);
      }
      values.push(col);
    }
    maps.push({ panel, origin, u, v, lu, lv, nu, nv, values });
  };
  // Near faces in the default view: long wall at y = oy (south), short wall at x = ox (west).
  mapOf("long", [ox, oy - off, tb], [1, 0, 0], [0, 0, 1], g.outerX, H);
  mapOf("short", [ox - off, oy, tb], [0, 1, 0], [0, 0, 1], g.outerY, H);
  const zTop = Math.max(gz, top + tr + (i.roof.enabled ? i.roof.cover : 0));
  return {
    boxes,
    maps,
    vmax,
    center: [g.baseX / 2, g.baseY / 2, zTop / 2],
    extent: Math.max(g.baseX, g.baseY, zTop) + 2 * e,
  };
}
