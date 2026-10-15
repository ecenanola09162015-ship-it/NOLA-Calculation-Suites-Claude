import { uiCatalogue, uiTrades } from "./ui-catalogue";

type Draft = { id: string; moduleSlug: string; title: string };

export type ExplorerModule<D extends Draft> = {
  slug: string;
  name: string;
  drafts: D[];
};
export type ExplorerSub<D extends Draft> = {
  label: string;
  modules: ExplorerModule<D>[];
};
export type ExplorerTrade<D extends Draft> = {
  trade: string;
  subs: ExplorerSub<D>[];
};

const byTitle = (a: Draft, b: Draft) =>
  a.title.localeCompare(b.title, undefined, {
    numeric: true,
    sensitivity: "base",
  });

/**
 * Project explorer tree: Trade → sub-level → module → calculations.
 * Only levels that contain at least one calculation are returned.
 * Calculations of a module not in the catalogue go to an "Other" trade so
 * nothing saved is ever hidden.
 */
export function buildExplorerTree<D extends Draft>(
  drafts: D[],
): ExplorerTrade<D>[] {
  const known = new Set<string>(uiCatalogue.map((m) => m.slug));
  const tree: ExplorerTrade<D>[] = [];
  for (const { trade, subs } of uiTrades) {
    const subNodes: ExplorerSub<D>[] = [];
    for (const { group, label } of subs) {
      const modules = uiCatalogue
        .filter((m) => m.group === group)
        .map((m) => ({
          slug: m.slug as string,
          name: m.name as string,
          drafts: drafts.filter((d) => d.moduleSlug === m.slug).sort(byTitle),
        }))
        .filter((m) => m.drafts.length > 0);
      if (modules.length) subNodes.push({ label, modules });
    }
    if (subNodes.length) tree.push({ trade, subs: subNodes });
  }
  const other = drafts.filter((d) => !known.has(d.moduleSlug));
  if (other.length) {
    const slugs = [...new Set(other.map((d) => d.moduleSlug))].sort();
    tree.push({
      trade: "Other",
      subs: [
        {
          label: "Other modules",
          modules: slugs.map((slug) => ({
            slug,
            name: slug,
            drafts: other.filter((d) => d.moduleSlug === slug).sort(byTitle),
          })),
        },
      ],
    });
  }
  return tree;
}

/** Shared title rule for save and rename: 1–100 characters after trimming. */
export function titleProblem(title: string): string | null {
  const t = title.trim();
  if (!t) return "Enter a calculation name.";
  if (t.length > 100) return "Use 100 characters or fewer.";
  return null;
}
