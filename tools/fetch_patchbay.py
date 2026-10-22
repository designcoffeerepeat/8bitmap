#!/usr/bin/env python3
"""Snapshot one day of Patchbay New York shows into public/data/patchbay-events.json.

Patchbay (https://patchbay.fm/new-york) lists the city's live music, with every
act on the bill and their genres. Its pages carry the shows as schema.org
MusicEvent data, read here from the day's pages (/new-york/today or
/new-york/tomorrow, 20 shows a page). robots.txt allows these pages and asks
for 5 seconds between requests, which the script keeps.

The day's list names each venue but not its street, which only a show's own page
gives, so the first show seen at a venue is opened once and the venue's address
and position are kept in data/patchbay-venues.json for later runs. NYC addresses
are placed with GeoSearch, others (New Jersey, Long Island) with the Census
geocoder; venues off the map are dropped by the page as usual.

Usage:  python3 tools/fetch_patchbay.py [YYYY-MM-DD]     (default: today in NYC)
"""

import json
import re
import sys
import time
import urllib.error
import urllib.parse
from datetime import date, datetime, timedelta
from pathlib import Path

from fetch_nycgov import DATA, NYC, geosearch, get, strip_html

ROOT = Path(__file__).resolve().parent.parent
OUT = DATA / 'patchbay-events.json'
VENUES = ROOT / 'data' / 'patchbay-venues.json'
SITE = 'https://patchbay.fm'
PAGE = f'{SITE}/new-york'
CENSUS = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress'
DELAY = 5  # robots.txt Crawl-delay
RETRY_DAYS = 14  # how long a venue without a usable address waits before its page is read again
NYC_PLACES = {'new york', 'manhattan', 'brooklyn', 'queens', 'bronx', 'the bronx', 'staten island', 'long island city',
              'astoria', 'ridgewood', 'flushing', 'jamaica', 'sunnyside', 'woodside', 'jackson heights', 'forest hills',
              'rockaway', 'far rockaway', 'rockaway beach', 'maspeth', 'corona', 'elmhurst'}
NIGHTLIFE = re.compile(r'\b(house|techno|disco|dj|club|rave|trance|drum and bass|jungle|electro)\b', re.I)

last = 0.0


def fetch(url):
    """A page from patchbay.fm, at most one every DELAY seconds."""
    global last
    time.sleep(max(0.0, last + DELAY - time.time()))
    try:
        return get(url, as_json=False)
    finally:
        last = time.time()


def ld_json(page):
    out = []
    for m in re.finditer(r'<script type="application/ld\+json">(.*?)</script>', page, re.S):
        d = json.loads(m.group(1))
        out += d if isinstance(d, list) else [d]
    return out


def listing(day):
    """The day's MusicEvents. Only today and tomorrow have their own list."""
    today = datetime.now(NYC).date()
    which = {today: 'today', today + timedelta(days=1): 'tomorrow'}.get(day)
    if not which:
        raise SystemExit(f'Patchbay only lists today and tomorrow by day; {day} is neither.')
    shows, page = [], 1
    while page <= 15:
        try:
            body = fetch(f'{PAGE}/{which}?page={page}')
        except urllib.error.HTTPError as e:
            if e.code == 404 and page > 1:  # past the last page
                break
            raise
        items = [it['item'] for d in ld_json(body) if d.get('@type') == 'ItemList' for it in d.get('itemListElement', [])]
        if not items:
            break
        shows += items
        page += 1
    return shows


def show_day(ev):
    """The night a show is listed for, from its link: /show/new-york-2026-10-22-warsaw."""
    m = re.search(r'/show/new-york-(\d{4}-\d{2}-\d{2})-', ev.get('url', ''))
    return date.fromisoformat(m.group(1)) if m else None


def census(address):
    q = urllib.parse.urlencode({'address': address, 'benchmark': 'Public_AR_Current', 'format': 'json'})
    hits = get(f'{CENSUS}?{q}')['result']['addressMatches']
    return {'lat': hits[0]['coordinates']['y'], 'lng': hits[0]['coordinates']['x']} if hits else None


def locate(street, locality, region):
    if locality.lower() in NYC_PLACES and region in ('', 'NY'):
        num = street.split()[0]
        hit = next((r for r in geosearch(f'{street}, {locality}', size=3) if r['label'].startswith(num + ' ')), None)
        if not hit and re.match(r'\d+-\d+ ', street) and locality.lower() in ('new york', 'manhattan', 'brooklyn', 'bronx', 'the bronx', 'staten island'):
            return locate(street.replace(num, num.split('-')[0], 1), locality, region)  # a range of lots: 55-57 N 9th St
        return hit
    return census(', '.join(x for x in (street, locality, region) if x))


def venue_info(name, show_url, venues):
    """{'address', 'lat', 'lng'} for a venue, or None, reading its address from one show page the first time."""
    v = venues.get(name)
    if v and (v.get('lat') is not None or date.fromisoformat(v['checked']) > date.today() - timedelta(days=RETRY_DAYS)):
        return v if v.get('lat') is not None else None
    entry = {'address': '', 'lat': None, 'lng': None, 'checked': date.today().isoformat()}
    try:
        ev = next(d for d in ld_json(fetch(show_url)) if d.get('@type') == 'MusicEvent')
        a = ev.get('location', {}).get('address', {})
        street, locality, region = (a.get(k, '').strip() for k in ('streetAddress', 'addressLocality', 'addressRegion'))
        if street and re.match(r'\d', street):
            entry['address'] = f'{street}, {locality}' if locality and locality != 'New York' else street
            pos = locate(street, locality, region)
            if pos:
                entry['lat'], entry['lng'] = round(pos['lat'], 6), round(pos['lng'], 6)
    except Exception as e:
        print(f'  could not read the address of {name}: {e}', file=sys.stderr)
        return None
    venues[name] = entry
    return entry if entry['lat'] is not None else None


def to_raw(ev, day, v):
    start = datetime.fromisoformat(ev['startDate'].replace('Z', '+00:00')).astimezone(NYC)
    acts = [p.get('name', '') for p in ev.get('performer') or [] if p.get('name')]
    genres = list(dict.fromkeys(g for p in ev.get('performer') or [] for g in p.get('genre') or []))
    title = strip_html(ev.get('name', ''))
    shown = [a for a in acts if a.lower() not in title.lower()]
    return {
        'id': ev['url'].rsplit('/', 1)[-1],
        'title': title,
        'category': 'nightlife' if NIGHTLIFE.search(f'{title} {" ".join(genres[:4])}') else 'music',
        'start': start.isoformat(),
        'end': None,
        'listedDay': day.isoformat(),
        'allDay': False,
        'venue': {'name': ev['location']['name'], 'address': v['address'], 'neighborhood': '', 'lat': v['lat'], 'lng': v['lng']},
        'price': None,
        'priceUnknown': True,
        'description': ('With ' + ', '.join(shown[:6])) if shown else '',
        'details': ', '.join(genres[:8]),
        'url': ev['url'],
        'tags': genres[:5],
    }


def main():
    day = datetime.strptime(sys.argv[1], '%Y-%m-%d').date() if len(sys.argv) > 1 else datetime.now(NYC).date()
    print(f'Fetching Patchbay New York shows for {day}...')
    venues = json.loads(VENUES.read_text()) if VENUES.exists() else {}
    shows = listing(day)
    events, unplaced, seen = [], [], set()
    try:
        for ev in shows:
            if ev.get('url') in seen or show_day(ev) != day or 'Cancelled' in ev.get('eventStatus', ''):
                continue
            seen.add(ev['url'])
            v = venue_info(ev['location']['name'], ev['url'], venues)
            if v:
                events.append(to_raw(ev, day, v))
            else:
                unplaced.append({'title': ev.get('name'), 'venue': ev['location']['name'], 'url': ev['url']})
    finally:
        VENUES.write_text(json.dumps(venues, indent=1, sort_keys=True, ensure_ascii=False))
    OUT.write_text(json.dumps({
        'source': {'name': 'Patchbay', 'url': PAGE},
        'date': day.isoformat(),
        'fetchedAt': datetime.now(NYC).isoformat(timespec='seconds'),
        'events': events,
        'unplaced': unplaced,
    }, indent=1, ensure_ascii=False))
    print(f'  {len(events)} placed, {len(unplaced)} without a location')
    print(f'  wrote {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
