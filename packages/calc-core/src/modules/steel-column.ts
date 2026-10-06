import { z } from "zod";

import { verificationRequiredResult } from "../not-implemented";
import type { CalculationResult, CodeReference } from "../types";

export const steelColumnInputSchema = z.object({
  sectionDesignation: z.string().min(1),
  yieldStrengthMpa: z.number().positive(),
  lengthXMm: z.number().positive(),
  lengthYMm: z.number().positive(),
  kx: z.number().positive(),
  ky: z.number().positive(),
  axialDemandKn: z.number().nonnegative(),
});

export type SteelColumnInput = z.infer<typeof steelColumnInputSchema>;

export interface SteelColumnOutput {
  designStrengthKn: number;
  utilization: number;
  governingAxis: "x" | "y";
}

export function calculateSteelColumn(
  input: SteelColumnInput,
  code: CodeReference,
): CalculationResult<SteelColumnOutput> {
  steelColumnInputSchema.parse(input);
  return verificationRequiredResult(
    "steel-column",
    code,
    "Steel Column equations are not released until AISC/NSCP benchmark cases and effective-length assumptions are approved.",
  );
}
