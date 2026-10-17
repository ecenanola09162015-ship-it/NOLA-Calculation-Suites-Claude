# Underground tank (rectangular), engine tank-0.1.0

Slug `underground-tank`, Concrete, status `verification-required`. Basis ACI 350-20 first (with the ACI 318-19 strength provisions it references); NSCP 2015 project label second. † marks clause numbers still to be confirmed against the licensed ACI 350-20 text.

## Model
- Inside plan Lx × Ly, clear height H. Wall, base slab (with projection) and optional roof slab with soil cover.
- Panels are Kirchhoff plates (the retaining-wall BFS plate solver) on centreline spans:
  - **walls**: corners fixed, base fixed or pinned, top pinned under a roof or free;
  - **base slab**: edges fixed or pinned;
  - **roof**: edges pinned or fixed.
- Design moments are Wood–Armer per face and direction.

## Load cases
Factors are editable (ACI 350-20 Table 5.3.1†).
- **Leak test**: full, no backfill. Liquid F at 1.4, walls bending outward. Walls also carry direct tension from the edge shear of the adjacent walls.
- **Empty and backfilled**: at-rest (or active) earth, groundwater, live surcharge. H at 1.6, L at 1.6.
- **Base slab**:
  - uplift 1.6·γw·hw − 0.9·self weight (empty);
  - soil reaction to walls, roof and cover, 1.2D + 1.6L (full, conservative uniform reaction).
- **Roof**: 1.2D + 1.6L and 1.4D.

## ACI 350 checks
- Sd = φfy/(γ fs,max) ≥ 1.0 on flexure and on flexure plus tension (9.2.6†), with γ = factored / service at the governing point.
  - Flexure fs,max = 320 (normal) or 260 (severe) / (β√(s² + 4(2 + db/2)²)) ksi, in inches. Capped at 36 / 30 ksi, with β = 1.2 (h ≥ 16 in) or 1.35.
  - Direct tension fs,max: 20 / 17 ksi.
- Flexure + axial tension by strain compatibility, two steel layers, moment about mid-depth.
- Shear: Vc = 0.17(1 + Nu/(3.5Ag))λ√f′c bd at d from the supports, φ 0.75.
- Shrinkage and temperature steel by joint spacing (Table 24.4.3.2†), each face ≥ half.
- Spacing ≤ 300 mm, cover ≥ 50 mm, walls ≥ 300 mm when H ≥ 3 m.
- Flotation FS ≥ input (default 1.10), empty tank: concrete, roof cover, and soil plus water over the projection.
- Bearing (full tank, service).

## Seismic (ACI 350.3-20, `underground-tank-seismic.ts`)
One direction of motion at a time (along Lx loads the short walls, along Ly the long walls).
- **Response factors:** SDS = ⅔SsFa, SD1 = ⅔S1Fv (9.4.1). I from Table 4.1.1a. Ri from Table 4.1.1b (fixed or hinged base: 2.25 on grade, 3.25 buried, interpolated by liquid level against ground); Rc = 1.0.
- **Dynamic properties:**
  - Wi, Wc (9.2.1); hi, hc (9.2.2); hi′, hc′ (9.2.3); ε (9.6.1).
  - Ti: rigid under a roof (Ci = SDS), or the R9.2.4 cantilever stiffness when open.
  - Tc (9.2.4d–f); Ci, Cc (9.4.1–9.4.2); Ct = Ci (9.4.3b).
- **Forces and moments:** Pw, Pw′, Pr, Pi, Pc (4.1.1); ü_v (4.1.4); Peg by R8.1 (non-yielding by default, k_hw with groundwater, resultant at 0.6H); V (4.1.2); Mb, Mo (4.1.3).
- **Wall pressures:**
  - On walls perpendicular to the motion: ½Pi and ½Pc by the R5.3.1 linear distributions, plus Pw′ uniform and p_vy, combined per 5.3.2.
  - On the trailing wall: dynamic earth pressure as an inverted trapezoid.
  - Two new design cases:
    - seismic full: 1.2F + 1.0E outward, with direct tension;
    - seismic empty: 1.6H + 1.0E + 0.5L inward. Backfill is never used to reduce liquid effects (8.2).
- **Freeboard:**
  - d_max = (L/2)·Cc·I (7.1a), compared with the gap to the roof soffit or wall top.
  - When a covered tank has inadequate freeboard, the R7.1 method applies:
    - confined fraction k_r = acos(h_o/d_max)/π added to the impulsive mass;
    - convective force × (1 − k_r);
    - roof uplift C_LF·γL(d_max/I − h_o) over Li = (L/π)·acos(h_o/d_max) from each wall, designed with 0.9D + 1.0E.
- **Sd = 1.0† in cases with E.**

## Not in this release (warned)
- Circular tanks.
- Internal partition walls.
- The operating case (full + backfilled).
- Corner moment iteration between panels.
- In-plane shear of the walls parallel to the motion, the IBP floor pressure, and tank overturning / sliding (reported, not designed).
- Joints and waterstops.

3D view (three.js, lazy) and DXF (section + plan, AC1021, 1:20) are in the workspace.

## Verification (`packages/calc-core/test/underground-tank.test.ts`, `underground-tank-seismic.test.ts`)
- Seismic:
  - 9.2.1–9.2.4 and 9.6.1 by hand and against Figs. 9.2.1–9.2.4;
  - 9.4 coefficients;
  - R5.3.1 distributions integrate to P/2 at h;
  - 4.1.1 / 4.1.2 / R8.1 forces by hand, with Peg resultant at 0.6H;
  - R7.1 confined mass and uplift;
  - Table 4.1.1b Ri.
- fs,max by hand (25.95 ksi for Ø16 @ 200, h 300), the caps, Sd, and the shrinkage table.
- Section strength = slab strength at N = 0; tension reduces capacity, down to zero.
- Simply supported roof with b/a = 1.5: Timoshenko 0.0812 (ν 0.3) → 0.0784 (ν 0.2), within 1 %.
- Long open wall in the leak test: base moment 1.4·γHL³/6 plus the half-slab offset, within 2 %.
- Flotation by hand, grouping and clauses.
