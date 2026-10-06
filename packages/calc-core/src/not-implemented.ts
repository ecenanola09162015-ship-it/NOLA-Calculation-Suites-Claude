import type { CalculationResult, CodeReference } from "./types";

export function verificationRequiredResult<TOutput>(
  moduleSlug: string,
  code: CodeReference,
  message: string,
): CalculationResult<TOutput> {
  return {
    metadata: {
      moduleSlug,
      engineVersion: "0.1.0",
      code,
      unitSystem: "metric",
      calculatedAt: new Date(0).toISOString(),
    },
    status: "interface-only",
    output: null,
    warnings: [
      {
        code: "ENGINEERING_VERIFICATION_REQUIRED",
        message,
        severity: "blocking",
      },
    ],
  };
}
