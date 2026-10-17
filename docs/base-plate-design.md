# Steel column base plate & anchor rod design pilot

The Base Plate launcher card (Steel) opens a live workspace inside the project explorer. The engine lives in `packages/calc-core` (`modules/base-plate.ts`, `modules/base-plate-anchors.ts`, `anchor-rods.ts`, shared `steel-shapes/`); the web workspace, PDF report and save endpoint consume the same versioned inputs (`kind: "base-plate"`, `version: 1`). Saved base plates are `verification-required`. Engine `base-plate-0.3.0`.

## Basis

- AISC 360-22 J8 bearing (φc = 0.65, A2 = largest geometrically similar concentric area, √(A2/A1) ≤ 2), J2.4 fillet weld (φ = 0.75), J9 → ACI 318 for anchor rods.
- AISC Design Guide 1, 3rd Ed. (2024) Ch. 4: uniform bearing stress block; axial (m, n, λn′), small moment (Y = N − 2e), large moment (Y and Tu from the quadratic, rods on the outer tension line at f), bearing interface ℓ = max(m, n) with fp Y(ℓ − Y/2) when Y < ℓ, tension interface x = f − d/2 + tf/2 with a 45° effective width per rod.
- ACI 318-19 Ch. 17: steel (17.6.1, 17.7.1 with grout ×0.80), breakout in tension with h′ef for ≥ 3 near edges (17.6.2), pullout (17.6.3), side-face blowout (17.6.4), adhesive bond and sustained tension (17.6.5, 17.5.2.2), breakout in shear with narrow-member ca1 (17.7.2), pryout (17.7.3), interaction (17.8), minimum geometry (17.9), seismic 0.75 and option (a) ductility (17.10), shear lug (17.11). φ per Table 17.5.3 with Condition A/B and post-installed category.
- AISC Manual 16th Ed. Table 14-2 holes and washers (≥ 2-1/2 in rule; untabulated sizes "derived" and labelled).
- NSCP 2015 is recorded as the project standard; calculation follows the editions above (NSCP Sec. 510 / 417 are AISC 360-10 / ACI 318-14 based).

## Design codes and method (engine 0.2.0)

Two primary codes: **Concrete** (ACI 318-19, or NSCP 2015 project on the ACI 318-19 basis) and **Steel** (AISC 360-22 + DG1, or NSCP 2015 project on the AISC 360-22 basis); other editions are listed as Future Development. Drafts saved with one `code` open with both codes set from it.

**LRFD / ASD** (shared `steel-design-method.ts`, reused by later steel modules): LRFD applies φ (bearing 0.65, plate 0.90, weld 0.75, friction 0.75) to factored combinations; ASD applies 1/Ω (2.31, 1.67, 2.00, 2.00) to service combinations (AISC 360-22 B3.2). ACI 318-19 has no ASD, so under ASD the anchor checks (Ch. 17, incl. lug bearing/breakout) use α × ASD demand against φRn, α = 1.6 by default (editable 1.4–2.0, printed in the report).

## Stiffeners (engine 0.3.0)

Layouts (Panel 02, plan thumbnails at true scale): none; I-shapes web-line (2), flange-tip (4), web-side (2), cross (web-line + web-side, 4); rectangular HSS mid-side (4); round HSS / pipe radial (4). Inputs: ts, hc (at the column), he (at the plate edge; 0 = triangle), corner snip, Fy, fillets to the column and to the plate (both sides), flexure section (stiffener alone, or tee with the plate), plate-panel method. Drafts saved before 0.3.0 open unstiffened; a layout that does not suit a new column family resets to none.

AISC DG1 3rd Ed. Sec. 3.1 puts stiffened bases outside its scope; the method is printed in the notes, steps and PDF:

- **Plate panels.** The DG1 zones (m beyond 0.95d, n beyond 0.80bf; HSS 0.95; round 0.80D) keep their critical lines as supported back edges; stiffeners add side supports. P3 (back + two stiffeners) and P2 (back + one stiffener) panels under the uniform bearing block (partial blocks clipped to the panel): (a) yield-line, default — families P3-A/B, P2-C1/C2, fixed supports m′ = m, × 1.10 corner allowance, never above the unstiffened cantilever; (b) Hillerborg simple strip method (45° to the nearest support, lower bound). Unstiffened zones and λn′ stay DG1.
- **Tension side.** DG1 Ex. 4.7-7: each rod bends the plate about its nearest support (DG1 column-face lever x, or a stiffener face, a = clear distance), 45° width 2a clipped to the support length; rods of one support share the union width.
- **Stiffener.** Cantilever bracket from the column face loaded by the strip-method share of bearing (width min(y, cap) each side, cap = b/2 for P3, b for P2) or by the rods assigned to it. Flexure at 19 sections along the taper: F11 rectangular bar (LTB with Lb = length, Cb 1.0, when the free edge is in compression) or F9 tee (effective plate 15εtp each side, EN 1993-1-5 9.1); shear yielding J4.2(a); hc/ts ≤ 0.56√(E/Fy) (engine rule); welds J2.4 — to the column √((V/2Lw)² + (6M/2Lw²)²), to the plate rod tension on one fillet over 2a with kds 1.5 (DG1 Ex. 4.7-7), bearing by contact (tee adds VQ/I).
- **Column.** Web-line stiffeners on I-shapes: J10.2 web local yielding and J10.3 web crippling at the member end, H = 1.5M/Lw over lb = Lw/2, k = tf. HSS walls, flange tips and webs out of plane are not calculated (note in the report). The column-to-plate weld is still checked without stiffener relief.

Checks: `stiffener-flexure`, `stiffener-shear`, `stiffener-slenderness`, `stiffener-weld-column`, `stiffener-weld-plate`, `stiffener-column`, `geo-stiffener-fit`, `geo-stiffener-clear` (washer/2 + weld). Fix in 0.3.0: the uplift 45° width now counts only rods in tension (was all rods of the line).

## Custom column sections

Column source is the AISC database or a custom section: built-up I/H (d, bf, tf, tw), rectangular/square box (H, B, t), round tube (OD, t) or solid bar (H, B; checked as a rectangle with t = B/2). Each maps to the engine families I / HSS-RECT / HSS-ROUND; A, weight, Ix and Iy are shown, invalid proportions (tf ≥ d/2, tw ≥ bf, t ≥ B/2, t ≥ OD/2) stop the analysis with a message, and the report marks the section "Custom (user input)".

## Inputs

Column from the shared AISC Shapes Database v16.0 picker (W, HP, M, S, HSS rect/square, HSS round, PIPE) with orientation 0°/90°; plate, grout, concentric pedestal (f′c psi dropdown shared with Slab/Column); anchor type (cast-in headed / hooked / stud, adhesive, four mechanical types), specification and size dropdowns with automatic Fy, Fu, futa and ductility; grid or perimeter layout; hef; hole (Table 14-2 or custom); welded plate washers; post-installed product record (ESR/ETA: category, kc, τ, Np, cac, cmin, smin); shear transfer by rods, friction (μ, compression only, not for E) or shear lug; weld; SDC and ACI 17.10.5.3 option; factored combinations with Excel paste (ID, Pu, Mx, My, Vx, Vy, Seismic).

Sign convention: Pu positive in compression; +Mx moves the resultant to +Y (rods on −Y in tension); +My to +X; +Vx towards the east edge, +Vy towards north.

## Engine assumptions (flagged in the report)

- Biaxial small eccentricity: uniform bearing on (Bx − 2ex)(By − 2ey). Biaxial large eccentricity: DG1 per axis with full Pu and rod tensions superposed (conservative); to be compared with the DG1 3rd Ed. biaxial procedure once the guide's equations are confirmed.
- Net uplift: elastic rod group, no bearing.
- λn′ for round sections uses D/4 (I and rectangular HSS: √(d bf)/4).
- Without welded washers half the rods resist shear and breakout is checked from the front row; with welded washers all rods and the farthest row (ACI 17.7.2.1(b)).
- Shear-lug breakout uses the 17.7.2.2.1 upper-bound Vb; lug welds are not checked. Shear parallel to an edge and ψc,V = 1.2 are not evaluated.
- Pedestal reinforcement, embedded/blockout bases and plate flexibility are out of scope; stiffened plates per the section above.

## Shapes database

`tools/shapes/import_aisc_shapes.py` builds `packages/calc-core/src/steel-shapes/data/*.json` (1,660 shapes, SI) from the AISC v16.0 tables packaged in `steelpy` 1.1.1 (Apache-2.0) with metric labels from the AISC v15.0 file; `provenance.json` records checksums. The ~130 kB index loads on first focus of the picker; a family file only when a shape is selected. Redistribution of AISC data needs AISC's written permission before commercial release (decision D-03).

## Drawings, 3D and report

`lib/base-plate-drawing.ts` (palette A "Engineering": concrete stipple, 45° steel hatching on cut steel, heavy / medium / light line weights) produces the plan and Sections A-A / B-B as SVG for both the Layout tab and the PDF (true scale, DG1 critical sections, bearing zone, tension rods, loads). The 3D tab (three.js, loaded with the tab) shows pedestal, grout, plate with holes, column stub from the shape profile, rods with nuts and washers, hooks / adhesive / expansion ends, shear lug, load and moment arrows, a breakout prism and a see-through toggle; a snapshot can be added to the Complete PDF. `lib/base-plate-steps.ts` prints the step-by-step calculation in the Calculations tab and the PDF.

## Verification

`packages/calc-core/test/base-plate.test.ts` checks the engine against `tools/benchmarks/base_plate_reference.py` (independent Python): J8 bearing, DG1 axial / small / large moment (Y, Tu, both interfaces), ACI steel, h′ef breakout, ψec, pullout, shear breakout, interaction, bond, seismic 0.75, Table 14-2, the user's workbook steel values and its geometry bug (E8), sizing non-mutation and the shapes database. `apps/web/test/base-plate-*.test.tsx` cover the workspace, drawings, 3D model, PDF, save API and a real-browser run. `packages/calc-core/test/base-plate-stiffeners.test.ts` checks the stiffener engine against `tools/benchmarks/base_plate_stiffener_reference.py` (numerical yield-line integration, strip loads, F11/J4.2/J2.4/J10) and AISC DG1 3rd Ed. Example 4.7-7 (a 3.00 in, be 6.00 in, Mr 51.9 kip-in, weld φRn 50.1 kips per rod). The other DG1 3rd Ed. worked examples are added with the DG1 alignment batch.
