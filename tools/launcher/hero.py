"""Launcher hero art: 'structural mind' (neural truss) BEHIND a modern diagrid tower.
Writes apps/web/public/launcher/hero-<theme>.svg for the three launcher themes."""
import math
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mind import mind_svg  # noqa: E402

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'apps', 'web', 'public', 'launcher')
C30 = math.cos(math.pi / 6)

THEMES = {
    'blueprint': dict(
        mind=dict(line='#7FD3EA', node='#BFE9F5', glow='#3CD0F0', glow2='#9BF0FF', grid='#7FD3EA', grid_op=0.10, member_op=0.5),
        b=dict(glassL=('#2E6C93', '#163A57'), glassR=('#21557A', '#102C44'), edge='#8FD8EE', roof='#1B3D59', mull='#7FC8E2',
               frame='#3CD0F0', glow='#9BF0FF', plate='#14304A', podiumL='#1C3B57', podiumR='#173350')),
    'concrete': dict(
        mind=dict(line='#5A43DF', node='#2C2A7A', glow='#19B6DA', glow2='#7C6BFF', grid='#5A43DF', grid_op=0.07),
        b=dict(glassL=('#DCE6F3', '#B9C9DF'), glassR=('#C7D5EA', '#A6B9D4'), edge='#5A6E8C', roof='#EEF2F8', mull='#7F93B0',
               frame='#5A43DF', glow='#19B6DA', plate='#E6E9F5', podiumL='#D9DEE8', podiumR='#C9D0DD')),
    'night': dict(
        mind=dict(line='#4FC3D9', node='#9ADBE8', glow='#F2A33A', glow2='#FFD58A', grid='#4FC3D9', grid_op=0.08, member_op=0.45),
        b=dict(glassL=('#2B3A4A', '#18222D'), glassR=('#223040', '#141C25'), edge='#4FC3D9', roof='#1D2833', mull='#4FC3D9',
               frame='#F2A33A', glow='#FFD58A', plate='#151D25', podiumL='#1D2731', podiumR='#18212A')),
}


def poly(pts, fill, stroke, sw=1.0, op=1.0):
    return f'<polygon points="{" ".join(f"{x:.1f},{y:.1f}" for x, y in pts)}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" opacity="{op}"/>'


def hero_svg(m, b, W=760, H=420):
    brain = mind_svg(W=640, H=420, **m)
    inner = re.sub(r'^<svg[^>]*>', '', brain).replace('</svg>', '')
    defs = re.search(r'<defs>.*?</defs>', inner, re.S).group(0)
    inner = inner.replace(defs, '')
    P = lambda x, y, z: (500 + (x - y) * C30 * 13.0, 300 + (x + y) * 0.5 * 13.0 - z * 13.0)
    gdefs = ''.join(f'<linearGradient id="{t}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{c[0]}"/><stop offset="1" stop-color="{c[1]}"/></linearGradient>'
                    for t, c in (('gL', b['glassL']), ('gR', b['glassR'])))
    out = []

    def box(x, y, z, w, d, h, side, front, top):
        out.append(poly([P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h)], front, b['edge']))
        out.append(poly([P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h)], side, b['edge']))
        out.append(poly([P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)], top, b['edge']))

    def tower(x, y, w, d, h, diagrid=True):
        box(x, y, 0, w, d, h, 'url(#gL)', 'url(#gR)', b['roof'])
        ln = []
        z = 0.75
        while z < h - 0.05:
            for a, c in ((P(x, y + d, z), P(x + w, y + d, z)), (P(x + w, y, z), P(x + w, y + d, z))):
                ln.append(f'M{a[0]:.1f} {a[1]:.1f} L{c[0]:.1f} {c[1]:.1f}')
            z += 0.75
        for k in range(1, int(w / 0.5)):
            a, c = P(x + k * 0.5, y + d, 0), P(x + k * 0.5, y + d, h); ln.append(f'M{a[0]:.1f} {a[1]:.1f} L{c[0]:.1f} {c[1]:.1f}')
        out.append(f'<path d="{" ".join(ln)}" stroke="{b["mull"]}" stroke-width="0.6" fill="none" opacity="0.8"/>')
        if diagrid:
            dg = []; n = int(h / (d * 0.9)) + 1; st = h / n
            for k in range(n):
                for ya, yb in ((y, y + d), (y + d, y)):
                    a, c = P(x + w, ya, k * st), P(x + w, yb, (k + 1) * st); dg.append(f'M{a[0]:.1f} {a[1]:.1f} L{c[0]:.1f} {c[1]:.1f}')
            out.append(f'<path d="{" ".join(dg)}" stroke="{b["frame"]}" stroke-width="2.2" fill="none" stroke-linecap="round"/>')
        a, c = P(x, y + d, h), P(x + w, y + d, h)
        out.append(f'<path d="M{a[0]:.1f} {a[1]:.1f} L{c[0]:.1f} {c[1]:.1f}" stroke="{b["glow"]}" stroke-width="3" opacity="0.9"/>')

    out.append(poly([P(-3, -3, 0), P(11, -3, 0), P(11, 9, 0), P(-3, 9, 0)], b['plate'], b['edge'], 1, 0.9))
    tower(0.0, 2.0, 4.2, 4.2, 16.5)
    tower(5.2, 0.5, 3.4, 3.4, 9.5, diagrid=False)
    box(-1, 6.6, 0, 10.5, 1.4, 1.6, b['podiumL'], b['podiumR'], b['roof'])
    box(9.0, 0.0, 0, 1.4, 8.0, 1.6, b['podiumL'], b['podiumR'], b['roof'])
    crown = P(2.1, 4.1, 16.5)
    out.append(f'<circle cx="{crown[0]:.0f}" cy="{crown[1]:.0f}" r="5" fill="{m["glow"]}"/>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Neural network behind a diagrid tower">'
            f'{defs.replace("</defs>", gdefs + "</defs>")}'
            f'<g transform="translate(150 -6) scale(0.95)">{inner}</g>{"".join(out)}</svg>')


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for name, t in THEMES.items():
        open(os.path.join(OUT, f'hero-{name}.svg'), 'w').write(hero_svg(t['mind'], t['b']))
        print('wrote hero', name)
    import bands
    bands.structural().save(os.path.join(OUT, 'band-structural.jpg'), quality=86)
    bands.geotechnical().save(os.path.join(OUT, 'band-geotechnical.jpg'), quality=86)
    print('wrote bands')
