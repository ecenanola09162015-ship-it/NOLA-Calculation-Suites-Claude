"use client";
import { Fragment, useCallback, useRef, useState, type ReactNode } from "react";
import { confirmLeave } from "../lib/unsaved";
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
const BasePlateWorkspace = dynamic(
  () => import("./base-plate-workspace").then((m) => m.BasePlateWorkspace),
  { loading: () => <p>Opening base plate workspace…</p> },
);
const StairWorkspace = dynamic(
  () => import("./stair-workspace").then((m) => m.StairWorkspace),
  { loading: () => <p>Opening stairs workspace…</p> },
);
const RetainingWallWorkspace = dynamic(
  () =>
    import("./retaining-wall-workspace").then((m) => m.RetainingWallWorkspace),
  { loading: () => <p>Opening retaining wall workspace…</p> },
);
import { ProjectContext, ProjectEditor } from "./project-context";
import { CalcSuiteProvider } from "./calc-actions";
import { ProjectExplorer, type RenameResult } from "./project-explorer";
import { ThemeSwitcher, useLauncherTheme } from "./launcher-theme";
import { LauncherHero } from "./launcher-hero";
import { BrandMark } from "./brand-mark";
import {
  createProjectAction,
  createInterfaceDraftAction,
  renameCalculationAction,
  updateProjectAction,
  type DuplicateInfo,
} from "@/app/actions";
import type { ProjectRecord, CalculationDraftRecord } from "@/lib/projects";
import { uiCatalogue, uiTrades, type UiModule } from "@/lib/ui-catalogue";
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
  const [theme, setTheme] = useLauncherTheme();
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
  const recent = drafts
    .filter((d) => !projectId || d.projectId === projectId)
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 3);
  // Unsaved edits in the open column / slab workspace (reported by it).
  const workspaceDirty = useRef(false);
  const onDirtyChange = useCallback((dirty: boolean) => {
    workspaceDirty.current = dirty;
  }, []);
  /** Ask before leaving a workspace with unsaved edits; true = proceed. */
  function leave() {
    if (!confirmLeave(workspaceDirty.current)) return false;
    workspaceDirty.current = false;
    return true;
  }
  function selectProject(id: string) {
    if (!leave()) return;
    setProjectId(id);
    setModule(null);
    setDraftId("");
    setMessage("");
    setExplorer(false);
  }
  function openModule(item: UiModule) {
    if (!leave()) return;
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
  function openDraft(d: CalculationDraftRecord) {
    const item = uiCatalogue.find((m) => m.slug === d.moduleSlug);
    if (!item) return;
    if (!leave()) return;
    setProjectId(d.projectId);
    setWorkspaceSession((previous) => previous + 1);
    setModule(item);
    setDraftId(d.id);
    setTitle(d.title);
    setMessage("");
    setExplorer(false);
  }
  async function renameDraft(id: string, value: string): Promise<RenameResult> {
    try {
      const res = await renameCalculationAction(id, value);
      if (!res.ok)
        return {
          ok: false,
          error: res.error,
          suggestion: res.duplicate?.suggestion,
        };
      const item = res.value;
      setDrafts((previous) =>
        previous.map((d) => (d.id === item.id ? item : d)),
      );
      if (draftId === item.id && leave()) {
        // Reopen the calculation so the workspace shows (and later saves) the new name.
        setTitle(item.title);
        setWorkspaceSession((previous) => previous + 1);
      }
      setMessage(`Renamed to “${item.title}”.`);
      return { ok: true };
    } catch {
      return {
        ok: false,
        error: "Calculation could not be renamed. Please retry.",
      };
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
        <Image src={`/icons/${item.slug}.webp`} width={84} height={84} alt="" />
        <strong>{item.name}</strong>
        <span className={`suiteBadge ${item.pilot ? "isPilot" : ""}`}>
          {item.pilot ? "Pilot" : "Future Development"}
        </span>
      </button>
    );
  }
  const page = (
    <main
      className="suiteApp"
      data-theme={theme}
      data-view={module ? "workspace" : "home"}
    >
      <header className="suiteTopbar">
        <BrandMark />
        <nav aria-label="Main navigation">
          <button
            className="active"
            onClick={() => {
              if (!leave()) return;
              setModule(null);
              setDraftId("");
            }}
          >
            Projects
          </button>
          <button
            onClick={() => {
              if (!leave()) return;
              setModule(null);
              setDraftId("");
            }}
          >
            Calculation modules
          </button>
        </nav>
        <ThemeSwitcher value={theme} onChange={setTheme} />
        {account}
      </header>
      <div className="suiteBody">
        <aside
          className={`suiteExplorer ${explorer ? "isOpen" : ""}`}
          aria-label="Project explorer"
        >
          <div className="suiteExplorerHeading mobileOnly">
            <span />
            <button
              className="mobileOnly"
              onClick={() => setExplorer(false)}
              aria-label="Close project explorer"
            >
              ×
            </button>
          </div>
          <ProjectExplorer
            projects={projects}
            drafts={drafts}
            projectId={projectId}
            draftId={draftId}
            search={search}
            onSearch={setSearch}
            onSelectProject={selectProject}
            onOpenDraft={openDraft}
            onNewProject={() => {
              setNewProject(true);
              setProjectDuplicate(null);
              setMessage("");
              setExplorer(false);
            }}
            onNewCalculation={(id) => {
              selectProject(id);
              const name =
                projects.find((p) => p.id === id)?.name ?? "this project";
              setMessage(
                `Choose a module below to start a new calculation in ${name}.`,
              );
            }}
            onProjectInfo={(id) => {
              const target = projects.find((p) => p.id === id);
              if (!target) return;
              selectProject(id);
              setNewProject(false);
              setEditingProject(target);
            }}
            onRename={renameDraft}
          />
        </aside>
        <section className="suiteMain">
          {module ? (
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
          ) : null}
          <button
            className="suiteSecondary mobileOnly"
            onClick={() => setExplorer(true)}
          >
            ☰ Project explorer
          </button>
          {module ? (
            <div className="suiteHeading">
              <div>
                <h1>{module.name}</h1>
                <p>
                  {project
                    ? `${project.buildingName || "Building name not set"} · ${project.location}`
                    : "Interface preview · Pilot and future modules"}
                </p>
              </div>
              <button
                className="suiteSecondary"
                onClick={() => {
                  if (!leave()) return;
                  setModule(null);
                  setDraftId("");
                }}
              >
                ← All modules
              </button>
            </div>
          ) : (
            <LauncherHero
              theme={theme}
              project={project}
              quickOpen={uiCatalogue
                .filter((m) => m.slug === "rc-column" || m.slug === "slab")
                .map((m) => ({
                  label: `Open ${m.name}`,
                  onOpen: () => openModule(m),
                }))}
            />
          )}
          <div className="suiteNotice">
            Development build — RC column and slab screening available;
            engineering review pending.
          </div>
          <p className="suiteFeedback" role="status" aria-live="polite">
            {message}
          </p>
          {!module ? (
            <>
              {recent.length ? (
                <section className="lxContinue" aria-labelledby="lx-continue">
                  <h2 id="lx-continue">Continue</h2>
                  <div className="lxRecent">
                    {recent.map((d) => {
                      const m = uiCatalogue.find(
                        (x) => x.slug === d.moduleSlug,
                      );
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => openDraft(d)}
                        >
                          <Image
                            src={`/icons/${d.moduleSlug}.webp`}
                            width={44}
                            height={44}
                            alt=""
                          />
                          <span>
                            <b>{d.title}</b>
                            <small>{m?.name ?? d.moduleSlug}</small>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ) : null}
              {uiTrades.map(({ trade, subs }) => {
                const id = `${trade.toLowerCase()}-heading`;
                const count = subs
                  .map(
                    (sub) =>
                      `${sub.label} ${uiCatalogue.filter((m) => m.group === sub.group).length}`,
                  )
                  .join(" · ");
                const geo = trade === "Geotechnical";
                return (
                  <section
                    key={trade}
                    aria-labelledby={id}
                    className={`suiteTrade trade${trade}${geo ? " geotechnical" : ""}`}
                  >
                    <h2 id={id} className="tradeHeading">
                      <span>{trade}</span>
                      <small>{count}</small>
                    </h2>
                    {geo ? (
                      subs.map((sub) => (
                        <Fragment key={sub.group}>
                          <h3>{sub.label}</h3>
                          <div className="suiteGeoCards">
                            {uiCatalogue
                              .filter((item) => item.group === sub.group)
                              .map(card)}
                          </div>
                        </Fragment>
                      ))
                    ) : (
                      <div className="suiteStructural">
                        {subs.map((sub) => (
                          <section
                            key={sub.group}
                            className={`suiteGroup group${sub.group}`}
                          >
                            <h3>{sub.label}</h3>
                            <div className="suiteCards">
                              {uiCatalogue
                                .filter((item) => item.group === sub.group)
                                .map(card)}
                            </div>
                          </section>
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </>
          ) : module.slug === "rc-column" ? (
            <RectangularColumnWorkspace
              key={`${projectId}:${workspaceSession}`}
              project={project}
              draft={selectedDraft}
              cloudReady={cloudReady}
              onDirtyChange={onDirtyChange}
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
              onDirtyChange={onDirtyChange}
              onSaved={(item) =>
                setDrafts((previous) => [
                  item,
                  ...previous.filter((d) => d.id !== item.id),
                ])
              }
            />
          ) : module.slug === "base-plate" ? (
            <BasePlateWorkspace
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
          ) : module.slug === "stairs" ? (
            <StairWorkspace
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
          ) : module.slug === "retaining-wall" ? (
            <RetainingWallWorkspace
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
                src={`/icons/${module.slug}.webp`}
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
  return (
    // Save to project: a copy lands in another project's explorer list.
    <CalcSuiteProvider
      projects={projects}
      onCopied={(item) =>
        setDrafts((previous) => [
          item,
          ...previous.filter((d) => d.id !== item.id),
        ])
      }
    >
      {page}
    </CalcSuiteProvider>
  );
}
