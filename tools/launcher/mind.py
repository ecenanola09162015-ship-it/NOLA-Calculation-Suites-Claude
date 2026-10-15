"""'Structural mind' hero art: a neural network drawn as a triangulated space-frame truss.
Nodes = truss joints (with depth), members = bars, a few glowing signal paths. Deterministic SVG."""
import math
import numpy as np


def mind_svg(W=640, H=420, line='#5B45E0', node='#2A2F8F', glow='#22C3E6', glow2='#8B7CFF',
             grid='#5B45E0', grid_op=0.10, bg=None, seed=4, member_op=0.42):
    rng = np.random.default_rng(seed)
    # brain-like silhouette: two lobes + stem region (union of ellipses)
    ell = [(0.40, 0.46, 0.30, 0.33), (0.62, 0.44, 0.30, 0.34), (0.52, 0.30, 0.26, 0.22), (0.55, 0.70, 0.12, 0.12)]
    def inside(x, y):
        return any(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 for cx, cy, rx, ry in ell)
    pts = []
    tries = 0
    while len(pts) < 120 and tries < 20000:
        tries += 1
        x, y = rng.uniform(0.08, 0.95), rng.uniform(0.08, 0.86)
        if not inside(x, y): continue
        if all(math.hypot(x - p[0], (y - p[1]) * 1.4) > 0.052 for p in pts):
            pts.append((x, y, rng.uniform(0, 1)))
    P = np.array(pts)
    xy = P[:, :2] * [W, H]
    # members: connect each joint to its nearest neighbours (truss triangulation look)
    edges = set()
    for i in range(len(P)):
        d = np.hypot(*(xy - xy[i]).T); order = np.argsort(d)[1:5]
        for j in order:
            if d[j] < W * 0.13: edges.add(tuple(sorted((i, int(j)))))
    edges = sorted(edges)
    # signal paths: greedy walks left -> right across the graph
    adj = {i: [] for i in range(len(P))}
    for a, b in edges: adj[a].append(b); adj[b].append(a)
    paths = []
    starts = np.argsort(xy[:, 0])[:14]
    for k, s0 in enumerate(rng.choice(starts, 4, replace=False)):
        path = [int(s0)]; cur = int(s0)
        for _ in range(16):
            nxt = [n for n in adj[cur] if n not in path and xy[n, 0] > xy[cur, 0] - 6]
            if not nxt: break
            cur = max(nxt, key=lambda n: xy[n, 0] + rng.uniform(-25, 25)); path.append(cur)
        if len(path) > 5: paths.append(path)
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Neural network drawn as a structural truss">',
           '<defs>',
           f'<linearGradient id="sig" x1="0" x2="1"><stop offset="0" stop-color="{glow}" stop-opacity="0"/><stop offset="0.35" stop-color="{glow}"/><stop offset="1" stop-color="{glow2}"/></linearGradient>',
           '<filter id="blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="5"/></filter>',
           f'<radialGradient id="halo" cx="0.52" cy="0.46" r="0.55"><stop offset="0" stop-color="{glow2}" stop-opacity="0.18"/><stop offset="1" stop-color="{glow2}" stop-opacity="0"/></radialGradient>',
           '</defs>']
    if bg: out.append(f'<rect width="{W}" height="{H}" fill="{bg}"/>')
    # isometric drafting grid
    g = []
    for k in range(-20, 40):
        x0 = k * 32
        g.append(f'M{x0} {H} L{x0 + H * 1.732:.0f} 0')
        g.append(f'M{x0} 0 L{x0 + H * 1.732:.0f} {H}')
    out.append(f'<path d="{" ".join(g)}" stroke="{grid}" stroke-opacity="{grid_op}" stroke-width="0.6" fill="none"/>')
    out.append(f'<rect width="{W}" height="{H}" fill="url(#halo)"/>')
    # members (depth -> opacity)
    for a, b in edges:
        z = (P[a, 2] + P[b, 2]) / 2
        out.append(f'<line x1="{xy[a,0]:.1f}" y1="{xy[a,1]:.1f}" x2="{xy[b,0]:.1f}" y2="{xy[b,1]:.1f}" stroke="{line}" '
                   f'stroke-opacity="{member_op * (0.45 + 0.55 * z):.2f}" stroke-width="{0.8 + 1.0 * z:.2f}"/>')
    # signal paths with glow
    for path in paths:
        d = 'M' + ' L'.join(f'{xy[i,0]:.1f} {xy[i,1]:.1f}' for i in path)
        out.append(f'<path d="{d}" stroke="{glow}" stroke-width="7" stroke-opacity="0.35" fill="none" filter="url(#blur)"/>')
        out.append(f'<path d="{d}" stroke="url(#sig)" stroke-width="2.4" fill="none" stroke-linejoin="round"/>')
    # joints (gusset nodes)
    on_path = {i for p in paths for i in p}
    for i, (x, y) in enumerate(xy):
        z = P[i, 2]; r = 2.2 + 2.6 * z
        if i in on_path:
            out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r + 5:.1f}" fill="{glow}" opacity="0.25" filter="url(#blur)"/>')
            out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r + 0.8:.1f}" fill="{glow}"/>')
        else:
            out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}" fill="{node}" opacity="{0.55 + 0.45 * z:.2f}"/>')
    out.append('</svg>')
    return '\n'.join(out)
