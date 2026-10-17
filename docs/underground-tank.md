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

## Not in this release (warned)
- Seismic: ACI 350.3 hydrodynamic and sloshing pressures, and dynamic earth pressure.
- Circular tanks.
- Internal partition walls.
- The operating case (full + backfilled).
- Corner moment iteration between panels.
- 3D view and DXF.
- Joints and waterstops.

## Verification (`packages/calc-core/test/underground-tank.test.ts`)
- fs,max by hand (25.95 ksi for Ø16 @ 200, h 300), the caps, Sd, and the shrinkage table.
- Section strength = slab strength at N = 0; tension reduces capacity, down to zero.
- Simply supported roof with b/a = 1.5: Timoshenko 0.0812 (ν 0.3) → 0.0784 (ν 0.2), within 1 %.
- Long open wall in the leak test: base moment 1.4·γHL³/6 plus the half-slab offset, within 2 %.
- Flotation by hand, grouping and clauses.
