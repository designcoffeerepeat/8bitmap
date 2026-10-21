#!/usr/bin/env python3
"""Snapshot one day of SeatGeek NYC events into public/data/seatgeek-events.json.

Uses the SeatGeek Platform API (https://platform.seatgeek.com), which needs a
free client id in the SEATGEEK_CLIENT_ID environment variable (a repository
secret for the scheduled refresh). Venues carry coordinates. Without a client
id the script says so and leaves the existing snapshot alone.

Usage:  python3 tools/fetch_seatgeek.py [YYYY-MM-DD]     (default: today in NYC)
"""

import json
import os
import re
import sys
import time
import urllib.parse
from datetime import datetime
from pathlib import Path

from fetch_nycgov import DATA, NYC, get, venue_category

ROOT = Path(__file__).resolve().parent.parent
OUT = DATA / 'seatgeek-events.json'
API = 'https://api.seatgeek.com/2/events'
PAGE = 'https://seatgeek.com/cities/new-york'
CATEGORIES = {'concert': 'music', 'music_festival': 'music', 'comedy': 'comedy', 'theater': 'theater', 'broadway_tickets_national': 'theater',
              'classical': 'music', 'dance_performance_tour': 'theater', 'film': 'film', 'sports': 'sports', 'family': 'community'}


def fetch_day(day, client_id):
    params = {'client_id': client_id, 'lat': 40.73, 'lon': -73.96, 'range': '12mi', 'per_page': 100,
              'datetime_local.gte': f'{day}T00:00:00', 'datetime_local.lte': f'{day}T23:59:59', 'sort': 'datetime_local.asc'}
    rows, page = [], 1
    while True:
        data = get(f'{API}?{urllib.parse.urlencode({**params, "page": page})}')
        rows += data.get('events') or []
        meta = data.get('meta') or {}
        if page * 100 >= meta.get('total', 0) or page >= 10:
            return rows
        page += 1
        time.sleep(0.25)


def category(ev):
    names = [t.get('name', '') for t in ev.get('taxonomies') or []]
    for n in [ev.get('type', '')] + names[::-1]:
        if n in CATEGORIES:
            return CATEGORIES[n]
        if 'sport' in n or n.endswith(('baseball', 'basketball', 'football', 'hockey', 'soccer')):
            return 'sports'
    return venue_category((ev.get('venue') or {}).get('name', ''))


def to_raw(ev):
    v = ev['venue']
    start = datetime.fromisoformat(ev['datetime_local']).replace(tzinfo=NYC)
    s = ev.get('stats') or {}
    lo, hi = s.get('lowest_price'), s.get('highest_price')
    price = {'min': round(lo), 'max': round(hi or lo), 'currency': 'USD'} if lo is not None else None
    return {
        'id': str(ev['id']),
        # SeatGeek adds the city to most titles ('Hadestown - New York').
        'title': re.sub(r'\s+-\s+New York$', '', ev.get('title') or ev.get('short_title') or ''),
        'category': category(ev),
        'start': start.isoformat(),
        'end': None,
        'allDay': bool(ev.get('time_tbd')),
        'venue': {'name': v.get('name', 'Venue TBA'), 'address': ', '.join(x for x in (v.get('address'), v.get('extended_address')) if x),
                  'neighborhood': v.get('city', ''), 'lat': round(float(v['location']['lat']), 6), 'lng': round(float(v['location']['lon']), 6)},
        'price': price,
        'priceUnknown': price is None,
        'description': (ev.get('type') or '').replace('_', ' '),
        'details': ev.get('description') or '',
        'url': ev.get('url') or PAGE,
        'tags': [t['name'].replace('_', ' ') for t in ev.get('taxonomies') or [] if t.get('name')],
    }


def main():
    day = datetime.strptime(sys.argv[1], '%Y-%m-%d').date() if len(sys.argv) > 1 else datetime.now(NYC).date()
    client_id = os.environ.get('SEATGEEK_CLIENT_ID')
    if not client_id:
        print('SEATGEEK_CLIENT_ID is not set; skipping SeatGeek and keeping the existing snapshot.')
        return
    print(f'Fetching SeatGeek events for {day}...')
    rows = fetch_day(day, client_id)
    events, unplaced, seen = [], [], set()
    for ev in rows:
        v = ev.get('venue') or {}
        # Timed-entry attractions can list many slots a day; keep the first.
        slot = ((ev.get('title') or '').strip().lower(), v.get('id'))
        if ev['id'] in seen or slot in seen or ev.get('date_tbd'):
            continue
        seen.update((ev['id'], slot))
        if (v.get('location') or {}).get('lat'):
            events.append(to_raw(ev))
        else:
            unplaced.append({'title': ev.get('title'), 'url': ev.get('url')})
    OUT.write_text(json.dumps({
        'source': {'name': 'SeatGeek', 'url': PAGE},
        'date': day.isoformat(),
        'fetchedAt': datetime.now(NYC).isoformat(timespec='seconds'),
        'events': events,
        'unplaced': unplaced,
    }, indent=1, ensure_ascii=False))
    print(f'  {len(events)} placed, {len(unplaced)} without a location')
    print(f'  wrote {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
