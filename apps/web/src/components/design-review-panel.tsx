"use client";
import { useState } from "react";
import {
  composeRemark,
  GROUP_LABEL,
  parseRemark,
  reasonGroup,
  reasonsFor,
} from "../lib/judgment-reasons";
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
  module = "column",
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
  /** Picks the tickable reason list. */
  module?: "column" | "slab" | "base-plate";
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
          <p>
            Tick At Least One Reason (Or Write One Under “Other”) For Each Amber
            Check Before Saving.
          </p>
          {active.map((c) => (
            <JudgmentReasons
              key={c.id}
              check={c}
              module={module}
              remarks={remarks}
              onChange={onChange}
              siblings={active.filter(
                (o) =>
                  o.id !== c.id &&
                  reasonGroup(o.id, module) === reasonGroup(c.id, module),
              )}
            />
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

/**
 * Tickable reasons for one amber check. "Other" reveals a note box. The
 * selection is stored as the remark text (see lib/judgment-reasons).
 */
function JudgmentReasons({
  check,
  module,
  remarks,
  onChange,
  siblings,
}: {
  check: DesignCheck;
  module: "column" | "slab" | "base-plate";
  remarks: DesignRemarks;
  onChange: (r: DesignRemarks) => void;
  /** Other amber checks of the same group (for "apply to all"). */
  siblings: DesignCheck[];
}) {
  const group = reasonGroup(check.id, module);
  const options = reasonsFor(group);
  const { ticked, note } = parseRemark(remarks[check.id], options);
  const [otherOpen, setOtherOpen] = useState(false);
  const other = otherOpen || !!note;
  const set = (nextTicked: string[], nextNote: string) =>
    onChange({ ...remarks, [check.id]: composeRemark(nextTicked, nextNote) });
  const done = !!(remarks[check.id] ?? "").trim();
  return (
    <fieldset className={`judgmentReasons ${done ? "isDone" : ""}`}>
      <legend>
        {check.label}
        <span className="judgmentGroup"> · {GROUP_LABEL[group]}</span>
      </legend>
      {options.map((o) => (
        <label key={o} className="rcCheckbox">
          <input
            type="checkbox"
            checked={ticked.includes(o)}
            onChange={(e) =>
              set(
                e.target.checked
                  ? options.filter((x) => x === o || ticked.includes(x))
                  : ticked.filter((x) => x !== o),
                note,
              )
            }
          />
          <span>{o}</span>
        </label>
      ))}
      <label className="rcCheckbox">
        <input
          type="checkbox"
          checked={other}
          onChange={(e) => {
            setOtherOpen(e.target.checked);
            if (!e.target.checked) set(ticked, "");
          }}
        />
        <span>Other (write a reason)</span>
      </label>
      {other ? (
        <textarea
          aria-label={`${check.label} Other Reason`}
          maxLength={2000}
          value={note}
          onChange={(e) => set(ticked, e.target.value)}
        />
      ) : null}
      {siblings.length && done ? (
        <button
          type="button"
          className="linkButton"
          onClick={() =>
            onChange({
              ...remarks,
              ...Object.fromEntries(
                siblings.map((s) => [s.id, remarks[check.id]!]),
              ),
            })
          }
        >
          Apply these reasons to all {siblings.length + 1} amber{" "}
          {GROUP_LABEL[group].toLowerCase()} checks
        </button>
      ) : null}
    </fieldset>
  );
}
