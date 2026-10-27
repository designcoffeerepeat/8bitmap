"""Write src/scripts/map/detail.json: the fine ground detail drawn on top of the land tiles.

The land tiles (land.json, about 133m x 135m each) are split into SUB x SUB finer pixels, and each
fine pixel gets one letter:
  p  park           h  highway / expressway     r  major street or avenue
  w  lake or pond   a  airport runway          m  runway centre line marking
Fine pixels only count on land tiles, so roads and parks never spill into the rivers.

Sources:
- Parks: NYC Parks Properties (NYC Open Data dataset enfh-gkve), parks of PARK_MIN_ACRES or more,
  leaving out parkway strips, street medians and the beaches (geo.js draws those as sand).
- Roads: NYC Street Centerline, CSCL (NYC Open Data dataset inkn-q76z). Every highway segment
  (rw_type 2), plus the streets named in MAJOR_STREETS.
- Lakes and runways are traced by hand below.

Each row is run-length encoded like land.json: "40.3p12." is 40 empty, 3 park, 12 empty.

Usage:  python3 tools/build_detail.py
"""
import json
import math
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LAND = ROOT / 'src' / 'scripts' / 'map' / 'land.json'
OUT = ROOT / 'src' / 'scripts' / 'map' / 'detail.json'
PARKS_URL = 'https://data.cityofnewyork.us/resource/enfh-gkve.json'
STREETS_URL = 'https://data.cityofnewyork.us/resource/inkn-q76z.json'

SUB = 4  # fine pixels per tile side
PARK_MIN_ACRES = 2.5
SKIP_PARK_TYPES = {'Parkway', 'Mall', 'Triangle/Plaza', 'Lot', 'Undeveloped', 'Cemetery'}

# Major streets by borough code (1 Manhattan, 2 Bronx, 3 Brooklyn, 4 Queens, 5 Staten Island),
# spelled as the centerline file spells them ("E 42 ST" is stored with two spaces: "E  42 ST").
MAJOR_STREETS = {
    # Manhattan's avenues are close together, so only every other one (the ones people use to find
    # their way: 1st, 3rd, Park, 5th, 6th, 8th / Central Park West, 10th / Amsterdam and Broadway)
    '1': [
        'BROADWAY', '1 AVE', '3 AVE', 'PARK AVE', '5 AVE', 'AVE OF THE AMERICAS', '8 AVE', '10 AVE',
        'AMSTERDAM AVE', 'CENTRAL PARK W', 'LENOX AVE', 'ADAM CLAYTON POWELL JR BLVD', 'ST NICHOLAS AVE',
        'BOWERY', 'CANAL ST', 'DELANCEY ST', 'E HOUSTON ST', 'W HOUSTON ST', 'CHAMBERS ST',
        'E 14 ST', 'W 14 ST', 'E 23 ST', 'W 23 ST', 'E 34 ST', 'W 34 ST', 'E 42 ST', 'W 42 ST',
        'E 57 ST', 'W 57 ST', 'E 72 ST', 'W 72 ST', 'E 86 ST', 'W 86 ST', 'E 96 ST', 'W 96 ST',
        'CENTRAL PARK N', 'CENTRAL PARK S', 'E 125 ST', 'W 125 ST', 'W 145 ST', 'DYCKMAN ST', 'W 181 ST',
    ],
    '2': [
        'GRAND CONC', 'E 145 ST', 'E FORDHAM RD', 'W FORDHAM RD', 'PELHAM PKWY S', 'PELHAM PKWY N',
        'BOSTON RD', 'JEROME AVE', 'WEBSTER AVE', '3 AVE', 'E TREMONT AVE', 'W TREMONT AVE',
        'WESTCHESTER AVE', 'SOUNDVIEW AVE', 'E 149 ST', 'BROADWAY', 'WHITE PLAINS RD', 'E GUN HILL RD',
        'BAYCHESTER AVE', 'CITY ISLAND AVE', 'SOUTHERN BLVD', 'BRUCKNER BLVD', 'RIVERDALE AVE',
        'E 161 ST', 'E 138 ST', 'UNIVERSITY AVE', 'CASTLE HILL AVE', 'E 233 ST',
    ],
    '3': [
        'FLATBUSH AVE', 'ATLANTIC AVE', 'EASTERN PKWY', 'OCEAN PKWY', '4 AVE', 'KINGS HWY', 'BEDFORD AVE',
        'NOSTRAND AVE', 'CONEY ISLAND AVE', 'FULTON ST', 'BUSHWICK AVE', 'MYRTLE AVE', 'BROADWAY',
        'LINDEN BLVD', 'UTICA AVE', 'PENNSYLVANIA AVE', 'FLATLANDS AVE', 'SURF AVE', 'METROPOLITAN AVE',
        'GRAND ST', 'BAY PKWY', '86 ST', 'MCGUINNESS BLVD', 'EMMONS AVE', 'FORT HAMILTON PKWY',
        'OCEAN AVE', 'CHURCH AVE', 'FLUSHING AVE', 'GRAND AVE', 'KENT AVE', 'WYTHE AVE', 'MANHATTAN AVE',
        'COURT ST', 'SMITH ST', 'NEPTUNE AVE', 'RALPH AVE', 'REMSEN AVE', 'AVE U', 'AVE J', 'CROPSEY AVE',
    ],
    '4': [
        'QUEENS BLVD', 'NORTHERN BLVD', 'ROOSEVELT AVE', 'ASTORIA BLVD', 'JAMAICA AVE', 'HILLSIDE AVE',
        'WOODHAVEN BLVD', 'CROSS BAY BLVD', 'ROCKAWAY BLVD', 'UNION TPKE', 'MAIN ST', 'METROPOLITAN AVE',
        'MYRTLE AVE', '21 ST', 'STEINWAY ST', 'FRANCIS LEWIS BLVD', 'MERRICK BLVD', 'SUTPHIN BLVD',
        'ATLANTIC AVE', 'LINDEN BLVD', 'ROCKAWAY BEACH BLVD', 'JUNCTION BLVD', 'VERNON BLVD', '31 ST',
        'KISSENA BLVD', 'BELL BLVD', 'GRAND AVE', 'JACKSON AVE', 'GREENPOINT AVE', 'SKILLMAN AVE',
        'BROADWAY', '108 ST', 'YELLOWSTONE BLVD', 'GUY R BREWER BLVD', 'SPRINGFIELD BLVD',
        'PARSONS BLVD', 'FRESH POND RD', 'ROCKAWAY FWY', 'FARMERS BLVD',
    ],
    '5': [
        'HYLAN BLVD', 'RICHMOND AVE', 'VICTORY BLVD', 'FOREST AVE', 'RICHMOND TER', 'AMBOY RD',
        'ARTHUR KILL RD', 'BAY ST', 'RICHMOND RD', 'TODT HILL RD', 'CLOVE RD', 'FATHER CAPODANNO BLVD',
        'SOUTH AVE', 'DRUMGOOLE RD E', 'DRUMGOOLE RD W', 'PAGE AVE', 'HUGUENOT AVE', 'BRADLEY AVE', 'MANOR RD',
    ],
}

# Lakes and ponds inside the parks, [lat, lng], roughly traced.
LAKES = [
    # Central Park Reservoir (Jacqueline Kennedy Onassis)
    [[40.7890, -73.9605], [40.7883, -73.9580], [40.7850, -73.9575], [40.7822, -73.9595], [40.7815, -73.9630],
     [40.7825, -73.9660], [40.7858, -73.9668], [40.7884, -73.9645]],
    # Central Park: the Lake
    [[40.7792, -73.9735], [40.7785, -73.9700], [40.7770, -73.9685], [40.7752, -73.9705], [40.7745, -73.9745],
     [40.7760, -73.9762], [40.7778, -73.9758]],
    # Harlem Meer
    [[40.7975, -73.9530], [40.7972, -73.9502], [40.7958, -73.9495], [40.7950, -73.9515], [40.7955, -73.9540]],
    # The Pond at Central Park South
    [[40.7668, -73.9745], [40.7665, -73.9725], [40.7652, -73.9722], [40.7650, -73.9742]],
    # Prospect Park Lake
    [[40.6610, -73.9705], [40.6595, -73.9660], [40.6560, -73.9640], [40.6530, -73.9655], [40.6528, -73.9700],
     [40.6550, -73.9725], [40.6585, -73.9725]],
    # Meadow Lake, Flushing Meadows
    [[40.7415, -73.8385], [40.7410, -73.8345], [40.7330, -73.8325], [40.7300, -73.8340], [40.7305, -73.8370],
     [40.7360, -73.8385]],
    # Willow Lake, Flushing Meadows
    [[40.7275, -73.8355], [40.7270, -73.8320], [40.7205, -73.8300], [40.7200, -73.8330]],
    # Van Cortlandt Lake
    [[40.8930, -73.8880], [40.8930, -73.8855], [40.8885, -73.8850], [40.8885, -73.8875]],
]

# Runways as [from, to] center lines, [lat, lng].
RUNWAYS = [
    # LaGuardia 4/22 and 13/31
    [[40.7694, -73.8847], [40.7836, -73.8711]],
    [[40.7822, -73.8790], [40.7722, -73.8565]],
    # JFK 4L/22R, 4R/22L, 13L/31R, 13R/31L
    [[40.6224, -73.7860], [40.6455, -73.7633]],
    [[40.6270, -73.7710], [40.6480, -73.7500]],
    [[40.6575, -73.7940], [40.6435, -73.7690]],
    [[40.6480, -73.8160], [40.6260, -73.7790]],
    # Newark 4L/22R, 4R/22L, 11/29
    [[40.6760, -74.1820], [40.7030, -74.1730]],
    [[40.6770, -74.1760], [40.7000, -74.1670]],
    [[40.6930, -74.1830], [40.6870, -74.1640]],
]

ORDER = ['p', 'w', 'a', 'm', 'r', 'h']  # later letters are drawn over earlier ones


def fetch(url, params):
    req = urllib.request.Request(f'{url}?{urllib.parse.urlencode(params)}', headers={'User-Agent': '8bitmap'})
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.load(r)


def fetch_all(url, params, page=50000):
    out = []
    while True:
        rows = fetch(url, {**params, '$limit': page, '$offset': len(out), '$order': ':id'})
        out += rows
        if len(rows) < page:
            return out


def stored(name):
    # "E 42 ST" -> "E  42 ST", the way the centerline file stores a directional prefix
    parts = name.split(' ', 1)
    return f'{parts[0]}  {parts[1]}' if parts[0] in ('E', 'W', 'N', 'S') and len(parts) == 2 else name


def decode(rows, cols):
    grid = []
    for line in rows:
        out = []
        num = ''
        for ch in line:
            if ch.isdigit():
                num += ch
            else:
                out += [ch] * int(num)
                num = ''
        assert len(out) == cols
        grid.append(out)
    return grid


def encode(row):
    out = []
    k = 0
    while k < len(row):
        j = k
        while j < len(row) and row[j] == row[k]:
            j += 1
        out.append(f'{j - k}{row[k]}')
        k = j
    return ''.join(out)


def main():
    land = json.loads(LAND.read_text())
    bounds, cell, cols = land['bounds'], land['cell'], land['cols']
    tiles = decode(land['rows'], cols)
    rows = len(tiles)
    W, H = cols * SUB, rows * SUB
    fine = [['.'] * W for _ in range(H)]
    sub_lat = cell['lat'] / SUB
    sub_lng = cell['lng'] / SUB

    def fx(lng):
        return (lng - bounds['west']) / sub_lng

    def fy(lat):
        return (bounds['north'] - lat) / sub_lat

    def on_land(x, y):
        return tiles[y // SUB][x // SUB] != '.'

    def setpx(x, y, ch):
        if not (0 <= x < W and 0 <= y < H) or not on_land(x, y):
            return
        if fine[y][x] == '.' or ORDER.index(ch) >= ORDER.index(fine[y][x]):
            fine[y][x] = ch

    def fill_rings(rings, ch):
        # even-odd scanline fill over all rings (outer rings and holes), rings are [lng, lat]
        pts = [[(fx(lng), fy(lat)) for lng, lat in ring] for ring in rings]
        ys = [p[1] for ring in pts for p in ring]
        for y in range(max(0, math.floor(min(ys))), min(H, math.ceil(max(ys)) + 1)):
            yc = y + 0.5
            xs = []
            for ring in pts:
                for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
                    if (y1 > yc) != (y2 > yc):
                        xs.append(x1 + (yc - y1) * (x2 - x1) / (y2 - y1))
            xs.sort()
            for a, b in zip(xs[::2], xs[1::2]):
                for x in range(max(0, math.ceil(a - 0.5)), min(W, math.floor(b - 0.5) + 1)):
                    setpx(x, y, ch)

    def line(lng1, lat1, lng2, lat2, ch, width, dash=0):
        x1, y1, x2, y2 = fx(lng1), fy(lat1), fx(lng2), fy(lat2)
        steps = max(1, math.ceil(max(abs(x2 - x1), abs(y2 - y1)) * 2))
        for s in range(steps + 1):
            if dash and (s // dash) % 2:
                continue
            t = s / steps
            x = x1 + (x2 - x1) * t
            y = y1 + (y2 - y1) * t
            for dx in range(width):
                for dy in range(width):
                    setpx(math.floor(x - (width - 1) / 2) + dx, math.floor(y - (width - 1) / 2) + dy, ch)

    # parks
    parks = fetch_all(PARKS_URL, {
        '$select': 'signname,acres,typecategory,multipolygon',
        '$where': f'acres >= {PARK_MIN_ACRES}',
    })
    kept = 0
    for p in parks:
        if p.get('typecategory') in SKIP_PARK_TYPES or not p.get('multipolygon'):
            continue
        # beaches and boardwalks stay sand (BEACHES in geo.js) rather than turning green
        name = p.get('signname') or ''
        if 'Boardwalk' in name or name.endswith(' Beach'):
            continue
        rings = [ring for poly in p['multipolygon']['coordinates'] for ring in poly]
        fill_rings(rings, 'p')
        kept += 1
    print(f'parks: {kept} of {len(parks)}')

    for lake in LAKES:
        fill_rings([[[lng, lat] for lat, lng in lake]], 'w')
    for (lat1, lng1), (lat2, lng2) in RUNWAYS:
        line(lng1, lat1, lng2, lat2, 'a', 3)
        line(lng1, lat1, lng2, lat2, 'm', 1, dash=4)

    # streets: major named streets one fine pixel wide, then highways two wide on top
    for boro, names in MAJOR_STREETS.items():
        wanted = sorted({stored(n) for n in names})
        quoted = ','.join("'" + n.replace("'", "''") + "'" for n in wanted)
        segs = fetch_all(STREETS_URL, {
            '$select': 'full_street_name,the_geom',
            '$where': f"boroughcode='{boro}' AND rw_type='1' AND full_street_name in ({quoted})",
        })
        found = {s['full_street_name'] for s in segs}
        missing = [n for n in wanted if n not in found]
        print(f'borough {boro}: {len(segs)} street segments' + (f', not found: {missing}' if missing else ''))
        for s in segs:
            for ln in s['the_geom']['coordinates']:
                for (a, b), (c, d) in zip(ln, ln[1:]):
                    line(a, b, c, d, 'r', 1)

    highways = fetch_all(STREETS_URL, {'$select': 'the_geom', '$where': "rw_type='2'"})
    print(f'highways: {len(highways)} segments')
    for s in highways:
        for ln in s['the_geom']['coordinates']:
            for (a, b), (c, d) in zip(ln, ln[1:]):
                line(a, b, c, d, 'h', 2)

    out = {'sub': SUB, 'cols': W, 'rows': [encode(r) for r in fine]}
    OUT.write_text(json.dumps(out, separators=(',', ':')) + '\n')
    print(f'wrote {OUT.relative_to(ROOT)}: {W} x {H}, {OUT.stat().st_size // 1024} KB')


if __name__ == '__main__':
    main()
