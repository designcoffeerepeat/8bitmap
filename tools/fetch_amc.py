#!/usr/bin/env python3
"""Snapshot one day of IMAX showings at AMC Lincoln Square 13 into public/data/amc-events.json.

Uses AMC's official API (https://developers.amctheatres.com), which needs a vendor key in the
AMC_API_KEY environment variable (a repository secret for the scheduled refresh). Only IMAX
showings are kept: the theatre's other screens are left out on purpose. Without a key the
script says so and leaves the existing snapshot alone.

Usage:  python3 tools/fetch_amc.py [YYYY-MM-DD]     (default: today in NYC)
"""

import json
import os
import sys
import urllib.error
import urllib.parse
from datetime import datetime
from pathlib import Path

from fetch_nycgov import DATA, NYC, get

ROOT = Path(__file__).resolve().parent.parent
OUT = DATA / 'amc-events.json'
API = 'https://api.amctheatres.com'
SLUG = 'amc-lincoln-square-13'
PAGE = f'https://www.amctheatres.com/movie-theatres/new-york-city/{SLUG}'
# Broadway at West 68th Street, where the building sits; used when the API leaves coordinates out.
VENUE = {'name': 'AMC Lincoln Square 13 IMAX', 'address': '1998 Broadway, New York', 'neighborhood': 'Upper West Side',
         'lat': 40.775461, 'lng': -73.981854}


def call(path, key, **params):
    url = f'{API}{path}' + (f'?{urllib.parse.urlencode(params)}' if params else '')
    return get(url, headers={'X-AMC-Vendor-Key': key, 'Accept': 'application/json'})


def theatre(key):
    """The theatre's record, found by its slug in AMC's New York list."""
    page = 1
    while True:
        data = call('/v2/theatres', key, state='new-york', **{'page-size': 100, 'page-number': page})
        rows = (data.get('_embedded') or {}).get('theatres', [])
        for t in rows:
            if t.get('slug') == SLUG or 'lincoln square' in (t.get('name') or '').lower():
                return t
        if not rows or page * 100 >= data.get('count', 0):
            raise SystemExit(f'{SLUG} is not in AMC\'s New York theatre list')
        page += 1


def showtimes(tid, day, key):
    """Every showtime that day. The API takes the date as M-D-YY."""
    rows, page = [], 1
    while True:
        data = call(f'/v2/theatres/{tid}/showtimes/{day.month}-{day.day}-{day:%y}', key,
                    **{'page-size': 100, 'page-number': page})
        got = (data.get('_embedded') or {}).get('showtimes', [])
        rows += got
        if not got or page * 100 >= data.get('count', 0):
            return rows
        page += 1


def is_imax(s):
    marks = [s.get('premiumFormat') or '', s.get('premiumFormatName') or '']
    marks += [f"{a.get('code', '')} {a.get('name', '')}" for a in s.get('attributes') or []]
    return any('imax' in m.lower() for m in marks)


def venue_of(t):
    loc = t.get('location') or {}
    lat, lng = loc.get('latitude'), loc.get('longitude')
    if lat is None or lng is None:
        return VENUE
    return {**VENUE, 'address': ', '.join(x for x in (loc.get('addressLine1'), loc.get('city')) if x) or VENUE['address'],
            'lat': round(float(lat), 6), 'lng': round(float(lng), 6)}


def to_raw(s, venue):
    start = datetime.fromisoformat(s['showDateTimeLocal']).replace(tzinfo=NYC)
    fmt = ' / '.join(dict.fromkeys(a.get('name') for a in s.get('attributes') or [] if 'imax' in (a.get('code', '') + a.get('name', '')).lower()))
    rating = s.get('mpaaRating')
    minutes = s.get('runTime')
    return {
        'id': str(s['id']),
        'title': f"{s.get('movieName', 'Movie')} in IMAX",
        'category': 'film',
        'start': start.isoformat(),
        'end': None,
        'allDay': False,
        'venue': venue,
        'price': None,
        'priceUnknown': True,
        'description': ' / '.join(x for x in (fmt or 'IMAX', rating, f'{minutes} min' if minutes else None) if x),
        'details': 'Sold out.' if s.get('isSoldOut') else '',
        'url': s.get('purchaseUrl') or s.get('movieUrl') or PAGE,
        'tags': ['IMAX'],
    }


def main():
    day = datetime.strptime(sys.argv[1], '%Y-%m-%d').date() if len(sys.argv) > 1 else datetime.now(NYC).date()
    key = os.environ.get('AMC_API_KEY')
    if not key:
        print('AMC_API_KEY is not set; skipping AMC and keeping the existing snapshot.')
        return
    print(f'Fetching IMAX showings at AMC Lincoln Square for {day}...')
    try:
        t = theatre(key)
        rows = showtimes(t['id'], day, key)
    except urllib.error.HTTPError as e:
        raise SystemExit(f'AMC API said {e.code}: {e.read().decode("utf-8", "replace")[:300]}')
    venue = venue_of(t)
    events = [to_raw(s, venue) for s in rows if is_imax(s) and s.get('showDateTimeLocal')]
    OUT.write_text(json.dumps({
        'source': {'name': 'AMC Lincoln Square IMAX', 'url': PAGE},
        'date': day.isoformat(),
        'fetchedAt': datetime.now(NYC).isoformat(timespec='seconds'),
        'events': events,
        'unplaced': [],
    }, indent=1, ensure_ascii=False))
    print(f'  {len(events)} IMAX showings of {len(rows)} at the theatre')
    print(f'  wrote {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
