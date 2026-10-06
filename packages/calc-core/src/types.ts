export type Discipline =
  "Concrete" | "Steel" | "Loads" | "Foundation & Geotechnical";

export type VerificationStatus =
  "interface-only" | "verification-required" | "verified" | "deprecated";

export type ReleasePhase = "Pilot" | "Phase 2" | "Later";

export interface CodeReference {
  family:
    "American / International" | "NSCP" | "Eurocode" | "Australian Standards";
  standard: string;
  edition: string;
}

export interface ModuleDefinition {
  slug: string;
  name: string;
  discipline: Discipline;
  summary: string;
  releasePhase: ReleasePhase;
  priority: "P0" | "P1" | "P2";
  verificationStatus: VerificationStatus;
  initialCodes: readonly string[];
}

export interface CalculationMetadata {
  moduleSlug: string;
  engineVersion: string;
  code: CodeReference;
  unitSystem: "metric" | "us-customary";
  calculatedAt: string;
}

export interface CalculationWarning {
  code: string;
  message: string;
  severity: "information" | "warning" | "blocking";
}

export interface CalculationResult<TOutput> {
  metadata: CalculationMetadata;
  status: VerificationStatus;
  output: TOutput | null;
  warnings: CalculationWarning[];
}
