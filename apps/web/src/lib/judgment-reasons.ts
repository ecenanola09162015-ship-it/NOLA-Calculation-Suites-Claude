/**
 * Tickable engineering-judgment reasons for amber checks (user-approved list,
 * 13 Oct 2026). Ticked reasons are stored as the remark text itself, so saved
 * drafts, the save/export validation and the PDF need no change; ticks are
 * restored by matching the stored text.
 */
export type ReasonGroup =
  | "flexure"
  | "slenderness"
  | "shear"
  | "confinement"
  | "grade"
  | "scwb"
  | "slab";

export const GENERAL_REASONS = [
  "Exceedance is within the project's engineering-judgment band and has been reviewed by the engineer of record.",
  "Verified by an independent check or other software (e.g. spColumn, ETABS section designer).",
  "To be resolved at detailing / the next design iteration.",
] as const;

export const GROUP_REASONS: Record<ReasonGroup, readonly string[]> = {
  flexure: [
    "Mux and Muy are envelope maxima that do not occur at the same time; the actual concurrent demand is lower.",
    "Demands come from an uncracked or conservative analysis model.",
    "Bresler is a conservative reference; the 3D strain-compatibility check governs.",
  ],
  slenderness: [
    "Confirmed by a second-order P-Δ analysis in ETABS.",
    "k = 1.0 and βdns used conservatively for a braced frame.",
    "Minimum moment M2,min governs and is a conservative limiting case.",
  ],
  shear: [
    "Ve uses column Mpr, not capped by the beams' probable moment strength; conservative under 18.7.6.1.1.",
    "Vux and Vuy are non-concurrent envelope values (biaxial interaction is conservative).",
    "Vc = 0 in lo is taken conservatively.",
    "Spacing or legs will be adjusted at detailing.",
  ],
  confinement: [
    "Spacing rounded to a practical 25 mm increment; the difference from the limit is negligible.",
    "Ash, hx or the lo length will be met by the final bar and cross-tie layout in the shop drawings.",
  ],
  grade: [
    "Mill certificates confirm actual fy ≤ fy + 125 MPa and actual tensile / actual yield ≥ 1.25.",
    "Drawings and specifications will call for PNS W grade / ASTM A706 bars.",
    "No welding of longitudinal bars; splices are lap splices or mechanical couplers.",
  ],
  scwb: [
    "ΣMnb includes the effective slab reinforcement conservatively.",
    "Joint is at the roof level / falls under an exception in 18.7.3.1.",
  ],
  slab: [
    "Moments come from a conservative coefficient method or envelope.",
    "Deflection is reviewed separately (long-term or cracked section).",
  ],
};

export const GROUP_LABEL: Record<ReasonGroup, string> = {
  flexure: "Flexure / axial / biaxial",
  slenderness: "Slenderness",
  shear: "Shear",
  confinement: "Confinement / detailing",
  grade: "SMF bar grade",
  scwb: "Strong column–weak beam",
  slab: "Slab",
};

/** Which reason group a check id belongs to. */
export function reasonGroup(
  id: string,
  module: "column" | "slab" = "column",
): ReasonGroup {
  if (module === "slab") return "slab";
  if (id.startsWith("tie:shear")) return "shear";
  if (id.startsWith("tie:smf:grade")) return "grade";
  if (id.startsWith("tie:smf:scwb")) return "scwb";
  if (id.startsWith("tie:")) return "confinement";
  if (/:slender-/.test(id)) return "slenderness";
  return "flexure";
}

export const reasonsFor = (group: ReasonGroup) => [
  ...GENERAL_REASONS,
  ...GROUP_REASONS[group],
];

const NOTE = "Note: ";

/** Remark text from ticked reasons and an optional note. */
export function composeRemark(ticked: string[], note: string) {
  const parts = [...ticked];
  if (note.trim()) parts.push(NOTE + note.trim());
  return parts.join(" | ");
}

/**
 * Ticks and note recovered from stored text. Text that is not a preset (a
 * remark written before the checklist existed) becomes the note.
 */
export function parseRemark(text: string | undefined, options: string[]) {
  const raw = (text ?? "").trim();
  if (!raw) return { ticked: [] as string[], note: "" };
  const parts = raw.split(" | ");
  const ticked: string[] = [];
  const rest: string[] = [];
  for (const p of parts) {
    if (options.includes(p)) ticked.push(p);
    else rest.push(p.startsWith(NOTE) ? p.slice(NOTE.length) : p);
  }
  return { ticked, note: rest.join(" | ") };
}
