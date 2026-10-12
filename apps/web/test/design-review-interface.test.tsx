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
});
