import { defaultDesignCheckPolicy } from "@nola/calc-core";
import type {
  CalculationDraftRecord,
  ProjectRecord,
} from "../../src/lib/projects";

const project = (id: string, name: string): ProjectRecord =>
  ({
    id,
    name,
    projectNumber: "",
    buildingName: "Aura 1",
    location: "Las Pinas",
    preparedBy: "EEN1",
    checkedBy: "EEN2",
    approvedBy: "EEN3",
    designCheckPolicy: defaultDesignCheckPolicy,
    updatedAt: "2026-10-15T00:00:00.000Z",
  }) as ProjectRecord;
const draft = (
  id: string,
  projectId: string,
  moduleSlug: string,
  title: string,
): CalculationDraftRecord => ({
  id,
  projectId,
  moduleSlug,
  title,
  payload: {},
  verificationStatus: "interface-only",
  updatedAt: "2026-10-15T00:00:00.000Z",
});
export const explorerProjects = [
  project("p1", "Method Man"),
  project("p2", "Tower B"),
];
export const explorerDrafts = [
  draft("d1", "p1", "rc-column", "C1 · First floor"),
  draft("d2", "p1", "rc-column", "C2 · Ground floor"),
  draft("d3", "p1", "slab", "SL-01"),
  draft("d4", "p1", "soil-bearing-capacity", "SBC-01"),
  draft("d5", "p2", "rc-column", "C1"),
];
