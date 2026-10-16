#!/usr/bin/env python3
"""Snapshot one night of Resident Advisor listings into public/data/ra-events.json.

RA's own pages (https://ra.co/events/us/newyork) load their listings from the
site's GraphQL endpoint. Most venues there carry exact lat/lng; venues with no
position or only a rough one (0,0 or whole-hundredth values like 41, -74) are
placed from their street address with NYC GeoSearch instead. RA groups listings by night: a party that starts after
midnight still belongs to the night it is listed on.

Usage:  python3 tools/fetch_ra.py [YYYY-MM-DD]     (default: today in NYC)
"""

import json
import re
import sys
import urllib.request
from datetime import datetime
from pathlib import Path

from fetch_nycgov import CACHE, NYC, UA, geosearch

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'data' / 'ra-events.json'
GRAPHQL = 'https://ra.co/graphql'
PAGE = 'https://ra.co/events/us/newyork'
AREA_NYC = 8

QUERY = """
query GET_EVENT_LISTINGS($filters: FilterInputDtoInput, $pageSize: Int, $page: Int) {
  eventListings(filters: $filters, pageSize: $pageSize, page: $page) {
    totalResults
    data {
      event {
        id title startTime endTime contentUrl cost
        genres { name }
        artists { name }
        venue { name address location { latitude longitude } }
      }
    }
  }
}"""


def post(body):
    req = urllib.request.Request(GRAPHQL, data=json.dumps(body).encode(), headers={
        'User-Agent': UA, 'Content-Type': 'application/json', 'Referer': PAGE})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode('utf-8'))


def fetch_day(day):
    filters = {'areas': {'eq': AREA_NYC},
               'listingDate': {'gte': f'{day}T00:00:00.000Z', 'lte': f'{day}T23:59:59.999Z'}}
    rows, page = [], 1
    while True:
        res = post({'operationName': 'GET_EVENT_LISTINGS', 'query': QUERY,
                    'variables': {'filters': filters, 'pageSize': 100, 'page': page}})
        if res.get('errors'):
            raise RuntimeError(res['errors'][0].get('message'))
        data = res['data']['eventListings']
        rows += [d['event'] for d in data['data']]
        if len(rows) >= data['totalResults'] or not data['data']:
            return rows
        page += 1


def position(venue, cache):
    loc = venue.get('location') or {}
    lat, lng = loc.get('latitude'), loc.get('longitude')
    rough = lat is None or lng is None or (abs(lat) < 1 and abs(lng) < 1) or (
        round(lat * 100) == lat * 100 and round(lng * 100) == lng * 100)
    if not rough:
        return {'lat': lat, 'lng': lng}
    address = re.sub(r'\s+USA$', '', (venue.get('address') or '').strip())
    if not re.match(r'\d', address):
        return None
    key = f'ra: {address}'
    if key not in cache:
        try:
            res = geosearch(address)
        except Exception as e:
            print(f'  GeoSearch failed for "{address}": {e}', file=sys.stderr)
            return None
        cache[key] = {k: res[0][k] for k in ('lat', 'lng', 'label')} if res and res[0]['confidence'] >= 0.8 else None
    return cache[key]


def local_iso(naive):
    """RA times are NYC wall-clock times with no offset."""
    if not naive:
        return None
    return datetime.fromisoformat(naive[:19]).replace(tzinfo=NYC).isoformat()


def price(cost):
    nums = [float(n) for n in re.findall(r'\d+(?:\.\d+)?', cost or '')]
    if re.search(r'\bfree\b', cost or '', re.I) and not nums:
        return None, False
    if not nums:
        return None, True
    lo, hi = min(nums), max(nums)
    return {'min': round(lo) if lo.is_integer() else lo, 'max': round(hi) if hi.is_integer() else hi, 'currency': 'USD'}, False


def to_raw(ev, day, pos):
    v = ev['venue'] or {}
    p, unknown = price(ev.get('cost'))
    artists = [a['name'] for a in ev.get('artists') or []]
    genres = [g['name'] for g in ev.get('genres') or []]
    neighborhood = ''
    m = re.search(r',\s*([^,]+?),\s*NY\b', v.get('address') or '')
    if m:
        neighborhood = 'Manhattan' if m.group(1).strip() == 'New York' else m.group(1).strip()
    return {
        'id': ev['id'],
        'title': ev['title'],
        'category': 'nightlife',
        # Multi-day listings start on an earlier day; show tonight's run at the same clock time.
        'start': local_iso(day + ev['startTime'][10:] if ev['startTime'][:10] < day else ev['startTime']),
        # A party that starts after midnight still belongs to the night it is listed on.
        'listedDay': day,
        'end': local_iso(ev.get('endTime')),
        'venue': {'name': v.get('name') or 'Venue TBA', 'address': v.get('address') or '', 'neighborhood': neighborhood,
                  'lat': round(pos['lat'], 6), 'lng': round(pos['lng'], 6)},
        'price': p,
        'priceUnknown': unknown,
        'description': f"Lineup: {', '.join(artists)}" if artists else '',
        'details': f"Genres: {', '.join(genres)}" if genres else '',
        'url': f"https://ra.co{ev['contentUrl']}",
        'tags': genres,
    }


def main():
    day = sys.argv[1] if len(sys.argv) > 1 else datetime.now(NYC).date().isoformat()
    print(f'Fetching Resident Advisor listings for {day}...')
    rows = fetch_day(day)
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    events, unplaced = [], []
    for ev in rows:
        pos = position(ev.get('venue') or {}, cache)
        if pos:
            events.append(to_raw(ev, day, pos))
        else:
            unplaced.append({'title': ev['title'], 'address': (ev.get('venue') or {}).get('address', ''),
                             'url': f"https://ra.co{ev['contentUrl']}"})
    CACHE.write_text(json.dumps(cache, indent=1, sort_keys=True))
    OUT.write_text(json.dumps({
        'source': {'name': 'Resident Advisor', 'url': PAGE},
        'date': day,
        'fetchedAt': datetime.now(NYC).isoformat(timespec='seconds'),
        'events': events,
        'unplaced': unplaced,
    }, indent=1, ensure_ascii=False))
    print(f'  {len(events)} placed, {len(unplaced)} without a location')
    print(f'  wrote {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
