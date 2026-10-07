# RC column development build v0.1

The first numerical module implements SI-unit section strength for short, rectangular tied columns with centrally symmetric reinforcement. The authenticated launcher retains its project explorer. A saved column stores inputs and the section-check acknowledgement; results are recomputed when reopened. Inputs initialize from the user's `20260825_ACI_Rectangular_Column_Design_Excel2016_INTERACTION_CURVES_FIXED_FINAL.xlsx` example.

## Code status

| Choice     | Status                                                                                                      |
| ---------- | ----------------------------------------------------------------------------------------------------------- |
| ACI 318-19 | Development section calculation, `verification-required`                                                    |
| NSCP 2015  | Inputs can be saved; numerical output blocked pending licensed provision mapping and independent benchmarks |
| BS EN 1992 | Disabled, Future Development                                                                                |
| AS 3600    | Disabled, Future Development                                                                                |

An ACI calculation is never relabeled as NSCP. The old public `calculateRcColumn` interface-only contract remains unchanged; the new explicit development engine is `analyzeRectangularColumn`.

## Engineering basis

All lengths are mm, material stresses MPa, axial forces kN, and moments kN·m. Pu is compression-positive. Reinforcement coordinates originate at the geometric centroid, x right and y up. Positive Mx corresponds to compression at the positive-y face; positive My corresponds to compression at the positive-x face. Each moment axis has positive and negative compression-face curves.

- ACI 318-19 22.2.2.1: ultimate concrete compression strain 0.003; plane sections and elastic-perfectly-plastic reinforcement.
- 22.2.2.4 and Table 22.2.2.4.3: equivalent concrete stress block 0.85 f′c, β₁ = 0.85 through 28 MPa, reducing 0.05 per 7 MPa to a minimum 0.65.
- Table 21.2.2: tied-column φ = 0.65 for εt ≤ fy/Es, a linear transition to 0.90 at εt = fy/Es + 0.003.
- Table 22.4.2.1: maximum reduced compressive strength 0.80 × 0.65 × P₀; P₀ = 0.85 f′c(Ag − Ast) + fy Ast.
- Bars are concentrated areas at their centers. Concrete displaced by a bar is subtracted when its center is inside the compression block. This approximation has small force discontinuities at a block crossing; no root is accepted across a discontinuity without force-equilibrium tolerance.
- At each included Pu, signed-axis design moments are extracted by curve crossing and bisection (55 iterations), accepting axial-force residual ≤ max(0.01 kN, |Pu| × 10⁻⁶).
- Biaxial screening follows the workbook's linear |Mux|/φMnx(Pu) + |Muy|/φMny(Pu) ≤ 1. This is a screening approximation, not a complete biaxial strain-compatibility surface or a claim of ACI biaxial compliance.

The engine excludes slenderness, P–Δ, shear, seismic confinement, tie spacing, development, lap splices, and complete detailing checks. The user must separately assess slenderness/second-order demand suitability before calculating. Current input limits: f′c 17–80 MPa, fy 200–550 MPa, Es 100,000–250,000 MPa, fy/Es ≤ 0.003, section dimensions ≤10,000 mm, 4–80 bars, and 1–500 load combinations. Geometry must contain every bar without overlap; centrally symmetric matching bar pairs are required. Steel ratio and declared cover are warnings rather than complete detailing certification.

## Workbook audit findings

The provided example contains 600 × 800 mm concrete, f′c35, fy420, Es200000, twelve mixed 25/20 mm bars, and five signed load combinations. Ast = 4476.769531 mm²; P₀ = 16027.059310 kN; φPn,max = 8334.070841 kN. Its steel ratio is 0.93266%, below 1%. Bar centers are 50 mm from some faces despite 40 mm clear cover plus 10 mm ties, so the declared cover is not satisfied. These inputs are preserved and warnings displayed rather than silently changed.

Some workbook strength-reduction cells and outputs are cached constants instead of live formulas. The app recalculates strain-dependent φ and does not treat those stored values as authoritative. The original workbook is not modified.

## Excel clipboard and draft behavior

Use the Paste from Excel area or paste tab-separated cells directly into the load table. Supported layouts are Pu/Mux/Muy; Label/Pu/Mux/Muy; or LC No/Description/Pu/Mux/Muy/[Include]. Recognized workbook headers allow columns to be mapped by name. Decimal-point numbers, correctly grouped thousands separators, signed/scientific numbers, and parenthesized negative values are accepted. Include supports Yes/No, True/False, and 1/0. Loads are already factored; no load combinations or unit conversions are generated.

Pasted cells are previewed before explicit Replace or Append. Invalid rows, duplicate labels, or a combined count over 500 prevent mutation. This release imports clipboard cells, not uploaded .xlsx workbooks. Engineering input changes invalidate displayed results. Print/PDF includes project preparer/checker/approver information and development warnings. Those names are metadata, not recorded engineering approvals or signatures.

The save API requires a signed-in user, same-origin JSON, valid UUIDs, a bounded request, and a validated versioned RC payload. Database insert/update is limited to the owner's project and matching draft project/module. Stored status remains `verification-required`, never `verified`. SQL details and credentials are not exposed in errors.

## Verification evidence

- Workbook analytical Ast, P₀, and φPn,max agree within 10⁻⁵ kN (area within 10⁻⁶ mm²).
- Independent published reference: StructurePoint, _Interaction Diagram — Tied Reinforced Concrete Column Design Strength (ACI 318-19)_, May 24, 2022, summary/control points. https://structurepoint.org/publication/pdf/Interaction-Diagram-Tied-Reinforced-Concrete-Column-Design-Strength-ACI-318-19.pdf
- The reference's 16 in square, eight #9 (nominal 1 in²) section is converted to SI. Axial cap, four strain-control-point forces/moments, pure bending, and pure tension agree within 2%. This tolerance covers the independently tabulated SI β₁ thresholds (28/7 MPa) versus the example's imperial 4000/1000 psi thresholds; SI-converted f′c gives β₁≈0.80376 rather than 0.80. The general 2% benchmark tolerance does not weaken the force-equilibrium root tolerance.
- Primary ACI-published explanation of Table 21.2.2: https://www.concrete.org/publications/getarticle.aspx?m=icap&pubID=51740277
- Regression checks cover φ/β₁ boundaries, signed symmetry, excessive axial/moment demands, excluded rows, invalid geometry, NSCP blocking, Excel formats/atomic rejection, payload validation, API authentication/errors, and rendered code choices/diagrams.
- Repository lint/typechecking, 18 automated tests, and web production build pass. UI browser interaction/print/mobile verification and authenticated live save/reload remain outstanding: the local headless browser binary was unavailable and its download failed. Server-render tests are not substitutes for those browser checks.

Independent engineering review against licensed ACI/NSCP clauses, additional benchmark cases (including full biaxial analysis), and a signed release decision remain required before changing status to `verified`. Web implementation is complete for this development milestone; desktop/mobile integration and installers are separate future milestones.
