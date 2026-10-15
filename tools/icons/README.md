# Module icon generator

Source for the launcher module icons in `apps/web/public/icons/*.webp`.

- `iso3d.py`: small isometric renderer (numpy + Pillow) with procedural materials: concrete,
  soil strata (topsoil, clay, silt, sand, gravel, saturated sand), steel, galvanised steel, rock and water.
- `icons.py`: one function per module (24). Each lists the geometry in model units, so a change is a
  few lines and is easy to review.
- `export.py`: renders, crops, equalises visual size and writes 256 px WebP files.

```bash
pip install numpy pillow
python3 tools/icons/export.py              # all icons
python3 tools/icons/export.py riprap       # one icon
```

Adding a module: add a function to `icons.py`, register it in `ICONS` under the module slug used in
`apps/web/src/lib/ui-catalogue.ts`, run `export.py`, and commit the new `.webp`.

Design decisions per icon are traced in the decision sheet (I-01 … I-24, 14–15 Oct 2026).
