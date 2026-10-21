#!/usr/bin/env python3
"""Snapshot one day of NYC farmers markets into public/data/greenmarkets-events.json.

The Health Department publishes the city's farmers markets, Greenmarkets and
farm stands each year as the "NYC Farmers Markets" dataset on NYC Open Data
(https://data.cityofnewyork.us/d/8vwk-6iz2), with a public API that needs no
key. Each market has coordinates, its market days ("Saturday", "Tuesday &
Friday", "Monday (1st and 3rd)") and its hours as text, so this script works
out which markets are open on the day asked for.

The dataset has no season dates. Markets marked open year round show all year;
the rest show from June through November, when seasonal markets run.

Usage:  python3 tools/fetch_greenmarkets.py [YYYY-MM-DD]     (default: today in NYC)
"""

import json
import re
import sys
import urllib.parse
from datetime import datetime
from pathlib import Path

from fetch_nycgov import DATA, NYC, get

ROOT = Path(__file__).resolve().parent.parent
OUT = DATA / 'greenmarkets-events.json'
API = 'https://data.cityofnewyork.us/resource/8vwk-6iz2.json'
PAGE = 'https://data.cityofnewyork.us/d/8vwk-6iz2'
SEASON = range(6, 12)  # June to November for markets that are not open year round
DAYS = {'mon': 0, 'tue': 1, 'tus': 1, 'wed': 2, 'thu': 3, 'fri': 4, 'sat': 5, 'sun': 6, 'su': 6, 'w': 2}
DAY = r'\b(mon|tue|tus|wed|thu|fri|sat|sun)(?:[a-z]*day)?s?\b'


def fetch_year(year):
    q = urllib.parse.urlencode({'$where': f"year='{year}'", '$limit': 1000})
    return get(f'{API}?{q}')


def market_days(text):
    """'Tuesday-Saturday' -> {1,2,3,4,5}; 'Friday (2nd and 4th)' -> {4: {2, 4}}. Values are weeks of the month or None for every week."""
    text = text.lower()
    days = {}
    for part in re.split(r'[,&;]|\band\b(?![^(]*\))', text):
        rng = re.search(rf'{DAY}\s*(?:-|to)\s*{DAY}', part)
        if rng:
            a, b = DAYS[rng.group(1)], DAYS[rng.group(2)]
            for d in range(a, (b if b >= a else b + 7) + 1):
                days[d % 7] = None
            continue
        weeks = {int(n) for n in re.findall(r'(\d)(?:st|nd|rd|th)', part)} or None
        for m in re.finditer(DAY, part):
            days[DAYS[m.group(1)]] = weeks
    return days


def clock(s):
    """'8 a.m.', '2:30 p.m.', '12 p.m.' -> (hour, minute)."""
    m = re.match(r'\s*(\d{1,2})(?::(\d{2}))?\s*([ap])?', s, re.I)
    if not m:
        return None
    h, mins, ap = int(m.group(1)), int(m.group(2) or 0), (m.group(3) or '').lower()
    if ap == 'p' and h != 12:
        h += 12
    if ap == 'a' and h == 12:
        h = 0
    return h, mins


def hours_on(text, weekday):
    """Opening and closing time for one weekday from '8 a.m. - 2 p.m. (W); 9 a.m. - 2 p.m. (SU)'."""
    parts = [p for p in text.split(';') if p.strip()]
    if len(parts) > 1:
        for p in parts:
            label = re.search(r'\(([a-z]+)\)', p, re.I)
            if label and DAYS.get(label.group(1).lower()[:3], DAYS.get(label.group(1).lower())) == weekday:
                text = p
                break
        else:
            text = parts[0]
    m = re.match(r'\s*(.+?)\s*-\s*(.+?)(?:\(|$)', text)
    if not m:
        return None
    open_, close = clock(m.group(1)), clock(m.group(2))
    if not open_ or not close:
        return None
    # '2 - 5 p.m.': the opening time takes the closing time's p.m.
    if not re.search(r'[ap]\.?\s*m', m.group(1), re.I) and open_[0] + 12 <= close[0]:
        open_ = (open_[0] + 12, open_[1])
    return open_, close


def main():
    day = datetime.strptime(sys.argv[1], '%Y-%m-%d').date() if len(sys.argv) > 1 else datetime.now(NYC).date()
    print(f'Fetching NYC farmers markets for {day}...')
    rows = fetch_year(day.year)
    if not rows:
        # The new year's list comes out in spring; until then last year's markets are the best guide.
        rows = fetch_year(day.year - 1)
    print(f'  {len(rows)} markets listed')
    week = (day.day - 1) // 7 + 1
    events, unplaced = [], []
    for r in rows:
        name = (r.get('marketname') or '').strip()
        year_round = (r.get('open_year_round') or '').lower().startswith('yes')
        if not name or (not year_round and day.month not in SEASON):
            continue
        days = market_days(r.get('daysoperation') or '')
        if day.weekday() not in days or (days[day.weekday()] and week not in days[day.weekday()]):
            continue
        hours = hours_on(r.get('hoursoperations') or '', day.weekday())
        try:
            lat, lng = float(r['latitude']), float(r['longitude'])
        except (KeyError, ValueError):
            unplaced.append({'title': name, 'address': r.get('streetaddress', '')})
            continue
        start = datetime(day.year, day.month, day.day, *(hours[0] if hours else (0, 0)), tzinfo=NYC)
        end = datetime(day.year, day.month, day.day, *hours[1], tzinfo=NYC) if hours else None
        notes = [f"Open {r['daysoperation'].strip()}, {r['hoursoperations'].strip()}." if r.get('hoursoperations') else '',
                 'Open year round.' if year_round else 'Seasonal market.',
                 'Accepts EBT/SNAP.' if (r.get('accepts_ebt') or '').lower().startswith('yes') else '']
        events.append({
            'id': re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-'),
            'title': name,
            'category': 'food',
            'start': start.isoformat(),
            'end': end.isoformat() if end and end > start else None,
            'allDay': hours is None,
            'venue': {'name': name, 'address': (r.get('streetaddress') or '').strip(), 'neighborhood': r.get('borough', ''),
                      'lat': round(lat, 6), 'lng': round(lng, 6)},
            'price': None,
            'priceUnknown': False,  # free to walk in; you pay the farmers
            'description': 'Farmers market' if 'farm stand' not in name.lower() else 'Farm stand',
            'details': ' '.join(n for n in notes if n),
            'url': None,  # the dataset has no page per market
            'tags': ['EBT'] if (r.get('accepts_ebt') or '').lower().startswith('yes') else [],
        })
    OUT.write_text(json.dumps({
        'source': {'name': 'NYC Farmers Markets', 'url': PAGE},
        'date': day.isoformat(),
        'fetchedAt': datetime.now(NYC).isoformat(timespec='seconds'),
        'events': events,
        'unplaced': unplaced,
    }, indent=1, ensure_ascii=False))
    print(f'  {len(events)} open, {len(unplaced)} without a location')
    print(f'  wrote {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
