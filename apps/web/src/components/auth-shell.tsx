import type { ReactNode } from "react";

import { BrandMark } from "./brand-mark";

export function AuthShell({
  children,
  eyebrow,
  title,
}: {
  children: ReactNode;
  eyebrow: string;
  title: string;
}) {
  return (
    <main className="authPage">
      <section className="authIntro">
        <BrandMark />
        <p className="eyebrow">ENGINEERING WITH TRACEABILITY</p>
        <h1>One calculation record, consistent on every device.</h1>
        <p>
          Verified inputs, units, assumptions, code editions, results, and
          review history—from desktop to site visit.
        </p>
      </section>
      <section className="authCard managedAuth" aria-labelledby="auth-title">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2 id="auth-title">{title}</h2>
        </div>
        {children}
      </section>
    </main>
  );
}
