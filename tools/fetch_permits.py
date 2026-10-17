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

from fetch_nycgov import CACHE, NYC, dist_m, geosearch, get, intersection

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'data' / 'permits-events.json'
API = 'https://data.cityofnewyork.us/resource/tvpp-9vvx.json'
PAGE = 'https://data.cityofnewyork.us/d/tvpp-9vvx'
# Permit types that are public events. Parks "Special Event" permits also cover
# birthday picnics and lawn closures, so those need a public-sounding name.
PUBLIC = re.compile(r'^(parade|street festival|single block festival|street event|plaza event|plaza partner event|'
                    r'open street partner event|farmers market|sidewalk sale|athletic race)$', re.I)
SPECIAL = re.compile(r'festival|\bfest\b|fair\b|market|grownyc|carnival|parade|concert|music|movie|film night|'
                     r'halloween|fright|haunted|\b5k\b|\b10k\b|run\b|walk\b|yoga|dance|art\b|chalk|jam\b', re.I)
PRIVATE = re.compile(r'birthday|shower|party|wedding|closure|construction|renovation|bbq|barbecue|picnic|'
                     r'\btest|pick ?up|meeting|\bipo\b|disposal|popup line|^celebration$|^miscellaneous$|amplified|parks event|rain date|back ?up date', re.I)


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
    if re.search(r'market|food|taste|grownyc|greenmarket', t):
        return 'food'
    if re.search(r'race|run\b|walk|bike|tour de', t):
        return 'sports'
    if re.search(r'music|concert|jazz', t):
        return 'music'
    if re.search(r'art|film|theater|theatre|dance', t):
        return 'art'
    return 'community'


def street(s):
    """'EAST   82 STREET' -> 'EAST 82nd STREET', which GeoSearch matches far better."""
    def nth(m):
        n = int(m.group(2))
        return f"{m.group(1) or ''}{n}{'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')} "
    s = re.sub(r'\s+', ' ', s).strip()
    s = re.sub(r'^([EWNS])\.? (?=\d)', lambda m: {'E': 'EAST ', 'W': 'WEST ', 'N': 'NORTH ', 'S': 'SOUTH '}[m.group(1).upper()], s)
    s = re.sub(r'(\d+)(?:st|nd|rd|th)\b', r'\1', s, flags=re.I)  # '32rd' typos; the suffix is added back below
    return re.sub(r'^((?:EAST|WEST|NORTH|SOUTH|BEACH) )?(\d+) (?=STREET|AVENUE|PLACE|ROAD|DRIVE|TERRACE|LANE)', nth, s, flags=re.I)


def place(location, borough, cache):
    """The first spot named in a permit location, placed on the map."""
    first = re.split(r',\s*(?=[A-Z0-9 ]+ between )|;', location)[0].strip()
    # 'Greeley Square Plaza: Greeley Square (32/33 Broadway) Broadway between ...': the street is surer than the name.
    if ':' in first and ' between ' in first.split(':', 1)[1].lower():
        first = re.sub(r'^.*?\)\s*', '', first.split(':', 1)[1]).strip()
    seg = (re.match(r'(.+?) between (.+?) and (.+)$', first, re.I)
           or re.match(r'([^:]+?) - (.+?) to ([^:]+)', first))  # 'CHAUNCEY STREET - HOWARD AVENUE to SARATOGA AVENUE'
    name = first.split(':')[0].strip()
    key = f'permit place: {first if seg else name} | {borough}'
    if key in cache:
        return cache[key]
    hit = None
    try:
        if seg:
            # One corner of the closed block is close enough, and half the lookups.
            best = intersection(street(seg.group(1)), street(seg.group(2)), borough)
            hit = best[1] if best and best[0] < 250 else None
        else:
            norm = lambda s: re.sub(r'[^a-z0-9]+', ' ', s.lower()).strip()
            same = [r for r in geosearch(f'{name}, {borough}', size=5) if norm(r['label'].split(',')[0]) == norm(name)]
            # GeoSearch sometimes has several far-apart points under one park name; skip those rather than guess.
            if same and all(dist_m(same[0], r) < 1000 for r in same):
                hit = {k: same[0][k] for k in ('lat', 'lng', 'label')}
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
        public = PUBLIC.match(kind.strip()) or (kind == 'Special Event' and SPECIAL.search(name))
        if not name or not public or PRIVATE.search(name) or name.lower() in seen:
            continue
        seen.add(name.lower())
        borough = (r.get('event_borough') or '').strip()
        location = (r.get('event_location') or '').strip()
        pos = place(location, borough, cache) if location and borough else None
        if len(seen) % 25 == 0:
            CACHE.write_text(json.dumps(cache, indent=1, sort_keys=True))
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
            'allDay': start.hour == 0 and start.minute == 0,
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
