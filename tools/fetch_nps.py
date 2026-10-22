#!/usr/bin/env python3
"""Snapshot one day of National Park Service events in NYC into public/data/nps-events.json.

Uses the NPS Data API (https://www.nps.gov/subjects/developer/), which needs a
free API key in the NPS_API_KEY environment variable (a repository secret for
the scheduled refresh). It covers ranger tours, talks and festivals at the
federal parks in the city: Statue of Liberty, Ellis Island, Governors Island,
Gateway (Floyd Bennett Field, Jamaica Bay, Fort Wadsworth, Great Kills),
Federal Hall, Castle Clinton, Grant's Tomb, Hamilton Grange and more. NPS
content is US government work, so it is free to reuse. Without a key the
script says so and leaves the existing snapshot alone.

Events usually carry their own coordinates; the rest are placed at their park.

Usage:  python3 tools/fetch_nps.py [YYYY-MM-DD]     (default: today in NYC)
"""

import html
import json
import os
import re
import sys
import urllib.parse
from datetime import datetime
from pathlib import Path

from fetch_nycgov import DATA, NYC, get

ROOT = Path(__file__).resolve().parent.parent
OUT = DATA / 'nps-events.json'
API = 'https://developer.nps.gov/api/v1/events'
PAGE = 'https://www.nps.gov/state/ny/index.htm'
# NYC park units and a spot to fall back on when an event has no coordinates.
# Gateway also covers Sandy Hook in New Jersey; the map drops anything off its edges.
PARKS = {
    'stli': ('Statue of Liberty National Monument', 40.689249, -74.044500),
    'elis': ('Ellis Island', 40.699500, -74.039600),
    'gois': ('Governors Island National Monument', 40.691700, -74.016800),
    'gate': ('Gateway National Recreation Area', 40.590300, -73.891400),
    'feha': ('Federal Hall National Memorial', 40.707300, -74.010300),
    'cacl': ('Castle Clinton National Monument', 40.703600, -74.016800),
    'afbg': ('African Burial Ground National Monument', 40.714400, -74.004600),
    'gegr': ("General Grant National Memorial (Grant's Tomb)", 40.813400, -73.963100),
    'hagr': ('Hamilton Grange National Memorial', 40.821200, -73.947400),
    'thrb': ('Theodore Roosevelt Birthplace', 40.738900, -73.989300),
    'stwa': ('Stonewall National Monument', 40.733800, -74.002100),
    'loea': ('Lower East Side Tenement Museum', 40.718800, -73.990100),
}

JERSEY = re.compile(r'sandy hook|fort hancock|new jersey|\bNJ\b|highlands', re.I)
# Gateway's New York units, for events that only say where they are in words.
GATEWAY_NYC = re.compile(r'floyd bennett|jamaica bay|fort wadsworth|great kills|miller field|jacob riis|fort tilden|'
                         r'breezy point|canarsie|plumb beach|staten island|brooklyn|queens', re.I)


def fetch_day(day, key):
    params = {'parkCode': ','.join(PARKS), 'dateStart': day.isoformat(), 'dateEnd': day.isoformat(), 'pageSize': 50}
    rows, page = [], 1
    while True:
        data = get(f'{API}?{urllib.parse.urlencode({**params, "pageNumber": page})}', {'X-Api-Key': key})
        batch = data.get('data') or []
        rows += batch
        if not batch or len(rows) >= int(data.get('total') or 0):
            return rows
        page += 1


def text(s):
    s = re.sub(r'<(br|/p|/li)[^>]*>', '\n', s or '', flags=re.I)
    s = html.unescape(re.sub(r'<[^>]+>', '', s))
    return re.sub(r'[ \t]+', ' ', re.sub(r'\n\s*\n+', '\n\n', s)).strip()


def clock(s):
    """'10:00 AM' -> (10, 0)."""
    m = re.match(r'\s*(\d{1,2}):?(\d{2})?\s*([AP])\.?M', s or '', re.I)
    if not m:
        return None
    h = int(m.group(1)) % 12 + (12 if m.group(3).upper() == 'P' else 0)
    return h, int(m.group(2) or 0)


def category(ev):
    t = ' '.join([ev.get('title', ''), ev.get('category', ''), *(ev.get('types') or []), *(ev.get('tags') or [])]).lower()
    if re.search(r'concert|music|jazz', t):
        return 'music'
    if re.search(r'film|movie', t):
        return 'film'
    if re.search(r'theater|theatre|performance|play\b', t):
        return 'theater'
    if re.search(r'\bart\b|exhibit|craft', t):
        return 'art'
    if re.search(r'kayak|paddle|bike|hike|run\b|fitness|fishing', t):
        return 'sports'
    return 'community'


def to_raws(ev, day):
    code = (ev.get('sitecode') or '').lower()
    park = PARKS.get(code, (ev.get('parkfullname') or 'National Park Service', None, None))
    where = text(ev.get('location'))
    # Gateway also runs Sandy Hook in New Jersey, and its events there often have no
    # coordinates; placing those at the park's NYC spot would put them in Brooklyn.
    if JERSEY.search(f"{where} {ev.get('title', '')}"):
        return []
    try:
        lat, lng = float(ev['latitude']), float(ev['longitude'])
    except (KeyError, TypeError, ValueError):
        if code == 'gate' and not GATEWAY_NYC.search(f"{where} {ev.get('title', '')}"):
            return []
        lat, lng = park[1], park[2]
    if lat is None:
        return []
    all_day = str(ev.get('isallday', '')).lower() == 'true'
    free = str(ev.get('isfree', '')).lower() == 'true'
    body = text(ev.get('description'))
    fee = text(ev.get('feeinfo'))
    # A tour run several times a day is one pin, starting at its first time, with every time listed.
    slots = sorted({(clock(t.get('timestart')), clock(t.get('timeend'))) for t in ev.get('times') or []
                    if clock(t.get('timestart'))}, key=lambda t: t[0])
    first = slots[0] if slots and not all_day else (None, None)
    start = datetime(day.year, day.month, day.day, *(first[0] or (0, 0)), tzinfo=NYC)
    end = datetime(day.year, day.month, day.day, *first[1], tzinfo=NYC) if first[1] and len(slots) == 1 else None
    times = f"Times: {', '.join(datetime(2000, 1, 1, *t[0]).strftime('%-I:%M %p') for t in slots)}." if len(slots) > 1 else ''
    return [{
        'id': ev.get('id'),
        'title': html.unescape(ev.get('title', '')).strip(),
        'category': category(ev),
        'start': start.isoformat(),
        'end': end.isoformat() if end and end > start else None,
        'allDay': first[0] is None,
        # The location field is often a sentence ("The tour is inside the brownstone at ..."), so it goes under the park's name.
        'venue': {'name': park[0], 'address': where if where and len(where) <= 80 else park[0],
                  'neighborhood': ev.get('parkfullname') or park[0], 'lat': round(lat, 6), 'lng': round(lng, 6)},
        'price': None,
        'priceUnknown': not free,
        'description': ' '.join(x for x in (times, body.split('\n')[0][:200] if body else ev.get('category', '')) if x),
        'details': '\n\n'.join(x for x in (body, where if len(where) > 80 else '', f'Fees: {fee}' if fee and not free else '') if x)[:1200],
        'url': ev.get('infourl') or f"https://www.nps.gov/planyourvisit/event-details.htm?id={ev.get('id')}",
        'tags': [x for x in (ev.get('types') or [])][:3],
    }]


def main():
    day = datetime.strptime(sys.argv[1], '%Y-%m-%d').date() if len(sys.argv) > 1 else datetime.now(NYC).date()
    key = os.environ.get('NPS_API_KEY')
    if not key:
        print('NPS_API_KEY is not set; skipping the National Park Service and keeping the existing snapshot.')
        return
    print(f'Fetching National Park Service events for {day}...')
    rows = fetch_day(day, key)
    events, unplaced, seen = [], [], set()
    for ev in rows:
        # A recurring event lists every date it runs; keep it only when that includes this day.
        dates = ev.get('dates') or []
        if ev.get('id') in seen or (dates and day.isoformat() not in dates):
            continue
        seen.add(ev.get('id'))
        raws = to_raws(ev, day)
        if raws:
            events += raws
        else:
            unplaced.append({'title': ev.get('title'), 'address': ev.get('location', '')})
    OUT.write_text(json.dumps({
        'source': {'name': 'National Park Service', 'url': PAGE},
        'date': day.isoformat(),
        'fetchedAt': datetime.now(NYC).isoformat(timespec='seconds'),
        'events': events,
        'unplaced': unplaced,
    }, indent=1, ensure_ascii=False))
    print(f'  {len(events)} placed, {len(unplaced)} without a location')
    print(f'  wrote {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
