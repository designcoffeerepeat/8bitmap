#!/usr/bin/env python3
"""Snapshot one day of events from Staten Island's own calendars into public/data/statenisland-events.json.

Same idea as fetch_foresthills.py: each place is read on its own, and only the title, time and a
link back are kept; no images or write-ups. Every event names its venue as its publisher, so each
shows up on its own in the Sources dropdown.

  Staten Island Children's Museum   its WordPress events feed (The Events Calendar plugin),
                                    https://sichildrensmuseum.org/wp-json/tribe/events/v1/events
  Noble Maritime Collection         its Squarespace events page, https://www.noblemaritime.org/events
  Historic Richmond Town            its Squarespace events page, https://www.historicrichmondtown.org/events
  Alice Austen House                its events list (Modern Events Calendar), https://aliceausten.org/all-events/

St. George Theatre sells through Ticketmaster, which already lists its shows, and Staten Island's
parks come in through NYC.gov.

Checked 2026-10-22 and left out: Empire Outlets (terms allow personal, non-commercial use only and
forbid reproducing anything), Kills Boro Brewing (terms forbid reproducing or using any site content
without written permission), Snug Harbor, the Staten Island Museum and Wagner College (Cloudflare
blocks automated readers), Staten Island Arts (its server refuses automated readers), NYPL (bot
wall), the Staten Island Zoo (refuses requests), the Conference House (no event calendar, tours
only), Greenbelt Conservancy and Flagship Brewing (calendars empty or a year old), the CSI Center
for the Arts (its calendar is school-group shows), Jacques Marchais Museum (Wix calendar that only
loads in a browser), Garibaldi-Meucci Museum (site could not be reached).

Usage:  python3 tools/fetch_statenisland.py [YYYY-MM-DD]     (default: today in NYC)
"""

import json
import re
import sys
import time
import urllib.parse
from datetime import datetime
from pathlib import Path

from fetch_nycgov import CACHE, DATA, NYC, geosearch, get
from fetch_venues import at, clock, text

ROOT = Path(__file__).resolve().parent.parent
OUT = DATA / 'statenisland-events.json'

SICM = ("Staten Island Children's Museum", '1000 Richmond Terrace, Staten Island', 'https://sichildrensmuseum.org/')
NOBLE = ('Noble Maritime Collection', '1000 Richmond Terrace, Staten Island', 'https://www.noblemaritime.org/')
HRT = ('Historic Richmond Town', '441 Clarke Avenue, Staten Island', 'https://www.historicrichmondtown.org/')
AUSTEN = ('Alice Austen House', '2 Hylan Boulevard, Staten Island', 'https://aliceausten.org/')

KINDS = [
    ('theater', r'theat(er|re)|\bplay\b|puppet|\bdance\b'),
    ('music', r'concert|\bjazz\b|\bband\b|choir|music|shant(y|ies)|\bsongs?\b'),
    ('film', r'screening|\bfilm\b|movie|cinema'),
    ('art', r'\bart\b|exhibit|gallery|photo|painting|craft|workshop|weaving|knit|auction'),
    ('food', r'brunch|dinner|food|tasting|harvest|pumpkin'),
]


def kind(title, default='community'):
    return next((k for k, pat in KINDS if re.search(pat, title.lower())), default)


def event(place, title, start, url, end=None, address=None):
    return {'venue': place[0], 'address': address or place[1], 'title': title, 'category': kind(title),
            'start': start, 'end': end if end and end > start else None, 'url': url, 'publisher': (place[0], place[2])}


def sicm(day):
    q = urllib.parse.urlencode({'start_date': day.isoformat(), 'end_date': day.isoformat() + ' 23:59:59', 'per_page': 50})
    out = []
    for e in get(f'https://sichildrensmuseum.org/wp-json/tribe/events/v1/events?{q}').get('events', []):
        title = text(e.get('title', ''))
        # Members-only parties and private bookings are not open to the public.
        if e.get('all_day') or re.search(r'members only|private', title, re.I):
            continue
        try:
            start = datetime.fromisoformat(e['start_date']).replace(tzinfo=NYC)
            end = datetime.fromisoformat(e['end_date']).replace(tzinfo=NYC)
        except (KeyError, ValueError):
            continue
        if start.date() == day:
            out.append(event(SICM, title, start, e.get('url') or SICM[2], end))
    return out


def squarespace(place, path):
    def read(day):
        base = place[2].rstrip('/')
        out = []
        for e in get(f'{base}{path}?format=json').get('upcoming', []):
            start = datetime.fromtimestamp(e['startDate'] / 1000, NYC)
            end = datetime.fromtimestamp(e['endDate'] / 1000, NYC) if e.get('endDate') else None
            # Exhibitions and season-long tours are listed as one long event; only what starts that day is kept.
            if start.date() != day or (end and end.date() != day):
                continue
            loc = e.get('location') or {}
            line = text(loc.get('addressLine1'))
            address = f'{line}, Staten Island' if re.match(r'\d', line) else None
            out.append(event(place, text(e.get('title')), start, base + e.get('fullUrl', ''), end, address))
        return out
    read.__name__ = place[0].lower().replace(' ', '_')
    return read


def austen(day):
    page = get(AUSTEN[2] + 'all-events/', as_json=False)
    out = []
    for m in re.finditer(r'<article class="([^"]*mec-event-article[^"]*)">(.*?)</article>', page, re.S):
        cls, body = m.groups()
        ym = re.search(r'mec-toggle-(\d{4})(\d{2})', cls)
        dd = re.search(r'mec-event-date[^>]*>\s*<span>(\d{1,2})</span>', body)
        link = re.search(r'mec-event-title"><a[^>]*href="([^"]+)"[^>]*>(.*?)</a>', body, re.S)
        if not (ym and dd and link) or (int(ym[1]), int(ym[2]), int(dd[1])) != (day.year, day.month, day.day):
            continue
        st = re.search(r'mec-start-time">([^<]+)<', body)
        if not st:
            continue
        h, mi = clock(st[1])
        en = re.search(r'mec-end-time">([^<]+)<', body)
        end = at(day, *clock(en[1])) if en else None
        out.append(event(AUSTEN, text(link[2]), at(day, h, mi), link[1], end))
    return out


READERS = [sicm, squarespace(NOBLE, '/events'), squarespace(HRT, '/events'), austen]


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
    print(f'Fetching Staten Island calendars for {day}...')
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
        pub_name, pub_url = r['publisher']
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
        'source': {'name': 'Staten Island calendars', 'url': HRT[2]},
        'date': day.isoformat(),
        'fetchedAt': datetime.now(NYC).isoformat(timespec='seconds'),
        'events': events,
        'unplaced': unplaced,
    }, indent=1, ensure_ascii=False))
    print(f'  {len(events)} placed, {len(unplaced)} without a location')
    print(f'  wrote {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
