"use client";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { buildExplorerTree, titleProblem } from "../lib/explorer-tree";
import type { CalculationDraftRecord, ProjectRecord } from "@/lib/projects";

export type RenameResult =
  { ok: true } | { ok: false; error: string; suggestion?: string };

type Editing = {
  id: string;
  value: string;
  error?: string;
  suggestion?: string;
  busy?: boolean;
  confirmOpen?: boolean;
};

/**
 * Project explorer: Projects → Trade → sub-level → module → calculations.
 * Levels appear only when they hold a calculation. Calculations can be renamed
 * from the right-click menu, the "⋯" button, or F2.
 */
export function ProjectExplorer({
  projects,
  drafts,
  projectId,
  draftId,
  search,
  onSearch,
  onSelectProject,
  onOpenDraft,
  onNewProject,
  onNewCalculation,
  onProjectInfo,
  onRename,
}: {
  projects: ProjectRecord[];
  drafts: CalculationDraftRecord[];
  projectId: string;
  draftId: string;
  search: string;
  onSearch: (value: string) => void;
  onSelectProject: (id: string) => void;
  onOpenDraft: (draft: CalculationDraftRecord) => void;
  onNewProject: () => void;
  onNewCalculation: (projectId: string) => void;
  onProjectInfo: (projectId: string) => void;
  onRename: (id: string, title: string) => Promise<RenameResult>;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(projectId ? [projectId] : []),
  );
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(
    null,
  );
  const [editing, setEditing] = useState<Editing | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!projectId) return;
    setExpanded((prev) =>
      prev.has(projectId) ? prev : new Set([...prev, projectId]),
    );
  }, [projectId]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (
        menuRef.current &&
        e.target instanceof Node &&
        menuRef.current.contains(e.target)
      )
        return;
      setMenu(null);
    };
    const esc = (e: globalThis.KeyboardEvent) =>
      e.key === "Escape" && setMenu(null);
    document.addEventListener("mousedown", close);
    document.addEventListener("scroll", close, true);
    document.addEventListener("keydown", esc);
    menuRef.current?.querySelector("button")?.focus();
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("scroll", close, true);
      document.removeEventListener("keydown", esc);
    };
  }, [menu]);

  const q = search.trim().toLowerCase();
  const visible = projects.filter(
    (p) =>
      !q ||
      `${p.name} ${p.buildingName}`.toLowerCase().includes(q) ||
      drafts.some(
        (d) => d.projectId === p.id && d.title.toLowerCase().includes(q),
      ),
  );

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function startRename(d: CalculationDraftRecord) {
    setMenu(null);
    setEditing({ id: d.id, value: d.title });
  }
  async function submit(current: CalculationDraftRecord) {
    if (!editing || editing.busy) return;
    const value = editing.value.trim();
    if (value === current.title) return setEditing(null);
    const problem = titleProblem(value);
    if (problem) return setEditing({ ...editing, error: problem });
    if (current.id === draftId && !editing.confirmOpen)
      return setEditing({ ...editing, confirmOpen: true, error: undefined });
    setEditing({ ...editing, busy: true, error: undefined });
    const res = await onRename(current.id, value);
    if (res.ok) setEditing(null);
    else
      setEditing({
        ...editing,
        busy: false,
        confirmOpen: false,
        error: res.error,
        suggestion: res.suggestion,
      });
  }

  function calcRow(d: CalculationDraftRecord) {
    if (editing?.id === d.id) {
      const e = editing;
      return (
        <li key={d.id} className="exCalc isEditing">
          <label className="srOnly" htmlFor={`rename-${d.id}`}>
            Rename calculation
          </label>
          <input
            id={`rename-${d.id}`}
            className="exRename"
            value={e.value}
            maxLength={100}
            autoFocus
            disabled={e.busy}
            onFocus={(ev) => ev.currentTarget.select()}
            onChange={(ev) =>
              setEditing({
                ...e,
                value: ev.target.value,
                error: undefined,
                confirmOpen: false,
              })
            }
            onKeyDown={(ev) => {
              if (ev.key === "Enter") {
                ev.preventDefault();
                void submit(d);
              } else if (ev.key === "Escape") {
                ev.preventDefault();
                setEditing(null);
              }
            }}
            aria-invalid={Boolean(e.error)}
            aria-describedby={e.error ? `rename-err-${d.id}` : undefined}
          />
          {e.confirmOpen ? (
            <div className="exConfirm" role="alert">
              <p>
                This calculation is open. It will reload with the new name;
                unsaved changes are lost.
              </p>
              <button
                type="button"
                className="suitePrimary"
                onClick={() => void submit(d)}
              >
                Rename and reload
              </button>
              <button
                type="button"
                className="suiteSecondary"
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
            </div>
          ) : null}
          {e.error ? (
            <p className="exError" id={`rename-err-${d.id}`} role="alert">
              {e.error}
              {e.suggestion ? (
                <button
                  type="button"
                  onClick={() =>
                    setEditing({
                      ...e,
                      value: e.suggestion!,
                      error: undefined,
                      suggestion: undefined,
                    })
                  }
                >
                  Use “{e.suggestion}”
                </button>
              ) : null}
            </p>
          ) : null}
        </li>
      );
    }
    return (
      <li
        key={d.id}
        className={`exCalc ${draftId === d.id ? "selected" : ""}`}
        onContextMenu={(ev: MouseEvent) => {
          ev.preventDefault();
          setMenu({ id: d.id, x: ev.clientX, y: ev.clientY });
        }}
      >
        <button
          type="button"
          className="exCalcOpen"
          aria-current={draftId === d.id ? "true" : undefined}
          onClick={() => onOpenDraft(d)}
          onKeyDown={(ev: KeyboardEvent) => {
            if (ev.key === "F2") {
              ev.preventDefault();
              startRename(d);
            }
          }}
        >
          {d.title}
        </button>
        <button
          type="button"
          className="exMore"
          aria-label={`Actions for ${d.title}`}
          aria-haspopup="menu"
          onClick={(ev) => {
            const r = ev.currentTarget.getBoundingClientRect();
            setMenu({ id: d.id, x: r.left, y: r.bottom + 4 });
          }}
        >
          ⋯
        </button>
      </li>
    );
  }

  const menuDraft = menu ? drafts.find((d) => d.id === menu.id) : undefined;

  return (
    <div className="exRoot">
      <div className="exHead">
        <h2>Projects</h2>
      </div>
      <button
        type="button"
        className="suitePrimary exNewProject"
        onClick={onNewProject}
      >
        ＋ New project
      </button>
      <label className="suiteSearch">
        <span className="srOnly">Search projects and calculations</span>
        <input
          placeholder="Search projects and calculations…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
      </label>
      <ul className="exProjects">
        {visible.map((p) => {
          const open = expanded.has(p.id);
          const own = drafts.filter(
            (d) =>
              d.projectId === p.id &&
              (!q ||
                `${p.name} ${p.buildingName}`.toLowerCase().includes(q) ||
                d.title.toLowerCase().includes(q)),
          );
          const tree = buildExplorerTree(own);
          return (
            <li
              key={p.id}
              className={`exProject ${projectId === p.id ? "selected" : ""}`}
            >
              <div className="exProjectRow">
                <button
                  type="button"
                  className="exTwisty"
                  aria-expanded={open}
                  aria-label={`${open ? "Collapse" : "Expand"} ${p.name}`}
                  onClick={() => toggle(p.id)}
                >
                  {open ? "▾" : "▸"}
                </button>
                <button
                  type="button"
                  className="exProjectName"
                  onClick={() => {
                    onSelectProject(p.id);
                    if (!open) toggle(p.id);
                  }}
                >
                  {p.name}
                  <small>{p.buildingName}</small>
                </button>
              </div>
              {open ? (
                <div className="exProjectBody">
                  <button
                    type="button"
                    className="exNewCalc"
                    onClick={() => onNewCalculation(p.id)}
                  >
                    ＋ New calculation
                  </button>
                  <button
                    type="button"
                    className="exLink"
                    onClick={() => onProjectInfo(p.id)}
                  >
                    Project information
                  </button>
                  {tree.map((t) => (
                    <details key={t.trade} open className="exTrade">
                      <summary>{t.trade}</summary>
                      {t.subs.map((s) => (
                        <details key={s.label} open className="exSub">
                          <summary>{s.label}</summary>
                          {s.modules.map((m) => (
                            <details key={m.slug} open className="exModule">
                              <summary>
                                {m.name}
                                <span className="exCount">
                                  {m.drafts.length}
                                </span>
                              </summary>
                              <ul>{m.drafts.map(calcRow)}</ul>
                            </details>
                          ))}
                        </details>
                      ))}
                    </details>
                  ))}
                  {!tree.length ? (
                    <p className="suiteEmpty">
                      No calculations yet. Use New calculation to start one.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {!projects.length ? (
        <p className="suiteEmpty">
          Create your first project to organize calculations.
        </p>
      ) : null}
      {menu && menuDraft ? (
        <div
          ref={menuRef}
          className="exMenu"
          role="menu"
          aria-label={`Actions for ${menuDraft.title}`}
          style={{
            left: Math.max(4, Math.min(menu.x, window.innerWidth - 170)),
            top: Math.max(4, Math.min(menu.y, window.innerHeight - 60)),
          }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => startRename(menuDraft)}
          >
            Rename
          </button>
        </div>
      ) : null}
    </div>
  );
}
