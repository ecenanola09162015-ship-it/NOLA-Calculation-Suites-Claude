/**
 * Column section drawing → DXF (AC1021): structure, layers, geometry by hand
 * calculation, and an independent audit with ezdxf when Python is available.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import DxfParser from "dxf-parser";
import { designColumnTransverse } from "@nola/calc-core";
import {
  LAYERS,
  columnSectionDrawing,
  sectionFileName,
} from "../src/lib/cad/column-section-drawing";
import { sectionDrawingToDxf } from "../src/lib/cad/section-dxf";
import { sectionDrawingToSvg } from "../src/lib/cad/section-svg";

import { input, tie } from "./browser/cad-fixture";
const design = designColumnTransverse(input, tie);
const drawing = columnSectionDrawing({
  input,
  tie,
  design,
  hookBasis: "aci135",
  title: "C-01A",
  projectName: "Ayala Tower",
  date: new Date("2026-10-14T03:00:00Z"),
});
const dxfText = sectionDrawingToDxf(drawing);

describe("CAD section drawing (DXF AC1021)", () => {
  it("file name YYMMDD_ABC_<mark>_Section.dxf", () => {
    expect(drawing.fileName).toBe("261014_AYA_C-01A_Section.dxf");
    expect(sectionFileName(undefined, "C 2 / Level 3", new Date("2026-01-05T00:00:00Z"))).toBe(
      "260105_PRJ_C-2-Level-3_Section.dxf",
    );
  });
  it("header: AC1021, mm, LTSCALE 20", () => {
    expect(dxfText).toMatch(/\$ACADVER\s+1\s+AC1021/);
    expect(dxfText).toMatch(/\$INSUNITS\s+70\s+4/);
    expect(dxfText).toMatch(/\$LTSCALE\s+40\s+20/);
  });
  it("layers with the office colours and linetypes", () => {
    const doc = new DxfParser().parseSync(dxfText)!;
    const layers = doc.tables.layer.layers as Record<string, { colorIndex: number; lineType?: string }>;
    for (const [name, l] of Object.entries(LAYERS)) {
      expect(layers[name], name).toBeDefined();
      expect(layers[name]!.colorIndex, name).toBe(l.color);
    }
    expect(dxfText).toMatch(/AcDbLayerTableRecord\s+2\s+S-CONC-COVR\s+70\s+0\s+62\s+8\s+6\s+DASHED/);
  });
  it("two sections, 12 filled bars each, ties, dims, table text", () => {
    const doc = new DxfParser().parseSync(dxfText)!;
    const ents = doc.entities as { type: string; layer: string; text?: string }[];
    const count = (t: string, layer?: string) =>
      ents.filter((e) => e.type === t && (!layer || e.layer === layer)).length;
    expect(count("CIRCLE", "S-REBR-MAIN")).toBe(24);
    expect(dxfText.match(/\nHATCH\n/g)!.length).toBe(24);
    expect(count("DIMENSION", "S-DIMS")).toBe(6);
    const texts = ents.filter((e) => e.type === "TEXT").map((e) => e.text);
    for (const t of ["C-01A", "SECTION AT Lo", "SECTION AT Lc", "MAIN BARS: 12 - %%c20", "TIES", "LOC.", "SPACING", "@Lo", "@Lc", "@Lj", "So", "Sc", "Sj"])
      expect(texts, t).toContain(t);
    // Lo: hoop (2 rings + 2 tails) + 2 X + 1 Y cross-ties; Lc: hoop only.
    expect(count("LWPOLYLINE", "S-REBR-XTIE")).toBe(3);
    expect(count("LWPOLYLINE", "S-REBR-TIES")).toBe(4);
    expect(count("LWPOLYLINE", "S-REBR-TIES-MID")).toBe(4);
    expect(texts).toContain(`${design.adopted.sEnd}`);
    expect(texts).toContain(`${design.adopted.sMid}`);
  });
  it("hoop geometry by hand: Ø16 centreline 400 − 2·40 − 16 = 304 wide, bend radius 6db/2 + db/2 = 56", () => {
    const hoop = drawing.prims.filter((p) => p.t === "poly" && p.layer === "S-REBR-TIES");
    // Outer ring: half width 152 + 8 = 160 → x from −160 to 160 (first section at x = 0).
    const xsOuter = hoop.flatMap((p) => (p.t === "poly" ? p.v.map((v) => v.p[0]) : []));
    expect(Math.min(...xsOuter)).toBeCloseTo(-160, 6);
    expect(Math.max(...xsOuter)).toBeCloseTo(160, 6);
    // Corner arcs carry bulge tan(90°/4).
    const bulges = hoop.flatMap((p) => (p.t === "poly" ? p.v.map((v) => v.bulge ?? 0) : [])).filter(Boolean);
    expect(bulges.every((b) => Math.abs(Math.abs(b) - Math.tan(Math.PI / 8)) < 1e-9)).toBe(true);
  });
  it("cross-tie 135° tail length = max(6db, 75) = 96 for Ø16", () => {
    const x = drawing.prims.find((p) => p.t === "poly" && p.layer === "S-REBR-XTIE");
    expect(x).toBeDefined();
    // The first two vertices of the left outline are the 135° tail (offset by db/2).
    const v = x!.t === "poly" ? x!.v : [];
    expect(Math.hypot(v[1]!.p[0] - v[0]!.p[0], v[1]!.p[1] - v[0]!.p[1])).toBeCloseTo(96, 6);
  });
  it("90° crosstie end of 6db when the ACI 318-14 / NSCP 2015 basis is chosen", () => {
    const d90 = columnSectionDrawing({ input, tie, design, hookBasis: "aci14x90", title: "C-01A" });
    const x = d90.prims.find((p) => p.t === "poly" && p.layer === "S-REBR-XTIE");
    const v = x!.t === "poly" ? x!.v : [];
    const last = v.findIndex((q, i) => i > 0 && q.bulge === undefined && v[i - 1]!.bulge !== undefined);
    expect(last).toBeGreaterThan(0);
    const lengths = v.slice(0, -1).map((q, i) => Math.hypot(v[i + 1]!.p[0] - q.p[0], v[i + 1]!.p[1] - q.p[1]));
    expect(lengths.some((l) => Math.abs(l - 96) < 1e-6)).toBe(true); // 6·16 = 96 (also = 135° tail here)
    expect(sectionDrawingToDxf(d90)).toContain("S-REBR-XTIE");
  });
  it("passes an independent ezdxf audit (if available) and renders to SVG", () => {
    const svg = sectionDrawingToSvg(drawing);
    expect(svg).toContain("SECTION AT Lo");
    expect(svg).toContain("Ø");
    const dir = mkdtempSync(join(tmpdir(), "nola-dxf-"));
    const file = join(dir, drawing.fileName);
    writeFileSync(file, dxfText);
    if (process.env.CAD_OUT) {
      writeFileSync(join(process.env.CAD_OUT, drawing.fileName), dxfText);
      writeFileSync(join(process.env.CAD_OUT, "section.svg"), svg);
    }
    let out = "";
    try {
      out = execFileSync(
        "python3",
        ["-c", "import sys,ezdxf\nfrom ezdxf import recover\ndoc,a=recover.readfile(sys.argv[1])\nb=doc.audit()\nprint(doc.dxfversion,len(a.errors),len(a.fixes),len(b.errors),len(b.fixes))", file],
        { encoding: "utf8" },
      );
    } catch {
      return; // ezdxf not installed: structural checks above still apply
    }
    expect(out.trim()).toBe("AC1021 0 0 0 0");
  });
});
