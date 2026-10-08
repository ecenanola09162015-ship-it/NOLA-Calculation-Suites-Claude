# Optional column quantity estimate

The column workspace has an Enable Quantity Estimate checkbox. Disabled estimates retain inputs but do not produce quantities or appear in the print report. Estimate edits do not invalidate or change structural section capacities. Optional quantity data is saved within the existing version-1 column draft; old drafts remain supported.

Steel unit weight is circular area in square metres multiplied by 7850 kg/m³. Longitudinal quantities follow the current designed bar diameters/count and section fy, measured over the selected floor-to-floor height. Concrete is gross b × h × height, including the upper beam-column joint. Identical-column count scales both steel and concrete; kg/m³ uses total steel and gross concrete.

Editable contiguous spacing zones cover the whole height and must have a boundary at the bottom of the upper beam joint. First/last tie offsets are explicit. Each zone fits an evenly spaced grid at or below the entered maximum spacing. Shared zone boundaries are counted once and assigned to the upper zone, including its diameter and grade.

Each full-section rectangular hoop contributes two legs parallel to X and two parallel to Y. Additional legs are individual full-width/depth cross-ties. Multiple hoops are assumed full-section, not nested/overlapping hoop geometry. Schematic arrangements require designer review against actual longitudinal bar positions; they do not verify lateral restraint or confinement.

Hook choices are designer 8db at each physical end, or ACI 318-19 135° at both ends. The automatic mode supports 9.5–25.4 mm transverse bars, uses max(6db, 76.2 mm) straight extension (conservative conversion of the US edition's 3-inch minimum), and displays a minimum inside bend diameter of 4db through 16 mm and 6db above 16 mm. Nonstandard diameters are mapped conservatively to these two size classes. References: Table 25.3.2, §§25.3.4–25.3.5. No 90° cross-tie exception is used. SI code edition/bar designation and actual fabrication practice must be confirmed by the designer.

IMPORTANT: preliminary lengths are centerline straight-body dimensions plus hook extensions. Bend arcs, closure shape, fit around longitudinal bars and fabrication tolerances are excluded. This is not a final bar bending schedule. Splices, longitudinal anchorage, couplers and procurement waste are excluded. Hook rules alone do not establish seismic design: Chapter 18 zone lengths, spacing, supported bars, Ash and joint reinforcement remain separate engineering checks.

The report includes unfiltered totals, a detailed diameter/fy/function-filtered schedule and a filtered subtotal. Counts include all identical columns; elevation levels show one column. Tests check independent unit weights and lengths, shared-boundary counting, quantity scaling, zone validation, hook minima, old-draft compatibility and disabled/report rendering.

Each zone also accepts independently checked full cutting-length overrides for hoops, X cross-ties and Y cross-ties. These replace the automatic preliminary length and allow designer-supplied bend and closure details to be reflected in quantities. Blank overrides restore automatic estimation.
