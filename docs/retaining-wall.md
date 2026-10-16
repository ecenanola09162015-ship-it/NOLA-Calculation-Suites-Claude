# RC retaining wall — Phase 1 (1 m strip)

Engine `rwall-0.1.0`, slug `retaining-wall`, status `verification-required`. Basis ACI 318-19 (SI) first. NSCP 2015 is cited second, as the project standard for load combinations (Sec. 203), stability (Sec. 307†) and seismic coefficients (Sec. 208), labelled "calculated per ACI 318-19". † marks clause numbers still to be confirmed against the licensed text.

## Scope

- Wall types: cantilever (base fixed, top free), propped (prop at hp, rigid or spring), basement (base and top slab each fixed or pinned).
- Earth pressure: Rankine with sloping backfill, Coulomb (vertical back, δ), at-rest K0 = (1 − sinφ)·OCR^sinφ, or a user K. Effective stress below the water table and full hydrostatic water. Dead and live surcharge.
- Seismic: Mononobe-Okabe (yielding) or Wood (non-yielding) increment, resultant at 0.6H, plus optional wall inertia.
- Stability on the vertical plane through the heel (H + tf + heel·tanβ): overturning, sliding (μ(V − U), optional passive with mobilisation factor, shear key depth, prop), bearing with full contact or triangular contact q = 2V/3a when e > B/6, and the eccentricity limit B/3. Live surcharge is driving only; bearing takes the worse of with and without its vertical part.
- Stem: Euler–Bernoulli member with tapered EI, solved by direct stiffness; moments by statics from the FE reactions. Strength envelopes from the selected combinations (NSCP 2015 203.3 or ASCE 7-16 2.3, H at 1.6 where it adds, groundwater as H, soil weight as D).
- Footing: factored bearing pressure from the factored resultant; toe and heel cantilevers from the stem faces, reverse moments on the opposite bars.
- Checks: flexure (strain compatibility, shared with the Slab module), one-way shear Table 22.5.5.1(c) (λs on the stem, λs = 1 for the footing), minimum steel (Table 7.6.1.1, 24.4.3.2; wall Table 11.6.1), spacing, crack control 24.3.2, hooked dowel development 25.4.3.1 with the Class B lap length reported, back-bar cut-off extension.

## Not covered (reported as warnings)

Global stability and settlement; footing rotation (base assumed fixed); the prop, the slabs and their connections; the temporary stages before the prop or top slab exist; ACI 350 water-retaining provisions; compaction pressure; broken-back backfill. Buttress/counterfort design is Phase 3.

## Verification

`packages/calc-core/test/retaining-wall.test.ts`: Rankine, Coulomb, M-O and K0 coefficients; cantilever, propped and fixed–fixed closed forms (including the 0.0214wH² span moment); spring-prop limit; and the corrected audit values from the user's workbook (RW-01: Pa 50.43 kN/m, FS sliding 1.50, toe pressure 72.4 kPa; RW-X: Mu 51.63 kN·m/m; BW-01: reactions 17.82 / 36.26 kN/m, span +M 7.36 kN·m/m, pinned-top base M 22.86 kN·m/m), plus bearing redistribution, water, seismic and schema limits.

## Phase 2 — full-width stem plate

`analysis: "plate"` analyses the stem as an L × H Kirchhoff plate (`retaining-wall-plate-fe.ts`, a wall-owned copy of the Slab BFS 16-DOF element so the Slab module is unchanged). Edges: base fixed/pinned; top free / pinned / fixed (cantilever), pinned or a horizontal prop line (propped), the basement slabs (basement); each end free or a perpendicular wall, pinned or fixed; buttresses as vertical line supports of their own height. Loads are the same depth-varying pressure components as the strip, one right-hand side each on one factorisation.

Design moments are Wood–Armer per face and direction from the factored combinations; the governing point is the largest DCR on the sampled mesh (d and bars vary with height). Optional 1 m averaging beside the peak. Checks replace the strip stem checks: vertical back/front, horizontal back/front (horizontal bars ③ now carry moment), shear for vertical spanning at the base and horizontal spanning at end walls and buttresses, crack-control spacing for horizontal bars. Clauses: ACI 318-19 13.3.7.2† (two-way slab, Ch. 8), 8.5.1.1, 22.2–22.3, Table 22.5.5.1. Footing and stability stay per metre (strip). Buttress design and buttress reactions are Phase 3; the stem-top line-load eccentric moment is carried in the strip only.

Verification (`test/retaining-wall-plate.test.ts`): Navier series (uniform and hydrostatic, simply supported), Timoshenko clamped square (0.0231 / −0.0513 qa²), long cantilever wall = PH/3 and cylindrical bending mx = ν my, long propped wall = 2PH/15 (top edge and prop line), closely spaced buttresses = q s²/12, partial-height buttress support, Wood–Armer rules, and wall-design integration (strip match at mid-length, end-wall and buttress effects, averaging ≤ peak). The UI adds the plate panel, the Elevation tab (contours, restraints, buttresses, governing point), the 3D end walls, counterforts and back-face moment map, and the report elevation figures and peaks table. Moody (USBR EM27) and PCA (via IS 3370-4) table benchmarks are to be keyed in from the free sources.

## Phase 3 — counterforts and section DXF

With `analysis: "plate"` and buttresses on a wall with a heel, each buttress is designed as a counterfort (`retaining-wall-counterfort.ts`), loaded by its FE line reactions (R = K·u − F on the line's w DOFs, so the share carried by the base and the end walls is excluded).

- Flexure: tapered T-beam cantilevered from the footing, stem as compression flange (overhang ≤ min(8h, s/2, ln/8), Table 6.3.2.1), tension bars along the inclined back edge, d = (t + reach)·cosα − cover − tie − db/2; strain compatibility (22.2, 22.3), φ Table 21.2.2.
- Shear: Vu,eff = Vu − (Mu/d)·tanα (R9.4.3†), φ(Vc + Vs) with Vc = 0.17√f′c bw d (22.5.5.1(a)), horizontal ties as stirrups, Vs ≤ 0.66√f′c bw d.
- Ties: horizontal stem → counterfort for the peak reaction intensity, vertical heel → counterfort for the net factored heel load × tributary length, φ = 0.90.
- Minimum steel min[9.6.1.2, 4/3 As,req (9.6.1.3)], Av,min 9.6.3.4, one-layer clear spacing 25.2.1, hooked anchorage into the footing (ψr = 1.6).
- Heel between counterforts: continuous slab wu·s²/12 at the counterforts, or wu·a²/2 for a free-end overhang, on the top distribution bars. The heel strip (cantilever) check is kept as a conservative bound.

Not covered: elastic (flexible) buttress supports, counterfort axial shortening, front buttresses / pilasters (walls without a heel), two-layer counterfort bars.

The Section tab exports the section as AutoCAD 2007 DXF (mm, 1:20, office layers; counterforts beyond dashed). Tests: `test/retaining-wall-counterfort.test.ts` (T-beam by hand, reaction equilibrium, heel moments, integration) and `apps/web/test/retaining-wall-dxf.test.ts`.
