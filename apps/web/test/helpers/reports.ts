import {
  analyzeRectangularColumn,
  analyzeSlab,
  defaultSlabInput,
  defaultSlabQuantity,
  defaultColumnQuantity,
  defaultDesignCheckPolicy,
  defaultProjectReportSettings,
  slabDesignChecks,
  columnDesignChecks,
  designCheckStatus,
  type RectangularColumnInput,
} from "@nola/calc-core";
import { columnReportData, slabReportData } from "../../src/lib/reports/data";
export function reportFixtures(estimateEnabled = true) {
  const project = {
    id: "12345678-1234-1234-1234-123456789012",
    name: "Deux Maison",
    buildingName: "MAISON GRAN DUETTO",
    location: "Crosswinds, Tagaytay City, Cavite",
    preparedBy: "Ernest Christian E. Nanola",
    checkedBy: "Structural Reviewer",
    approvedBy: "Approver",
    projectNumber: "P1",
    updatedAt: "2026-10-12",
    reportSettings: {
      ...defaultProjectReportSettings,
      ownerClient: "Brittany",
      buildingDescription:
        "Two-Storey Duplex Residence With Basement And Attic",
    },
  };
  const input: RectangularColumnInput = {
    code: "ACI 318-19",
    width: 400,
    depth: 500,
    fc: 28,
    fy: 420,
    es: 200000,
    cover: 40,
    tieDiameter: 10,
    bars: [
      [-135, -185],
      [-135, 185],
      [135, -185],
      [135, 185],
    ].map(([x, y]) => ({ x, y, diameter: 25 })),
    loads: [
      {
        id: "LC1",
        description: "Gravity",
        pu: 900,
        mx: 60,
        my: 30,
        included: true,
      },
      {
        id: "LC2",
        description: "Lateral",
        pu: 700,
        mx: 100,
        my: 35,
        included: true,
      },
    ],
  };
  const result = analyzeRectangularColumn(input),
    quantity = defaultColumnQuantity();
  quantity.enabled = estimateEnabled;
  const slab = defaultSlabInput();
  for (const bar of Object.values(slab.extra)) bar.enabled = true;
  const sr = analyzeSlab(slab, false),
    sq = defaultSlabQuantity();
  sq.enabled = estimateEnabled;
  const remarks = (checks: ReturnType<typeof columnDesignChecks>) =>
    Object.fromEntries(
      checks
        .filter((c) => designCheckStatus(c.dcr).id === "judgment")
        .map((c) => [c.id, "Reviewed Load Assumptions And Capacity."]),
    );
  return {
    column: columnReportData(
      project,
      "C-01",
      input,
      result,
      quantity,
      defaultDesignCheckPolicy,
      remarks(columnDesignChecks(result)),
    ),
    slab: slabReportData(
      project,
      "SL-01",
      slab,
      sr,
      sq,
      defaultDesignCheckPolicy,
      remarks(slabDesignChecks(slab, sr)),
    ),
  };
}
