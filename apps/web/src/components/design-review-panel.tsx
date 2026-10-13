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
  primaryPrefixes,
  title = "DCR-Based Design Checks",
  compact = false,
}: {
  checks: DesignCheck[];
  policy: DesignCheckPolicy;
  remarks: DesignRemarks;
  onChange: (r: DesignRemarks) => void;
  /** Check-id prefixes shown up front (e.g. the governing combination). */
  primaryPrefixes?: string[];
  title?: string;
  /** Panel use (05/06): omit the workflow note and policy footer. */
  compact?: boolean;
}) {
  const isPrimary = (c: DesignCheck) =>
    !primaryPrefixes || primaryPrefixes.some((p) => c.id.startsWith(p));
  const primary = checks.filter(isPrimary);
  const secondary = checks.filter((c) => !isPrimary(c));
  const finite = secondary
    .map((c) => c.dcr)
    .filter((v): v is number => v !== null && Number.isFinite(v));
  const secondaryWorst = finite.length ? Math.max(...finite) : null;
  const active = checks.filter(
    (c) => designCheckStatus(c.dcr, policy).id === "judgment",
  );
  // Only remarks that belong to the checks shown in this table.
  const recorded = checks
    .filter((c) => remarks[c.id]?.trim())
    .map((c) => [c, remarks[c.id]] as const);
  return (
    <section className="designReviewPanel">
      <h3>{title}</h3>
      {compact ? null : (
        <p>
          Workflow Status Bands Do Not Waive Mandatory Code Or Detailing
          Requirements. “Not Evaluated” Does Not Mean Pass.
        </p>
      )}
      <ReviewTable checks={primary} policy={policy} />
      {secondary.length ? (
        <details className="designReviewMore">
          <summary>
            Show All Combinations ({secondary.length} More Checks
            {secondaryWorst !== null
              ? `, Highest DCR ${secondaryWorst.toFixed(3)}`
              : ""}
            )
          </summary>
          <ReviewTable checks={secondary} policy={policy} />
        </details>
      ) : null}
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
      {recorded.length ? (
        <section className="remarksReport">
          <h3>Recorded Engineering Remarks</h3>
          <dl>
            {recorded.map(([c, text]) => (
              <div key={c.id}>
                <dt>{c.label}</dt>
                <dd>{text}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
      {compact ? null : (
        <p className="designPolicyReport">
          Status Limits: Optimize Below {policy.optimizeBelow}; Pass Through{" "}
          {policy.passThrough}; Engineering Judgment Through{" "}
          {policy.judgmentThrough}.
        </p>
      )}
    </section>
  );
}

function ReviewTable({
  checks,
  policy,
}: {
  checks: DesignCheck[];
  policy: DesignCheckPolicy;
}) {
  return (
    <div className="rcTableWrap reviewTableWrap">
      <table className="reviewTable">
        <colgroup>
          <col className="dcCheck" />
          <col className="dcClause" />
          <col className="dcValue" />
          <col className="dcStatus" />
        </colgroup>
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
                {c.detail ? (
                  <p className="slabMuted reviewDetail">{c.detail}</p>
                ) : null}
              </th>
              <td className="designClause" data-label="Code Reference">
                {c.clause}
              </td>
              <td data-label="DCR">
                {c.dcr === null
                  ? (c.invalidLabel ?? "—")
                  : Number.isFinite(c.dcr)
                    ? c.dcr.toFixed(3)
                    : (c.invalidLabel ?? "No Available Capacity")}
              </td>
              <td data-label="Status">
                <DesignStatus dcr={c.dcr} policy={policy} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
