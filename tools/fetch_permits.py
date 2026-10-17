#!/usr/bin/env python3
"""Snapshot one day of NYC permitted street events into public/data/permits-events.json.

The city publishes every permitted event (street fairs, parades, plaza events,
markets) as the "NYC Permitted Event Information" dataset on NYC Open Data
(https://data.cityofnewyork.us/d/tvpp-9vvx), with a public API that needs no
key. Locations are text such as "BROADWAY between WEST 34 STREET and WEST 42
STREET" or a park name, so they are placed the same way as NYC.gov listings:
street segments with NYC GeoSearch, parks and plazas by name. Permits that are
not public events (film shoots, sports field bookings, block parties) are
skipped.

Usage:  python3 tools/fetch_permits.py [YYYY-MM-DD]     (default: today in NYC)
"""

import json
import re
import string
import sys
import urllib.parse
from datetime import datetime
from pathlib import Path

from fetch_nycgov import CACHE, NYC, geocode, geosearch, get

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'data' / 'permits-events.json'
API = 'https://data.cityofnewyork.us/resource/tvpp-9vvx.json'
PAGE = 'https://data.cityofnewyork.us/d/tvpp-9vvx'
PUBLIC = re.compile(r'parade|festival|fair|street event|plaza|market|special event|athletic race|walk|run\b', re.I)
SKIP = re.compile(r'production|sport\s*-|block party|filming|construction|religious|rally|press', re.I)


def fetch_day(day):
    where = f"start_date_time >= '{day}T00:00:00' AND start_date_time <= '{day}T23:59:59'"
    rows, offset = [], 0
    while True:
        q = urllib.parse.urlencode({'$where': where, '$limit': 1000, '$offset': offset, '$order': 'start_date_time'})
        page = get(f'{API}?{q}')
        rows += page
        if len(page) < 1000:
            return rows
        offset += 1000


def category(name, kind):
    t = f'{name} {kind}'.lower()
    if re.search(r'market|food|taste', t):
        return 'food'
    if re.search(r'race|run\b|walk|bike|tour de', t):
        return 'sports'
    if re.search(r'music|concert|jazz', t):
        return 'music'
    if re.search(r'art|film|theater|theatre|dance', t):
        return 'art'
    return 'community'


def place(location, borough, cache):
    """The first spot named in a permit location, placed on the map."""
    first = re.split(r',\s*(?=[A-Z0-9 ]+ between )|;', location)[0].strip()
    if ' between ' in first.lower():
        return geocode(re.sub(r'\bbetween\b', 'between', first, flags=re.I).replace(' AND ', ' and '), borough, cache)
    name = first.split(':')[0].strip()
    key = f'permit place: {name} | {borough}'
    if key in cache:
        return cache[key]
    hit = None
    try:
        for r in geosearch(f'{name}, {borough}', size=5):
            norm = lambda s: re.sub(r'[^a-z0-9]+', ' ', s.lower()).strip()
            if norm(r['label'].split(',')[0]) == norm(name):
                hit = {k: r[k] for k in ('lat', 'lng', 'label')}
                break
    except Exception as e:
        print(f'  GeoSearch failed for "{name}": {e}', file=sys.stderr)
        return None
    cache[key] = hit
    return hit


def main():
    day = datetime.strptime(sys.argv[1], '%Y-%m-%d').date() if len(sys.argv) > 1 else datetime.now(NYC).date()
    print(f'Fetching NYC permitted events for {day}...')
    rows = fetch_day(day)
    print(f'  {len(rows)} permits')
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    events, unplaced, seen = [], [], set()
    for r in rows:
        name, kind = (r.get('event_name') or '').strip(), r.get('event_type') or ''
        if not name or SKIP.search(kind) or not PUBLIC.search(kind) or (name, r.get('start_date_time')) in seen:
            continue
        seen.add((name, r.get('start_date_time')))
        borough = (r.get('event_borough') or '').strip()
        location = (r.get('event_location') or '').strip()
        pos = place(location, borough, cache) if location and borough else None
        if not pos:
            unplaced.append({'title': name, 'address': location, 'url': PAGE})
            continue
        start = datetime.fromisoformat(r['start_date_time'][:19]).replace(tzinfo=NYC)
        end = datetime.fromisoformat(r['end_date_time'][:19]).replace(tzinfo=NYC) if r.get('end_date_time') else None
        events.append({
            'id': r.get('event_id') or f'{name}-{start:%H%M}',
            'title': string.capwords(name) if name.isupper() else name,
            'category': category(name, kind),
            'start': start.isoformat(),
            'end': end.isoformat() if end and end.date() == start.date() else None,
            'venue': {'name': string.capwords(location.split(' between ')[0].split(':')[0].lower()),
                      'address': string.capwords(location.lower()), 'neighborhood': borough,
                      'lat': round(pos['lat'], 6), 'lng': round(pos['lng'], 6)},
            'price': None,
            'priceUnknown': False,  # street events are free to attend
            'description': kind,
            'details': f"Permit from {r['event_agency']}." if r.get('event_agency') else '',
            'url': PAGE,
            'tags': [kind] if kind else [],
        })
    CACHE.write_text(json.dumps(cache, indent=1, sort_keys=True))
    OUT.write_text(json.dumps({
        'source': {'name': 'NYC Street Events', 'url': PAGE},
        'date': day.isoformat(),
        'fetchedAt': datetime.now(NYC).isoformat(timespec='seconds'),
        'events': events,
        'unplaced': unplaced,
    }, indent=1, ensure_ascii=False))
    print(f'  {len(events)} placed, {len(unplaced)} without a mappable location')
    print(f'  wrote {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
