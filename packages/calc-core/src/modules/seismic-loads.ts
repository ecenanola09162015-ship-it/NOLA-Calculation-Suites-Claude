import { z } from "zod";

import { verificationRequiredResult } from "../not-implemented";
import type { CalculationResult, CodeReference } from "../types";

export const seismicLoadsInputSchema = z
  .object({
    seismicWeightKn: z.number().positive(),
    responseModificationFactor: z.number().positive(),
    importanceFactor: z.number().positive(),
    siteClass: z.string().min(1),
    floorElevationsM: z.array(z.number().nonnegative()).min(1),
    floorWeightsKn: z.array(z.number().positive()).min(1),
  })
  .refine(
    (value) => value.floorElevationsM.length === value.floorWeightsKn.length,
    {
      message:
        "Floor elevations and floor weights must contain the same number of entries.",
    },
  );

export type SeismicLoadsInput = z.infer<typeof seismicLoadsInputSchema>;

export interface SeismicLoadsOutput {
  baseShearKn: number;
  verticalForcesKn: number[];
}

export function calculateSeismicLoads(
  input: SeismicLoadsInput,
  code: CodeReference,
): CalculationResult<SeismicLoadsOutput> {
  seismicLoadsInputSchema.parse(input);
  return verificationRequiredResult(
    "seismic-loads",
    code,
    "Seismic Load equations are not released until the exact ASCE 7/NSCP editions and reference cases are approved.",
  );
}
