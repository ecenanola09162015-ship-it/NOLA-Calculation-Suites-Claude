# Optional column quantity estimate

The column workspace has an Enable Quantity Estimate checkbox. Disabled estimates retain inputs but do not produce quantities or appear in the print report. Estimate edits do not invalidate or change structural section capacities. Optional quantity data is saved within the existing version-1 column draft; old drafts remain supported.

Steel unit weight is circular area in square metres multiplied by 7850 kg/m³. Longitudinal quantities follow the current designed bar diameters/count and section fy, measured over the selected floor-to-floor height. Concrete is gross b × h × height, including the upper beam-column joint. Identical-column count scales both steel and concrete; kg/m³ uses total steel and gross concrete.

Editable contiguous spacing zones cover the whole height and must have a boundary at the bottom of the upper beam joint. First/last tie offsets are explicit. Each zone fits an evenly spaced grid at or below the entered maximum spacing. Shared zone boundaries are counted once and assigned to the upper zone, including its diameter and grade.

Each full-section rectangular hoop contributes two legs parallel to X and two parallel to Y. Additional legs are individual full-width/depth cross-ties. Multiple hoops are assumed full-section, not nested/overlapping hoop geometry. Schematic arrangements require designer review against actual longitudinal bar positions; they do not verify lateral restraint or confinement.

Hook choices are designer 8db at each physical end, or ACI 318-19 135° at both ends. The automatic mode supports 9.5–25.4 mm transverse bars, uses max(6db, 76.2 mm) straight extension (conservative conversion of the US edition's 3-inch minimum), and displays a minimum inside bend diameter of 4db through 16 mm and 6db above 16 mm. Nonstandard diameters are mapped conservatively to these two size classes. References: Table 25.3.2, §§25.3.4–25.3.5. No 90° cross-tie exception is used. SI code edition/bar designation and actual fabrication practice must be confirmed by the designer.

IMPORTANT: preliminary lengths are centerline straight-body dimensions plus hook extensions. Bend arcs, closure shape, fit around longitudinal bars and fabrication tolerances are excluded. This is not a final bar bending schedule. Splices, longitudinal anchorage, couplers and procurement waste are excluded. Hook rules alone do not establish seismic design: Chapter 18 zone lengths, spacing, supported bars, Ash and joint reinforcement remain separate engineering checks.

The report includes unfiltered totals, a detailed diameter/fy/function-filtered schedule and a filtered subtotal. Counts include all identical columns; elevation levels show one column. Tests check independent unit weights and lengths, shared-boundary counting, quantity scaling, zone validation, hook minima, old-draft compatibility and disabled/report rendering.

Each zone also accepts independently checked full cutting-length overrides for hoops, X cross-ties and Y cross-ties. These replace the automatic preliminary length and allow designer-supplied bend and closure details to be reflected in quantities. Blank overrides restore automatic estimation.

The editor now accepts interior X and Y cross-ties directly. Each full-section hoop contributes two exterior legs per direction; total legs are displayed automatically. Changing hoop count preserves the entered interior cross-ties. Existing drafts retain their original physical quantities through the legacy total-leg storage representation. The toolbar and estimate panel both have synchronized prominent enable controls. Reinforcement percentages use unfiltered longitudinal/shear weight divided by total reinforcement weight, not concrete volume or filtered subtotal.

## Estimate Interface And Drawing Updates

Titles and headings use Title Case while preserving engineering symbols and units; future module interfaces should follow this convention. The estimate has an explicit Adopt Section Tie Diameter confirmation, applies to all zones, retains spacing/grade/counts, and clears checked cutting-length overrides. Zone diameters remain individually editable.

Zone sections are stacked from highest to lowest elevation and share colours with the elevation. Section aspect ratio, longitudinal bar locations/diameters, hoop centreline offset (clear cover + half tie diameter), and tie stroke thickness use physical millimetres. Rounded bend radius and hook extension use the existing selected hook basis. Hook orientation is illustrative: collisions, hook fit, bar engagement and confinement are not certified. Multiple full-section hoops coincide in plan rather than being falsely shown as nested hoops.

Automatic cross-tie coordinates use aligned opposing peripheral longitudinal bars, excluding corner rows. Insufficient candidates are explicitly flagged rather than invented. Editable X cross-tie positions are Y coordinates relative to section centre; Y cross-tie positions are X coordinates. Invalid/unmatched connections are marked for review. These optional arrays are backward compatible and persist in the draft. Position edits do not change the existing full-section piece-length assumptions or establish a fabrication-ready bar schedule.
