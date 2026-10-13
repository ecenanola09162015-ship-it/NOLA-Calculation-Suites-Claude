import { z } from "zod";
import defaults from "./design-check-policy.json";
import type { RectangularColumnResult } from "./modules/rectangular-column";
import type { TransverseResult } from "./modules/column-transverse";
import type { SlabInput, SlabResult } from "./modules/slab-design";
import { columnClauses, slabClauses } from "./code-clauses";
const band = z.object({
  label: z.string().trim().min(1).max(100),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
});
export const designCheckPolicySchema = z
  .object({
    optimizeBelow: z.number().finite().positive(),
    passThrough: z.number().finite().positive(),
    judgmentThrough: z.number().finite().positive(),
    bands: z.object({
      optimize: band,
      pass: band,
      judgment: band,
      improve: band,
    }),
  })
  .refine(
    (p) => p.optimizeBelow < p.passThrough && p.passThrough < p.judgmentThrough,
    "Status thresholds must be strictly increasing.",
  );
export type DesignCheckPolicy = z.infer<typeof designCheckPolicySchema>;
export const defaultDesignCheckPolicy: DesignCheckPolicy =
  designCheckPolicySchema.parse(defaults);
export const designRemarksSchema = z.record(
  z.string().max(200),
  z.string().max(2000),
);
export type DesignRemarks = z.infer<typeof designRemarksSchema>;
export type DesignCheck = {
  id: string;
  label: string;
  dcr: number | null;
  detail?: string;
  invalidLabel?: string;
  /** Code clause basis printed beside the check (panel and PDF). */
  clause: string;
};
export function designCheckStatus(
  dcr: number | null | undefined,
  policy: DesignCheckPolicy = defaultDesignCheckPolicy,
) {
  if (dcr === null || dcr === undefined || Number.isNaN(dcr) || dcr < 0)
    return { id: "unavailable", label: "Not Evaluated", color: "#667085" };
  const id =
    dcr < policy.optimizeBelow
      ? "optimize"
      : dcr <= policy.passThrough
        ? "pass"
        : dcr <= policy.judgmentThrough
          ? "judgment"
          : "improve";
  return { id, ...policy.bands[id] };
}
const utilization = (demand: number, capacity: number | null) =>
  demand === 0
    ? 0
    : capacity !== null && capacity > 0
      ? Math.abs(demand) / capacity
      : Infinity;
export function columnDesignChecks(r: RectangularColumnResult): DesignCheck[] {
  return r.checks
    .filter((c) => c.load.included)
    .flatMap((c) => {
      const rows: DesignCheck[] = [
        {
          id: `${c.load.id}:axial`,
          label: `${c.load.id} · Axial`,
          dcr: c.axialRatio,
          clause: columnClauses.axial(),
        },
        {
          id: `${c.load.id}:mx`,
          label: `${c.load.id} · Flexure X`,
          dcr: utilization(c.mux, c.capacityX),
          clause: columnClauses.flexure(),
        },
        {
          id: `${c.load.id}:my`,
          label: `${c.load.id} · Flexure Y`,
          dcr: utilization(c.muy, c.capacityY),
          clause: columnClauses.flexure(),
        },
        {
          id: `${c.load.id}:biaxial3d`,
          label: `${c.load.id} · Biaxial 3D`,
          dcr: c.biaxialRatio ?? Infinity,
          clause: columnClauses.biaxial3d(),
        },
        {
          id: `${c.load.id}:bresler`,
          label: `${c.load.id} · Biaxial Bresler`,
          dcr: c.bresler.applicable ? c.bresler.ratio : null,
          invalidLabel: c.bresler.applicable
            ? undefined
            : "n/a (Pu < 0.10f′cAg)",
          detail: c.bresler.note,
          clause: columnClauses.bresler(),
        },
      ];
      if (c.slenderness)
        for (const d of [c.slenderness.x, c.slenderness.y])
          if (d.slender)
            rows.push({
              id: `${c.load.id}:slender-${d.axis}`,
              label: `${c.load.id} · Slenderness ${d.axis.toUpperCase()} (δ/1.4)`,
              dcr: d.unstable ? Infinity : d.secondOrderRatio / 1.4,
              detail: d.note,
              clause: columnClauses.slenderness(d.sway),
            });
      return rows;
    });
}
/** Shear / tie / confinement checks for the Design Review (ids prefixed "tie:"). */
export function columnTransverseChecks(
  t: TransverseResult | null | undefined,
): DesignCheck[] {
  return (t?.checks ?? []).map((c) => ({
    id: `tie:${c.id}`,
    label: c.label,
    dcr: c.dcr,
    detail: c.detail,
    clause: c.clause,
  }));
}
export function slabDesignChecks(i: SlabInput, r: SlabResult): DesignCheck[] {
  const out: DesignCheck[] = [];
  const system = r.type;
  for (const v of r.regions) {
    const distribution = system === "one-way" && v.layer.startsWith("long");
    const main = r.bars.find((b) => b.group === "main" && b.layer === v.layer);
    out.push(
      {
        id: `${v.id}:flexure`,
        label: `${v.label} · Governing Flexure`,
        dcr: v.dcr,
        clause: slabClauses.flexure(system),
        detail: `MAIN As ${v.mainAs.toFixed(0)} + EXTRA As ${v.extraAs.toFixed(0)} = Total As ${v.as.toFixed(0)} mm²/m At x/L = ${v.position.toFixed(3)}.`,
      },
      ...v.zones.map((zone) => ({
        id: `${v.id}:zone:${zone.id}:flexure`,
        label: `${v.label} · ${zone.label}`,
        dcr: zone.dcr,
        clause: slabClauses.flexure(system),
      })),
      {
        id: `${v.id}:minimum`,
        label: `${v.label} · Continuous MAIN Minimum Reinforcement`,
        detail:
          "MAIN BARS Are Checked Across The Full Span; Cut-Off EXTRA BARS Contribute To Local Flexural Strength.",
        dcr: main && main.as > 0 ? v.minAs / main.as : Infinity,
        clause: slabClauses.minimumSteel(system),
      },
      {
        id: `${v.id}:spacing`,
        label: `${v.label} · Reinforcement Spacing`,
        dcr: Math.max(
          ...v.spacingChecks.map((s) =>
            Math.max(
              s.maxPitch / s.maxSpacing,
              s.minClear > 0 ? s.requiredClear / s.minClear : Infinity,
            ),
          ),
        ),
        invalidLabel: "Bars Overlap / Invalid Clear Spacing",
        clause: slabClauses.spacing(system, distribution),
        detail: v.spacingChecks
          .map(
            (s) =>
              `${s.label}: Clear ${s.minClear.toFixed(1)} mm (Min ${s.requiredClear.toFixed(1)}); Pitch ${s.maxPitch.toFixed(1)} mm (Max ${s.maxSpacing.toFixed(1)}).`,
          )
          .join(" "),
      },
      {
        id: `${v.id}:strain`,
        label: `${v.label} · Tension-Controlled Strain`,
        dcr: v.strain > 0 ? (i.fy / i.es + 0.003) / v.strain : Infinity,
        clause: slabClauses.strain(),
      },
    );
  }
  out.push(
    ...r.shear.map((v) => ({
      id: `shear:${v.edge}`,
      label: `${v.edge} · Shear`,
      dcr: v.dcr,
      clause: v.concentratedWithinD
        ? slabClauses.shearAtSupport(system)
        : slabClauses.shear(system),
      ...(v.concentratedWithinD
        ? {
            detail:
              "Point load within d of the support: critical section taken at the support line.",
          }
        : {}),
    })),
    ...r.punching.map((p) => ({
      id: `punching:${p.id}`,
      label: `${p.id} · Punching Shear`,
      dcr: Number.isFinite(p.dcr) ? p.dcr : null,
      clause: slabClauses.punching(),
      detail: `Vu = ${p.vu.toFixed(1)} kN (${p.combination}) vs φVc = ${p.phiVc.toFixed(1)} kN; loaded area ${p.c1.toFixed(0)} × ${p.c2.toFixed(0)} mm, d = ${p.d.toFixed(1)} mm, b0 = ${p.b0.toFixed(0)} mm (${p.sides} sides, αs = ${p.alphaS}), β = ${p.beta.toFixed(2)}, λs = ${p.lambdaS.toFixed(3)}, vc = ${p.vc.toFixed(3)} MPa.`,
      invalidLabel: "Not Evaluated · Loaded Area Spans Supports",
    })),
    deflectionCheck(i, r),
  );
  out.push(
    ...r.detailing.development.map((v) => {
      const bar = r.bars.find(
        (b) => b.group === "extra" && b.layer === v.layer,
      );
      const required = v.ld + (bar ? Math.max(bar.d, 12 * bar.diameter) : 0);
      return {
        id: `development:${v.layer}`,
        label: `${v.layer} · Development-Length Screen`,
        dcr: v.extension > 0 ? required / v.extension : Infinity,
        clause: slabClauses.development(system),
      };
    }),
  );
  return out;
}
/**
 * One deflection-control check, consistent with the engine status:
 * h ≥ hmin → DCR = hmin/h (calculation waived, cracked Δ reported for information);
 * h < hmin → DCR = Δcr/limit (cracked effective inertia governs).
 */
function deflectionCheck(i: SlabInput, r: SlabResult): DesignCheck {
  const d = r.deflection,
    t = d.minimumThickness;
  const info = `Cracked Δ = ${d.crackedImmediate.toFixed(2)} mm (${d.crackedCombination}; Ma = ${d.ma.toFixed(2)}, Mcr = ${d.mcr.toFixed(2)} kN·m/m; Ie = ${(d.ie / 1e6).toFixed(1)}e6 of Ig ${(d.ig / 1e6).toFixed(1)}e6 mm⁴) vs L/${i.deflectionDivisor} = ${d.limit.toFixed(2)} mm.`;
  if (d.governedBy === "thickness")
    return {
      id: "deflection",
      label: "Deflection Control · Minimum Thickness",
      dcr: i.h > 0 ? t.hmin / i.h : null,
      clause: slabClauses.minimumThickness(t.system),
      detail: `${t.formula} ≤ h = ${i.h} mm; calculated deflection waived. Information: ${info}`,
    };
  return {
    id: "deflection",
    label: "Deflection Control · Cracked Immediate Deflection",
    dcr: d.limit > 0 ? d.crackedImmediate / d.limit : null,
    clause: `${slabClauses.deflection()}; h < hmin per ${slabClauses.minimumThickness(t.system)}`,
    detail: `h = ${i.h} mm < ${t.formula}; deflection calculated. ${info}`,
  };
}
export function missingJudgmentRemarks(
  checks: DesignCheck[],
  policy: DesignCheckPolicy,
  remarks: DesignRemarks,
) {
  return checks.filter(
    (c) =>
      designCheckStatus(c.dcr, policy).id === "judgment" &&
      !remarks[c.id]?.trim(),
  );
}
