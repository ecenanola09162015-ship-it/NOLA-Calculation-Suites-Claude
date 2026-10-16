"""Build the shared steel shapes database (packages/calc-core/src/steel-shapes/data).

Source tables (reproducible, no network to aisc.org needed):
  1. AISC Shapes Database v16.0 tables as packaged in `steelpy` 1.1.1
     (PyPI, Apache-2.0; "AISC Shapes Database v16.0", U.S. customary):
       pip download --no-deps steelpy==1.1.1
  2. AISC Shapes Database v15.0 xlsx as packaged in npm `aisc` 0.1.0
     (BSD-3-Clause wrapper), used only for EDI names and metric labels:
       npm pack aisc@0.1.0
Redistribution of AISC data inside the app needs AISC's written permission
before commercial release (decision D-03); pilot use with attribution.

Usage:
  python3 -I tools/shapes/import_aisc_shapes.py <steelpy shape files dir> <v15 xlsx> <out dir>
"""
import csv, glob, hashlib, json, os, re, sys
import openpyxl

IN = 25.4
SRC_DIR, V15, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
FAMILIES = {  # steelpy file → (AISC Type, family group)
    "W": ("W", "I"), "M": ("M", "I"), "S": ("S", "I"), "HP": ("HP", "I"),
    "C": ("C", "C"), "MC": ("MC", "C"), "L": ("L", "L"),
    "WT": ("WT", "T"), "MT": ("MT", "T"), "ST": ("ST", "T"),
    "HSS": ("HSS", "HSS-RECT"), "HSS_R": ("HSS", "HSS-ROUND"), "PIPE": ("PIPE", "HSS-ROUND"),
}
FRACTION = {"HSS", "L", "PIPE"}
LEN = "d bf tw tf k k1 Ht h B b tnom tdes OD ID t x y eo xp yp rx ry rz ro rts ho".split()
UNIT = {**{c: IN for c in LEN}, "area": IN**2, "Zx": IN**3, "Sx": IN**3, "Zy": IN**3, "Sy": IN**3,
        "Sz": IN**3, "C": IN**3, "Ix": IN**4, "Iy": IN**4, "Iz": IN**4, "J": IN**4, "Cw": IN**6,
        "H": 1.0, "tan_a": 1.0, "weight": 1.488164}
RENAME = {"area": "A", "weight": "W", "tan_a": "tanAlpha"}


def name(raw, fam):
    m = re.match(r"^([A-Za-z]+)(.*)$", raw)
    pre, rest = m.group(1), m.group(2)
    out = []
    for p in rest.split("X"):
        t = p.split("_")
        if len(t) == 3:
            out.append(f"{t[0]}-{t[1]}/{t[2]}")
        elif len(t) == 2:
            if fam == "HSS_R":
                out.append(f"{t[0]}.{t[1]}")
            else:
                out.append(f"{t[0]}/{t[1]}" if fam in FRACTION else f"{t[0]}.{t[1]}")
        else:
            out.append(p)
    return pre + "X".join(out)


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


wb = openpyxl.load_workbook(V15, read_only=True, data_only=True)
rows = list(wb["Database v15.0"].iter_rows(values_only=True))
metric = {r[2]: r[85] for r in rows[1:] if r[2]}

os.makedirs(os.path.join(OUT, "data"), exist_ok=True)
index, provenance = [], {"files": {}}
for fam, (atype, group) in FAMILIES.items():
    path = os.path.join(SRC_DIR, f"{fam}_shapes.csv")
    provenance["files"][os.path.basename(path)] = hashlib.sha256(open(path, "rb").read()).hexdigest()
    shapes = []
    for r in csv.DictReader(open(path, encoding="utf-8")):
        n = name(r["shape"], fam)
        props = {}
        for k, f in UNIT.items():
            v = num(r.get(k))
            if v is not None:
                props[RENAME.get(k, k)] = round(v * f, 6 if f == 1.0 else 4)
        s = {"name": n, "metric": metric.get(n), "type": atype, "group": group, **props}
        shapes.append(s)
        if group == "HSS-RECT":
            d, b, t = props["Ht"], props["B"], props["tdes"]
            key = (d, b, t, t)
        elif group == "HSS-ROUND":
            d, t = props["OD"], props["tdes"]
            key = (d, d, t, t)
        elif group in ("I", "C", "T"):
            key = (props["d"], props["bf"], props["tf"], props["tw"])
        else:  # angles: d × b × t
            key = (props["d"], props["b"], props["t"], props["t"])
        index.append([n, metric.get(n), atype, group, *[round(v, 2) for v in key], round(props["A"], 1), round(props["W"], 2)])
    fn = f"{fam.lower().replace('_', '-')}.json"
    with open(os.path.join(OUT, "data", fn), "w") as fh:
        json.dump(shapes, fh, separators=(",", ":"))
    print(fn, len(shapes))
with open(os.path.join(OUT, "data", "index.json"), "w") as fh:
    json.dump(index, fh, separators=(",", ":"))
provenance.update({
    "database": "AISC Shapes Database v16.0",
    "via": "steelpy 1.1.1 (PyPI, Apache-2.0)",
    "metricLabels": "AISC Shapes Database v15.0 via npm aisc 0.1.0",
    "v15Sha256": hashlib.sha256(open(V15, "rb").read()).hexdigest(),
    "units": "SI: mm, mm², mm³, mm⁴, mm⁶, kg/m (converted from in-based values)",
    "count": len(index),
})
with open(os.path.join(OUT, "data", "provenance.json"), "w") as fh:
    json.dump(provenance, fh, indent=2)
print("total", len(index))
