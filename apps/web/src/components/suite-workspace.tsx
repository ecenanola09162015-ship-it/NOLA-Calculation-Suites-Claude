"use client";
import { useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
const RectangularColumnWorkspace = dynamic(
  () =>
    import("./rectangular-column-workspace").then(
      (m) => m.RectangularColumnWorkspace,
    ),
  { loading: () => <p>Opening RC column workspace…</p> },
);
const SlabWorkspace = dynamic(
  () => import("./slab-workspace").then((m) => m.SlabWorkspace),
  { loading: () => <p>Opening slab workspace…</p> },
);
import { ProjectContext, ProjectEditor } from "./project-context";
import { BrandMark } from "./brand-mark";
import {
  createProjectAction,
  createInterfaceDraftAction,
  updateProjectAction,
  type DuplicateInfo,
} from "@/app/actions";
import type { ProjectRecord, CalculationDraftRecord } from "@/lib/projects";
import { uiCatalogue, type UiModule } from "@/lib/ui-catalogue";
const projectFields = [
  ["name", "Project Name"],
  ["buildingName", "Building Name"],
  ["location", "Location"],
  ["preparedBy", "Prepared By"],
  ["checkedBy", "Checked By"],
  ["approvedBy", "Approved By"],
] as const;
export function SuiteWorkspace({
  initialModule,
  initialProjects,
  initialDrafts,
  cloudReady,
  account,
}: {
  initialModule?: string;
  initialProjects: ProjectRecord[];
  initialDrafts: CalculationDraftRecord[];
  cloudReady: boolean;
  account: ReactNode;
}) {
  const [projects, setProjects] = useState(initialProjects);
  const [drafts, setDrafts] = useState(initialDrafts);
  const [projectId, setProjectId] = useState(initialProjects[0]?.id ?? "");
  const [newProject, setNewProject] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectRecord | null>(
    null,
  );
  const [explorer, setExplorer] = useState(false);
  const [search, setSearch] = useState("");
  const [module, setModule] = useState<UiModule | null>(
    () => uiCatalogue.find((item) => item.slug === initialModule) ?? null,
  );
  const [workspaceSession, setWorkspaceSession] = useState(0);
  const [draftId, setDraftId] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [projectDuplicate, setProjectDuplicate] =
    useState<DuplicateInfo | null>(null);
  const newProjectForm = useRef<HTMLFormElement>(null);
  const project = projects.find((item) => item.id === projectId);
  const selectedDraft = drafts.find((item) => item.id === draftId);
  function selectProject(id: string) {
    setProjectId(id);
    setModule(null);
    setDraftId("");
    setMessage("");
    setExplorer(false);
  }
  function openModule(item: UiModule) {
    setWorkspaceSession((previous) => previous + 1);
    setModule(item);
    setDraftId("");
    setTitle(`${item.name} — 01`);
    setMessage("");
  }
  async function createProject(form: FormData) {
    setBusy(true);
    setMessage("");
    setProjectDuplicate(null);
    try {
      const res = await createProjectAction(form);
      if (!res.ok) {
        setMessage(res.error);
        setProjectDuplicate(res.duplicate ?? null);
        return;
      }
      const item = res.value;
      setProjects((previous) => [item, ...previous]);
      selectProject(item.id);
      setNewProject(false);
      setMessage("Project created and saved.");
    } catch {
      setMessage("Project could not be saved. Please retry.");
    } finally {
      setBusy(false);
    }
  }
  /** Rename: put the suggested free name in the field for the user to edit. */
  function applySuggestedName(form: HTMLFormElement | null, name: string) {
    const field = form?.elements.namedItem("name");
    if (field instanceof HTMLInputElement) {
      field.value = name;
      field.focus();
      field.select();
    }
    setProjectDuplicate(null);
    setMessage("");
  }
  async function editProject(form: FormData) {
    if (!editingProject) return;
    setBusy(true);
    setMessage("");
    try {
      const res = await updateProjectAction(editingProject.id, form);
      if (!res.ok) {
        setMessage(
          res.duplicate
            ? `${res.error} Project names must be unique; try "${res.duplicate.suggestion}".`
            : res.error,
        );
        return;
      }
      const item = res.value;
      setProjects((previous) =>
        previous.map((p) => (p.id === item.id ? item : p)),
      );
      setEditingProject(null);
      setMessage("Project Information Updated And Saved.");
    } catch {
      setMessage("Project changes could not be saved.");
    } finally {
      setBusy(false);
    }
  }
  async function saveDraft() {
    if (!module || !project) return;
    setBusy(true);
    setMessage("");
    try {
      const res = await createInterfaceDraftAction(
        project.id,
        module.slug,
        title,
      );
      if (!res.ok) {
        setMessage(
          res.duplicate
            ? `${res.error} Use another title, e.g. "${res.duplicate.suggestion}".`
            : res.error,
        );
        return;
      }
      const item = res.value;
      setDrafts((previous) => [item, ...previous]);
      setDraftId(item.id);
      setMessage("Interface draft saved to this project.");
    } catch {
      setMessage("Draft could not be saved.");
    } finally {
      setBusy(false);
    }
  }
  function card(item: UiModule) {
    return (
      <button
        type="button"
        className="suiteModule"
        key={item.slug}
        onClick={() => openModule(item)}
      >
        <Image src={`/icons/${item.slug}.svg`} width={84} height={84} alt="" />
        <strong>{item.name}</strong>
        <span className={`suiteBadge ${item.pilot ? "isPilot" : ""}`}>
          {item.pilot ? "Pilot" : "Future Development"}
        </span>
      </button>
    );
  }
  return (
    <main className="suiteApp">
      <header className="suiteTopbar">
        <BrandMark />
        <nav aria-label="Main navigation">
          <button
            className="active"
            onClick={() => {
              setModule(null);
              setDraftId("");
            }}
          >
            Projects
          </button>
          <button
            onClick={() => {
              setModule(null);
              setDraftId("");
            }}
          >
            Calculation modules
          </button>
        </nav>
        {account}
      </header>
      <div className="suiteBody">
        <aside
          className={`suiteExplorer ${explorer ? "isOpen" : ""}`}
          aria-label="Project explorer"
        >
          <div className="suiteExplorerHeading">
            <h2>PROJECT EXPLORER</h2>
            <button
              className="mobileOnly"
              onClick={() => setExplorer(false)}
              aria-label="Close project explorer"
            >
              ×
            </button>
          </div>
          <button
            className="suitePrimary"
            onClick={() => {
              setNewProject(true);
              setProjectDuplicate(null);
              setMessage("");
              setExplorer(false);
            }}
          >
            ＋ New project
          </button>
          <label className="suiteSearch">
            <span className="srOnly">Search projects</span>
            <input
              placeholder="Search projects…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <div className="suiteTree">
            {projects
              .filter((item) =>
                `${item.name} ${item.buildingName}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((item) => (
                <div key={item.id}>
                  <button
                    className={`suiteFolder ${projectId === item.id ? "selected" : ""}`}
                    onClick={() => selectProject(item.id)}
                  >
                    <span aria-hidden="true">
                      {projectId === item.id ? "▾" : "▸"} ▣
                    </span>{" "}
                    {item.name}
                  </button>
                  {projectId === item.id && (
                    <div className="suiteTreeChildren">
                      <button
                        onClick={() => {
                          setModule(null);
                          setDraftId("");
                        }}
                      >
                        ▤ Project information
                      </button>
                      <p>▾ Calculations</p>
                      {drafts
                        .filter((d) => d.projectId === item.id)
                        .map((d) => (
                          <button
                            className={draftId === d.id ? "selected" : ""}
                            key={d.id}
                            onClick={() => {
                              const item = uiCatalogue.find(
                                (m) => m.slug === d.moduleSlug,
                              );
                              if (item) {
                                setWorkspaceSession((previous) => previous + 1);
                                setModule(item);
                                setDraftId(d.id);
                                setTitle(d.title);
                                setMessage("");
                                setExplorer(false);
                              }
                            }}
                          >
                            ▤ {d.title}
                            <small>
                              {d.moduleSlug === "rc-column"
                                ? "Column draft"
                                : d.moduleSlug === "slab"
                                  ? "Slab draft"
                                  : "UI draft"}
                            </small>
                          </button>
                        ))}
                      {!drafts.some((d) => d.projectId === item.id) && (
                        <span className="suiteEmpty">No calculations yet</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            {!projects.length && (
              <p className="suiteEmpty">
                Create your first project to organize calculation drafts.
              </p>
            )}
          </div>
        </aside>
        <section className="suiteMain">
          <ProjectContext
            project={project}
            moduleName={module?.name ?? "Calculation Modules"}
            onEdit={() => {
              if (project) {
                setNewProject(false);
                setMessage("");
                setEditingProject(project);
              }
            }}
          />
          <button
            className="suiteSecondary mobileOnly"
            onClick={() => setExplorer(true)}
          >
            ☰ Project explorer
          </button>
          <div className="suiteHeading">
            <div>
              <h1>{module?.name ?? "Calculation modules"}</h1>
              <p>
                {project
                  ? `${project.buildingName || "Building name not set"} · ${project.location}`
                  : "Interface preview · Pilot and future modules"}
              </p>
            </div>
            {module && (
              <button
                className="suiteSecondary"
                onClick={() => {
                  setModule(null);
                  setDraftId("");
                }}
              >
                ← All modules
              </button>
            )}
          </div>
          <div className="suiteNotice">
            Development build — RC column and slab screening available;
            engineering review pending.
          </div>
          <p className="suiteFeedback" role="status" aria-live="polite">
            {message}
          </p>
          {!module ? (
            <>
              <section
                aria-labelledby="structural-heading"
                className="suiteTrade"
              >
                <h2 id="structural-heading">STRUCTURAL</h2>
                <div className="suiteStructural">
                  {["Concrete", "LOADS", "Steel"].map((group) => (
                    <section key={group} className={`suiteGroup group${group}`}>
                      <h3>{group}</h3>
                      <div className="suiteCards">
                        {uiCatalogue
                          .filter((item) => item.group === group)
                          .map(card)}
                      </div>
                    </section>
                  ))}
                </div>
              </section>
              <section
                aria-labelledby="geotechnical-heading"
                className="suiteTrade geotechnical"
              >
                <h2 id="geotechnical-heading">GEOTECHNICAL</h2>
                <h3>Foundation & soil</h3>
                <div className="suiteGeoCards">
                  {uiCatalogue
                    .filter((item) => item.group === "Geotechnical")
                    .map(card)}
                </div>
              </section>
            </>
          ) : module.slug === "rc-column" ? (
            <RectangularColumnWorkspace
              key={`${projectId}:${workspaceSession}`}
              project={project}
              draft={selectedDraft}
              cloudReady={cloudReady}
              onSaved={(item) => {
                setDrafts((previous) => [
                  item,
                  ...previous.filter((d) => d.id !== item.id),
                ]);
              }}
            />
          ) : module.slug === "slab" ? (
            <SlabWorkspace
              key={`${projectId}:${workspaceSession}`}
              project={project}
              draft={selectedDraft}
              cloudReady={cloudReady}
              onSaved={(item) =>
                setDrafts((previous) => [
                  item,
                  ...previous.filter((d) => d.id !== item.id),
                ])
              }
            />
          ) : (
            <section className="suiteDraftWorkspace">
              <Image
                src={`/icons/${module.slug}.svg`}
                width={120}
                height={120}
                alt=""
              />
              <span className={`suiteBadge ${module.pilot ? "isPilot" : ""}`}>
                {module.pilot ? "Pilot" : "Future Development"}
              </span>
              <h2>
                {selectedDraft
                  ? selectedDraft.title
                  : `${module.name} workspace`}
              </h2>
              <p>
                {module.pilot
                  ? "Organize an interface draft now. Engineering inputs and calculations will be added after approval."
                  : "This module is planned for future development. Its calculation engine has not been started."}
              </p>
              {module.pilot && !selectedDraft && (
                <>
                  <label>
                    Calculation title
                    <input
                      value={title}
                      maxLength={100}
                      onChange={(event) => setTitle(event.target.value)}
                    />
                  </label>
                  <button
                    className="suitePrimary"
                    disabled={!project || !cloudReady || busy || !title.trim()}
                    onClick={saveDraft}
                  >
                    {busy ? "Saving…" : "Create interface draft"}
                  </button>
                  {!project && <p>Select or create a project first.</p>}
                </>
              )}
              <div className="suiteLocked">
                Calculations and design results are unavailable in this
                interface build.
              </div>
              {project && (
                <p>
                  Project: {project.name} · Building: {project.buildingName}
                </p>
              )}
            </section>
          )}
        </section>
        {editingProject ? (
          <ProjectEditor
            key={editingProject.id}
            project={editingProject}
            busy={busy}
            cloudReady={cloudReady}
            message={message}
            onSave={editProject}
            onCancel={() => {
              setEditingProject(null);
              setMessage("");
            }}
          />
        ) : null}
        {newProject && (
          <aside className="suiteDrawer" aria-labelledby="new-project-title">
            <div className="suiteDrawerHeading">
              <h2 id="new-project-title">New project</h2>
              <button
                disabled={busy}
                aria-label="Close new project form"
                onClick={() => setNewProject(false)}
              >
                ×
              </button>
            </div>
            <p>All fields are required.</p>
            <form
              ref={newProjectForm}
              onSubmit={(e) => {
                // onSubmit (not action=) so a rejected name keeps the inputs.
                e.preventDefault();
                createProject(new FormData(e.currentTarget));
              }}
            >
              {projectFields.map(([name, label]) => (
                <label key={name}>
                  {label} <span aria-hidden="true">*</span>
                  <input
                    name={name}
                    required
                    maxLength={100}
                    autoComplete="off"
                  />
                </label>
              ))}
              <p role="status">{message}</p>
              {projectDuplicate ? (
                <div className="duplicatePrompt" role="alert">
                  <p>
                    Project “{projectDuplicate.name}” already exists. Project
                    names are unique (capitals and extra spaces are ignored).
                  </p>
                  <button
                    type="button"
                    className="suitePrimary"
                    onClick={() => {
                      selectProject(projectDuplicate.id);
                      setNewProject(false);
                      setProjectDuplicate(null);
                    }}
                  >
                    Open existing
                  </button>
                  <button
                    type="button"
                    className="suiteSecondary"
                    onClick={() =>
                      applySuggestedName(
                        newProjectForm.current,
                        projectDuplicate.suggestion,
                      )
                    }
                  >
                    Rename to “{projectDuplicate.suggestion}”
                  </button>
                </div>
              ) : null}
              <button
                className="suitePrimary"
                disabled={busy || !cloudReady}
                type="submit"
              >
                {busy ? "Creating…" : "Create project"}
              </button>
              <button
                className="suiteSecondary"
                disabled={busy}
                type="button"
                onClick={() => setNewProject(false)}
              >
                Cancel
              </button>
              {!cloudReady && <p>Cloud storage is not configured.</p>}
            </form>
          </aside>
        )}
      </div>
      <footer className="suiteFooter">
        <span>ÑOLA Calculation Suites</span>
        <span>Pilot build · Independent calculation review pending</span>
      </footer>
    </main>
  );
}
