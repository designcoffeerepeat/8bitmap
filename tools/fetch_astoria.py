#!/usr/bin/env python3
"""Snapshot one day of events from Astoria venues' own calendars into public/data/astoria-events.json.

Same idea as fetch_venues.py, kept in its own file so each neighbourhood's venues can be added
without touching the others. Each venue is read on its own, and only the title, time and a link
back are kept; no images or write-ups. Every event names its venue as its publisher, so each
shows up on its own in the Sources dropdown.

  Socrates Sculpture Park   the Upcoming list on its Public Programs page (https://socratessculpturepark.org/public-programs/)
  Melrose Ballroom          the upcoming shows on https://www.melroseballroom.com/events
  Bohemian Hall             the event list on https://www.bohemianhall.com/event (data in the page)

Checked 2026-10-22 and left out: Museum of the Moving Image (turns automated visits away),
Noguchi Museum (terms forbid using the site for commercial purposes), Queens Public Library
(terms allow personal, non-commercial use only), Q.E.D. (terms forbid automated access),
Greater Astoria Historical Society (its events feed is closed to the public, no upcoming events),
Astoria Bookshop (calendar loads from another host), SingleCut, Kaufman Arts District and
Astoria Performing Arts Center (sites not reachable), Queens Council on the Arts and
The Astor Room (domains now belong to unrelated sites).

Usage:  python3 tools/fetch_astoria.py [YYYY-MM-DD]     (default: today in NYC)
"""

import json
import re
import sys
import time
from datetime import datetime
from pathlib import Path

from fetch_nycgov import CACHE, DATA, NYC, geosearch, get
from fetch_venues import at, clock, text

ROOT = Path(__file__).resolve().parent.parent
OUT = DATA / 'astoria-events.json'

# name: (street address for GeoSearch, website)
VENUES = {
    'Socrates Sculpture Park': ('32-01 Vernon Boulevard, Queens', 'https://socratessculpturepark.org/'),
    'Melrose Ballroom': ('36-08 33rd Street, Queens', 'https://www.melroseballroom.com/'),
    'Bohemian Hall & Beer Garden': ('29-19 24th Avenue, Queens', 'https://www.bohemianhall.com/'),
}

KINDS = [
    ('film', r'\bcinema\b|\bfilm\b|\bmovie\b|screening'),
    ('comedy', r'comedy|stand-?up'),
    ('sports', r'watch party|\bvs\.? |\bcup\b|fight|boxing|kickboxing|steel fighting|battles'),
    ('music', r'concert|\blive\b|\bband\b|\bdj\b|music|jazz|flamenco|party in the park'),
    ('nightlife', r'\bhouse\b|dance|disco|ballroom|club night|haunted'),
    ('food', r'oktoberfest|beer|food|market'),
    ('art', r'\bart\b|painting|sculpture|workshop'),
]


def kind(title, default):
    # 'Silent Disco at Bohemian Hall & Beer Garden' is not about beer.
    t = re.sub(r'\bat (bohemian hall|melrose ballroom|socrates)\b.*', '', title.lower())
    return next((k for k, pat in KINDS if re.search(pat, t)), default)


def event(venue, title, start, url, category, end=None):
    return {'venue': venue, 'title': title, 'category': category, 'start': start, 'end': end, 'url': url}


def time_range(s, day):
    """'12 – 6pm' | '11am – 1pm' | '1pm' | '6 – 10pm' -> (start, end) on day."""
    parts = [p.strip() for p in re.split(r'[–—-]', s) if p.strip()]
    end_hm = clock(parts[-1]) if len(parts) > 1 else None
    first = parts[0] if parts else ''
    if not re.search(r'[ap]\.?m', first, re.I) and end_hm:
        # '6 – 10pm': the start shares the end's half of the day, unless that would put it after the end ('11 – 1pm').
        m = re.match(r'(\d{1,2})(?::(\d{2}))?$', first)
        if not m:
            return None, None
        h, mins = int(m.group(1)) % 12, int(m.group(2) or 0)
        h += 12 if end_hm[0] >= 12 and h + 12 <= end_hm[0] else 0
        start_hm = (h, mins)
    else:
        start_hm = clock(first)
    if not start_hm:
        return None, None
    start = at(day, *start_hm)
    end = at(day, *end_hm) if end_hm else None
    return start, end if end and end > start else None


def socrates(day):
    # The page itself comes back brotli-compressed whatever is asked for, so read it through
    # WordPress's page API (Public Programs is page 370), which returns the same content as plain JSON.
    body = get('https://socratessculpturepark.org/wp-json/wp/v2/pages/370')['content']['rendered']
    upcoming = body.split('id="upcoming"', 1)[-1].split('>Past<', 1)[0]
    label = f"{day.strftime('%B')} {day.day:02d}, {day.year}"
    out = []
    for href, inner in re.findall(r'<a href="(https://socratessculpturepark.org/event/[^"]+)"[^>]*>(.*?)</a>', upcoming, re.S):
        line = text(inner)
        # '2026 Halloween Harvest Festival October 31, 2026 | 12 – 6pm'
        m = re.match(r'(.*?)\s+([A-Z][a-z]+ \d{2}, \d{4})\s*\|\s*(.+)$', line)
        if not m or m.group(2) != label or re.search(r'postponed|cancel', m.group(1), re.I):
            continue
        start, end = time_range(m.group(3), day)
        if start:
            title = m.group(1).strip()
            out.append(event('Socrates Sculpture Park', title, start, href, kind(title, 'art'), end))
    return out


def melrose(day):
    body = get('https://www.melroseballroom.com/events', as_json=False)
    upcoming = body.split('eventlist--upcoming', 1)[-1].split('eventlist--past', 1)[0]
    out = []
    for art in re.findall(r'<article class="eventlist-event.*?</article>', upcoming, re.S):
        title = re.search(r'class="eventlist-title-link">(.*?)</a>', art, re.S)
        link = re.search(r'href="(/events/[^"]+)"', art)
        # The 'add to Google Calendar' link has the start and end in UTC: dates=20261023T230000Z/20261024T050000Z
        when = re.search(r'dates=(\d{8}T\d{6}Z)/(\d{8}T\d{6}Z)', art)
        if not (title and link and when):
            continue
        start, end = (datetime.strptime(w, '%Y%m%dT%H%M%S%z').astimezone(NYC) for w in when.groups())
        if start.date() != day:
            continue
        title = re.sub(r'^\s*Share this event\s*', '', text(title.group(1)))
        out.append(event('Melrose Ballroom', title, start, 'https://www.melroseballroom.com' + link.group(1),
                         kind(title, 'music'), end if end > start else None))
    return out


def bohemian_hall(day):
    body = get('https://www.bohemianhall.com/event', as_json=False)
    out = []
    # The page carries its event list as JSON for the events widget: "events":{"events":[...]}
    for m in re.finditer(r'"events":\{"events":', body):
        try:
            events, _ = json.JSONDecoder().raw_decode(body, m.end())
        except ValueError:
            continue
        for e in events:
            cfg = (e.get('scheduling') or {}).get('config') or {}
            try:
                start = datetime.fromisoformat(cfg['startDate'].replace('Z', '+00:00')).astimezone(NYC)
                end = datetime.fromisoformat(cfg['endDate'].replace('Z', '+00:00')).astimezone(NYC) if cfg.get('endDate') else None
            except (KeyError, ValueError):
                continue
            if cfg.get('scheduleTbd') or start.date() != day or not e.get('slug'):
                continue
            title = text(e.get('title', ''))
            out.append(event('Bohemian Hall & Beer Garden', title, start,
                             f"https://www.bohemianhall.com/event-details/{e['slug']}", kind(title, 'community'),
                             end if end and end > start else None))
    return out


READERS = [socrates, melrose, bohemian_hall]


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
    print(f'Fetching Astoria venue calendars for {day}...')
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
        pos = place(r['venue'], cache)
        if not pos:
            unplaced.append({'title': r['title'], 'venue': r['venue'], 'url': r['url']})
            continue
        slug = re.sub(r'[^a-z0-9]+', '-', r['venue'].lower()).strip('-')
        events.append({
            'id': f"{slug}-{r['start'].strftime('%Y%m%d%H%M')}-{re.sub(r'[^a-z0-9]+', '-', r['title'].lower())[:40]}",
            'title': r['title'],
            'category': r['category'],
            'start': r['start'].isoformat(),
            'end': r['end'].isoformat() if r['end'] else None,
            'allDay': False,
            'venue': {'name': r['venue'], 'address': VENUES[r['venue']][0].split(',')[0], 'neighborhood': 'Astoria',
                      'lat': round(pos['lat'], 6), 'lng': round(pos['lng'], 6)},
            'price': None,
            'priceUnknown': True,
            'description': '',
            'details': '',
            'url': r['url'],
            'tags': [],
            'publisher': {'id': 'venue-' + slug, 'name': r['venue'], 'url': VENUES[r['venue']][1]},
        })
    CACHE.write_text(json.dumps(cache, indent=1, sort_keys=True))
    OUT.write_text(json.dumps({
        'source': {'name': 'Astoria venues', 'url': 'https://socratessculpturepark.org/'},
        'date': day.isoformat(),
        'fetchedAt': datetime.now(NYC).isoformat(timespec='seconds'),
        'events': events,
        'unplaced': unplaced,
    }, indent=1, ensure_ascii=False))
    print(f'  {len(events)} placed, {len(unplaced)} without a location')
    print(f'  wrote {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
