import { describe, expect, it } from "vitest";
import { buildExplorerTree, titleProblem } from "../src/lib/explorer-tree";
import { uiTrades } from "../src/lib/ui-catalogue";

const d = (id: string, moduleSlug: string, title: string) => ({
  id,
  moduleSlug,
  title,
});

describe("project explorer tree", () => {
  it("keeps the trade system: Structural (Concrete, Loads, Steel), Geotechnical (Foundation & soil)", () => {
    expect(uiTrades.map((t) => [t.trade, t.subs.map((s) => s.label)])).toEqual([
      ["Structural", ["Concrete", "Loads", "Steel"]],
      ["Geotechnical", ["Foundation & soil"]],
    ]);
  });
  it("files a column calculation under Structural › Concrete › RC Column", () => {
    const tree = buildExplorerTree([d("1", "rc-column", "C1 · First floor")]);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.trade).toBe("Structural");
    expect(tree[0]!.subs[0]!.label).toBe("Concrete");
    expect(tree[0]!.subs[0]!.modules[0]!.name).toBe("RC Column");
    expect(tree[0]!.subs[0]!.modules[0]!.drafts.map((x) => x.title)).toEqual([
      "C1 · First floor",
    ]);
  });
  it("shows only levels that hold a calculation", () => {
    expect(buildExplorerTree([])).toEqual([]);
    const tree = buildExplorerTree([
      d("1", "slab", "SL-01"),
      d("2", "soil-bearing-capacity", "SBC-1"),
    ]);
    expect(tree.map((t) => t.trade)).toEqual(["Structural", "Geotechnical"]);
    expect(tree[0]!.subs.map((s) => s.label)).toEqual(["Concrete"]);
    expect(tree[0]!.subs[0]!.modules.map((m) => m.slug)).toEqual(["slab"]);
    expect(tree[1]!.subs[0]!.label).toBe("Foundation & soil");
  });
  it("orders calculations by name with numbers in natural order", () => {
    const tree = buildExplorerTree([
      d("a", "rc-column", "C10"),
      d("b", "rc-column", "C2"),
      d("c", "rc-column", "C1"),
    ]);
    expect(tree[0]!.subs[0]!.modules[0]!.drafts.map((x) => x.title)).toEqual([
      "C1",
      "C2",
      "C10",
    ]);
  });
  it("never hides a calculation of an unknown module", () => {
    const tree = buildExplorerTree([d("x", "legacy-module", "Old")]);
    expect(tree.at(-1)!.trade).toBe("Other");
    expect(tree.at(-1)!.subs[0]!.modules[0]!.drafts[0]!.title).toBe("Old");
  });
  it("validates names: 1–100 characters after trimming", () => {
    expect(titleProblem("  ")).toMatch(/Enter/);
    expect(titleProblem("x".repeat(101))).toMatch(/100/);
    expect(titleProblem(" C1 ")).toBeNull();
  });
});
