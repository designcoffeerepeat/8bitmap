"""Write src/scripts/map/neighborhoods.json from NYC's official neighborhood list.

Source: NYC Department of City Planning, 2020 Neighborhood Tabulation Areas
(NYC Open Data dataset 9nt8-h7nd). Only residential areas (ntatype 0) are kept;
each label sits at the area-weighted centre of the area's largest polygon.

Usage:  python3 tools/build_neighborhoods.py
"""
import json
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'src' / 'scripts' / 'map' / 'neighborhoods.json'
URL = 'https://data.cityofnewyork.us/resource/9nt8-h7nd.json?$limit=1000'


def ring_centroid(ring):
    a = cx = cy = 0.0
    for (x0, y0), (x1, y1) in zip(ring, ring[1:] + ring[:1]):
        f = x0 * y1 - x1 * y0
        a += f
        cx += (x0 + x1) * f
        cy += (y0 + y1) * f
    a /= 2
    return abs(a), (cx / (6 * a), cy / (6 * a)) if a else ring[0]


def main():
    with urllib.request.urlopen(urllib.request.Request(URL, headers={'User-Agent': '8bitmap'}), timeout=60) as r:
        rows = json.load(r)
    out = []
    for row in rows:
        if str(row.get('ntatype')) != '0':
            continue
        polys = row['the_geom']['coordinates']
        area, (lng, lat) = max(ring_centroid(p[0]) for p in polys)
        out.append({'name': row['ntaname'], 'borough': row['boroname'], 'lat': round(lat, 5), 'lng': round(lng, 5)})
    out.sort(key=lambda n: (n['borough'], n['name']))
    OUT.write_text(json.dumps(out, indent=1) + '\n')
    print(f'wrote {len(out)} neighborhoods to {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
