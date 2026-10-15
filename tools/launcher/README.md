# Launcher art generator

Writes `apps/web/public/launcher/`:

- `hero-blueprint.svg`, `hero-concrete.svg`, `hero-night.svg`: the "structural mind" (a neural network drawn
  as a triangulated truss) behind a diagrid tower, one per launcher theme (`hero.py`, `mind.py`).
- `band-structural.jpg`, `band-geotechnical.jpg`: abstract backgrounds for the STRUCTURAL (blue bands) and
  GEOTECHNICAL (brown hexagons) trade headings (`bands.py`).

All art is generated procedurally (no stock images) and is deterministic.

```bash
pip install numpy pillow
python3 tools/launcher/hero.py
```
