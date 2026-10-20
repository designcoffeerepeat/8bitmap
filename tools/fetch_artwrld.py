#!/usr/bin/env python3
"""Snapshot one day of Artwrld gallery and museum openings into public/data/artwrld-events.json.

Artwrld's New York openings page (https://www.artwrld.com/city/new-york/openings)
lists the coming week's exhibition openings, each with the gallery and its
coordinates in the page data. Openings on the day are kept. A reception time comes
from the listing ("Opens today 6:00 - 8:00 PM") or from the exhibition's own page;
an opening with no reception time is shown all day. Only the title, gallery, time
and a link are kept, no images or write-ups.

Usage:  python3 tools/fetch_artwrld.py [YYYY-MM-DD]     (default: today in NYC)
"""

import json
import re
import sys
import time
from datetime import datetime
from pathlib import Path

from fetch_nycgov import NYC, get

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'data' / 'artwrld-events.json'
SITE = 'https://www.artwrld.com'
PAGE = f'{SITE}/city/new-york/openings'


def flight(body):
    """The page data Next.js streams into the HTML as self.__next_f.push([1, "..."]) chunks."""
    out = ''
    for chunk in re.findall(r'self\.__next_f\.push\((\[.*?\])\)</script>', body, re.S):
        try:
            part = json.loads(chunk)
        except ValueError:
            continue
        if len(part) > 1 and isinstance(part[1], str):
            out += part[1]
    return out


def openings():
    """Every listing card on the openings page, once each."""
    seen = {}
    for m in re.finditer(r'"item":(\{[^{}]*"startDate"[^{}]*\})', flight(get(PAGE, as_json=False))):
        item = json.loads(m.group(1))
        seen.setdefault(item['id'], item)
    return list(seen.values())


def reception(text):
    """'6:00 – 8:00 PM' or '6:00pm - 8:00pm' -> ((18, 0), (20, 0)); None when no time is given."""
    m = re.search(r'(\d{1,2})(?::(\d\d))?\s*([ap]m)?\s*[-–]\s*(\d{1,2})(?::(\d\d))?\s*([ap]m)', text, re.I)
    if not m:
        return None
    h1, m1, ap1, h2, m2, ap2 = m.groups()
    clock = lambda h, mm, ap: (int(h) % 12 + (12 if ap.lower() == 'pm' else 0), int(mm or 0))
    return clock(h1, m1, ap1 or ap2), clock(h2, m2, ap2)


def detail_reception(slug):
    """The 'Opening Reception' line on the exhibition's page."""
    body = flight(get(f'{SITE}/exhibit/{slug}', as_json=False))
    m = re.search(r'"Opening Reception"\}\],\["\$","div",null,\{[^{}]*"children":"([^"]+)"', body)
    return reception(m.group(1)) if m else None


def short(d):
    return f'{d:%b} {d.day}'


def main():
    day = datetime.strptime(sys.argv[1], '%Y-%m-%d').date() if len(sys.argv) > 1 else datetime.now(NYC).date()
    print(f'Fetching Artwrld openings for {day}...')
    rows = openings()
    print(f'  {len(rows)} upcoming openings listed')
    events, unplaced = [], []
    for it in rows:
        if it.get('startDate') != day.isoformat():
            continue
        try:
            lat, lng = round(float(it['lat']), 6), round(float(it['lng']), 6)
        except (KeyError, TypeError, ValueError):
            unplaced.append({'title': it['title'], 'venue': it.get('gallery'), 'url': f"{SITE}/exhibit/{it['slug']}"})
            continue
        times = reception(it.get('date', ''))
        if not times:
            times = detail_reception(it['slug'])
            time.sleep(0.3)
        until = datetime.strptime(it['endDate'], '%Y-%m-%d').date() if it.get('endDate') else None
        at = lambda hm: datetime(day.year, day.month, day.day, *hm, tzinfo=NYC).isoformat()
        events.append({
            'id': it['id'],
            'title': it['title'].strip(),
            'category': 'art',
            'start': at(times[0]) if times else at((0, 0)),
            'end': at(times[1]) if times and times[1] > times[0] else None,
            'allDay': times is None,
            'venue': {'name': it.get('gallery') or 'Gallery', 'address': '', 'neighborhood': it.get('location', ''),
                      'lat': lat, 'lng': lng},
            'price': None,
            'priceUnknown': True,
            'description': 'Exhibition opening' + (f', on view until {short(until)}' if until else ''),
            'details': '',
            'url': f"{SITE}/exhibit/{it['slug']}",
            'tags': ['opening'],
        })
    OUT.write_text(json.dumps({
        'source': {'name': 'Artwrld', 'url': PAGE},
        'date': day.isoformat(),
        'fetchedAt': datetime.now(NYC).isoformat(timespec='seconds'),
        'events': events,
        'unplaced': unplaced,
    }, indent=1, ensure_ascii=False))
    print(f'  {len(events)} openings on the day, {len(unplaced)} without a location')
    print(f'  wrote {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
