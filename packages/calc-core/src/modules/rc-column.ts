import { z } from "zod";

import { verificationRequiredResult } from "../not-implemented";
import type { CalculationResult, CodeReference } from "../types";

export const rcColumnInputSchema = z.object({
  widthMm: z.number().positive(),
  depthMm: z.number().positive(),
  concreteStrengthMpa: z.number().positive(),
  steelYieldStrengthMpa: z.number().positive(),
  axialDemandKn: z.number(),
  momentXKnM: z.number(),
  momentYKnM: z.number(),
});

export type RcColumnInput = z.infer<typeof rcColumnInputSchema>;

export interface RcColumnOutput {
  axialUtilization: number;
  biaxialUtilization: number;
}

export function calculateRcColumn(
  input: RcColumnInput,
  code: CodeReference,
): CalculationResult<RcColumnOutput> {
  rcColumnInputSchema.parse(input);
  return verificationRequiredResult(
    "rc-column",
    code,
    "RC Column equations are not released until ACI/NSCP benchmark cases and independent review are approved.",
  );
}
