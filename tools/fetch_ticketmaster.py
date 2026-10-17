#!/usr/bin/env python3
"""Snapshot one day of Ticketmaster NYC events into public/data/ticketmaster-events.json.

Uses Ticketmaster's Discovery API (https://developer.ticketmaster.com), which
needs a free API key in the TICKETMASTER_API_KEY environment variable (a
repository secret for the scheduled refresh). Venues carry coordinates, so no
address lookup is needed. Without a key the script says so and leaves the
existing snapshot alone.

Usage:  python3 tools/fetch_ticketmaster.py [YYYY-MM-DD]     (default: today in NYC)
"""

import json
import os
import sys
import time
import urllib.parse
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fetch_nycgov import NYC, get

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'data' / 'ticketmaster-events.json'
API = 'https://app.ticketmaster.com/discovery/v2/events.json'
PAGE = 'https://www.ticketmaster.com/discover/new-york'
CENTER, RADIUS_MI = '40.73,-73.96', 12
CATEGORIES = {'Music': 'music', 'Sports': 'sports', 'Arts & Theatre': 'art', 'Film': 'film'}


def fetch_day(day, key):
    start = datetime(day.year, day.month, day.day, tzinfo=NYC)
    iso = lambda t: t.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    params = {
        'apikey': key, 'latlong': CENTER, 'radius': RADIUS_MI, 'unit': 'miles', 'size': 200, 'sort': 'date,asc',
        'startDateTime': iso(start), 'endDateTime': iso(start + timedelta(days=1)),
    }
    rows, page = [], 0
    while True:
        data = get(f'{API}?{urllib.parse.urlencode({**params, "page": page})}')
        rows += (data.get('_embedded') or {}).get('events', [])
        info = data.get('page') or {}
        # The Discovery API stops at 1000 results (size x page).
        if page + 1 >= info.get('totalPages', 1) or (page + 1) * 200 >= 1000:
            return rows
        page += 1
        time.sleep(0.25)  # 5 requests per second at most


def to_raw(ev, day):
    v = ev['_embedded']['venues'][0]
    loc = v.get('location') or {}
    when = ev.get('dates', {}).get('start', {})
    if when.get('dateTime'):
        start = datetime.fromisoformat(when['dateTime'].replace('Z', '+00:00')).astimezone(NYC)
        all_day = False
    else:
        start = datetime.fromisoformat(f"{when.get('localDate', day.isoformat())}T{when.get('localTime') or '00:00:00'}").replace(tzinfo=NYC)
        all_day = not when.get('localTime')
    seg = ((ev.get('classifications') or [{}])[0].get('segment') or {}).get('name', '')
    genre = ((ev.get('classifications') or [{}])[0].get('genre') or {}).get('name', '')
    prices = ev.get('priceRanges') or []
    price = None
    if prices:
        lo, hi = min(p.get('min', 0) for p in prices), max(p.get('max', 0) for p in prices)
        price = {'min': round(lo), 'max': round(hi), 'currency': prices[0].get('currency', 'USD')}
    addr = ', '.join(x for x in ((v.get('address') or {}).get('line1'), (v.get('city') or {}).get('name')) if x)
    return {
        'id': ev['id'],
        'title': ev['name'],
        'category': 'comedy' if genre == 'Comedy' else CATEGORIES.get(seg, 'community'),
        'start': start.isoformat(),
        'end': None,
        'allDay': all_day,
        'venue': {'name': v.get('name', 'Venue TBA'), 'address': addr, 'neighborhood': (v.get('city') or {}).get('name', ''),
                  'lat': round(float(loc['latitude']), 6), 'lng': round(float(loc['longitude']), 6)},
        'price': price,
        'priceUnknown': price is None,
        'description': ' / '.join(x for x in (seg, genre) if x and x != 'Undefined'),
        'details': ev.get('info') or ev.get('pleaseNote') or '',
        'url': ev.get('url') or PAGE,
        'tags': [x for x in (genre,) if x and x != 'Undefined'],
    }


def main():
    day = datetime.strptime(sys.argv[1], '%Y-%m-%d').date() if len(sys.argv) > 1 else datetime.now(NYC).date()
    key = os.environ.get('TICKETMASTER_API_KEY')
    if not key:
        print('TICKETMASTER_API_KEY is not set; skipping Ticketmaster and keeping the existing snapshot.')
        return
    print(f'Fetching Ticketmaster events for {day}...')
    rows = fetch_day(day, key)
    events, unplaced, seen = [], [], set()
    for ev in rows:
        venues = (ev.get('_embedded') or {}).get('venues') or []
        # Timed-entry attractions list every slot ('Balloon Museum' every 15 minutes); keep the first of the day.
        slot = (ev.get('name', '').strip().lower(), venues[0].get('id') if venues else None)
        if ev['id'] in seen or slot in seen:
            continue
        seen.update((ev['id'], slot))
        if venues and (venues[0].get('location') or {}).get('latitude'):
            events.append(to_raw(ev, day))
        else:
            unplaced.append({'title': ev.get('name'), 'url': ev.get('url')})
    OUT.write_text(json.dumps({
        'source': {'name': 'Ticketmaster', 'url': PAGE},
        'date': day.isoformat(),
        'fetchedAt': datetime.now(NYC).isoformat(timespec='seconds'),
        'events': events,
        'unplaced': unplaced,
    }, indent=1, ensure_ascii=False))
    print(f'  {len(events)} placed, {len(unplaced)} without a location')
    print(f'  wrote {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
