import { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ProjectExplorer,
  type RenameResult,
} from "../../src/components/project-explorer";
import { explorerDrafts, explorerProjects } from "./explorer-fixture";

declare global {
  interface Window {
    renames: [string, string][];
    newCalcs: string[];
  }
}
window.renames = [];
window.newCalcs = [];

function Harness() {
  const [drafts, setDrafts] = useState(explorerDrafts);
  const [search, setSearch] = useState("");
  async function onRename(id: string, title: string): Promise<RenameResult> {
    window.renames.push([id, title]);
    if (title.toLowerCase() === "c2 · ground floor")
      return {
        ok: false,
        error: '"C2 · Ground floor" already exists in this project.',
        suggestion: "C2 · Ground floor (2)",
      };
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, title } : d)));
    return { ok: true };
  }
  return (
    <ProjectExplorer
      projects={explorerProjects}
      drafts={drafts}
      projectId="p1"
      draftId="d4"
      search={search}
      onSearch={setSearch}
      onSelectProject={() => {}}
      onOpenDraft={() => {}}
      onNewProject={() => {}}
      onNewCalculation={(id) => window.newCalcs.push(id)}
      onProjectInfo={() => {}}
      onRename={onRename}
    />
  );
}
createRoot(document.getElementById("root")!).render(<Harness />);
