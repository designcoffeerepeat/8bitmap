#!/usr/bin/env python3
"""Snapshot one day of ArtRabbit New York openings into public/data/artrabbit-events.json.

ArtRabbit lists New York exhibitions on two paged lists: what is on now
(https://www.artrabbit.com/all-listings/united-states/new-york) and what opens
soon (.../upcoming). Each card carries the venue's coordinates and, for shows with
a reception, a line such as "Opening: Today, 18:00", "Opening: Tomorrow, 18:00" or
"Opening: 24 Oct 2026, 5-7pm". Only receptions on the day are kept, as art, with
the title, venue, time and a link back; no images or write-ups.

Usage:  python3 tools/fetch_artrabbit.py [YYYY-MM-DD]     (default: today in NYC)
"""

import html
import json
import re
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from fetch_nycgov import DATA, NYC, get

ROOT = Path(__file__).resolve().parent.parent
OUT = DATA / 'artrabbit-events.json'
SITE = 'https://www.artrabbit.com'
LISTS = [f'{SITE}/all-listings/united-states/new-york', f'{SITE}/all-listings/united-states/new-york/upcoming']


def text(s):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s or ''))).strip()


def cards(url):
    """Every listing card on one list, page by page, until a page repeats or comes back empty."""
    out, seen, n = [], set(), 1
    while n <= 40:
        body = get(f'{url}?page={n}', as_json=False)
        page = re.findall(r'<article class="m_listing-item[^"]*"(.*?)</article>', body, re.S)
        ids = [re.search(r'data-ident="(\d+)"', c).group(1) for c in page if 'data-ident' in c]
        if not page or set(ids) <= seen:
            return out
        seen.update(ids)
        for c in page:
            link = re.search(r'href="(/events/[^"#]+)"', c)
            title = re.search(r'b_small-heading mod--primary">(.*?)</p>', c, re.S)
            opening = re.search(r'b_highlight">\s*Opening:\s*(.*?)</p>', c, re.S)
            lat, lng = re.search(r'data-lat="([-\d.]+)"', c), re.search(r'data-lon="([-\d.]+)"', c)
            venue = re.findall(r'b_instructional-text mod--large">(.*?)</p>', c, re.S)
            if link and title and opening:
                out.append({'id': re.search(r'data-ident="(\d+)"', c).group(1), 'url': SITE + link.group(1),
                            'title': text(title.group(1)), 'opening': text(opening.group(1)),
                            'venue': text(venue[0]) if venue else 'Venue TBA',
                            'lat': float(lat.group(1)) if lat else None, 'lng': float(lng.group(1)) if lng else None})
        n += 1
        time.sleep(0.5)
    return out


def reception(label, today):
    """('Tomorrow, 18:00' | '24 Oct 2026, 5-7pm' | '29 Oct 2026') -> (date, start (h, m) or None, end (h, m) or None)."""
    when, _, hours = label.partition(',')
    when = when.strip().lower()
    if when == 'today':
        d = today
    elif when == 'tomorrow':
        d = today + timedelta(days=1)
    else:
        try:
            d = datetime.strptime(when, '%d %b %Y').date()
        except ValueError:
            return None, None, None
    hours = hours.strip().lower()
    m = re.match(r'(\d{1,2}):(\d{2})$', hours)
    if m:
        return d, (int(m.group(1)), int(m.group(2))), None
    # '5-7pm', '6:30-8:30 pm', '6pm'
    m = re.match(r'(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:[-–]\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?$', hours)
    if not m or not hours:
        return d, None, None
    def hm(h, mins, ampm):
        h = int(h) % 12 + (12 if ampm == 'pm' else 0) if ampm else int(h)
        return h, int(mins or 0)
    end_ampm = m.group(6) or m.group(3)
    start = hm(m.group(1), m.group(2), m.group(3) or end_ampm)
    end = hm(m.group(4), m.group(5), end_ampm) if m.group(4) else None
    return d, start, end


def main():
    day = datetime.strptime(sys.argv[1], '%Y-%m-%d').date() if len(sys.argv) > 1 else datetime.now(NYC).date()
    # 'Today' and 'Tomorrow' follow ArtRabbit's own clock in London, which turns over five hours before New York.
    today = datetime.now(ZoneInfo('Europe/London')).date()
    print(f'Fetching ArtRabbit openings for {day}...')
    rows = []
    for url in LISTS:
        try:
            rows += cards(url)
        except Exception as e:
            print(f'  could not read {url}: {e}', file=sys.stderr)
    print(f'  {len(rows)} listings with an opening')
    events, unplaced, seen = [], [], set()
    for r in rows:
        d, start, end = reception(r['opening'], today)
        if d != day or r['id'] in seen:
            continue
        seen.add(r['id'])
        if r['lat'] is None or r['lng'] is None:
            unplaced.append({'title': r['title'], 'venue': r['venue'], 'url': r['url']})
            continue
        at = lambda h_m: datetime(day.year, day.month, day.day, *h_m, tzinfo=NYC).isoformat()
        events.append({
            'id': r['id'],
            'title': r['title'],
            'category': 'art',
            'start': at(start) if start else at((0, 0)),
            'end': at(end) if start and end and end > start else None,
            'allDay': start is None,
            'venue': {'name': r['venue'], 'address': '', 'neighborhood': '',
                      'lat': round(r['lat'], 6), 'lng': round(r['lng'], 6)},
            'price': None,
            'priceUnknown': False,  # gallery openings are free to walk into
            'description': 'Opening reception',
            'details': '',
            'url': r['url'],
            'tags': [],
        })
    OUT.write_text(json.dumps({
        'source': {'name': 'ArtRabbit', 'url': LISTS[0]},
        'date': day.isoformat(),
        'fetchedAt': datetime.now(NYC).isoformat(timespec='seconds'),
        'events': events,
        'unplaced': unplaced,
    }, indent=1, ensure_ascii=False))
    print(f'  {len(events)} placed, {len(unplaced)} without a location')
    print(f'  wrote {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
