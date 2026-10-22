#!/usr/bin/env python3
"""Snapshot one day of Coney Island events into public/data/coneyisland-events.json.

Coney Island and Brighton Beach have almost no listings on the big sites, so this reads the
neighborhood's own calendars, each on its own so one site being down only loses that one:

  Coney Island USA       the events list on https://www.coneyisland.com/event (Burlesque at the
                         Beach, sideshow nights, films, talks); times come from each listing's
                         Add to Google Calendar link
  Luna Park              the park calendar on https://lunaparknyc.com/plan/park-hours/
                         (Halloween Harvest days, DJ nights); plain opening hours are left out
  Deno's Wonder Wheel    the special events on https://www.denoswonderwheel.com/calendar
                         (fireworks, karaoke, dance shows); the daily ride hours are left out

Checked 2026-10-22: none of these has terms that forbid automated reading, and their robots.txt
allow these pages (coneyisland.com and denoswonderwheel.com block only ?format=json and ical
exports, which are not used). Only title, time, a price when given and a link back are kept.
Left out: the New York Aquarium (its terms are on wcs.org, which the build cannot reach yet),
Kingsborough Community College (its calendar loads from a widget host not reachable yet), On Stage
at Kingsborough (no season announced), the Alliance for Coney Island (its events page has no dates),
Brooklyn Public Library (a bot check page), Millennium Theatre (site down) and Tatiana (domain parked).

Usage:  python3 tools/fetch_coneyisland.py [YYYY-MM-DD]     (default: today in NYC)
"""

import json
import re
import sys
import time
from datetime import datetime, timezone

from fetch_nycgov import CACHE, DATA, NYC, ROOT, geosearch, get
from fetch_venues import at, clock, event, text

OUT = DATA / 'coneyisland-events.json'

# name: (street address for GeoSearch, website)
VENUES = {
    'Coney Island USA': ('1208 Surf Avenue, Brooklyn', 'https://www.coneyisland.com/event'),
    'Luna Park': ('1000 Surf Avenue, Brooklyn', 'https://lunaparknyc.com/plan/park-hours/'),
    "Deno's Wonder Wheel": ('3059 West 12th Street, Brooklyn', 'https://www.denoswonderwheel.com/calendar'),
}
MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
          'October', 'November', 'December']


def price_of(s):
    if re.search(r'\bfree\b', s, re.I):
        return {'min': 0, 'max': 0, 'currency': 'USD'}
    nums = [float(n) for n in re.findall(r'\$(\d+(?:\.\d+)?)', s)]
    return {'min': round(min(nums)), 'max': round(max(nums)), 'currency': 'USD'} if nums else None


def utc(s):
    return datetime.strptime(s, '%Y%m%dT%H%M%SZ').replace(tzinfo=timezone.utc).astimezone(NYC)


def coney_island_usa(day, cache):
    body = get('https://www.coneyisland.com/event', as_json=False)
    out = []
    for a in re.findall(r'<article class="eventlist-event.*?</article>', body, re.S):
        dates = re.search(r'google\.com/calendar/event\?[^"]*?dates=(\d{8}T\d{6}Z)/(\d{8}T\d{6}Z)', a)
        title = re.search(r'<h1 class="eventlist-title"><a [^>]*>(.*?)</a>', a, re.S)
        link = re.search(r'href="(/event/[^"?#]+)"', a)
        if not (dates and title and link):
            continue
        start, end = utc(dates.group(1)), utc(dates.group(2))
        if start.date() != day:
            continue
        title = text(title.group(1))
        kind = text((re.search(r'\?category=[^"]*">(.*?)</a>', a, re.S) or re.search('()', '')).group(1))
        if re.search(r'burlesque|sideshow|drag', f'{kind} {title}', re.I):
            category = 'theater'
        elif re.search(r'cinema|film|movie|screening', title, re.I):
            category = 'film'
        else:
            category = 'community'
        where = re.search(r'maps\.google\.com\?q=([^"]+)"', a)
        addr = text(where.group(1)).replace(' United States', '') if where else ''
        pos = None
        # A few listings are held down the street rather than at the sideshow building.
        if addr and not addr.startswith('1208 '):
            key = f'coneyisland: {addr}'
            if key not in cache:
                num = addr.split()[0]
                hit = next((r for r in geosearch(addr, size=3) if r['label'].startswith(num + ' ')), None)
                cache[key] = {k: hit[k] for k in ('lat', 'lng', 'label')} if hit else None
                time.sleep(0.2)
            pos = cache[key]
        note = text((re.search(r'<div class="eventlist-excerpt">(.*?)</div>', a, re.S) or re.search('()', '')).group(1))
        ev = event('Coney Island USA', title, start, 'https://www.coneyisland.com' + link.group(1), category,
                   end=end if end > start else None, price=price_of(note), pos=pos,
                   publisher=('Coney Island USA', VENUES['Coney Island USA'][1]) if pos else None)
        if pos:
            ev['address'] = addr.split(' Brooklyn')[0]
        out.append(ev)
    return out


def luna_park(day):
    body = get('https://lunaparknyc.com/plan/park-hours/', as_json=False)
    # The month grid and the day lists below it both carry data-mec-cell; the lists hold the events.
    cell = re.search(rf'class="mec-calendar-events-sec[^"]*" data-mec-cell="{day:%Y%m%d}"(.*?)(?=data-mec-cell="|$)', body, re.S)
    out = []
    for art in re.findall(r'<article class="mec-event-article">(.*?)</article>', cell.group(1) if cell else '', re.S):
        span = re.search(r'(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M)', text(art), re.I)
        name = re.search(r'<h4 class="mec-event-title"><a [^>]*href="([^"]+)"[^>]*>(.*?)</a>', art, re.S)
        if not (span and name):
            continue
        title = text(name.group(2))
        if re.fullmatch(r'park (opening )?hours', title, re.I):
            continue
        start, end = at(day, *clock(span.group(1))), at(day, *clock(span.group(2)))
        category = 'music' if re.search(r'\bDJ\b|live|concert', title) else 'community'
        ev = event('Luna Park', title, start, name.group(1), category, end=end if end > start else None)
        ev['priceUnknown'] = True
        out.append(ev)
    return out


def denos(day):
    """The park's 2026 calendar is one long list, 'October 17 - ThrillerNYC Dance Event ...', mostly
    ride hours and closed days, which are left out."""
    body = get('https://www.denoswonderwheel.com/calendar', as_json=False)
    lines = re.findall(r'<p[^>]*>(.*?)</p>', body, re.S)
    out = []
    for line in (text(x) for x in lines):
        m = re.match(rf'{MONTHS[day.month - 1]} {day.day}\s*-\s*(.+)', line)
        if not m:
            continue
        what = m.group(1)
        # One line can hold the day's hours and an event: '... open at noon, September 4 - Practical Magic ...'
        what = re.split(rf',\s*{MONTHS[day.month - 1]} {day.day}\s*-\s*', what)[-1]
        if re.match(r'(kiddie park|adult rides|park) (opens|open)|closed\b', what, re.I):
            continue
        times = re.findall(r'(\d{1,2}(?::\d{2})?\s*[ap]\.?m)', what, re.I)
        if not times:
            continue
        title = re.split(r'\s+[-–]\s+|\s+from\s+\d|\s+\d{1,2}(?::\d{2})?\s*[ap]m', what, maxsplit=1, flags=re.I)[0].strip(' .,')
        start = at(day, *clock(times[0]))
        end = at(day, *clock(times[1])) if len(times) > 1 and re.search(r'\bto\b|-', what) else None
        category = ('music' if re.search(r'karaoke|concert|music', title, re.I)
                    else 'theater' if re.search(r'dance|show', title, re.I) else 'community')
        ev = event("Deno's Wonder Wheel", title, start, VENUES["Deno's Wonder Wheel"][1], category,
                   end=end if end and end > start else None)
        out.append(ev)
    return out


READERS = [coney_island_usa, luna_park, denos]


def place(venue, cache):
    key = f'venue: {venue}'
    if key not in cache:
        addr = VENUES[venue][0]
        num = addr.split()[0]
        hit = next((r for r in geosearch(addr, size=3) if r['label'].startswith(num + ' ')), None)
        cache[key] = {k: hit[k] for k in ('lat', 'lng', 'label')} if hit else None
        time.sleep(0.2)
    return cache[key]


def main():
    day = datetime.strptime(sys.argv[1], '%Y-%m-%d').date() if len(sys.argv) > 1 else datetime.now(NYC).date()
    print(f'Fetching Coney Island calendars for {day}...')
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    rows = []
    for read in READERS:
        try:
            got = read(day, cache) if read is coney_island_usa else read(day)
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
        pos = r['pos'] or place(r['venue'], cache)
        if not pos:
            unplaced.append({'title': r['title'], 'venue': r['venue'], 'url': r['url']})
            continue
        slug = re.sub(r'[^a-z0-9]+', '-', r['venue'].lower()).strip('-')
        pub_name, pub_url = r['publisher'] or (r['venue'], VENUES[r['venue']][1])
        pub_id = 'venue-' + re.sub(r'[^a-z0-9]+', '-', pub_name.lower()).strip('-')
        events.append({
            'id': f"{slug}-{r['start'].strftime('%Y%m%d%H%M')}-{re.sub(r'[^a-z0-9]+', '-', r['title'].lower())[:40]}",
            'title': r['title'],
            'category': r['category'],
            'start': r['start'].isoformat(),
            'end': r['end'].isoformat() if r['end'] else None,
            'allDay': False,
            'venue': {'name': r['venue'], 'address': r.get('address') or VENUES[r['venue']][0].split(',')[0],
                      'neighborhood': r['neighborhood'], 'lat': round(pos['lat'], 6), 'lng': round(pos['lng'], 6)},
            'price': r['price'],
            'priceUnknown': r.get('priceUnknown', r['price'] is None),
            'description': r['description'],
            'details': '',
            'url': r['url'],
            'tags': [],
            'publisher': {'id': pub_id, 'name': pub_name, 'url': pub_url},
        })
    events.sort(key=lambda e: e['start'])
    CACHE.write_text(json.dumps(cache, indent=1, sort_keys=True))
    OUT.write_text(json.dumps({
        'source': {'name': 'Coney Island calendars', 'url': 'https://www.coneyisland.com/event'},
        'date': day.isoformat(),
        'fetchedAt': datetime.now(NYC).isoformat(timespec='seconds'),
        'events': events,
        'unplaced': unplaced,
    }, indent=1, ensure_ascii=False))
    print(f'  {len(events)} placed, {len(unplaced)} without a location')
    print(f'  wrote {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
