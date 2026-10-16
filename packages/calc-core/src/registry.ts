import type { ModuleDefinition } from "./types";

export const moduleRegistry = [
  {
    slug: "slab",
    name: "Slab Design",
    discipline: "Concrete",
    summary:
      "Rectangular edge-supported slab flexure, reinforcement and shear screening.",
    releasePhase: "Pilot",
    priority: "P0",
    verificationStatus: "verification-required",
    initialCodes: ["ACI 318-19", "NSCP 2015 project / ACI 318-19 basis"],
  },
  {
    slug: "retaining-wall",
    name: "Concrete Retaining Wall",
    discipline: "Concrete",
    summary:
      "RC cantilever, propped and basement walls on a 1 m strip: earth pressure, stability, stem and footing design.",
    releasePhase: "Pilot",
    priority: "P1",
    verificationStatus: "verification-required",
    initialCodes: ["ACI 318-19", "NSCP 2015 project / ACI 318-19 basis"],
  },
  {
    slug: "rc-column",
    name: "RC Column",
    discipline: "Concrete",
    summary: "Axial and biaxial reinforced-concrete column design.",
    releasePhase: "Pilot",
    priority: "P0",
    verificationStatus: "interface-only",
    initialCodes: ["ACI 318", "NSCP"],
  },
  {
    slug: "steel-column",
    name: "Steel Column",
    discipline: "Steel",
    summary: "Compression-member strength and stability design.",
    releasePhase: "Pilot",
    priority: "P0",
    verificationStatus: "interface-only",
    initialCodes: ["AISC 360", "NSCP"],
  },
  {
    slug: "seismic-loads",
    name: "Seismic Loads",
    discipline: "Loads",
    summary: "Equivalent lateral force calculation with traceable parameters.",
    releasePhase: "Pilot",
    priority: "P0",
    verificationStatus: "interface-only",
    initialCodes: ["ASCE 7", "NSCP"],
  },
  {
    slug: "soil-bearing-capacity",
    name: "Soil Bearing Capacity",
    discipline: "Foundation & Geotechnical",
    summary: "Allowable and ultimate bearing-pressure assessment.",
    releasePhase: "Pilot",
    priority: "P0",
    verificationStatus: "interface-only",
    initialCodes: ["Approved geotechnical method", "NSCP"],
  },
  {
    slug: "slope-stability",
    name: "Slope Stability Analysis",
    discipline: "Foundation & Geotechnical",
    summary: "Critical slip-surface and factor-of-safety assessment.",
    releasePhase: "Phase 2",
    priority: "P1",
    verificationStatus: "interface-only",
    initialCodes: ["Approved geotechnical method"],
  },
] as const satisfies readonly ModuleDefinition[];

export function getModule(slug: string): ModuleDefinition | undefined {
  return moduleRegistry.find((module) => module.slug === slug);
}

export function getPilotModules(): readonly ModuleDefinition[] {
  return moduleRegistry.filter((module) => module.releasePhase === "Pilot");
}
