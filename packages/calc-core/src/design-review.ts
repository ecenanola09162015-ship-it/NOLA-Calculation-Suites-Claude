import { z } from "zod";
import defaults from "./design-check-policy.json";
import type { RectangularColumnResult } from "./modules/rectangular-column";
import type { SlabInput, SlabResult } from "./modules/slab-design";
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
    .flatMap((c) => [
      {
        id: `${c.load.id}:axial`,
        label: `${c.load.id} · Axial`,
        dcr: c.axialRatio,
      },
      {
        id: `${c.load.id}:mx`,
        label: `${c.load.id} · Flexure X`,
        dcr: utilization(c.load.mx, c.capacityX),
      },
      {
        id: `${c.load.id}:my`,
        label: `${c.load.id} · Flexure Y`,
        dcr: utilization(c.load.my, c.capacityY),
      },
      {
        id: `${c.load.id}:interaction`,
        label: `${c.load.id} · Biaxial Interaction`,
        dcr: c.interaction ?? Infinity,
      },
    ]);
}
export function slabDesignChecks(i: SlabInput, r: SlabResult): DesignCheck[] {
  const out: DesignCheck[] = [];
  for (const v of r.regions) {
    const main = r.bars.find((b) => b.group === "main" && b.layer === v.layer);
    out.push(
      {
        id: `${v.id}:flexure`,
        label: `${v.label} · Governing Flexure`,
        dcr: v.dcr,
        detail: `MAIN As ${v.mainAs.toFixed(0)} + EXTRA As ${v.extraAs.toFixed(0)} = Total As ${v.as.toFixed(0)} mm²/m At x/L = ${v.position.toFixed(3)}.`,
      },
      ...v.zones.map((zone) => ({
        id: `${v.id}:zone:${zone.id}:flexure`,
        label: `${v.label} · ${zone.label}`,
        dcr: zone.dcr,
      })),
      {
        id: `${v.id}:minimum`,
        label: `${v.label} · Continuous MAIN Minimum Reinforcement`,
        detail:
          "MAIN BARS Are Checked Across The Full Span; Cut-Off EXTRA BARS Contribute To Local Flexural Strength.",
        dcr: main && main.as > 0 ? v.minAs / main.as : Infinity,
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
      },
    );
  }
  out.push(
    ...r.shear.map((v) => ({
      id: `shear:${v.edge}`,
      label: `${v.edge} · Shear`,
      dcr: v.dcr,
    })),
    {
      id: "deflection",
      label: "Immediate Deflection",
      dcr:
        r.deflection.limit > 0
          ? r.deflection.immediate / r.deflection.limit
          : null,
    },
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
      };
    }),
  );
  return out;
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
