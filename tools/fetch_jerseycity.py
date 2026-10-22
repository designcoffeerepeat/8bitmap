#!/usr/bin/env python3
"""Snapshot one day of Jersey City, NJ events into public/data/jerseycity-events.json.

Jersey City sits on the map's New Jersey shore. Each calendar is read on its own so one site
being down only loses that one:

  Jersey City Culture     the city's own calendar, run by the Office of Cultural Affairs: festivals,
                          park events, gallery shows, library programs. Read from its public events
                          feed (The Events Calendar) on https://jerseycityculture.org/events/calendar/;
                          meetings, hearings and city-wide listings with no place are left out
  Art House Productions   theater, dance, film nights and concerts at 345 Marin Blvd, from the
                          Upcoming Events list of its Shopify box office
  Mana Contemporary       open studios, openings and talks at 888 Newark Ave, from the site's
                          public event list (its Chicago events are left out)
  Historic Downtown SID   Groove on Grove, the Grove Street farmers market and street fairs, from its
                          public events feed (The Events Calendar); empty between seasons

Checked 2026-10-22: none of these has terms that forbid automated reading, and their robots.txt
allow these pages (Jersey City Culture's only turns away AI training and SEO crawlers).
Left out: the Loew's Jersey Theatre and WFMU (Monty Hall), whose terms forbid automated collection;
White Eagle Hall, Jersey City Theater Center, the library's main site and Liberty Science Center,
which turn automated visits away. Only title, time, a price when given and a link back are kept.

NYC GeoSearch only knows the five boroughs, so places are looked up in PLACES below first, then
with the US Census geocoder (cached in data/geocode-cache.json). Events that can't be placed are
listed under 'unplaced'.

Usage:  python3 tools/fetch_jerseycity.py [YYYY-MM-DD]     (default: today in NYC)
"""

import json
import re
import sys
import time
import urllib.parse
from datetime import date, datetime

from fetch_nycgov import CACHE, DATA, NYC, ROOT, get
from fetch_redhook import tribe_events, tribe_time
from fetch_venues import at, clock, event, text

OUT = DATA / 'jerseycity-events.json'
CENSUS = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress'

CULTURE = ('Jersey City Culture', 'https://jerseycityculture.org/events/calendar/')
ARTHOUSE = ('Art House Productions', 'https://www.arthouseproductions.org/collections/upcomingevents')
MANA = ('Mana Contemporary', 'https://www.manacontemporary.com/')
HDSID = ('Historic Downtown SID', 'https://jcdowntown.org/events/')

# Places the city calendar uses often, or gives no street address for. Lowercase name: (name, address, (lat, lng)).
PLACES = {
    'art house': ('Art House Productions', '345 Marin Blvd', (40.72360, -74.03880)),
    'art house productions': ('Art House Productions', '345 Marin Blvd', (40.72360, -74.03880)),
    'hamilton park': ('Hamilton Park', '9 McWilliams Pl', (40.72780, -74.04460)),
    'museum of jersey city history': ('Museum of Jersey City History', '298 Academy St', (40.72970, -74.06200)),
    'city hall council chambers': ('Jersey City Hall', '280 Grove St', (40.71780, -74.04350)),
    'city of jc city hall': ('Jersey City Hall', '280 Grove St', (40.71780, -74.04350)),
    'pershing field park': ('Pershing Field Park', '201 Central Ave', (40.74800, -74.05100)),
    'mana contemporary': ('Mana Contemporary', '888 Newark Ave', (40.73620, -74.06610)),
    'exchange place': ('Exchange Place', 'Montgomery St and Hudson St', (40.71630, -74.03370)),
    'lincoln park': ('Lincoln Park', 'West Side Ave and Belmont Ave', (40.72530, -74.07900)),
    'mcginley square plaza': ('McGinley Square Plaza', '741 Bergen Ave', (40.72500, -74.06700)),
    'bergen square': ('Bergen Square', 'Bergen Ave and Academy St', (40.72970, -74.06280)),
    'grove street path plaza': ('Grove Street PATH Plaza', '112 Newark Ave', (40.71960, -74.04300)),
    'landmark loews theatre': ("Loew's Jersey Theatre", '54 Journal Square', (40.73220, -74.06280)),
    'provost square plaza': ('Provost Square Plaza', '151 Bay St', (40.72060, -74.04000)),
    'pet shop': ('Pet Shop', '193 Newark Ave', (40.72130, -74.04550)),
    'grace church van vorst': ('Grace Church Van Vorst', '39 Erie St', (40.72380, -74.04430)),
    'liberty house': ('Liberty House', '76 Audrey Zapp Dr', (40.70860, -74.05350)),
    'pgml bonetti children’s room': ('Jersey City Main Library', '472 Jersey Ave', (40.72060, -74.04750)),
    'newport center garage 3rd floor': ('Newport Centre', '30 Mall Dr W', (40.72700, -74.03700)),
}
# Rough outline of Jersey City, to throw out geocoder hits somewhere else.
JC_BOX = (40.660, 40.775, -74.120, -74.020)
MONTHS = {m: i for i, m in enumerate(['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
                                      'September', 'October', 'November', 'December'], 1)}


def tidy(s):
    """The city calendar types some venues in capitals: 'PERSHING FIELD PARK' -> 'Pershing Field Park'."""
    s = text(s).strip(' ,')
    return s.title().replace("'S ", "'s ") if s.isupper() else s


def census(address, cache):
    key = f'census: {address}'
    if key not in cache:
        q = urllib.parse.urlencode({'address': f'{address}, Jersey City, NJ', 'benchmark': 'Public_AR_Current',
                                    'format': 'json'})
        hits = get(f'{CENSUS}?{q}')['result']['addressMatches']
        c = hits[0]['coordinates'] if hits else None
        cache[key] = {'lat': round(c['y'], 6), 'lng': round(c['x'], 6)} if c else None
        time.sleep(1)
    hit = cache[key]
    if hit and JC_BOX[0] <= hit['lat'] <= JC_BOX[1] and JC_BOX[2] <= hit['lng'] <= JC_BOX[3]:
        return hit['lat'], hit['lng']
    return None


def place(name, address, cache):
    """(name, address, (lat, lng)) or None."""
    known = PLACES.get(text(name).lower())
    if known:
        return known
    if not address or not re.match(r'\d', address):
        return None
    try:
        pos = census(address, cache)
    except Exception as e:
        print(f'  could not geocode {address}: {e}', file=sys.stderr)
        return None
    return (tidy(name) or tidy(address), tidy(address), pos) if pos else None


def price_of(cost):
    cost = text(cost)
    if re.match(r'free\b', cost, re.I):
        return {'min': 0, 'max': 0, 'currency': 'USD'}, True
    nums = [float(n) for n in re.findall(r'\d+(?:\.\d+)?', cost)]
    return ({'min': round(min(nums)), 'max': round(max(nums)), 'currency': 'USD'}, False) if nums else (None, False)


def category_of(title, more=''):
    """From the title alone when it says, otherwise from the title and the listing's categories or description."""
    return kind(title) if kind(title) != 'community' or not more else kind(f'{title} {more}')


def kind(s):
    return ('film' if re.search(r'\bfilm|movie|screening|cinema', s, re.I) else
            'comedy' if re.search(r'comedy|stand-?up|improv', s, re.I) else
            'music' if re.search(r'concert|music|jazz|\bband\b|\bdj\b|unplugged|choir', s, re.I) else
            'theater' if re.search(r'theat|musical|\bplay\b|ballet|dance|choreograph', s, re.I) else
            'art' if re.search(r'\bart\b|exhibit|gallery|studio|mural|opening reception', s, re.I) else
            'food' if re.search(r'farmers.? market|food|taste of', s, re.I) else 'community')


def title_of(s):
    """'Fall Festival Pershing Field Park 2026' -> 'Fall Festival Pershing Field Park'."""
    return re.sub(r'\s+(?:20\d\d)$', '', text(s))


def tribe_reader(site, publisher, day, cache, fallback=None, skip=None):
    out, unplaced = [], []
    for e in tribe_events(site, day):
        title = title_of(e.get('title'))
        if re.search(r'meeting|hearing|cancel|postpone|application|registration|deadline', title, re.I):
            continue
        v = e.get('venue') if isinstance(e.get('venue'), dict) else {}
        if skip and skip(v):
            continue
        where = place(v.get('venue') or '', v.get('address') or '', cache) or fallback
        if not where:
            unplaced.append({'title': title, 'venue': text(v.get('venue')), 'address': text(v.get('address'))})
            continue
        start, end = tribe_time(e, day)
        price, free = price_of(e.get('cost'))
        cats = ' '.join(c['name'] for c in e.get('categories', []))
        out.append({**event(where[0], title, start, e.get('url') or publisher[1], category_of(title, cats),
                            end=end, price=price, publisher=publisher, free=free), 'place': where})
    return out, unplaced


def culture(day, cache):
    # The Art House and Mana Contemporary readers list their own events.
    return tribe_reader('https://www.jerseycityculture.org', CULTURE, day, cache,
                        skip=lambda v: text(v.get('venue')).lower() in ('art house', 'mana contemporary'))


def hdsid(day, cache):
    # Most of the district's events are on the Grove Street PATH Plaza.
    return tribe_reader('https://jcdowntown.org', HDSID, day, cache, fallback=PLACES['grove street path plaza'])


def arthouse(day, cache):
    """Each show is a product whose description gives its dates: 'Saturday, November 7, 2026 at 7:30 PM'."""
    data = get('https://www.arthouseproductions.org/collections/upcomingevents/products.json?limit=100')
    when = re.compile(r'\b(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day,?\s+(' + '|'.join(MONTHS) +
                      r')\s+(\d{1,2})(?:st|nd|rd|th)?(?:,\s*(\d{4}))?\s*(?:at|\||@|,)?\s*'
                      r'((?:\d{1,2}(?::\d\d)?\s*[ap]\.?m\.?\s*(?:&|and|,)?\s*)+)', re.I)
    out = []
    for p in data.get('products', []):
        title = text(p['title']).split('|')[0].strip()
        body = text(p.get('body_html'))
        for m in when.finditer(body):
            d = date(int(m.group(4) or day.year), MONTHS[m.group(2).title()], int(m.group(3)))
            if d != day or d.strftime('%A')[:3].lower() != m.group(1)[:3].lower():
                continue
            nums = [float(n) for n in re.findall(r'\$(\d+(?:\.\d\d)?)', body)]
            price = {'min': round(min(nums)), 'max': round(max(nums)), 'currency': 'USD'} if nums else None
            for hm in filter(None, map(clock, re.findall(r'\d{1,2}(?::\d\d)?\s*[ap]\.?m', m.group(5), re.I))):
                out.append({**event('Art House Productions', title, at(day, *hm),
                                    f"https://www.arthouseproductions.org/products/{p['handle']}",
                                    category_of(title, body[:300]), price=price, publisher=ARTHOUSE),
                            'place': PLACES['art house productions']})
    return out, []


def mana(day, cache):
    out = []
    for e in get('https://www.manacontemporary.com/wp-json/wp/v2/event?per_page=30&_fields=title,link,acf'):
        a = e.get('acf') or {}
        title = text(e['title']['rendered'])
        if a.get('location') != 'jersey-city' or re.match(r'chicago\b', title, re.I):
            continue
        for slot in a.get('dates') or [a]:
            try:
                start = datetime.strptime(slot['date_time_begin'], '%B %d, %Y %I:%M %p').replace(tzinfo=NYC)
                end = datetime.strptime(slot['date_time_end'], '%B %d, %Y %I:%M %p').replace(tzinfo=NYC)
            except (KeyError, TypeError, ValueError):
                continue
            # Listings that start at midnight are fairs and exhibitions with no set time.
            if not start.date() <= day <= end.date() or (start.hour, start.minute) == (0, 0):
                continue
            start = at(day, start.hour, start.minute)
            out.append({**event('Mana Contemporary', re.sub(r'^Jersey City:\s*', '', title), start, e['link'],
                                category_of(title, 'art'),
                                end=end if end.date() == day and end > start else None, publisher=MANA),
                        'place': PLACES['mana contemporary']})
    return out, []


READERS = [culture, arthouse, mana, hdsid]


def main():
    day = datetime.strptime(sys.argv[1], '%Y-%m-%d').date() if len(sys.argv) > 1 else datetime.now(NYC).date()
    print(f'Fetching Jersey City calendars for {day}...')
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    rows, unplaced = [], []
    for read in READERS:
        try:
            got, missed = read(day, cache)
            print(f'  {read.__name__}: {len(got)}' + (f' ({len(missed)} unplaced)' if missed else ''))
            rows += got
            unplaced += missed
        except Exception as e:
            print(f'  could not read {read.__name__}: {e}', file=sys.stderr)
        time.sleep(1)
    CACHE.write_text(json.dumps(cache, indent=1, sort_keys=True))
    events, seen = [], set()
    for r in rows:
        key = (r['venue'], r['title'].lower(), r['start'])
        if key in seen:
            continue
        seen.add(key)
        name, address, (lat, lng) = r['place']
        slug = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')
        pub_name, pub_url = r['publisher']
        events.append({
            'id': f"jc-{slug}-{r['start'].strftime('%Y%m%d%H%M')}-{re.sub(r'[^a-z0-9]+', '-', r['title'].lower())[:40]}",
            'title': r['title'],
            'category': r['category'],
            'start': r['start'].isoformat(),
            'end': r['end'].isoformat() if r['end'] else None,
            'allDay': False,
            'venue': {'name': name, 'address': f'{address}, Jersey City, NJ', 'neighborhood': 'Jersey City',
                      'lat': lat, 'lng': lng},
            'price': r['price'],
            'priceUnknown': r['price'] is None and not r['free'],
            'description': r['description'],
            'details': '',
            'url': r['url'],
            'tags': [],
            'publisher': {'id': 'venue-' + re.sub(r'[^a-z0-9]+', '-', pub_name.lower()).strip('-'), 'name': pub_name, 'url': pub_url},
        })
    events.sort(key=lambda e: e['start'])
    OUT.write_text(json.dumps({
        'source': {'name': 'Jersey City calendars', 'url': CULTURE[1]},
        'date': day.isoformat(),
        'fetchedAt': datetime.now(NYC).isoformat(timespec='seconds'),
        'events': events,
        'unplaced': unplaced,
    }, indent=1, ensure_ascii=False))
    print(f'  {len(events)} placed, {len(unplaced)} unplaced')
    print(f'  wrote {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
