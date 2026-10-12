import { designCheckPolicySchema, designRemarksSchema } from "../design-review";
import { z } from "zod";
import { columnQuantitySchema } from "./column-quantity";
export const columnInputSchema = z
  .object({
    code: z.enum(["ACI 318-19", "NSCP 2015"]),
    width: z.number().positive().max(10000),
    depth: z.number().positive().max(10000),
    fc: z.number().min(17).max(80),
    fy: z.number().min(200).max(550),
    es: z.number().min(100000).max(250000),
    cover: z.number().nonnegative().max(1000),
    tieDiameter: z.number().positive().max(100),
    bars: z
      .array(
        z.object({
          x: z.number().min(-5000).max(5000),
          y: z.number().min(-5000).max(5000),
          diameter: z.number().positive().max(100),
        }),
      )
      .min(4)
      .max(80),
    loads: z
      .array(
        z.object({
          id: z.string().trim().min(1).max(100),
          description: z.string().max(300),
          pu: z.number().min(-1e8).max(1e8),
          mx: z.number().min(-1e8).max(1e8),
          my: z.number().min(-1e8).max(1e8),
          included: z.boolean(),
        }),
      )
      .min(1)
      .max(500),
  })
  .refine(
    (input) =>
      new Set(input.loads.map((load) => load.id)).size === input.loads.length,
    "Combination labels must be unique.",
  );
export const columnDraftSchema = z.object({
  kind: z.literal("rc-column"),
  version: z.literal(1),
  input: columnInputSchema,
  scopeConfirmed: z.boolean(),
  quantity: columnQuantitySchema.optional(),
  designPolicy: designCheckPolicySchema.optional(),
  remarks: designRemarksSchema.optional(),
  reviewCompleted: z.boolean().optional(),
});
