import { z } from "zod";

/**
 * Design-code catalogue: the single list every "Primary Design Code" dropdown
 * is built from (decision 17 Oct 2026).
 *
 * - `active`: selectable, calculations exist for it.
 * - `future`: shown greyed out as "Future Development"; not selectable.
 * - Each discipline has exactly one `default`. Rule: the latest active
 *   edition, except concrete stays on ACI 318-19 until ACI 318-25 is built.
 *
 * Releasing a code later = switch its status to "active" here and add its
 * provisions (owned by the code-basis work). Do not hard-code code lists in
 * module workspaces.
 */
export type CodeDiscipline = "concrete" | "steel" | "loads";
export type DesignCodeStatus = "active" | "future";

export interface DesignCodeOption {
  /** Stored value in drafts and reports, e.g. "ACI 318-19". */
  id: string;
  /** Dropdown / report label. */
  label: string;
  family: "American" | "NSCP" | "Eurocode" | "Australian" | "Canadian";
  year: number;
  status: DesignCodeStatus;
  default?: true;
}

export const designCodeCatalogue = {
  concrete: [
    {
      id: "ACI 318-19",
      label: "ACI 318-19",
      family: "American",
      year: 2019,
      status: "active",
      default: true,
    },
    {
      id: "ACI 318-25",
      label: "ACI 318-25",
      family: "American",
      year: 2025,
      status: "future",
    },
    {
      id: "ACI 318-14",
      label: "ACI 318-14",
      family: "American",
      year: 2014,
      status: "future",
    },
    {
      id: "NSCP 2015",
      label: "NSCP 2015 (Vol. 1)",
      family: "NSCP",
      year: 2015,
      status: "future",
    },
    {
      id: "NSCP 2010",
      label: "NSCP 2010 (Vol. 1)",
      family: "NSCP",
      year: 2010,
      status: "future",
    },
    {
      id: "BS EN 1992-1-1",
      label: "BS EN 1992-1-1 (Eurocode 2)",
      family: "Eurocode",
      year: 2004,
      status: "future",
    },
    {
      id: "AS 3600",
      label: "AS 3600",
      family: "Australian",
      year: 2018,
      status: "future",
    },
  ],
  steel: [
    {
      id: "AISC 360-22",
      label: "AISC 360-22",
      family: "American",
      year: 2022,
      status: "active",
      default: true,
    },
    {
      id: "AISC 360-16",
      label: "AISC 360-16",
      family: "American",
      year: 2016,
      status: "future",
    },
    {
      id: "NSCP 2015",
      label: "NSCP 2015 (Vol. 1)",
      family: "NSCP",
      year: 2015,
      status: "future",
    },
    {
      id: "NSCP 2010",
      label: "NSCP 2010 (Vol. 1)",
      family: "NSCP",
      year: 2010,
      status: "future",
    },
    {
      id: "BS EN 1993-1-1",
      label: "BS EN 1993-1-1 (Eurocode 3)",
      family: "Eurocode",
      year: 2005,
      status: "future",
    },
    {
      id: "AS 4100",
      label: "AS 4100",
      family: "Australian",
      year: 2020,
      status: "future",
    },
    {
      id: "CSA S16",
      label: "CSA S16",
      family: "Canadian",
      year: 2019,
      status: "future",
    },
  ],
  loads: [
    {
      id: "ASCE 7-22",
      label: "ASCE/SEI 7-22",
      family: "American",
      year: 2022,
      status: "active",
      default: true,
    },
    {
      id: "ASCE 7-16",
      label: "ASCE/SEI 7-16",
      family: "American",
      year: 2016,
      status: "active",
    },
    {
      id: "ASCE 7-10",
      label: "ASCE/SEI 7-10",
      family: "American",
      year: 2010,
      status: "active",
    },
    {
      id: "NSCP 2015",
      label: "NSCP 2015 (Vol. 1, Ch. 2)",
      family: "NSCP",
      year: 2015,
      status: "active",
    },
    {
      id: "NSCP 2010",
      label: "NSCP 2010 (Vol. 1, Ch. 2)",
      family: "NSCP",
      year: 2010,
      status: "future",
    },
    {
      id: "BS EN 1991",
      label: "BS EN 1991 / 1998 (Eurocodes 1 & 8)",
      family: "Eurocode",
      year: 2002,
      status: "future",
    },
    {
      id: "AS/NZS 1170",
      label: "AS/NZS 1170",
      family: "Australian",
      year: 2002,
      status: "future",
    },
  ],
} as const satisfies Record<CodeDiscipline, readonly DesignCodeOption[]>;

type Catalogue = typeof designCodeCatalogue;
/** Selectable code ids of a discipline, e.g. "ACI 318-19" for concrete. */
export type ActiveDesignCode<D extends CodeDiscipline> = Extract<
  Catalogue[D][number],
  { status: "active" }
>["id"];
export type ConcreteDesignCode = ActiveDesignCode<"concrete">;
export type SteelDesignCode = ActiveDesignCode<"steel">;
export type LoadsDesignCode = ActiveDesignCode<"loads">;

export function designCodeOptions(
  discipline: CodeDiscipline,
): readonly DesignCodeOption[] {
  return designCodeCatalogue[discipline];
}

export function activeDesignCodes<D extends CodeDiscipline>(
  discipline: D,
): ActiveDesignCode<D>[] {
  return (designCodeCatalogue[discipline] as readonly DesignCodeOption[])
    .filter((c) => c.status === "active")
    .map((c) => c.id as ActiveDesignCode<D>);
}

export function defaultDesignCode<D extends CodeDiscipline>(
  discipline: D,
): ActiveDesignCode<D> {
  const hit = (
    designCodeCatalogue[discipline] as readonly DesignCodeOption[]
  ).find((c) => c.default);
  if (!hit) throw new Error(`No default design code for ${discipline}.`);
  return hit.id as ActiveDesignCode<D>;
}

export function designCodeLabel(
  discipline: CodeDiscipline,
  id: string,
): string {
  return (
    (designCodeCatalogue[discipline] as readonly DesignCodeOption[]).find(
      (c) => c.id === id,
    )?.label ?? id
  );
}

/** Zod enum of the selectable codes of a discipline. */
export function designCodeSchema<D extends CodeDiscipline>(discipline: D) {
  const [first, ...rest] = activeDesignCodes(discipline);
  return z.enum([
    first as string,
    ...(rest as string[]),
  ]) as unknown as z.ZodType<ActiveDesignCode<D>>;
}

/**
 * Drafts saved before 17 Oct 2026 could choose "NSCP 2015 project — ACI
 * 318-19 / AISC 360-22 calculation basis". That option is retired: on load the
 * code becomes its calculation basis (identical results) and "NSCP 2015
 * (project standard)" is kept under Other Codes so the record stays traceable.
 */
export const LEGACY_PROJECT_STANDARD = "NSCP 2015";
export const LEGACY_PROJECT_STANDARD_NOTE = "NSCP 2015 (project standard)";

export function upgradeLegacyProjectCode(
  raw: unknown,
  fields: Readonly<Record<string, string>>,
): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const r = { ...(raw as Record<string, unknown>) };
  let upgraded = false;
  for (const [key, basis] of Object.entries(fields))
    if (r[key] === LEGACY_PROJECT_STANDARD) {
      r[key] = basis;
      upgraded = true;
    }
  if (!upgraded) return raw;
  const other = typeof r.otherCodes === "string" ? r.otherCodes.trim() : "";
  if (!/NSCP\s*2015/i.test(other))
    r.otherCodes = (
      other
        ? `${LEGACY_PROJECT_STANDARD_NOTE}; ${other}`
        : LEGACY_PROJECT_STANDARD_NOTE
    ).slice(0, 300);
  return r;
}
