import { z } from "zod";

import { verificationRequiredResult } from "../not-implemented";
import type { CalculationResult, CodeReference } from "../types";

export const soilBearingInputSchema = z.object({
  footingWidthM: z.number().positive(),
  footingLengthM: z.number().positive(),
  embedmentDepthM: z.number().nonnegative(),
  unitWeightKnM3: z.number().positive(),
  cohesionKpa: z.number().nonnegative(),
  frictionAngleDeg: z.number().min(0).max(50),
  groundwaterDepthM: z.number().nullable(),
  factorOfSafety: z.number().gt(1),
  sampleMethod: z.enum(["SPT", "CPT", "coring", "laboratory", "other"]),
});

export type SoilBearingInput = z.infer<typeof soilBearingInputSchema>;

export interface SoilBearingOutput {
  ultimateBearingCapacityKpa: number;
  allowableBearingCapacityKpa: number;
}

export function calculateSoilBearingCapacity(
  input: SoilBearingInput,
  code: CodeReference,
): CalculationResult<SoilBearingOutput> {
  soilBearingInputSchema.parse(input);
  return verificationRequiredResult(
    "soil-bearing-capacity",
    code,
    "Soil Bearing Capacity equations are not released until the selected method, groundwater corrections, cored-sample treatment, and benchmarks are approved.",
  );
}
