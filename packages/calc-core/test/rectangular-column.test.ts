import { describe, expect, it } from "vitest";
import {
  analyzeRectangularColumn,
  columnCapacityAt,
  columnCurve,
  columnStrainState,
  tiedColumnPhi,
  columnBeta1,
  parseColumnLoads,
  columnDraftSchema,
  type RectangularColumnInput,
} from "../src";
const input: RectangularColumnInput = {
  code: "ACI 318-19",
  width: 600,
  depth: 800,
  fc: 35,
  fy: 420,
  es: 200000,
  cover: 40,
  tieDiameter: 10,
  bars: [
    [-250, -350, 25],
    [250, -350, 25],
    [-250, 350, 25],
    [250, 350, 25],
    [0, -350, 20],
    [-250, 0, 20],
    [250, 0, 20],
    [0, 350, 20],
    [-125, -350, 20],
    [125, -350, 20],
    [-125, 350, 20],
    [125, 350, 20],
  ].map(([x, y, diameter]) => ({ x: x!, y: y!, diameter: diameter! })),
  loads: [
    { id: "LC1", description: "", pu: 2400, mx: 150, my: 80, included: true },
  ],
};
describe("rectangular tied-column development engine", () => {
  it("matches workbook analytical axial values and surfaces layout warnings", () => {
    const result = analyzeRectangularColumn(input);
    expect(result.steelArea).toBeCloseTo(4476.769531365455, 6);
    expect(result.p0).toBeCloseTo(16027.05930961537, 6);
    expect(result.axialCap).toBeCloseTo(8334.070841, 5);
    expect(result.warnings.some((w) => w.includes("1–8%"))).toBe(true);
    expect(result.warnings.some((w) => w.includes("clear cover"))).toBe(true);
    expect(result.status).toBe("verification-required");
  });
  it("uses ACI 2019 strain-dependent phi and SI beta boundaries", () => {
    expect(tiedColumnPhi(0.0021, 420, 200000)).toBe(0.65);
    expect(tiedColumnPhi(0.0036, 420, 200000)).toBeCloseTo(0.775, 10);
    expect(tiedColumnPhi(0.0051, 420, 200000)).toBe(0.9);
    expect(columnBeta1(28)).toBe(0.85);
    expect(columnBeta1(35)).toBeCloseTo(0.8, 10);
    expect(columnBeta1(80)).toBe(0.65);
  });
  it("preserves signed symmetric capacities and detects excessive demand", () => {
    const plus = columnCapacityAt(input, columnCurve(input, "x", 1), 2400)!;
    const minus = columnCapacityAt(input, columnCurve(input, "x", -1), 2400)!;
    expect(plus).toBeCloseTo(minus, 8);
    const r = analyzeRectangularColumn({
      ...input,
      loads: [
        { ...input.loads[0]!, mx: 10000 },
        { ...input.loads[0]!, id: "excluded", included: false },
        { ...input.loads[0]!, id: "axial", pu: 9000, mx: 0, my: 0 },
      ],
    });
    expect(r.checks.map((x) => x.outcome)).toEqual([
      "outside-screening-envelope",
      "not-checked",
      "outside-screening-envelope",
    ]);
    expect(
      columnCapacityAt(input, columnCurve(input, "x", 1), 9000),
    ).toBeNull();
  });
  it("uses identical ACI equations for the NSCP project workflow and exposes the basis", () => {
    const aci = analyzeRectangularColumn(input);
    const nscp = analyzeRectangularColumn({ ...input, code: "NSCP 2015" });
    expect(nscp).toEqual(aci);
    expect(nscp.calculationBasis).toBe("ACI 318-19");
    expect(nscp.status).toBe("verification-required");
  });
  it("rejects overlap and no included loads", () => {
    expect(() =>
      analyzeRectangularColumn({
        ...input,
        bars: [...input.bars, input.bars[0]!],
      }),
    ).toThrow("overlaps");
    expect(() => analyzeRectangularColumn({ ...input, loads: [] })).toThrow(
      "at least one",
    );
  });
  it("matches independent StructurePoint ACI 318-19 example after SI conversion within 2%", () => {
    // Published example: 16in square, eight #9 (1in²), center cover 2.5in,
    // fc=5ksi fy=60ksi Es=29,000ksi. SI beta=.80375 differs from IP beta=.80.
    const d = Math.sqrt((4 * 645.16) / Math.PI);
    const benchmark: RectangularColumnInput = {
      ...input,
      width: 406.4,
      depth: 406.4,
      fc: 34.4737865,
      fy: 413.685438,
      es: 199947.9617,
      bars: [-139.7, -139.7 / 3, 139.7 / 3, 139.7].flatMap((x) =>
        [-139.7, 139.7].map((y) => ({ x, y, diameter: d })),
      ),
    };
    const kNPerKip = 4.4482216153,
      kNmPerKipFt = 1.3558179483;
    const near = (actual: number, expected: number) =>
      expect(Math.abs(actual / expected - 1)).toBeLessThan(0.02);
    near(analyzeRectangularColumn(benchmark).axialCap, 797.7 * kNPerKip);
    const states = [
      { e: 0, p: 622.3, m: 169.86 },
      { e: benchmark.fy / benchmark.es / 2, p: 421.9, m: 220.05 },
      { e: benchmark.fy / benchmark.es, p: 270.9, m: 250.77 },
      { e: benchmark.fy / benchmark.es + 0.003, p: 171.6, m: 286.75 },
    ];
    for (const row of states) {
      const c = (0.003 * 342.9) / (0.003 + row.e),
        s = columnStrainState(benchmark, "x", 1, c);
      near(s.designP, row.p * kNPerKip);
      near(s.designM, row.m * kNmPerKipFt);
    }
    near(
      columnCapacityAt(benchmark, columnCurve(benchmark, "x", 1), 0)!,
      213.91 * kNmPerKipFt,
    );
    near(analyzeRectangularColumn(benchmark).tensionCap, -432 * kNPerKip);
  });
});
describe("Excel clipboard imports", () => {
  it("reads workbook headers and signed values", () => {
    const result = parseColumnLoads(
      "LC No\tDescription\tPu (kN)\tMux (kN-m)\tMuy (kN-m)\tInclude?\n1\tWind\t2,400\t(150)\t8e1\tYes\n2\tOther\t1000\t0\t-20\tNo",
    );
    expect(result[0]).toMatchObject({
      pu: 2400,
      mx: -150,
      my: 80,
      included: true,
    });
    expect(result[1]?.included).toBe(false);
  });
  it("supports three/four/five columns and rejects malformed or duplicate rows atomically", () => {
    expect(parseColumnLoads("1000\t50\t-20")[0]?.id).toBe("LC1");
    expect(parseColumnLoads("Wind\t1000\t50\t-20")[0]?.id).toBe("Wind");
    expect(parseColumnLoads("1\tWind\t1000\t50\t-20")[0]?.description).toBe(
      "Wind",
    );
    for (const text of [
      "1000\tbad\t20",
      "12,34\t50\t20",
      "LC1\t1000\t50\t20\nLC1\t2000\t60\t20",
    ])
      expect(() => parseColumnLoads(text)).toThrow();
  });
  it("validates save payload and rejects nonfinite demand", () => {
    expect(
      columnDraftSchema.safeParse({
        kind: "rc-column",
        version: 1,
        input,
        scopeConfirmed: true,
      }).success,
    ).toBe(true);
    expect(
      columnDraftSchema.safeParse({
        kind: "rc-column",
        version: 1,
        input: { ...input, loads: [{ ...input.loads[0], pu: NaN }] },
        scopeConfirmed: true,
      }).success,
    ).toBe(false);
  });
});
