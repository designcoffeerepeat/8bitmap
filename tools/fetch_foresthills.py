#!/usr/bin/env python3
"""Snapshot one day of events from Forest Hills' own calendars into public/data/foresthills-events.json.

Same idea as fetch_venues.py, kept in its own file so each neighbourhood's venues can be added
without touching the others. Each place is read on its own, and only the title, time and a link
back are kept; no images or write-ups. Every event names its venue as its publisher, so each
shows up on its own in the Sources dropdown.

  Commonpoint Queens   the public events (not the classes) in its WordPress events feed,
                       https://www.commonpoint.org/wp-json/tribe/events/v1/events, at Central Queens
                       in Forest Hills and its other NYC centers
  Rove                 Thursday trivia, as its home page announces it (https://www.rove7227.com/)

Forest Hills Stadium, the Forest Hills Greenmarket and Forest Park are already covered by
Ticketmaster and SeatGeek, the Greenmarkets source and NYC.gov.

Checked 2026-10-22 and left out: Cinemart Cinemas (terms allow personal use only and forbid passing
anything on for a commercial or public purpose), Queens Public Library (terms allow personal,
non-commercial use only), The Church-in-the-Gardens (its calendar is recovery groups, scouts and
rehearsals, not public events), Regal UA Midway (chain ticketing site).

Usage:  python3 tools/fetch_foresthills.py [YYYY-MM-DD]     (default: today in NYC)
"""

import html
import json
import re
import sys
import time
import urllib.parse
from datetime import datetime
from pathlib import Path

from fetch_nycgov import CACHE, DATA, NYC, geosearch, get
from fetch_venues import at, text

ROOT = Path(__file__).resolve().parent.parent
OUT = DATA / 'foresthills-events.json'

COMMONPOINT = ('Commonpoint Queens', 'https://www.commonpoint.org/')
ROVE = ('Rove', '72-27 Austin Street, Queens', 'https://www.rove7227.com/')

KINDS = [
    ('music', r'concert|\bjazz\b|\bband\b|choir|music'),
    ('art', r'\bart\b|painting|craft|floral|bouquet|workshop'),
    ('food', r'brunch|dinner|\btable\b|food|tasting'),
    ('sports', r'capoeira|basketball|soccer|swim|tennis|fitness'),
]


def kind(title, default='community'):
    return next((k for k, pat in KINDS if re.search(pat, title.lower())), default)


def event(venue, address, title, start, url, category, end=None, publisher=None):
    return {'venue': venue, 'address': address, 'title': title, 'category': category,
            'start': start, 'end': end, 'url': url, 'publisher': publisher}


def commonpoint(day):
    q = urllib.parse.urlencode({'start_date': day.isoformat(), 'end_date': day.isoformat() + ' 23:59:59',
                                'per_page': 50, 'categories': 4})  # 4 is 'Event'; 'Class' is the registered courses
    out = []
    for e in get(f'https://www.commonpoint.org/wp-json/tribe/events/v1/events?{q}').get('events', []):
        v = e.get('venue') if isinstance(e.get('venue'), dict) else {}
        # Virtual sessions and events with no street address can't go on the map.
        if not v.get('address') or e.get('all_day'):
            continue
        try:
            start = datetime.fromisoformat(e['start_date']).replace(tzinfo=NYC)
            end = datetime.fromisoformat(e['end_date']).replace(tzinfo=NYC)
        except (KeyError, ValueError):
            continue
        if start.date() != day:
            continue
        name = text(html.unescape(v.get('venue', '')))
        venue = name if name.lower().startswith('commonpoint') else f'Commonpoint {name}'
        title = text(e.get('title', ''))
        out.append(event(venue, f"{text(v['address'])}, {text(v.get('city') or 'Queens')}", title, start,
                         e.get('url') or COMMONPOINT[1], kind(title), end if end > start else None, COMMONPOINT))
    return out


def rove(day):
    page = text(get(ROVE[2], as_json=False))
    # 'TRIVIA NIGHT AT ROVE: EVERY THURSDAY 7-9PM!'
    m = re.search(r'TRIVIA NIGHT AT ROVE:\s*EVERY (\w+)DAY (\d{1,2})\s*-\s*(\d{1,2})\s*PM', page, re.I)
    if not m or day.strftime('%A').upper() != m.group(1).upper() + 'DAY':
        return []
    start, end = at(day, int(m.group(2)) % 12 + 12, 0), at(day, int(m.group(3)) % 12 + 12, 0)
    return [event(ROVE[0], ROVE[1], 'Trivia Night at Rove', start, ROVE[2], 'trivia', end if end > start else None)]


READERS = [commonpoint, rove]


def place(address, cache):
    key = f'venue: {address}'
    if key not in cache:
        num = address.split()[0]
        hit = next((r for r in geosearch(address, size=3) if r['label'].startswith(num + ' ')), None)
        cache[key] = {k: hit[k] for k in ('lat', 'lng', 'label')} if hit else None
        time.sleep(0.2)
    return cache[key]


def main():
    day = datetime.strptime(sys.argv[1], '%Y-%m-%d').date() if len(sys.argv) > 1 else datetime.now(NYC).date()
    print(f'Fetching Forest Hills calendars for {day}...')
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    rows = []
    for read in READERS:
        try:
            got = read(day)
            print(f'  {read.__name__}: {len(got)}')
            rows += got
        except Exception as e:
            print(f'  could not read {read.__name__}: {e}', file=sys.stderr)
        time.sleep(1)
    events, unplaced, seen = [], [], set()
    for r in rows:
        key = (r['venue'], r['title'].lower(), r['start'])
        if key in seen:
            continue
        seen.add(key)
        pos = place(r['address'], cache)
        if not pos:
            unplaced.append({'title': r['title'], 'venue': r['venue'], 'url': r['url']})
            continue
        slug = re.sub(r'[^a-z0-9]+', '-', r['venue'].lower()).strip('-')
        pub_name, pub_url = r['publisher'] or (r['venue'], ROVE[2])
        events.append({
            'id': f"{slug}-{r['start'].strftime('%Y%m%d%H%M')}-{re.sub(r'[^a-z0-9]+', '-', r['title'].lower())[:40]}",
            'title': r['title'],
            'category': r['category'],
            'start': r['start'].isoformat(),
            'end': r['end'].isoformat() if r['end'] else None,
            'allDay': False,
            'venue': {'name': r['venue'], 'address': r['address'].split(',')[0], 'neighborhood': '',
                      'lat': round(pos['lat'], 6), 'lng': round(pos['lng'], 6)},
            'price': None,
            'priceUnknown': True,
            'description': '',
            'details': '',
            'url': r['url'],
            'tags': [],
            'publisher': {'id': 'venue-' + re.sub(r'[^a-z0-9]+', '-', pub_name.lower()).strip('-'), 'name': pub_name, 'url': pub_url},
        })
    CACHE.write_text(json.dumps(cache, indent=1, sort_keys=True))
    OUT.write_text(json.dumps({
        'source': {'name': 'Forest Hills calendars', 'url': COMMONPOINT[1]},
        'date': day.isoformat(),
        'fetchedAt': datetime.now(NYC).isoformat(timespec='seconds'),
        'events': events,
        'unplaced': unplaced,
    }, indent=1, ensure_ascii=False))
    print(f'  {len(events)} placed, {len(unplaced)} without a location')
    print(f'  wrote {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
