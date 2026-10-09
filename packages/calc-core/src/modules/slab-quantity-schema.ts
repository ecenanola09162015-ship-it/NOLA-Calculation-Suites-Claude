import { z } from "zod";
const mm = z.number().finite();
const endSchema = z.object({
  extensionMode: z.enum(["half", "cover", "custom"]),
  extension: mm.min(0).max(3000),
  shape: z.enum(["straight", "L-hook"]),
  hookDirection: z.enum(["down", "up"]).default("down"),
  hookTail: mm.positive().max(3000).nullable(),
});
const beamSchema = z.object({
  width: mm.min(100).max(3000),
  depth: mm.min(100).max(5000),
  cover: mm.min(10).max(150),
  main: endSchema,
  extra: endSchema,
});
export const slabQuantitySchema = z.object({
  enabled: z.boolean(),
  members: mm.int().min(1).max(10000),
  clearX: mm.min(500).max(30000).nullable(),
  clearY: mm.min(500).max(30000).nullable(),
  beams: z.object({
    west: beamSchema,
    east: beamSchema,
    south: beamSchema,
    north: beamSchema,
  }),
});
export type SlabQuantityInput = z.infer<typeof slabQuantitySchema>;
export const slabQuantityEdges = ["west", "east", "south", "north"] as const;
export function defaultSlabQuantity(width = 300): SlabQuantityInput {
  const beam = () => ({
    width,
    depth: 500,
    cover: 40,
    main: {
      extensionMode: "half" as const,
      extension: 0,
      shape: "straight" as const,
      hookDirection: "down" as const,
      hookTail: null,
    },
    extra: {
      extensionMode: "half" as const,
      extension: 0,
      shape: "straight" as const,
      hookDirection: "down" as const,
      hookTail: null,
    },
  });
  return {
    enabled: false,
    members: 1,
    clearX: null,
    clearY: null,
    beams: { west: beam(), east: beam(), south: beam(), north: beam() },
  };
}
