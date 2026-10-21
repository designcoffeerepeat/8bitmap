"""Write src/scripts/map/land.json: which map tile is land, and which borough it belongs to.

Sources:
- NYC's five boroughs: NYC Department of City Planning borough boundaries, clipped to
  the shoreline (NYC Open Data dataset gthc-hcne).
- The land around the city (New Jersey, Westchester, Nassau): US Census Bureau 2018
  cartographic boundary counties at 1:500,000 (cb_2018_us_county_500k), read from a
  GeoJSON copy on GitHub because census.gov is not always reachable from build machines.

Each tile is one CELL (about 133m x 135m); a tile is land when its centre is inside a
polygon.
The output is one run-length encoded string per row, north to south, e.g. "12.3m40." is
12 water tiles, 3 Manhattan tiles, then 40 water tiles. geo.js reads it and takes the
map's bounds from it too, so change BOUNDS here and rerun to move the map's edges.

Usage:  python3 tools/build_land.py
"""
import json
import math
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'src' / 'scripts' / 'map' / 'land.json'
BOROUGHS_URL = 'https://data.cityofnewyork.us/resource/gthc-hcne.geojson'
COUNTIES_URL = 'https://raw.githubusercontent.com/loganpowell/census-geojson/master/GeoJSON/500k/2018/county.json'

# All five boroughs with a little room around them (NYC runs 40.477-40.918, -74.259 to -73.700).
BOUNDS = {'west': -74.27, 'east': -73.69, 'south': 40.47, 'north': 40.925}
CELL = {'lat': 0.0012, 'lng': 0.0016}

# One letter per area; geo.js maps them to area names.
BOROUGH_CODE = {'Manhattan': 'm', 'Bronx': 'x', 'Brooklyn': 'k', 'Queens': 'q', 'Staten Island': 's'}
NEIGHBOR_CODE = {'34': 'n', '36059': 'l', '36119': 'w'}  # New Jersey, Nassau, Westchester
NYC_COUNTIES = {'36005', '36047', '36061', '36081', '36085'}

# The 1:500,000 county shapes fill in the narrow water on the New Jersey side, so Newark Bay
# is cut back out by hand ([lng, lat] pairs) and New Jersey keeps a channel of water
# (the Kill Van Kull and Arthur Kill) at least NJ_GAP tiles wide wherever it faces the city.
NEWARK_BAY = [
    [-74.125, 40.722], [-74.105, 40.715], [-74.112, 40.690], [-74.128, 40.665], [-74.136, 40.638],
    [-74.166, 40.638], [-74.168, 40.660], [-74.150, 40.690], [-74.138, 40.710],
]
NJ_GAP = 2


def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': '8bitmap'})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)


def rings(geom):
    polys = geom['coordinates'] if geom['type'] == 'MultiPolygon' else [geom['coordinates']]
    return [ring for poly in polys for ring in poly]


def main():
    cols = round((BOUNDS['east'] - BOUNDS['west']) / CELL['lng'])
    rows = round((BOUNDS['north'] - BOUNDS['south']) / CELL['lat'])

    shapes = []  # (code, rings), painted in order so the boroughs win over their neighbours
    for f in fetch(COUNTIES_URL)['features']:
        p = f['properties']
        geoid = p['GEOID']
        code = NEIGHBOR_CODE.get(geoid) or NEIGHBOR_CODE.get(p['STATEFP'])
        if code and geoid not in NYC_COUNTIES:
            shapes.append((code, rings(f['geometry'])))
    n_neighbors = len(shapes)
    for f in fetch(BOROUGHS_URL)['features']:
        shapes.append((BOROUGH_CODE[f['properties']['boroname']], rings(f['geometry'])))

    grid = [['.'] * cols for _ in range(rows)]
    for code, rs in shapes[:n_neighbors] + [('.', [NEWARK_BAY])] + shapes[n_neighbors:]:
        edges = [(a, b) for ring in rs for a, b in zip(ring, ring[1:] + ring[:1])]
        for row in range(rows):
            lat = BOUNDS['north'] - (row + 0.5) * CELL['lat']
            xs = sorted(
                x0 + (lat - y0) * (x1 - x0) / (y1 - y0)
                for (x0, y0), (x1, y1) in edges
                if (y0 > lat) != (y1 > lat)
            )
            # even-odd fill between crossings, so holes stay water
            for left, right in zip(xs[::2], xs[1::2]):
                c0 = max(0, math.floor((left - BOUNDS['west']) / CELL['lng'] - 0.5) + 1)
                c1 = min(cols - 1, math.floor((right - BOUNDS['west']) / CELL['lng'] - 0.5))
                for col in range(c0, c1 + 1):
                    grid[row][col] = code

    nyc = set(BOROUGH_CODE.values())
    near_nyc = [[any(
        grid[r][c] in nyc
        for r in range(max(0, row - NJ_GAP), min(rows, row + NJ_GAP + 1))
        for c in range(max(0, col - NJ_GAP), min(cols, col + NJ_GAP + 1))
    ) for col in range(cols)] for row in range(rows)]
    for row in range(rows):
        for col in range(cols):
            if grid[row][col] == 'n' and near_nyc[row][col]:
                grid[row][col] = '.'

    def rle(line):
        out, k = [], 0
        while k < len(line):
            n = 1
            while k + n < len(line) and line[k + n] == line[k]:
                n += 1
            out.append(f'{n}{line[k]}')
            k += n
        return ''.join(out)

    OUT.write_text(json.dumps({
        'bounds': BOUNDS,
        'cell': CELL,
        'cols': cols,
        'rows': [rle(r) for r in grid],
    }, indent=0) + '\n')
    land = sum(c != '.' for r in grid for c in r)
    print(f'wrote {cols} x {rows} tiles ({land} land) to {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
