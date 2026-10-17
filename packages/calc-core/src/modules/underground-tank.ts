/**
 * Underground rectangular RC tank (engine tank-0.1.0), ACI 350-20 first.
 *
 * Geometry: inside plan Lx × Ly, clear height H from the base slab top to
 * the roof soffit (or wall top when open), walls tw, base slab tb with an
 * optional projection beyond the walls (flotation), optional roof slab tr
 * with soil cover. Walls are two-way plates fixed at the corners; the base
 * and roof are two-way plates on the walls.
 *
 * Load cases (factors editable, ACI 350-20 Table 5.3.1†):
 *  - Leak test: full of liquid, no backfill (walls outward, F).
 *  - Empty with backfill, groundwater and surcharge (walls inward, H / L;
 *    base uplift).
 *  - Roof: D (self + cover) and L.
 * Environmental durability factor Sd = φfy / (γ fs,max) ≥ 1.0 scales the
 * required strength in flexure and direct tension (ACI 350-20 9.2.6†).
 */
import { z } from "zod";

import { designCheckPolicySchema, designRemarksSchema } from "../design-review";

export const TANK_ENGINE = "tank-0.1.0";

const bar = z.object({ diameter: z.number().min(6).max(40), spacing: z.number().min(75).max(450) });
export type TankBar = z.infer<typeof bar>;
export const tankBarArea = (b: TankBar) => ((Math.PI / 4) * b.diameter ** 2 * 1000) / b.spacing;

export function defaultTankSeismic(enabled = true) {
  return { enabled, ss: 1.5, s1: 0.6, fa: 1.0, fv: 1.5, tl: 8, importance: 1.25, b: 0.667, yielding: false, clf: 2.2, factorF: 1.2, factorE: 1.0, factorL: 0.5 };
}
export const tankInputSchema = z
  .object({
    code: z.enum(["ACI 350-20", "NSCP 2015"]),
    /** Inside plan dimensions and clear height, m. */
    lx: z.number().min(1).max(60),
    ly: z.number().min(1).max(60),
    height: z.number().min(1).max(15),
    wall: z.number().min(0.15).max(1.5),
    base: z.number().min(0.2).max(2),
    /** Base slab projection beyond the outside wall face (all sides), m. */
    projection: z.number().min(0).max(3),
    roof: z.object({
      enabled: z.boolean(),
      thickness: z.number().min(0.15).max(1.2),
      edge: z.enum(["pinned", "fixed"]),
      /** Soil cover over the roof, m, and its unit weight. */
      cover: z.number().min(0).max(5),
      live: z.number().min(0).max(50),
    }),
    /** Wall base: fixed (monolithic) or pinned (water-stopped joint). */
    wallBase: z.enum(["fixed", "pinned"]),
    baseEdge: z.enum(["fixed", "pinned"]),
    liquid: z.object({
      depth: z.number().min(0).max(15),
      gamma: z.number().min(9).max(14),
    }),
    soil: z.object({
      phi: z.number().min(15).max(50),
      gamma: z.number().min(12).max(24),
      gammaSat: z.number().min(14).max(25),
      /** At-rest (non-yielding walls) or active. */
      theory: z.enum(["at-rest", "active"]),
      ocr: z.number().min(1).max(10),
      /** Ground level above the base slab top, m. */
      ground: z.number().min(0).max(20),
      /** Groundwater level above the base slab underside, m (0 = none). */
      water: z.number().min(0).max(20),
      gammaW: z.number().min(9.5).max(10.5),
      surcharge: z.number().min(0).max(100),
      allowable: z.number().min(25).max(1000),
    }),
    concreteWeight: z.number().min(20).max(26),
    fc: z.number().min(20).max(70),
    fy: z.number().min(275).max(550),
    es: z.number().min(190000).max(210000),
    cover: z.number().min(25).max(100),
    exposure: z.enum(["normal", "severe"]),
    /** Movement (contraction / expansion) joint spacing for shrinkage steel, m. */
    jointSpacing: z.number().min(1).max(100),
    flotationFS: z.number().min(1).max(2),
    factors: z.object({
      dead: z.number().min(0.9).max(1.6),
      deadMin: z.number().min(0.8).max(1),
      liquid: z.number().min(1).max(2),
      earth: z.number().min(1).max(2),
      live: z.number().min(1).max(2),
    }),
    bars: z.object({
      /** Walls: verticals are the outer layer, horizontals inside them. */
      verticalInside: bar,
      verticalOutside: bar,
      horizontalInside: bar,
      horizontalOutside: bar,
      /** Base and roof: x bars outer layer, y bars inside them, both faces. */
      baseTop: bar,
      baseBottom: bar,
      roofBottom: bar,
      roofTop: bar,
    }),
    /** ACI 350.3-20 seismic design (rectangular tanks, Type 1.1 / 1.2). */
    seismic: z
      .object({
        enabled: z.boolean(),
        /** Mapped MCE spectral accelerations and site coefficients (ASCE 7-16 Tables 11.4-1, 11.4-2). */
        ss: z.number().min(0).max(4),
        s1: z.number().min(0).max(2),
        fa: z.number().min(0.5).max(3),
        fv: z.number().min(0.5).max(4),
        tl: z.number().min(1).max(20),
        /** Table 4.1.1a importance factor. */
        importance: z.number().min(1).max(1.5),
        /** Vertical / horizontal design acceleration ratio (4.1.4.1, ≥ 2/3). */
        b: z.number().min(0.667).max(1.5),
        /** Backfill can yield (active, 3/8 factor of R8.1a) or not (at rest). */
        yielding: z.boolean(),
        /** Roof uplift coefficient C_LF for inadequate freeboard (R7.1, 1.4–3.2). */
        clf: z.number().min(1.4).max(3.2),
        /** Load factors in the seismic cases: liquid F, earthquake E, live L. */
        factorF: z.number().min(0.9).max(1.6),
        factorE: z.number().min(1).max(1.5),
        factorL: z.number().min(0).max(1.6),
      })
      .default(defaultTankSeismic(false)),
    divisions: z.number().int().min(8).max(24),
    dcrLimit: z.number().min(0.5).max(1.2),
  })
  .refine((i) => i.liquid.depth <= i.height + 1e-9, "The liquid depth must not exceed the clear height.")
  .refine((i) => i.soil.water <= i.soil.ground + i.base + 1e-9, "The groundwater level must not be above the ground.");
export type TankInput = z.infer<typeof tankInputSchema>;

export function defaultTankInput(): TankInput {
  return {
    code: "ACI 350-20",
    lx: 8,
    ly: 5,
    height: 3.5,
    wall: 0.3,
    base: 0.4,
    projection: 0.3,
    roof: { enabled: true, thickness: 0.25, edge: "pinned", cover: 0.6, live: 5 },
    wallBase: "fixed",
    baseEdge: "fixed",
    liquid: { depth: 3.2, gamma: 9.81 },
    soil: { phi: 30, gamma: 18, gammaSat: 20, theory: "at-rest", ocr: 1, ground: 3.75, water: 2.5, gammaW: 9.81, surcharge: 10, allowable: 150 },
    concreteWeight: 24,
    fc: 28,
    fy: 420,
    es: 200000,
    cover: 50,
    exposure: "normal",
    jointSpacing: 8,
    flotationFS: 1.1,
    factors: { dead: 1.2, deadMin: 0.9, liquid: 1.4, earth: 1.6, live: 1.6 },
    bars: {
      verticalInside: { diameter: 16, spacing: 200 },
      verticalOutside: { diameter: 16, spacing: 150 },
      horizontalInside: { diameter: 16, spacing: 200 },
      horizontalOutside: { diameter: 16, spacing: 200 },
      baseTop: { diameter: 16, spacing: 200 },
      baseBottom: { diameter: 20, spacing: 125 },
      roofBottom: { diameter: 16, spacing: 125 },
      roofTop: { diameter: 16, spacing: 150 },
    },
    seismic: defaultTankSeismic(true),
    divisions: 12,
    dcrLimit: 1,
  };
}

export const tankDraftSchema = z.object({
  kind: z.literal("underground-tank"),
  version: z.literal(1),
  input: tankInputSchema,
  designPolicy: designCheckPolicySchema.optional(),
  remarks: designRemarksSchema.optional(),
  reviewCompleted: z.boolean().optional(),
});
export type TankDraft = z.infer<typeof tankDraftSchema>;

/**
 * ACI 350.3-20 Table 4.1.1b, fixed- or hinged-base tanks: Ri 2.25 on or above
 * grade, 3.25 buried (maximum liquid surface at or below ground), linear in
 * between for partially buried tanks; Rc = 1.0.
 */
export function tankResponseFactor(i: Pick<TankInput, "liquid" | "soil">) {
  const hl = i.liquid.depth;
  if (hl <= 0) return 3.25;
  const buried = Math.max(0, Math.min(1, i.soil.ground / hl));
  return 2.25 + (3.25 - 2.25) * buried;
}
