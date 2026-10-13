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

export function storeyClearHeights(s: ColumnStorey): StoreyClearHeights {
  const derivedX = s.height - s.beamY - (s.capital ?? 0) - (s.bottom ?? 0);
  const derivedY = s.height - s.beamX - (s.capital ?? 0) - (s.bottom ?? 0);
  const luX = s.luOverrideX ?? derivedX;
  const luY = s.luOverrideY ?? derivedY;
  return {
    derivedX,
    derivedY,
    luX,
    luY,
    loClear: Math.max(luX, luY),
    joint: Math.max(s.beamX, s.beamY),
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
