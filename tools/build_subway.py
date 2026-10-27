"""Write src/scripts/map/subway.json: where each subway line runs, for the subway alerts overlay.

Source: the MTA's static subway GTFS (routes, trips and shapes), which lists every route's colour and
the path of each of its train patterns. Each route keeps its longest path plus any branch that runs
somewhere the kept paths do not (the A's two Rockaway ends, the 5's Dyre Ave and Nereid Ave ends...),
simplified to a few hundred points.

The deploy workflow runs this before every aul build. Run it by hand with:  python3 tools/build_subway.py
"""
import csv
import io
import json
import math
import urllib.request
import zipfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'src' / 'scripts' / 'map' / 'subway.json'
URLS = [
    'https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip',
    'http://web.mta.info/developers/data/nyct/subway/google_transit.zip',
]
TOLERANCE = 0.00012  # degrees (~12 m) for simplifying paths
NEAR = 0.0015  # degrees: a branch point this close to a kept path counts as covered


def fetch():
    for url in URLS:
        try:
            req = urllib.request.Request(url, headers={'User-Agent': '8bitmap'})
            with urllib.request.urlopen(req, timeout=120) as r:
                return zipfile.ZipFile(io.BytesIO(r.read()))
        except Exception as e:  # try the next copy
            print(f'{url}: {e}')
    raise SystemExit('could not download the subway GTFS')


def rows(z, name):
    with z.open(name) as f:
        yield from csv.DictReader(io.TextIOWrapper(f, encoding='utf-8-sig'))


def simplify(pts, tol):
    # Ramer-Douglas-Peucker
    if len(pts) < 3:
        return pts
    (y1, x1), (y2, x2) = pts[0], pts[-1]
    dx, dy = x2 - x1, y2 - y1
    norm = math.hypot(dx, dy) or 1e-12
    far, idx = 0, 0
    for i in range(1, len(pts) - 1):
        y, x = pts[i]
        d = abs(dy * (x - x1) - dx * (y - y1)) / norm if norm > 1e-12 else math.hypot(x - x1, y - y1)
        if d > far:
            far, idx = d, i
    if far <= tol:
        return [pts[0], pts[-1]]
    return simplify(pts[:idx + 1], tol)[:-1] + simplify(pts[idx:], tol)


def main():
    z = fetch()
    routes = {r['route_id']: r for r in rows(z, 'routes.txt')}
    shapes_of = defaultdict(set)
    for t in rows(z, 'trips.txt'):
        if t.get('shape_id'):
            shapes_of[t['route_id']].add(t['shape_id'])
    pts = defaultdict(list)
    for s in rows(z, 'shapes.txt'):
        pts[s['shape_id']].append((int(s['shape_pt_sequence']), float(s['shape_pt_lat']), float(s['shape_pt_lon'])))
    paths = {k: [(lat, lng) for _, lat, lng in sorted(v)] for k, v in pts.items()}

    out = {}
    for rid, r in sorted(routes.items()):
        cands = sorted((paths[s] for s in shapes_of.get(rid, ()) if s in paths), key=len, reverse=True)
        kept = []
        for p in cands:
            covered = sum(1 for q in p[::5] if any(abs(q[0] - k[0]) < NEAR and abs(q[1] - k[1]) < NEAR for path in kept for k in path[::3]))
            if not kept or covered < 0.8 * len(p[::5]):
                kept.append(p)
        if not kept:
            continue
        color = '#' + (r.get('route_color') or '808183').strip('#')
        text = '#' + (r.get('route_text_color') or 'FFFFFF').strip('#')
        out[rid] = {
            'name': r.get('route_long_name', ''),
            'color': color.upper(),
            'text': text.upper(),
            'paths': [[[round(a, 5), round(b, 5)] for a, b in simplify(p, TOLERANCE)] for p in kept],
        }
        print(f'{rid}: {len(kept)} paths, {sum(len(p) for p in out[rid]["paths"])} points')
    OUT.write_text(json.dumps({'routes': out}, separators=(',', ':')) + '\n')
    print(f'wrote {OUT.relative_to(ROOT)}: {len(out)} routes, {OUT.stat().st_size // 1024} KB')


if __name__ == '__main__':
    main()
