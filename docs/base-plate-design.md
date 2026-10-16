# Steel column base plate & anchor rod design pilot

The Base Plate launcher card (Steel) opens a live workspace inside the project explorer. The engine lives in `packages/calc-core` (`modules/base-plate.ts`, `modules/base-plate-anchors.ts`, `anchor-rods.ts`, shared `steel-shapes/`); the web workspace, PDF report and save endpoint consume the same versioned inputs (`kind: "base-plate"`, `version: 1`). Saved base plates are `verification-required`. Engine `base-plate-0.1.0`.

## Basis

- AISC 360-22 J8 bearing (φc = 0.65, A2 = largest geometrically similar concentric area, √(A2/A1) ≤ 2), J2.4 fillet weld (φ = 0.75), J9 → ACI 318 for anchor rods.
- AISC Design Guide 1, 3rd Ed. (2024) Ch. 4: uniform bearing stress block; axial (m, n, λn′), small moment (Y = N − 2e), large moment (Y and Tu from the quadratic, rods on the outer tension line at f), bearing interface ℓ = max(m, n) with fp Y(ℓ − Y/2) when Y < ℓ, tension interface x = f − d/2 + tf/2 with a 45° effective width per rod.
- ACI 318-19 Ch. 17: steel (17.6.1, 17.7.1 with grout ×0.80), breakout in tension with h′ef for ≥ 3 near edges (17.6.2), pullout (17.6.3), side-face blowout (17.6.4), adhesive bond and sustained tension (17.6.5, 17.5.2.2), breakout in shear with narrow-member ca1 (17.7.2), pryout (17.7.3), interaction (17.8), minimum geometry (17.9), seismic 0.75 and option (a) ductility (17.10), shear lug (17.11). φ per Table 17.5.3 with Condition A/B and post-installed category.
- AISC Manual 16th Ed. Table 14-2 holes and washers (≥ 2-1/2 in rule; untabulated sizes "derived" and labelled).
- NSCP 2015 is recorded as the project standard; calculation follows the editions above (NSCP Sec. 510 / 417 are AISC 360-10 / ACI 318-14 based).

## Inputs

Column from the shared AISC Shapes Database v16.0 picker (W, HP, M, S, HSS rect/square, HSS round, PIPE) with orientation 0°/90°; plate, grout, concentric pedestal (f′c psi dropdown shared with Slab/Column); anchor type (cast-in headed / hooked / stud, adhesive, four mechanical types), specification and size dropdowns with automatic Fy, Fu, futa and ductility; grid or perimeter layout; hef; hole (Table 14-2 or custom); welded plate washers; post-installed product record (ESR/ETA: category, kc, τ, Np, cac, cmin, smin); shear transfer by rods, friction (μ, compression only, not for E) or shear lug; weld; SDC and ACI 17.10.5.3 option; factored combinations with Excel paste (ID, Pu, Mx, My, Vx, Vy, Seismic).

Sign convention: Pu positive in compression; +Mx moves the resultant to +Y (rods on −Y in tension); +My to +X; +Vx towards the east edge, +Vy towards north.

## Engine assumptions (flagged in the report)

- Biaxial small eccentricity: uniform bearing on (Bx − 2ex)(By − 2ey). Biaxial large eccentricity: DG1 per axis with full Pu and rod tensions superposed (conservative); to be compared with the DG1 3rd Ed. biaxial procedure once the guide's equations are confirmed.
- Net uplift: elastic rod group, no bearing.
- λn′ for round sections uses D/4 (I and rectangular HSS: √(d bf)/4).
- Without welded washers half the rods resist shear and breakout is checked from the front row; with welded washers all rods and the farthest row (ACI 17.7.2.1(b)).
- Shear-lug breakout uses the 17.7.2.2.1 upper-bound Vb; lug welds are not checked. Shear parallel to an edge and ψc,V = 1.2 are not evaluated.
- Pedestal reinforcement, embedded/blockout bases, stiffened plates and plate flexibility are out of scope.

## Shapes database

`tools/shapes/import_aisc_shapes.py` builds `packages/calc-core/src/steel-shapes/data/*.json` (1,660 shapes, SI) from the AISC v16.0 tables packaged in `steelpy` 1.1.1 (Apache-2.0) with metric labels from the AISC v15.0 file; `provenance.json` records checksums. The ~130 kB index loads on first focus of the picker; a family file only when a shape is selected. Redistribution of AISC data needs AISC's written permission before commercial release (decision D-03).

## Drawings, 3D and report

`lib/base-plate-drawing.ts` produces the plan and Sections A-A / B-B as SVG for both the Layout tab and the PDF (true scale, DG1 critical sections, bearing zone, tension rods, loads). The 3D tab (three.js, loaded with the tab) shows pedestal, grout, plate with holes, column stub from the shape profile, rods with nuts and washers, hooks / adhesive / expansion ends, shear lug, load and moment arrows, a breakout prism and a see-through toggle; a snapshot can be added to the Complete PDF. `lib/base-plate-steps.ts` prints the step-by-step calculation in the Calculations tab and the PDF.

## Verification

`packages/calc-core/test/base-plate.test.ts` checks the engine against `tools/benchmarks/base_plate_reference.py` (independent Python): J8 bearing, DG1 axial / small / large moment (Y, Tu, both interfaces), ACI steel, h′ef breakout, ψec, pullout, shear breakout, interaction, bond, seismic 0.75, Table 14-2, the user's workbook steel values and its geometry bug (E8), sizing non-mutation and the shapes database. `apps/web/test/base-plate-*.test.tsx` cover the workspace, drawings, 3D model, PDF, save API and a real-browser run. AISC DG1 3rd Ed. worked examples are to be added as benchmarks once the guide is available.
