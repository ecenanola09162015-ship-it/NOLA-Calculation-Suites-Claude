# Stairs benchmark SB-1

Independent ACI 318-19 hand calculation for the Stairs module (engine checked: see the workbook's Comparison sheet).

- **Geometry:** dog-leg, 2 × 13 risers, R 153.85 mm, T 340 mm, waist and landing 200 mm, width 1.8 m, mid landing 1,460 mm (MDM stair geometry with a corrected design basis).
- **Supports:** flight 1 runs from a footing on soil (pinned) to the landing beam (pinned); flight 2 runs from the landing beam (pinned) to the floor beam (fixed).
- **Materials and loads:** f′c 27.6 MPa, fy 414 MPa, SDL 1.0 kPa, LL 4.8 kPa; combinations 1.2D + 1.6L and 1.4D.

| File                        | Content                                                                                                                                                                                                                                   |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Stairs_Benchmark_SB1.xlsx` | Inputs, loads, section checks and footing as live Excel formulas; frame and deflection results from `hand.py`; side-by-side comparison with the module (46 values, tolerance ±2 % forces / ±1 % capacities); findings for engineer review |
| `hand.py`                   | Frame solved by the force method (virtual work, numerical integration), written separately from the module's stiffness solver. Run `python3 hand.py` to regenerate `hand.json`                                                            |

The regression test `packages/calc-core/test/stair-benchmark.test.ts` pins the module to these hand values at a tolerance of 0.5 %.

**Not independent:** both use the same plan-load convention and the same thrust-envelope assumption (Findings 2 and 6 in the workbook).
