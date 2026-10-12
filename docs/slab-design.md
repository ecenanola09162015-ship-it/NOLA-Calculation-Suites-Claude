# Rectangular slab design development pilot

The Slab Design launcher opens a live rectangular slab workspace inside the project explorer. The shared calculation engine lives in `packages/calc-core`; the web interface, authenticated save endpoint and print report consume the same versioned inputs. Saved slabs are marked `verification-required`.

## Supported inputs and drawings

- ACI 318-19 calculation basis. Selecting NSCP 2015 retains that explicit basis by designer choice; it does not certify separate NSCP compliance. BS EN 1992 and AS 3600 remain disabled future options.
- Automatic one-way classification at long/short span ratio >= 2; otherwise two-way. Uniform gravity loading only, with each edge idealized as Fixed or Pinned. Spans are the analysis dimensions between idealized support lines.
- Separate top, bottom and side clear covers. Bar centerline elevation `z` is measured above the slab soffit. Short-direction bars automatically occupy the outer tension layer; long-direction bars clear the active short layers. Manual overrides remain available and are checked for cover and layer interference.
- Blue MAIN BARS continue across the panel. Orange EXTRA BARS terminate at designer-entered cutoffs, while being distributed across the full transverse panel width. Top extras act at Fixed supports; bottom extras act within the selected midspan interval. Long-direction extras are excluded for one-way slabs.
- Entered spacing is a maximum. The finite panel grid distributes bars evenly and staggers extras; the report lists actual pitch, count, elevation and steel area. Cutoff lengths are percentages of the analysis span. They are not automatically certified anchorage lengths.
- Bottom and top plans plus Section A-A along the short span and Section B-B along the long span update from the inputs. Support dimensions and thickness are schematic; drawings are not fabrication details.

## Analysis and checks

One-way moments and gross immediate deflection use the exact uniformly loaded beam solution for Pinned/Pinned, Fixed/Fixed and Fixed/Pinned ends. Two-way analysis uses an elastic Kirchhoff plate with an 8 x 8 polynomial Ritz basis, exact entered aspect ratio and Poisson ratio, and 18-point Gaussian integration. This replaces the workbook's rounded coefficient lookup; it is not the ACI Direct Design Method or Equivalent Frame Method.

Flexure uses strain compatibility and the ACI rectangular compression block on a one-metre strip, with individually active tensile layers, strain-dependent phi and tension-control screening. Compression-face reinforcement is conservatively excluded from capacity. DCR is factored moment divided by phi Mn. Extra-bar cutoff boundaries are sampled on both sides so reinforcement outside the active length is not counted.

Detailing screens minimum main steel (ACI 318-19 Tables 7.6.1.1/8.6.1.1: 0.0020 gross strip area for fy < 420 MPa, max(0.0018·420/fy, 0.0014) for fy ≥ 420 MPa), minimum clear spacing, maximum slab spacing, concrete cover, layer clashes and straight-bar development/cutoff length. One-way shear uses the ACI 318-19 no-stirrup expression including reinforcement ratio and size effect. Two-way local plate shear is sampled at a depth from the idealized support line and requires independent review, particularly near corners.

Spacing suggestions search the largest practical main-bar spacing on a 25 mm grid at the entered diameter, retaining existing extras. They check flexure, minimum steel, tension control and combined spacing. They never modify inputs and are not whole-design optimizations; shear, anchorage and serviceability must be rechecked.

Excel paste requires explicit headers `ID`, `DeadFactor`, `LiveFactor`, `ServiceLiveFactor`, accepts tab or comma separation, and previews rows before replace/append. Dead load includes self weight, superimposed dead load and partitions. Strength uses entered dead/live factors; immediate deflection uses D + the entered service-live factor times L. Invalid rows are rejected atomically.

## Limits requiring review

`SCREENING PASS` reports only the implemented checks at the selected DCR and deflection limits. It does not establish complete code compliance. Deflection control follows ACI 318-19: if h ≥ hmin (Table 7.3.1.1 for one-way with ℓ = centre-to-centre span and the 7.3.1.1.1 fy modifier; Table 8.3.1.2 with αfm > 2.0 assumed for edge-supported two-way panels, ℓn = clear long span, 90 mm floor) calculated deflection is waived and any cracked-deflection exceedance is reported as information only. If h < hmin, immediate deflection is scaled from the elastic solution by Ig/Ie, with Ie per Table 24.2.3.5 using the short-direction strip (lesser of the midspan value, 24.2.3.7, and the average with continuous-support sections, 24.2.3.6; compression steel neglected in Icr), and must not exceed the selected L/divisor. Sustained-load and long-term deflection are not evaluated. Pinned edges of two-way panels are flagged for the 8.3.1.2.1 edge-beam / +10% thickness requirement. Support anchorage, hooks, laps and complete curtailment remain review items. There are no checks for openings, concentrated loads, punching shear, column-supported slabs, corner torsion reinforcement, pattern live loading, redistribution, seismic detailing or fire resistance. A designer DCR limit above 1.00 does not establish code strength compliance.

Every DCR check carries its ACI 318-19 clause from `packages/calc-core/src/code-clauses.ts` (single registry); the review panel and the complete PDF print it in a Code Reference column.

Engineering acceptance requires a licensed-code clause review and independently checked project examples before design use. The printable report preserves these limits and project Prepared By, Checked By and Approved By fields.

## Verification

Automated tests compare simply supported plate results against an independently summed Navier series for several aspect ratios, clamped square coefficients against published classical plate values, all 16 support combinations for finite solutions, and one-way solutions against closed-form values. Tests also cover axis rotation, selected reinforcement and phi Mn, cover overrides, cutoff activity, combined spacing, shear reinforcement-ratio dependence, Excel parsing, recommendation non-mutation, saved UI restoration and save-endpoint validation.

The production build, TypeScript, lint and automated tests are required checks. Endpoint tests mock persistence; they do not prove a live signed-in database save/reload. A browser review of responsive drawings, PDF pagination and the authenticated end-to-end workflow remains part of pilot acceptance.

Reference context: [ACI structural analysis FAQ](https://www.concrete.org/frequentlyaskedquestions.aspx?faqid=910), [StructurePoint ACI 318-14 to ACI 318-19 changes](https://www.structurepoint.org/pdfs/StructurePoint_Software_Impact_of_changes_from_ACI_318-14_to_ACI-318-19.pdf). These summaries do not replace the licensed design code.
