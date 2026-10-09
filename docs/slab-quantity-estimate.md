# Slab Quantity Estimate

Optional, saved with the slab draft (version 1). Old drafts without quantities remain compatible. A prominent enable control appears in both the toolbar and the estimate; disabling retains settings and hides the estimate from print.

## Geometry And Defaults

- Clear panel X/Y are measured between bounding beam faces. Blank dimensions use the analysis span, explicitly flagged for confirmation. Quantity dimensions do not change analysis spans. Beam volume is excluded from slab concrete volume.
- Each west/east/south/north beam has width, depth and far-side cover inputs. Cover is to the slab bar's outer surface, not a beam stirrup. To-cover centreline extension is beam width minus cover minus half bar diameter.
- Each beam independently selects MAIN BAR and EXTRA BAR end rules: half beam width (default), to far-side cover, or custom extension; straight or L-hook; automatic 12db tail or a custom tail in mm, and down/up hook direction (default down into the beam). Automatic tails use each active layer's diameter. Extensions beyond available cover are rejected.
- New slab design defaults are top extra length L/3 from each fixed support and bottom extras from 0.25L to 0.75L. Existing saved cutoffs are not overwritten. The explicit reset action changes the shared design cutoff settings and therefore updates structural checks as well as estimates.
- Top extras are separate pieces at each fixed support, distributed across the full transverse width. Bottom extras are centered by default; their start/end overrides can reach support faces, at which point selected beam extensions and end details apply. One-way slabs retain short-direction extras only.

## Quantities And Drawings

Physical bar counts use the clear transverse dimension, current spacing, cover and diameters. Main grids fit a maximum spacing; extras use the same staggered grid convention as the designer. A quantity dimension change can change physical bar counts without changing analysis steel per metre.

Each piece reports slab body length, near/far beam extensions, near/far hook tails, total piece length, count, total length, circular-area unit mass (density 7850 kg/m³), and weight. Panel multiplier scales steel and concrete together. No input reinforcement is automatically optimized or replaced.

Filters: diameter, fy, function (flexural/distribution), MAIN/EXTRA group. Filtered subtotals do not change overall totals or weight percentages. Reports include total steel, MAIN/EXTRA shares, flexural/distribution shares, slab-only volume, kg/m³, beam geometry, end settings, fit notices and assumptions. In two-way slabs all bars are classified as flexural; in one-way slabs long-direction MAIN BARS are distribution reinforcement. There is no slab shear reinforcement quantity in this pilot.

Top/bottom estimate plans show physical grids, continuous main bars, cut-off extras, beam penetration and bounding beams. X/Y estimate sections show reinforcement elevations, beam widths/depths and selected vertical L-hook tails; vertical scale is explicitly exaggerated. These are separate from the design diagrams and are estimate illustrations, not fabrication drawings.

## Limits

Lengths add straight portions and hook tail allowances. Bend arcs/deductions, splices, couplers, fabrication tolerances and waste are excluded. Bounding beam tops are assumed flush with the slab top. The beam depth warning is a preliminary fit screen, not a clash or anchorage verification. Half-beam extensions and 12db tails are designer estimating defaults, not verified ACI development/anchorage compliance. Beam geometry changes do not alter the structural support model. Concrete is gross slab volume; steel is not deducted.

Authenticated end-to-end browser interaction and independent engineering validation remain required before release beyond a development pilot.
