import { createRoot } from "react-dom/client";
import { CalcSuiteProvider } from "../../src/components/calc-actions";
import { StairWorkspace } from "../../src/components/stair-workspace";
import type { ProjectRecord } from "../../src/lib/projects";

type W = { dirty: boolean[]; posts: Record<string, unknown>[] };
const w = window as unknown as W;
w.dirty = [];
w.posts = [];
window.fetch = (async (_url: string, init: { body: string }) => {
  const body = JSON.parse(init.body);
  w.posts.push(body);
  return new Response(
    JSON.stringify({
      draft: {
        id: body.id ?? "00000000-0000-4000-8000-000000000009",
        projectId: body.projectId,
        moduleSlug: body.moduleSlug,
        title: body.title,
        payload: body.payload,
        verificationStatus: "verification-required",
        updatedAt: "2026-10-17T14:30:00Z",
      },
    }),
    { status: 201 },
  );
}) as unknown as typeof fetch;

const project = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Aura 1",
  buildingName: "",
  location: "",
} as ProjectRecord;

createRoot(document.getElementById("root")!).render(
  <CalcSuiteProvider projects={[project]} onCopied={() => {}}>
    <StairWorkspace
      project={project}
      cloudReady
      onSaved={() => {}}
      onDirtyChange={(d) => w.dirty.push(d)}
    />
  </CalcSuiteProvider>,
);
