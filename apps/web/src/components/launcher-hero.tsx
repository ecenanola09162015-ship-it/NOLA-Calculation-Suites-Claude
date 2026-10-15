import Image from "next/image";
import type { ProjectRecord } from "@/lib/projects";
import type { LauncherTheme } from "./launcher-theme";

/** Launcher hero: project context, headline, quick opens, and the theme's art. */
export function LauncherHero({
  theme,
  project,
  quickOpen,
}: {
  theme: LauncherTheme;
  project?: ProjectRecord;
  quickOpen: { label: string; onOpen: () => void }[];
}) {
  return (
    <section className="lxHero" aria-labelledby="lx-hero-title">
      <div className="lxHeroText">
        <p className="lxMeta">
          {project
            ? `${project.name} / ${project.buildingName} · Prepared ${project.preparedBy} · Checked ${project.checkedBy}`
            : "Create or select a project in the explorer to save calculations."}
        </p>
        <h1 id="lx-hero-title">What are we designing today?</h1>
        <p className="lxLead">
          Open a module below. Every result carries its code clause, so the
          check stays traceable.
        </p>
        {quickOpen.length ? (
          <div className="lxQuick">
            {quickOpen.map((q) => (
              <button key={q.label} type="button" onClick={q.onOpen}>
                {q.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="lxArt">
        <Image
          src={`/launcher/hero-${theme}.svg`}
          alt=""
          width={760}
          height={420}
          unoptimized
          priority
        />
      </div>
    </section>
  );
}
