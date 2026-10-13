import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { defaultDesignCheckPolicy } from "@nola/calc-core";
import { DesignReviewPanel } from "../src/components/design-review-panel";
import {
  ProjectContext,
  ProjectEditor,
} from "../src/components/project-context";
const project = {
  id: "12345678-1234-1234-1234-123456789012",
  name: "Project Test 1",
  buildingName: "Aura (Tower A)",
  location: "Las Piñas",
  preparedBy: "Ernest",
  checkedBy: "Checker",
  approvedBy: "Approver",
  projectNumber: "P1",
  updatedAt: "2026-10-12",
};
describe("project context and review reporting", () => {
  it("keeps the active project details and editable form explicit", () => {
    const html = renderToStaticMarkup(
      <ProjectContext
        project={project}
        moduleName="RC Column"
        onEdit={() => {}}
      />,
    );
    for (const text of [
      "Project Breadcrumb",
      "Project Test 1",
      "Aura (Tower A)",
      "Las Piñas",
      "Module Type:",
      "RC Column",
      "Edit Project Information",
    ])
      expect(html).toContain(text);
    const editor = renderToStaticMarkup(
      <ProjectEditor
        project={project}
        busy={false}
        cloudReady={true}
        message=""
        onSave={async () => {}}
        onCancel={() => {}}
      />,
    );
    for (const text of [
      "Save",
      "Cancel",
      "Design Check Status Settings",
      'name="name"',
      'name="designCheckPolicy"',
    ])
      expect(editor).toContain(text);
  });
  it("shows the requested statuses and reports amber remarks", () => {
    const html = renderToStaticMarkup(
      <DesignReviewPanel
        checks={[
          { id: "flexure", label: "Flexure", dcr: 0.7 },
          { id: "shear", label: "Shear", dcr: 0.9 },
          { id: "axial", label: "Axial", dcr: 1.03 },
          { id: "interaction", label: "Interaction", dcr: 1.1 },
        ]}
        policy={defaultDesignCheckPolicy}
        remarks={{ axial: "Reviewed load envelope." }}
        onChange={() => {}}
      />,
    );
    for (const band of Object.values(defaultDesignCheckPolicy.bands))
      expect(html).toContain(band.label);
    expect(html).toContain("Axial Remarks");
    expect(html).toContain("Recorded Engineering Remarks");
    expect(html).toContain("Reviewed load envelope.");
    expect(html).not.toContain("Revise");
  });
  it("explains invalid spacing without calling it missing flexural capacity", () => {
    const html = renderToStaticMarkup(
      <DesignReviewPanel
        checks={[
          {
            id: "spacing",
            label: "Reinforcement Spacing",
            dcr: Infinity,
            invalidLabel: "Bars Overlap / Invalid Clear Spacing",
            detail: "MAIN + EXTRA BARS: Clear -12 mm.",
          },
        ]}
        policy={defaultDesignCheckPolicy}
        remarks={{}}
        onChange={() => {}}
      />,
    );
    expect(html).toContain("Bars Overlap / Invalid Clear Spacing");
    expect(html).toContain("MAIN + EXTRA BARS: Clear -12 mm.");
    expect(html).not.toContain("No Available Capacity");
    expect(html).toContain("Design Needs Improvement");
  });
});

describe("design review grouping", () => {
  it("shows the governing combination first and folds the rest", async () => {
    const { DesignReviewPanel } =
      await import("../src/components/design-review-panel");
    const { defaultDesignCheckPolicy } = await import("@nola/calc-core");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const checks = [
      {
        id: "LC1:axial",
        label: "LC1 · Axial",
        dcr: 0.9,
        clause: "ACI 318-19 22.4",
      },
      {
        id: "LC2:axial",
        label: "LC2 · Axial",
        dcr: 0.5,
        clause: "ACI 318-19 22.4",
      },
      {
        id: "LC3:axial",
        label: "LC3 · Axial",
        dcr: 0.7,
        clause: "ACI 318-19 22.4",
      },
      {
        id: "tie:shear:mid:y",
        label: "Shear Vuy",
        dcr: 0.6,
        clause: "ACI 318-19 22.5",
      },
    ];
    const html = renderToStaticMarkup(
      <DesignReviewPanel
        checks={checks}
        primaryPrefixes={["LC1:", "tie:"]}
        policy={defaultDesignCheckPolicy}
        remarks={{}}
        onChange={() => {}}
      />,
    );
    const fold = html.indexOf(
      "Show All Combinations (2 More Checks, Highest DCR 0.700)",
    );
    expect(fold).toBeGreaterThan(0);
    expect(html.indexOf("LC1 · Axial")).toBeLessThan(fold);
    expect(html.indexOf("Shear Vuy")).toBeLessThan(fold);
    expect(html.indexOf("LC2 · Axial")).toBeGreaterThan(fold);
    expect(html).toContain('<col class="dcCheck"/>');
  });
});
