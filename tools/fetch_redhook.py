#!/usr/bin/env python3
"""Snapshot one day of Red Hook events into public/data/redhook-events.json.

Red Hook has few listings on the big sites, so this reads the neighborhood's own calendars,
each on its own so one site being down only loses that one:

  Pioneer Works          the calendar on https://pioneerworks.org/calendar (concerts, talks,
                         Second Sundays, gallery Saturdays), with each program's page for its
                         discipline; programs held somewhere else are left out
  Waterfront Museum      the barge's open hours and shows, from the public events feed
                         (The Events Calendar) on https://waterfrontmuseum.org/barge-events/
  Brooklyn CB6           Community Board 6's community calendar (Red Hook, Carroll Gardens,
                         Cobble Hill, Gowanus, Park Slope), from the same kind of feed on
                         https://brooklyncb6.cityofnewyork.us/events/; only events with a street
                         address are kept, and not election days or Nitehawk shows (Nitehawk is
                         already in fetch_venues.py)

Checked 2026-10-22: none of the three has terms that forbid automated reading, and their
robots.txt allow it (CB6 asks for 10 seconds between requests). Left out: Kentler International
Drawing Space (terms forbid commercial use of the site's text), BWAC (no Red Hook space since its
fire), Sunny's Bar and Jalopy Theatre (their calendars are on hosts not reachable yet).
Only title, time, a price when given and a link back are kept.

Usage:  python3 tools/fetch_redhook.py [YYYY-MM-DD]     (default: today in NYC)
"""

import json
import re
import sys
import time
import urllib.parse
from datetime import datetime, timedelta

from fetch_nycgov import CACHE, DATA, NYC, ROOT, dist_m, geosearch, get
from fetch_venues import at, event, text

OUT = DATA / 'redhook-events.json'

# name: (street address for GeoSearch, website)
VENUES = {
    'Pioneer Works': ('159 Pioneer Street, Brooklyn', 'https://pioneerworks.org/'),
    'Waterfront Museum': ('290 Conover Street, Brooklyn', 'https://waterfrontmuseum.org/'),
}
CB6 = ('Brooklyn Community Board 6', 'https://brooklyncb6.cityofnewyork.us/events/')
# Pioneer Works disciplines -> map categories; anything else (science, technology, writing) is a talk.
DISCIPLINE = {'music': 'music', 'art': 'art', 'film': 'film', 'performance': 'theater', 'food': 'food'}


def next_data(body):
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', body, re.S)
    return json.loads(m.group(1))['props']['pageProps'] if m else {}


def hm(s):
    m = re.match(r'(\d{1,2}):(\d{2})$', s or '')
    return (int(m.group(1)), int(m.group(2))) if m else None


def pioneer_works(day):
    out = []
    for p in next_data(get('https://pioneerworks.org/calendar', as_json=False)).get('events', []):
        cal = p.get('calendar') or {}
        first, last = cal.get('startDate') or '', cal.get('endDate') or cal.get('startDate') or ''
        # 'continuous' and 'undated' are long-running series; a maskDate means the dates shown are vague.
        if cal.get('range') in ('continuous', 'undated', 'sessions') or cal.get('maskDate') or p.get('hideFromPage'):
            continue
        if not (first <= day.isoformat() <= last) or not hm(cal.get('startTime')):
            continue
        slug = (p.get('slug') or {}).get('current')
        url = f'https://pioneerworks.org/programs/{slug}'
        time.sleep(0.5)
        prog = next_data(get(url, as_json=False)).get('data') or {}
        if prog.get('offsiteLocation') or re.search(r'\bLot Radio\b', p.get('title', '')):
            continue
        start = at(day, *hm(cal['startTime']))
        end = at(day, *hm(cal['endTime'])) if hm(cal.get('endTime')) else None
        disciplines = prog.get('discipline') or []
        category = 'art' if cal.get('range') == 'gallery' else next(
            (DISCIPLINE[d] for d in disciplines if d in DISCIPLINE), 'community')
        doors = hm(cal.get('doorTime'))
        out.append(event('Pioneer Works', text(p.get('title')), start, url, category,
                         end=end if end and end > start else None,
                         description=f"Doors {at(day, *doors).strftime('%-I:%M %p').lower()}" if doors and at(day, *doors) < start else ''))
    return out


def tribe_events(site, day):
    """One day of a WordPress site's events from The Events Calendar's public REST feed."""
    q = urllib.parse.urlencode({'start_date': f'{day} 00:00:00', 'end_date': f'{day} 23:59:59', 'per_page': 50})
    rows, url = [], f'{site}/wp-json/tribe/events/v1/events?{q}'
    while url:
        data = get(url)
        rows += data.get('events', [])
        url = data.get('next_rest_url')
        if url:
            time.sleep(10)
    return rows


def tribe_time(e, day):
    start = datetime.strptime(e['start_date'], '%Y-%m-%d %H:%M:%S').replace(tzinfo=NYC)
    end = datetime.strptime(e['end_date'], '%Y-%m-%d %H:%M:%S').replace(tzinfo=NYC)
    # Multi-day listings keep their clock times on each day they run.
    if start.date() != day:
        start = at(day, start.hour, start.minute)
    return start, end if end > start and end.date() == day else None


def tribe_price(e):
    cost = text(e.get('cost'))
    if re.match(r'free\b', cost, re.I):
        return {'min': 0, 'max': 0, 'currency': 'USD'}
    nums = [float(n) for n in re.findall(r'\d+(?:\.\d+)?', cost)]
    return {'min': round(min(nums)), 'max': round(max(nums)), 'currency': 'USD'} if nums else None


def waterfront_museum(day):
    out = []
    for e in tribe_events('https://waterfrontmuseum.org', day):
        start, end = tribe_time(e, day)
        title = text(e.get('title'))
        cats = ' '.join(c['name'] for c in e.get('categories', [])).lower()
        if re.fullmatch(r'open hours', title, re.I):
            title, category = 'Open hours on the barge', 'community'
        else:
            category = 'music' if re.search(r'music|concert', cats) else 'theater' if 'performance' in cats else 'community'
        ev = event('Waterfront Museum', title, start, e.get('url') or VENUES['Waterfront Museum'][1], category,
                   end=end, price=tribe_price(e))
        ev['priceUnknown'] = ev['price'] is None and category != 'community'
        out.append(ev)
    return out


def cb6_place(v, cache):
    """A CB6 listing's place from its venue: the feed's own coordinates, a street address,
    or a park or building GeoSearch knows by exactly that name ('Carroll Park')."""
    key = f"cb6: {v.get('venue')}|{v.get('address')}"
    if key in cache:
        return cache[key]
    pos = None
    if v.get('geo_lat') and v.get('geo_lng'):
        pos = {'lat': float(v['geo_lat']), 'lng': float(v['geo_lng']), 'label': v.get('address') or v.get('venue')}
    else:
        addr, name = text(v.get('address')), text(v.get('venue'))
        if not addr[:1].isdigit():
            hit = next((r for r in geosearch(f'{name}, Brooklyn', size=3)
                        if r['label'].upper() == f'{name.upper()}, BROOKLYN, NY, USA'), None)
            pos = {k: hit[k] for k in ('lat', 'lng', 'label')} if hit else None
        else:
            hit = next((r for r in geosearch(f'{addr}, Brooklyn', size=3)
                        if r['label'].startswith(addr.split()[0] + ' ') and 'Brooklyn' in r['label']), None)
            pos = {k: hit[k] for k in ('lat', 'lng', 'label')} if hit else None
        time.sleep(0.2)
    cache[key] = pos
    return pos


def cb6(day, cache):
    out = []
    for e in tribe_events('https://brooklyncb6.cityofnewyork.us', day):
        title = text(e.get('title'))
        cats = [text(c['name']) for c in e.get('categories', [])]
        v = e.get('venue') if isinstance(e.get('venue'), dict) else {}
        if not v.get('address') or 'Elections' in cats or re.match(r'cancel', title, re.I):
            continue
        if 'nitehawk' in (v.get('venue') or '').lower() or title.lower().startswith('nitehawk'):
            continue
        pos = cb6_place(v, cache)
        if not pos:
            continue
        start, end = tribe_time(e, day)
        category = ('art' if 'Arts & Culture' in cats else 'food' if 'Food & Markets' in cats else 'community')
        ev = event(text(v.get('venue')), title, start, e.get('url') or CB6[1], category, end=end,
                   price=tribe_price(e), pos=pos, publisher=CB6)
        ev['address'] = text(v.get('address'))
        out.append(ev)
    return out


READERS = [pioneer_works, waterfront_museum, cb6]


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
    print(f'Fetching Red Hook calendars for {day}...')
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    rows = []
    for read in READERS:
        try:
            got = read(day, cache) if read is cb6 else read(day)
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
        pos = r['pos'] or (place(r['venue'], cache) if r['venue'] in VENUES else None)
        if not pos:
            unplaced.append({'title': r['title'], 'venue': r['venue'], 'url': r['url']})
            continue
        # The same event listed by CB6 and by the venue itself: keep the venue's.
        if r['publisher'] and any(e['start'] == r['start'].isoformat() and dist_m(pos, e['venue']) < 100 for e in events):
            continue
        slug = re.sub(r'[^a-z0-9]+', '-', r['venue'].lower()).strip('-')
        pub_name, pub_url = r['publisher'] or (r['venue'], VENUES[r['venue']][1])
        pub_id = 'venue-' + re.sub(r'[^a-z0-9]+', '-', pub_name.lower()).strip('-')
        address = r.get('address') or (VENUES[r['venue']][0].split(',')[0] if r['venue'] in VENUES else '')
        events.append({
            'id': f"{slug}-{r['start'].strftime('%Y%m%d%H%M')}-{re.sub(r'[^a-z0-9]+', '-', r['title'].lower())[:40]}",
            'title': r['title'],
            'category': r['category'],
            'start': r['start'].isoformat(),
            'end': r['end'].isoformat() if r['end'] else None,
            'allDay': False,
            'venue': {'name': r['venue'], 'address': address, 'neighborhood': r['neighborhood'],
                      'lat': round(pos['lat'], 6), 'lng': round(pos['lng'], 6)},
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
        'source': {'name': 'Red Hook calendars', 'url': 'https://pioneerworks.org/calendar'},
        'date': day.isoformat(),
        'fetchedAt': datetime.now(NYC).isoformat(timespec='seconds'),
        'events': events,
        'unplaced': unplaced,
    }, indent=1, ensure_ascii=False))
    print(f'  {len(events)} placed, {len(unplaced)} without a location')
    print(f'  wrote {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
