"use client";
import {
  designCheckStatus,
  type DesignCheck,
  type DesignCheckPolicy,
  type DesignRemarks,
} from "@nola/calc-core";
export function DesignStatus({
  dcr,
  policy,
}: {
  dcr: number | null | undefined;
  policy: DesignCheckPolicy;
}) {
  const s = designCheckStatus(dcr, policy);
  return (
    <span
      className={`designStatus designStatus-${s.id}`}
      style={{
        color: s.color,
        borderColor: s.color,
        backgroundColor: `${s.color}12`,
      }}
    >
      {s.label}
    </span>
  );
}
export function DesignReviewPanel({
  checks,
  policy,
  remarks,
  onChange,
}: {
  checks: DesignCheck[];
  policy: DesignCheckPolicy;
  remarks: DesignRemarks;
  onChange: (r: DesignRemarks) => void;
}) {
  const active = checks.filter(
    (c) => designCheckStatus(c.dcr, policy).id === "judgment",
  );
  return (
    <section className="designReviewPanel">
      <h3>DCR-Based Design Checks</h3>
      <p>
        Workflow Status Bands Do Not Waive Mandatory Code Or Detailing
        Requirements. “Not Evaluated” Does Not Mean Pass.
      </p>
      <div className="rcTableWrap">
        <table>
          <thead>
            <tr>
              <th>Check</th>
              <th>Code Reference</th>
              <th>DCR</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {checks.map((c) => (
              <tr key={c.id}>
                <th scope="row">
                  {c.label}
                  {c.detail ? <p className="slabMuted">{c.detail}</p> : null}
                </th>
                <td className="designClause">{c.clause}</td>
                <td>
                  {c.dcr === null
                    ? "—"
                    : Number.isFinite(c.dcr)
                      ? c.dcr.toFixed(3)
                      : (c.invalidLabel ?? "No Available Capacity")}
                </td>
                <td>
                  <DesignStatus dcr={c.dcr} policy={policy} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {active.length ? (
        <div className="judgmentRemarks">
          <h3>Engineering Judgment Remarks</h3>
          <p>Record A Reason For Each Amber Check Before Saving.</p>
          {active.map((c) => (
            <label key={c.id}>
              {c.label}
              <textarea
                aria-label={`${c.label} Remarks`}
                maxLength={2000}
                required
                value={remarks[c.id] ?? ""}
                onChange={(e) =>
                  onChange({ ...remarks, [c.id]: e.target.value })
                }
              />
            </label>
          ))}
        </div>
      ) : null}
      {Object.entries(remarks).filter(([, text]) => text.trim()).length ? (
        <section className="remarksReport">
          <h3>Recorded Engineering Remarks</h3>
          <dl>
            {Object.entries(remarks)
              .filter(([, text]) => text.trim())
              .map(([id, text]) => (
                <div key={id}>
                  <dt>{checks.find((c) => c.id === id)?.label ?? id}</dt>
                  <dd>{text}</dd>
                </div>
              ))}
          </dl>
        </section>
      ) : null}
      <p className="designPolicyReport">
        Status Limits: Optimize Below {policy.optimizeBelow}; Pass Through{" "}
        {policy.passThrough}; Engineering Judgment Through{" "}
        {policy.judgmentThrough}.
      </p>
    </section>
  );
}
