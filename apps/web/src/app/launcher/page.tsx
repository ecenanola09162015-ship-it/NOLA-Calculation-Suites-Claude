import { getPilotModules, moduleRegistry } from "@nola/calc-core";
import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";

export default function LauncherPage() {
  const pilotSlugs = new Set(getPilotModules().map((module) => module.slug));
  return (
    <main className="launcherPage">
      <header className="appHeader">
        <BrandMark />
        <div className="accountPill">Engineering workspace · Preview</div>
      </header>
      <section className="launcherHero">
        <p className="eyebrow">CALCULATION LAUNCHER</p>
        <h1>Choose a verified workflow.</h1>
        <p>
          Four pilot modules are prioritized. Other modules stay visible as the
          roadmap grows.
        </p>
      </section>
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
