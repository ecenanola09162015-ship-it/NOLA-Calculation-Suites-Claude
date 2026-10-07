import { getModule } from "@nola/calc-core";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";

export default async function ModulePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const module = getModule(slug);
  if (!module) notFound();

  if (slug === "rc-column") redirect("/launcher?module=rc-column");

  return (
    <main className="workspacePage">
      <nav>
        <Link href="/launcher">← Back to launcher</Link>
      </nav>
      <header className="workspaceHeader">
        <div>
          <p className="eyebrow">{module.discipline}</p>
          <h1>{module.name}</h1>
          <p>{module.summary}</p>
        </div>
        <span className="statusBadge">{module.verificationStatus}</span>
      </header>
      <section className="workspaceGrid">
        <div className="panel">
          <h2>Inputs</h2>
          <p>
            The approved schema is ready for the calculation workspace. Field
            groups will be completed with the engineering benchmark set.
          </p>
          <div className="placeholderRows" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </div>
        </div>
        <div className="panel resultPanel">
          <h2>Results</h2>
          <div className="blockingMessage">
            <strong>Engineering verification required</strong>
            <p>
              This module cannot issue design results until its code editions,
              benchmark calculations, and independent review are approved.
            </p>
          </div>
          <dl>
            <div>
              <dt>Release phase</dt>
              <dd>{module.releasePhase}</dd>
            </div>
            <div>
              <dt>Priority</dt>
              <dd>{module.priority}</dd>
            </div>
            <div>
              <dt>Initial references</dt>
              <dd>{module.initialCodes.join(" · ")}</dd>
            </div>
          </dl>
        </div>
      </section>
    </main>
  );
}
