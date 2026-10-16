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

Global stability and settlement; footing rotation (base assumed fixed); the prop, the slabs and their connections; the temporary stages before the prop or top slab exist; ACI 350 water-retaining provisions; compaction pressure; strip/line surcharges. Full-width plate analysis and buttresses are Phase 2 and 3.

## Verification

`packages/calc-core/test/retaining-wall.test.ts`: Rankine, Coulomb, M-O and K0 coefficients; cantilever, propped and fixed–fixed closed forms (including the 0.0214wH² span moment); spring-prop limit; and the corrected audit values from the user's workbook (RW-01: Pa 50.43 kN/m, FS sliding 1.50, toe pressure 72.4 kPa; RW-X: Mu 51.63 kN·m/m; BW-01: reactions 17.82 / 36.26 kN/m, span +M 7.36 kN·m/m, pinned-top base M 22.86 kN·m/m), plus bearing redistribution, water, seismic and schema limits.
