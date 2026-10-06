import { getPilotModules, moduleRegistry } from "@nola/calc-core";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createProjectAction } from "@/app/actions";
import { AccountControl } from "@/components/account-control";
import { BrandMark } from "@/components/brand-mark";
import { isAuthConfigured, isDatabaseConfigured } from "@/lib/env";
import { listProjects, type ProjectRecord } from "@/lib/projects";

export default async function LauncherPage() {
  const authReady = isAuthConfigured();
  const databaseReady = isDatabaseConfigured();
  let projects: ProjectRecord[] = [];
  if (authReady) {
    const { userId } = await auth();
    if (!userId) redirect("/login");
    if (databaseReady) projects = await listProjects(userId);
  }
  const pilotSlugs = new Set(getPilotModules().map((module) => module.slug));
  return (
    <main className="launcherPage">
      <header className="appHeader">
        <BrandMark />
        {authReady ? (
          <AccountControl />
        ) : (
          <div className="accountPill">Configuration preview</div>
        )}
      </header>
      <section className="launcherHero">
        <p className="eyebrow">CALCULATION LAUNCHER</p>
        <h1>Your engineering workspace.</h1>
        <p>
          Organize calculations by project, then open one of four pilot
          workflows. Only independently verified engines may issue design
          results.
        </p>
      </section>
      <section className="projectSection" aria-labelledby="projects-title">
        <div className="sectionHeading">
          <div>
            <p className="eyebrow">PROJECTS</p>
            <h2 id="projects-title">Recent work</h2>
          </div>
          <span className="configurationChip">
            {databaseReady
              ? "Cloud sync ready"
              : "Database connection required"}
          </span>
        </div>
        {databaseReady && authReady ? (
          <div className="projectGrid">
            <form action={createProjectAction} className="newProjectCard">
              <strong>New project</strong>
              <label>
                Project name
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={100}
                  placeholder="e.g. Quezon Office Tower"
                />
              </label>
              <div className="compactFields">
                <label>
                  Project no.
                  <input
                    name="projectNumber"
                    maxLength={40}
                    placeholder="NCS-001"
                  />
                </label>
                <label>
                  Location
                  <input name="location" maxLength={80} placeholder="City" />
                </label>
              </div>
              <button className="primaryButton" type="submit">
                Create project
              </button>
            </form>
            {projects.map((project) => (
              <article className="projectCard" key={project.id}>
                <span className="projectMonogram">
                  {project.name.slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <strong>{project.name}</strong>
                  <p>
                    {project.projectNumber || "No project number"} ·{" "}
                    {project.location || "Location not set"}
                  </p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="configurationPanel">
            <div>
              <strong>Deployment configuration is safely locked</strong>
              <p>
                The interface is testable now. Connect Clerk and Neon to enable
                verified-email accounts and account-scoped project storage.
              </p>
            </div>
            <Link href="/login">Review sign-in screen</Link>
          </div>
        )}
      </section>
      <div className="sectionHeading moduleHeading">
        <div>
          <p className="eyebrow">CALCULATION LAUNCHER</p>
          <h2>Design modules</h2>
        </div>
      </div>
      <section className="moduleGrid" aria-label="Calculation modules">
        {moduleRegistry.map((module) => (
          <Link
            className="moduleCard"
            href={`/modules/${module.slug}`}
            key={module.slug}
          >
            <span
              className={`moduleIcon discipline-${module.discipline.replaceAll(" ", "-").replaceAll("&", "and")}`}
            >
              {module.name.slice(0, 2).toUpperCase()}
            </span>
            <span>
              <small>{module.discipline}</small>
              <h2>{module.name}</h2>
              <p>{module.summary}</p>
            </span>
            <span
              className={pilotSlugs.has(module.slug) ? "phase pilot" : "phase"}
            >
              {module.releasePhase}
            </span>
          </Link>
        ))}
      </section>
    </main>
  );
}
