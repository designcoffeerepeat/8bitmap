#!/usr/bin/env python3
"""Snapshot one day of Artforum artguide New York openings into public/data/artguide-events.json.

Artforum's artguide (https://artguide.artforum.com) lists gallery and museum
exhibitions worldwide through the site's public WordPress API. Each listing
carries its city, the venue's coordinates and, when there is one, the opening
reception's date and hours. Only New York receptions on the day are kept, as
art, with the title, venue, time and a link back; no images or write-ups.

Usage:  python3 tools/fetch_artguide.py [YYYY-MM-DD]     (default: today in NYC)
"""

import html
import json
import re
import sys
import time
from datetime import datetime
from pathlib import Path

from fetch_nycgov import DATA, NYC, get

ROOT = Path(__file__).resolve().parent.parent
OUT = DATA / 'artguide-events.json'
SITE = 'https://artguide.artforum.com'
API = f'{SITE}/wp-json/wp/v2/ag-exhibition-event'
PAGE = f'{SITE}/cities/new-york/'


def listings():
    """Every listing the API has (a couple of thousand, worldwide), 100 at a time."""
    out, n = [], 1
    while n <= 60:
        try:
            page = get(f'{API}?per_page=100&page={n}&_fields=id,link,title,meta')
        except Exception as e:
            # Asking past the last page is answered with a 400.
            if '400' in str(e):
                return out
            raise
        if not page:
            return out
        out += page
        n += 1
        time.sleep(0.3)
    return out


def hm(s):
    m = re.match(r'(\d{1,2}):(\d{2})', s or '')
    return (int(m.group(1)), int(m.group(2))) if m else None


def main():
    day = datetime.strptime(sys.argv[1], '%Y-%m-%d').date() if len(sys.argv) > 1 else datetime.now(NYC).date()
    print(f'Fetching artguide openings for {day}...')
    rows = [r for r in listings() if (r.get('meta') or {}).get('location_slug') == 'new-york']
    print(f'  {len(rows)} New York listings')
    events, unplaced = [], []
    for r in rows:
        m = r['meta']
        # 'reception_date' is '2026-10-22' or '2026-10-22 18:00:00'.
        if (m.get('reception_date') or '')[:10] != day.isoformat():
            continue
        title = html.unescape(r['title']['rendered']).strip()
        try:
            lat, lng = float(m['latitude']), float(m['longitude'])
        except (KeyError, TypeError, ValueError):
            unplaced.append({'title': title, 'venue': m.get('venue_name'), 'url': r['link']})
            continue
        start = hm(m.get('reception_start_time')) or hm(m['reception_date'][11:])
        end = hm(m.get('reception_end_time'))
        at = lambda h_m: datetime(day.year, day.month, day.day, *h_m, tzinfo=NYC).isoformat()
        events.append({
            'id': str(r['id']),
            'title': title,
            'category': 'art',
            'start': at(start) if start else at((0, 0)),
            'end': at(end) if start and end and end > start else None,
            'allDay': start is None,
            'venue': {'name': html.unescape(m.get('venue_name') or 'Venue TBA'), 'address': '',
                      'neighborhood': m.get('neighborhood_name') or '', 'lat': round(lat, 6), 'lng': round(lng, 6)},
            'price': None,
            'priceUnknown': False,  # gallery openings are free to walk into
            'description': 'Opening reception',
            'details': '',
            'url': r['link'],
            'tags': [],
        })
    OUT.write_text(json.dumps({
        'source': {'name': 'Artforum artguide', 'url': PAGE},
        'date': day.isoformat(),
        'fetchedAt': datetime.now(NYC).isoformat(timespec='seconds'),
        'events': events,
        'unplaced': unplaced,
    }, indent=1, ensure_ascii=False))
    print(f'  {len(events)} placed, {len(unplaced)} without a location')
    print(f'  wrote {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
