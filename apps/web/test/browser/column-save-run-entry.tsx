import { createRoot } from "react-dom/client";
import { RectangularColumnWorkspace } from "../../src/components/rectangular-column-workspace";
import type { ProjectRecord } from "../../src/lib/projects";
import { columnSaveRunFixture } from "./column-save-run-fixture";

const w = window as unknown as { posts: { id?: string; projectId: string }[] };
w.posts = [];
window.fetch = (async (_url: string, init: { body: string }) => {
  const body = JSON.parse(init.body);
  w.posts.push({ id: body.id, projectId: body.projectId });
  return new Response(
    JSON.stringify({
      draft: {
        id: body.id ?? "new",
        projectId: body.projectId,
        moduleSlug: body.moduleSlug,
        title: body.title,
        payload: body.payload,
        verificationStatus: "verification-required",
        updatedAt: "2026-10-17T14:30:00Z",
      },
    }),
    { status: 200 },
  );
}) as unknown as typeof fetch;

createRoot(document.getElementById("root")!).render(
  <RectangularColumnWorkspace
    cloudReady
    project={{ id: "p1", name: "Aura 1" } as ProjectRecord}
    onSaved={() => {}}
    draft={{
      id: "saved",
      projectId: "p1",
      moduleSlug: "rc-column",
      title: "C1",
      payload: {
        kind: "rc-column",
        version: 1,
        input: columnSaveRunFixture,
        scopeConfirmed: true,
      },
      verificationStatus: "verification-required",
      updatedAt: "2026-10-17T14:00:00Z",
    }}
  />,
);
