import { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  CalcSuiteProvider,
  SaveRunBar,
  SaveToProject,
  StaleResultsNotice,
} from "../../src/components/calc-actions";
import { useCalculationRun } from "../../src/lib/use-calc-run";
import type { ProjectRecord } from "../../src/lib/projects";

type W = {
  posts: { projectId: string; title: string; id?: string }[];
  copied: string[];
  runs: number;
};
const w = window as unknown as W;
w.posts = [];
w.copied = [];
w.runs = 0;
// API stub: the first copy into P2 collides with an existing title.
window.fetch = (async (_url: string, init: { body: string }) => {
  const body = JSON.parse(init.body);
  w.posts.push({ projectId: body.projectId, title: body.title, id: body.id });
  const draft = {
    id: body.id ?? `new-${w.posts.length}`,
    projectId: body.projectId,
    moduleSlug: body.moduleSlug,
    title: body.title,
    payload: body.payload,
    verificationStatus: "interface-only",
    updatedAt: "2026-10-17T14:30:00Z",
  };
  if (body.projectId === "p2" && body.title === "BP-01")
    return new Response(
      JSON.stringify({
        error: "exists",
        duplicate: {
          id: "x",
          title: "BP-01",
          updatedAt: "",
          suggestion: "BP-01 (2)",
        },
      }),
      { status: 409 },
    );
  return new Response(JSON.stringify({ draft }), { status: 201 });
}) as unknown as typeof fetch;

const project = (id: string, name: string) =>
  ({ id, name, buildingName: "", location: "" }) as ProjectRecord;

function Harness() {
  const [a, setA] = useState(2);
  const [dirty, setDirty] = useState(false);
  const calc = useCalculationRun({ a }, (i) => {
    w.runs++;
    if (i.a < 0) throw new Error("a must be ≥ 0");
    return i.a * 10;
  });
  const save = async () => {
    w.posts.push({ projectId: "p1", title: "BP-01", id: "own" });
    setDirty(false);
    return true;
  };
  return (
    <>
      <input
        id="a"
        type="number"
        value={a}
        onChange={(e) => {
          setA(Number(e.target.value));
          setDirty(true);
        }}
      />
      <output id="result">
        {calc.result !== null
          ? String(calc.result)
          : calc.stale
            ? "stale"
            : calc.error}
      </output>
      {calc.stale ? <StaleResultsNotice onRun={calc.run} /> : null}
      <SaveRunBar
        section="Geometry"
        dirty={dirty}
        busy={false}
        canSave
        onSave={save}
        stale={calc.stale}
        onRun={calc.run}
      />
      <SaveToProject
        currentProjectId="p1"
        moduleSlug="base-plate"
        title="BP-01"
        canCopy
        buildPayload={() => ({ kind: "base-plate", input: { a } })}
        saveChanges={save}
      />
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <CalcSuiteProvider
    projects={[project("p1", "Aura 1"), project("p2", "Tower B")]}
    onCopied={(d) => w.copied.push(`${d.projectId}:${d.title}`)}
  >
    <Harness />
  </CalcSuiteProvider>,
);
