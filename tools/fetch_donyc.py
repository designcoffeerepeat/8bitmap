#!/usr/bin/env python3
"""Snapshot one day of doNYC listings into public/data/donyc-events.json.

doNYC's day pages (https://donyc.com/events/2026/10/17) list every event with
schema.org markup: title, venue, start time and category. The listings carry
no coordinates, so each venue's street address is read once from one of its
event pages, placed with NYC GeoSearch, and remembered in
data/geocode-cache.json so later runs only look up venues they have not seen.

Usage:  python3 tools/fetch_donyc.py [YYYY-MM-DD]     (default: today in NYC)
"""

import html
import json
import re
import sys
import time
from datetime import datetime
from pathlib import Path

from fetch_nycgov import CACHE, NYC, geosearch, get, intersection, venue_category

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'data' / 'donyc-events.json'
SITE = 'https://donyc.com'
CATEGORIES = {'music': 'music', 'art': 'art', 'arts': 'art', 'theatre': 'theater', 'theater': 'theater', 'comedy': 'comedy',
              'food': 'food', 'food-drink': 'food', 'sports': 'sports', 'film': 'film', 'nightlife': 'nightlife',
              'dance': 'nightlife', 'party': 'nightlife'}



def category(cat, venue):
    """doNYC files plays under arts too, so a show at a theater is theater."""
    c = CATEGORIES.get(cat)
    return venue_category(venue, c or 'community') if c in (None, 'art') else c


def page(path):
    return get(f'{SITE}{path}', as_json=False)


def text(s):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s or ''))).strip()


def listings(day):
    """Every listing card on the day's pages."""
    out, n = [], 1
    while n <= 40:
        body = page(f'/events/{day.year}/{day.month}/{day.day}' + (f'?page={n}' if n > 1 else ''))
        cards = re.split(r'(?=<div class="ds-listing event-card)', body)[1:]
        if not cards:
            return out
        for c in cards:
            link = re.search(r'data-permalink="([^"]+)"', c)
            title = re.search(r'itemprop="name">([^<]*)</span>\s*</a>', c)
            venue = re.search(r'<a href="(/venues/[^"]+)" itemprop="url"><span itemprop="name">([^<]*)', c)
            start = re.search(r'itemprop="startDate"[^>]*content="([^"]+)"', c)
            end = re.search(r'itemprop="endDate"[^>]*content="([^"]+)"', c)
            cat = re.search(r'ds-event-category-([a-z-]+)', c)
            if link and title and venue and start:
                out.append({'url': SITE + link.group(1), 'path': link.group(1), 'title': text(title.group(1)),
                            'venue_path': venue.group(1), 'venue': text(venue.group(2)),
                            'start': start.group(1), 'end': end.group(1) if end else None,
                            'category': category(cat.group(1) if cat else '', text(venue.group(2)))})
        n += 1
        time.sleep(0.3)
    return out


def venue_position(li, cache):
    """A venue's address from one of its event pages, placed with GeoSearch. Cached per venue."""
    key = f"donyc: {li['venue_path']}"
    if key in cache:
        return cache[key]
    hit = None
    try:
        body = page(li['path'])
        time.sleep(0.3)
        street = re.search(r'itemprop="streetAddress" content="([^"]*)"', body)
        locality = re.search(r'itemprop="addressLocality" content="([^"]*)"', body)
        postal = re.search(r'itemprop="postalCode" content="([^"]*)"', body)
        addr = html.unescape(street.group(1)).strip() if street else ''
        where = ', '.join(html.unescape(x.group(1)) for x in (locality, postal) if x and x.group(1))
        num = re.match(r'(\d+(?:-\d+)?)\s+\S', addr)
        corner = re.match(r'(.+?)\s*(?:&|\band\b|@)\s*(.+)', addr)
        if num and not corner:
            res = geosearch(f'{addr}, {where}')
            # Only trust a hit on the same house number.
            if res and res[0]['confidence'] >= 0.8 and res[0]['label'].startswith(num.group(1) + ' '):
                hit = {'lat': res[0]['lat'], 'lng': res[0]['lng'], 'label': res[0]['label'], 'address': f'{addr}, {where}'}
        elif corner and locality:
            boro = 'Manhattan' if locality.group(1).strip().lower() in ('new york', 'manhattan') else locality.group(1).strip()
            best = intersection(corner.group(1), corner.group(2), boro)
            if best and best[0] < 120:
                hit = {**best[1], 'address': f'{addr}, {where}'}
        if not hit:
            # Parks and landmarks GeoSearch knows by name ('Bryant Park', 'Governors Island').
            name = re.sub(r'[^a-z0-9]+', ' ', li['venue'].lower()).strip()
            for r in geosearch(li['venue'], size=5):
                if re.sub(r'[^a-z0-9]+', ' ', r['label'].split(',')[0].lower()).strip() == name and r['confidence'] >= 0.8:
                    hit = {'lat': r['lat'], 'lng': r['lng'], 'label': r['label'], 'address': r['label']}
                    break
    except Exception as e:
        print(f"  could not place {li['venue']}: {e}", file=sys.stderr)
        return None
    cache[key] = hit
    return hit


def on_day(iso, day):
    """doNYC times look like 2026-10-17T20:00-0400. A run that began earlier keeps its clock time today."""
    t = datetime.strptime(iso, '%Y-%m-%dT%H:%M%z')
    if t.date() < day:
        t = t.replace(year=day.year, month=day.month, day=day.day)
    return t.astimezone(NYC).isoformat()


def main():
    day = datetime.strptime(sys.argv[1], '%Y-%m-%d').date() if len(sys.argv) > 1 else datetime.now(NYC).date()
    print(f'Fetching doNYC listings for {day}...')
    rows = listings(day)
    print(f'  {len(rows)} listed')
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    events, unplaced, seen = [], [], set()
    for li in rows:
        if li['path'] in seen:
            continue
        seen.add(li['path'])
        pos = venue_position(li, cache)
        if not pos:
            unplaced.append({'title': li['title'], 'venue': li['venue'], 'url': li['url']})
            continue
        start = on_day(li['start'], day)
        end = on_day(li['end'], day) if li['end'] and li['end'][:10] == li['start'][:10] else None
        events.append({
            'id': li['path'].rstrip('/').split('/')[-1],
            'title': li['title'],
            'category': li['category'],
            'start': start,
            'end': end,
            'venue': {'name': li['venue'], 'address': pos.get('address', ''), 'neighborhood': '',
                      'lat': round(pos['lat'], 6), 'lng': round(pos['lng'], 6)},
            'price': None,
            'priceUnknown': True,  # day listings do not show prices
            'description': '',
            'details': '',
            'url': li['url'],
            'tags': [],
        })
    CACHE.write_text(json.dumps(cache, indent=1, sort_keys=True))
    OUT.write_text(json.dumps({
        'source': {'name': 'doNYC', 'url': SITE},
        'date': day.isoformat(),
        'fetchedAt': datetime.now(NYC).isoformat(timespec='seconds'),
        'events': events,
        'unplaced': unplaced,
    }, indent=1, ensure_ascii=False))
    print(f'  {len(events)} placed, {len(unplaced)} without a mappable venue')
    print(f'  wrote {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
