#!/usr/bin/env python3
"""Snapshot one day of Hoboken, NJ events into public/data/hoboken-events.json.

Hoboken sits on the map's New Jersey shore. These are the city's own venues, each read
on its own so one site being down only loses that one:

  Hoboken Historical Museum   talks, tours, workshops and openings, from the public events feed
                              (The Events Calendar) on https://hobokenmuseum.org/events/
  Hoboken Public Library      programs at the Main Library and the Grand Street Branch, from the
                              library's Communico calendar on https://hobokenlibrary.libnet.info/events;
                              off-site programs and drop-in services (office hours, board meetings)
                              are left out
  Stevens DeBaun PAC          concerts, plays and recitals from the season list on Stevens' DeBaun
                              Performing Arts Center page; listings without a time are left out

Checked 2026-10-22: none of these has terms that forbid automated reading, and their robots.txt
allow these pages. Waiting on hosts not reachable yet: Mile Square Theatre (its performance times are
on its Salesforce ticketing site) and the City of Hoboken calendar (on RecDesk).
Only title, time, a price when given and a link back are kept.

NYC GeoSearch only knows the five boroughs, so the venues' coordinates are written in below.

Usage:  python3 tools/fetch_hoboken.py [YYYY-MM-DD]     (default: today in NYC)
"""

import json
import re
import sys
import time
import urllib.parse
from datetime import date, datetime

from fetch_nycgov import DATA, NYC, ROOT, get
from fetch_redhook import tribe_events, tribe_time
from fetch_venues import at, clock, event, text

OUT = DATA / 'hoboken-events.json'

# name: (street address, (lat, lng), website)
VENUES = {
    'Hoboken Historical Museum': ('1301 Hudson Street', (40.75385, -74.02590), 'https://hobokenmuseum.org/events/'),
    'Hoboken Public Library': ('500 Park Avenue', (40.74290, -74.03110), 'https://hobokenlibrary.libnet.info/events'),
    'Hoboken Library, Grand Street Branch': ('124 Grand Street', (40.73740, -74.03530), 'https://hobokenlibrary.libnet.info/events'),
    'DeBaun Auditorium, Stevens': ('1 Castle Point Terrace', (40.74250, -74.02700), 'https://www.stevens.edu/debaunpac'),
}
LIBRARY = ('Hoboken Public Library', 'https://hobokenlibrary.libnet.info/events')
STEVENS = ('Stevens DeBaun PAC', 'https://www.stevens.edu/debaunpac')
BRANCHES = {'Main Library': 'Hoboken Public Library', 'Grand Street Branch': 'Hoboken Library, Grand Street Branch'}
MONTHS = {m: i for i, m in enumerate(['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
                                      'September', 'October', 'November', 'December'], 1)}


def museum(day):
    out = []
    for e in tribe_events('https://hobokenmuseum.org', day):
        start, end = tribe_time(e, day)
        title = text(e.get('title'))
        cats = ' '.join(c['name'] for c in e.get('categories', [])).lower()
        category = 'art' if 'art classes' in cats or re.search(r'workshop|collage|opening reception|exhibit', title, re.I) else 'community'
        cost = text(e.get('cost'))
        free = re.match(r'free\b', cost, re.I) or re.search(r'\bfree\b', title, re.I)
        nums = [float(n) for n in re.findall(r'\d+(?:\.\d+)?', cost)]
        price = {'min': round(min(nums)), 'max': round(max(nums)), 'currency': 'USD'} if nums and not free else None
        ev = event('Hoboken Historical Museum', title, start, e.get('url') or VENUES['Hoboken Historical Museum'][2],
                   category, end=end, price=price)
        ev['priceUnknown'] = price is None and not free
        out.append(ev)
    return out


def library(day):
    req = json.dumps({'private': False, 'date': day.isoformat(), 'days': 1, 'locations': [], 'ages': [], 'types': []})
    q = urllib.parse.urlencode({'event_type': 0, 'req': req})
    out = []
    for e in get(f'https://hobokenlibrary.libnet.info/eeventcaldata?{q}'):
        venue = BRANCHES.get(e.get('location'))
        title = text(e.get('title'))
        if not venue or e.get('private_event') == '1' or re.search(r'drop-in|office hours|meeting|cancel', title, re.I):
            continue
        start = datetime.strptime(e['raw_start_time'], '%Y-%m-%d %H:%M:%S').replace(tzinfo=NYC)
        end = datetime.strptime(e['raw_end_time'], '%Y-%m-%d %H:%M:%S').replace(tzinfo=NYC)
        if start.date() != day:
            continue
        category = ('film' if re.search(r'film|movie|screening', title, re.I) else
                    'music' if re.search(r'concert|music|vinyl|jazz', title, re.I) else
                    'art' if re.search(r'\bart\b|craft|paint|draw', title, re.I) else 'community')
        ages = text(e.get('ages'))
        ev = event(venue, title, start, e.get('url') or LIBRARY[1], category, end=end if end > start else None,
                   description=f'For {ages.lower()}' if ages and 'Adults' not in ages else '', publisher=LIBRARY)
        ev['priceUnknown'] = False  # library programs are free
        out.append(ev)
    return out


def stevens(day):
    """The season list is plain text: a title, then lines like '8pm Saturday November 21st,' and a room."""
    body = get('https://www.stevens.edu/campus-life/arts-campus/debaun-performing-arts-center', as_json=False)
    body = re.sub(r'<script.*?</script>|<style.*?</style>', '', body, flags=re.S)
    lines = [text(s) for s in re.split(r'<(?:br|/p|/h\d|/li|/div)\b[^>]*>', body)]
    lines = [s for s in lines if s]
    head = next((i for i, s in enumerate(lines) if re.search(r'DeBaun PAC \d{4}\D\d{4} Season', s)), None)
    if head is None:
        return []
    first_year = int(re.search(r'(\d{4})\D\d{4} Season', lines[head]).group(1))
    when = re.compile(r'((?:\d{1,2}(?::\d\d)?\s*[ap]m\s*&?\s*)*)\b(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day\s+('
                      + '|'.join(MONTHS) + r')\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+at\s+(\d{1,2}(?::\d\d)?\s*[ap]m))?', re.I)
    # Each show is its title lines, then its date lines, then a ticket note that may come after them.
    shows = []
    for s in lines[head + 1:]:
        if s.startswith('Stevens Institute of Technology'):
            break
        hits = list(when.finditer(s))
        if hits:
            if shows:
                shows[-1]['dates'].append((s, hits))
        elif re.search(r'complimentary', s, re.I) or re.fullmatch(r'(DeBaun Auditorium|Ondrick Music Room),?', s):
            continue
        elif re.search(r'tickets', s, re.I):
            if shows:
                shows[-1]['note'] = s
        elif shows and not shows[-1]['dates']:
            shows[-1]['title'].append(s)
        else:
            shows.append({'title': [s], 'dates': [], 'note': ''})
    out = []
    for show in shows:
        name = text(' '.join(show['title'])).strip(' ~,')
        nums = [int(n) for n in re.findall(r'\$(\d+)', show['note'])]
        price = {'min': min(nums), 'max': max(nums), 'currency': 'USD'} if nums else None
        category = 'music' if re.search(r'orchestra|band|choir|recital|jazz|voice|concert', name, re.I) else 'theater'
        for s, hits in show['dates']:
            for m in hits:
                month, mday = MONTHS[m.group(3).title()], int(m.group(4))
                d = date(first_year if month >= 7 else first_year + 1, month, mday)
                if d != day or d.strftime('%A')[:3].lower() != m.group(2)[:3].lower():
                    continue
                times = re.findall(r'\d{1,2}(?::\d\d)?\s*[ap]m', m.group(1) or '') or ([m.group(5)] if m.group(5) else [])
                for hm in filter(None, map(clock, times)):
                    ev = event('DeBaun Auditorium, Stevens', name, at(day, *hm), STEVENS[1], category, price=price,
                               description='At the Ondrick Music Room' if 'Ondrick' in s else '', publisher=STEVENS)
                    ev['priceUnknown'] = False  # free unless the list gives prices
                    out.append(ev)
    return out


READERS = [museum, library, stevens]


def main():
    day = datetime.strptime(sys.argv[1], '%Y-%m-%d').date() if len(sys.argv) > 1 else datetime.now(NYC).date()
    print(f'Fetching Hoboken calendars for {day}...')
    rows = []
    for read in READERS:
        try:
            got = read(day)
            print(f'  {read.__name__}: {len(got)}')
            rows += got
        except Exception as e:
            print(f'  could not read {read.__name__}: {e}', file=sys.stderr)
        time.sleep(1)
    events, seen = [], set()
    for r in rows:
        key = (r['venue'], r['title'].lower(), r['start'])
        if key in seen:
            continue
        seen.add(key)
        address, (lat, lng), url = VENUES[r['venue']]
        slug = re.sub(r'[^a-z0-9]+', '-', r['venue'].lower()).strip('-')
        pub_name, pub_url = r['publisher'] or (r['venue'], url)
        events.append({
            'id': f"{slug}-{r['start'].strftime('%Y%m%d%H%M')}-{re.sub(r'[^a-z0-9]+', '-', r['title'].lower())[:40]}",
            'title': r['title'],
            'category': r['category'],
            'start': r['start'].isoformat(),
            'end': r['end'].isoformat() if r['end'] else None,
            'allDay': False,
            'venue': {'name': r['venue'], 'address': f'{address}, Hoboken, NJ', 'neighborhood': 'Hoboken', 'lat': lat, 'lng': lng},
            'price': r['price'],
            'priceUnknown': r.get('priceUnknown', r['price'] is None),
            'description': r['description'],
            'details': '',
            'url': r['url'],
            'tags': [],
            'publisher': {'id': 'venue-' + re.sub(r'[^a-z0-9]+', '-', pub_name.lower()).strip('-'), 'name': pub_name, 'url': pub_url},
        })
    events.sort(key=lambda e: e['start'])
    OUT.write_text(json.dumps({
        'source': {'name': 'Hoboken calendars', 'url': 'https://hobokenmuseum.org/events/'},
        'date': day.isoformat(),
        'fetchedAt': datetime.now(NYC).isoformat(timespec='seconds'),
        'events': events,
        'unplaced': [],
    }, indent=1, ensure_ascii=False))
    print(f'  {len(events)} placed')
    print(f'  wrote {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
