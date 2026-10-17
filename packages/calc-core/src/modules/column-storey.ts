/**
 * Storey geometry: one floor-to-floor height and the upper-floor beam depths
 * drive the unsupported length ℓu (slenderness), the clear height for lo and
 * Ve (confinement) and the estimate's height and joint depth.
 *
 * ACI 318-19 6.2.4 (ℓu is the clear distance between floor slabs, beams or
 * other members providing lateral support in the direction considered, taken
 * to the lower extremity of any capital, drop panel or haunch).
 *
 * Conventions (user decisions, 13 Oct 2026):
 * - H is measured top of lower slab to top of upper slab (ETABS story height).
 * - Bending about x (Mux, h = depth) is braced by the beam running along Y;
 *   bending about y (Muy, h = width) by the beam running along X.
 *   ℓu,x = H − d(beam along Y) − capital − bottom; ℓu,y = H − d(beam along X) − …
 * - No beam in a direction (flat plate): enter the slab thickness.
 * - lo uses the larger ℓu (18.7.5.1, conservative); Ve uses each direction's
 *   own ℓu (18.7.6.1.1); the estimate's joint is the deeper beam (18.8.3).
 */
import { z } from "zod";

const finite = z.number().finite();
/**
 * One upper-floor side of the column (17 Oct 2026): a beam framing into that
 * face, or none (slab only). North/South beams run along Y and brace Mux;
 * East/West beams run along X and brace Muy.
 */
export const storeySideSchema = z.object({
  beam: z.boolean(),
  width: finite.min(100).max(3000),
  depth: finite.min(50).max(5000),
});
export type StoreySide = z.infer<typeof storeySideSchema>;
export type StoreySideId = "north" | "south" | "east" | "west";
export const STOREY_SIDES: StoreySideId[] = ["north", "south", "east", "west"];
export const DEFAULT_BEAM_WIDTH = 300;
export const DEFAULT_SLAB_THICKNESS = 150;
export const columnStoreySchema = z.object({
  /** Floor-to-floor height H, top of slab to top of slab, mm. */
  height: finite.min(500).max(20000),
  /** Depth of the beam running along X (braces bending about y), mm. */
  beamX: finite.min(0).max(5000),
  /** Depth of the beam running along Y (braces bending about x), mm. */
  beamY: finite.min(0).max(5000),
  /** Drop panel / capital / haunch depth below the beam or slab soffit, mm. */
  capital: finite.min(0).max(3000).default(0),
  /**
   * Lower support: height of the top of footing / tie beam / lower haunch
   * above the lower floor level (ground storey), mm.
   */
  bottom: finite.min(0).max(3000).default(0),
  /** Per-direction ℓu override (e.g. intermediate bracing), mm. */
  luOverrideX: finite.positive().max(50000).nullable().default(null),
  luOverrideY: finite.positive().max(50000).nullable().default(null),
  /** Upper slab thickness, mm: the depth on sides without a beam; 3D view. */
  slabThickness: finite.min(50).max(1000).optional(),
  /** Beams N/S/E/W. Absent on older drafts: built from beamX / beamY. */
  sides: z
    .object({
      north: storeySideSchema,
      south: storeySideSchema,
      east: storeySideSchema,
      west: storeySideSchema,
    })
    .optional(),
});
export type ColumnStorey = z.infer<typeof columnStoreySchema>;

export function defaultColumnStorey(): ColumnStorey {
  return {
    height: 3000,
    beamX: 500,
    beamY: 500,
    capital: 0,
    bottom: 0,
    luOverrideX: null,
    luOverrideY: null,
  };
}
/** New calculations: 300 × 500 beams on all four sides, 150 mm slab. */
export function newColumnStorey(): ColumnStorey {
  const beam = { beam: true, width: DEFAULT_BEAM_WIDTH, depth: 500 };
  return withStoreySides(
    defaultColumnStorey(),
    { north: beam, south: beam, east: beam, west: beam },
    DEFAULT_SLAB_THICKNESS,
  );
}

export interface StoreyClearHeights {
  /** Derived ℓu for bending about x (Mux) and about y (Muy), mm. */
  derivedX: number;
  derivedY: number;
  /** Adopted ℓu (override if set), mm. */
  luX: number;
  luY: number;
  /** Clear height used for lo = max(ℓu,x, ℓu,y). */
  loClear: number;
  /** Beam-column joint depth for the estimate = deeper beam. */
  joint: number;
}

/**
 * The four sides, resolved: stored sides, or (older drafts) N/S beams of
 * depth beamY and E/W beams of depth beamX at the default width (assumed).
 */
export function storeySides(s: ColumnStorey): {
  sides: Record<StoreySideId, StoreySide>;
  slab: number;
  assumedWidth: boolean;
} {
  const slab = s.slabThickness ?? DEFAULT_SLAB_THICKNESS;
  if (s.sides) return { sides: s.sides, slab, assumedWidth: false };
  const beam = (depth: number): StoreySide => ({
    beam: true,
    width: DEFAULT_BEAM_WIDTH,
    depth,
  });
  return {
    sides: {
      north: beam(s.beamY),
      south: beam(s.beamY),
      east: beam(s.beamX),
      west: beam(s.beamX),
    },
    slab,
    assumedWidth: true,
  };
}
/**
 * Depths for ℓu (ACI 318-19 6.2.4), user decision 17 Oct 2026: in each
 * direction the SHALLOWER support governs (longer ℓu, conservative for
 * slenderness); a side without a beam counts as the slab thickness.
 *   ns: N/S beams (along Y) → ℓu,x (Mux);  ew: E/W beams (along X) → ℓu,y.
 *   joint: deepest member at the joint (estimate, 18.8.3).
 */
export function storeyDepths(s: ColumnStorey) {
  const { sides, slab } = storeySides(s);
  const eff = (k: StoreySideId) => (sides[k].beam ? sides[k].depth : slab);
  return {
    ns: Math.min(eff("north"), eff("south")),
    ew: Math.min(eff("east"), eff("west")),
    joint: Math.max(...STOREY_SIDES.map(eff)),
  };
}
/** Store sides and keep beamX / beamY (governing depths) in step. */
export function withStoreySides(
  s: ColumnStorey,
  sides: Record<StoreySideId, StoreySide>,
  slabThickness: number,
): ColumnStorey {
  const next = { ...s, sides, slabThickness };
  const d = storeyDepths(next);
  return { ...next, beamX: d.ew, beamY: d.ns };
}

export function storeyClearHeights(s: ColumnStorey): StoreyClearHeights {
  const d = s.sides
    ? storeyDepths(s)
    : { ns: s.beamY, ew: s.beamX, joint: Math.max(s.beamX, s.beamY) };
  const derivedX = s.height - d.ns - (s.capital ?? 0) - (s.bottom ?? 0);
  const derivedY = s.height - d.ew - (s.capital ?? 0) - (s.bottom ?? 0);
  const luX = s.luOverrideX ?? derivedX;
  const luY = s.luOverrideY ?? derivedY;
  return {
    derivedX,
    derivedY,
    luX,
    luY,
    loClear: Math.max(luX, luY),
    joint: d.joint,
  };
}

/** Validation message, or "" when the geometry leaves a positive ℓu. */
export function storeyError(s: ColumnStorey) {
  const h = storeyClearHeights(s);
  if (h.derivedX <= 0 || h.derivedY <= 0)
    return "Beam, capital and bottom depths must be less than the floor-to-floor height.";
  return "";
}

/**
 * Drafts saved before storey geometry: build it from the estimate's height
 * and beam depth (both beams), and keep every previous number:
 * - a typed slenderness ℓu that differs becomes a ℓu override;
 * - a confinement clear height that differs stays as a manual value.
 */
export function migrateColumnStorey<
  I extends {
    storey?: ColumnStorey;
    slenderness?: {
      enabled: boolean;
      x: { lu: number };
      y: { lu: number };
    };
  },
  T extends {
    confinement: {
      enabled: boolean;
      clearHeight: number;
      clearHeightSource?: "storey" | "manual";
    };
  },
>(
  input: I,
  quantity: { height: number; beamDepth: number } | undefined,
  tie: T | undefined,
): { input: I; tie: T | undefined } {
  if (input.storey) return { input, tie };
  const height = quantity?.height ?? 3000;
  const beam = quantity?.beamDepth ?? 500;
  const storey: ColumnStorey = {
    ...defaultColumnStorey(),
    height,
    beamX: beam,
    beamY: beam,
  };
  const derived = height - beam;
  const sl = input.slenderness;
  if (sl?.enabled) {
    if (Math.abs(sl.x.lu - derived) > 0.5) storey.luOverrideX = sl.x.lu;
    if (Math.abs(sl.y.lu - derived) > 0.5) storey.luOverrideY = sl.y.lu;
  }
  const lo = storeyClearHeights(storey).loClear;
  const nextTie =
    tie && tie.confinement.clearHeightSource === undefined
      ? {
          ...tie,
          confinement: {
            ...tie.confinement,
            clearHeightSource:
              tie.confinement.enabled &&
              Math.abs(tie.confinement.clearHeight - lo) > 0.5
                ? ("manual" as const)
                : ("storey" as const),
          },
        }
      : tie;
  return { input: { ...input, storey }, tie: nextTie };
}
