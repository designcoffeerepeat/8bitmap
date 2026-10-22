#!/usr/bin/env python3
"""Snapshot one day of Queens Public Library programs into public/data/qpl-events.json.

The library's calendar (https://www.queenslibrary.org/calendar) can be filtered
by branch and day, and each result carries its program data (title, type, age
group, sessions) in the page. Only the branches in BRANCHES are read, starting
with the Flushing area. Only facts are kept (title, time, branch, program type
and age group) with a link back; no write-ups or images, because the library's
terms limit reuse of its material. Online-only, staff-only and cancelled
programs are skipped. Robots.txt allows the calendar and program pages.

Usage:  python3 tools/fetch_qpl.py [YYYY-MM-DD]     (default: today in NYC)
"""

import html
import json
import re
import sys
import time
import urllib.parse
from datetime import datetime
from pathlib import Path

from fetch_nycgov import CACHE, DATA, NYC, geosearch, get

ROOT = Path(__file__).resolve().parent.parent
OUT = DATA / 'qpl-events.json'
SITE = 'https://www.queenslibrary.org'
# With a desktop browser's user agent the calendar sends an empty page for scripts to fill in.
UA = '8bitmap/1.0 (+https://8bit.nyc)'

# Branch name as the calendar spells it: (calendar location code, street address, neighborhood).
# The calendar filters by the code; filtering by name is ignored.
BRANCHES = {
    'Flushing': ('91400000', '41-17 Main Street, Queens', 'Flushing'),
    'East Flushing': ('96200000', '196-36 Northern Boulevard, Queens', 'Flushing'),
    'McGoldrick': ('93800000', '155-06 Roosevelt Avenue, Queens', 'Flushing'),
    'Mitchell-Linden': ('94100000', '31-32 Union Street, Queens', 'Flushing'),
    'Queensboro Hill': ('96900000', '60-05 Main Street, Queens', 'Flushing'),
    'Pomonok': ('94500000', '158-21 Jewel Avenue, Queens', 'Flushing'),
}

# Program type -> map category; anything else is community.
CATEGORIES = {
    'Concerts': 'music', 'Hip Hop': 'music',
    'Films': 'film',
    'Cultural Arts': 'art', 'Crafts': 'art', 'Exhibit': 'art',
    'Fitness': 'sports',
}


def programs(branch, day):
    """Every program card the calendar shows for one branch on one day."""
    d = day.strftime('%m/%d/%y')
    q = urllib.parse.urlencode({'searchField': '*', 'category': 'calendar',
                                'searchFilter': f'sm_pSsnVirtua:{BRANCHES[branch][0]} sm_pSsnDate:[ {d}* TO {d}* ]'})
    body = get(f'{SITE}/calendar?{q}', headers={'User-Agent': UA}, as_json=False)
    out = []
    for blob in re.findall(r"arrJsonData_cal\['[^']+'\] = '(.*?)';</script>", body):
        try:
            out.append(json.loads(html.unescape(blob)))
        except ValueError:
            continue
    if len(out) >= 12:
        print(f'  {branch}: a full page of 12, later programs that day may be missing')
    return out


def place(branch, cache):
    address = BRANCHES[branch][1]
    if address not in cache:
        hit = geosearch(address)
        cache[address] = {'lat': hit[0]['lat'], 'lng': hit[0]['lng']} if hit else None
    return cache[address]


def main():
    day = datetime.strptime(sys.argv[1], '%Y-%m-%d').date() if len(sys.argv) > 1 else datetime.now(NYC).date()
    print(f'Fetching Queens Public Library programs for {day}...')
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    events, seen = [], set()
    for branch, (_, address, hood) in BRANCHES.items():
        time.sleep(1)  # go easy on the library's server
        try:
            rows = programs(branch, day)
        except Exception as e:  # one branch failing keeps the others
            print(f'  {branch}: {e}')
            continue
        pos = place(branch, cache)
        if not pos:
            print(f'  {branch}: address not found')
            continue
        n = 0
        for p in rows:
            if p.get('staff_only') or p.get('delivery_format') == 'Virtual' or re.match(r'\s*cancel', p.get('title', ''), re.I):
                continue
            for s in (p.get('other_sessions') or {}).values():
                start = datetime.fromtimestamp(s['timestamp_GMT'], NYC)
                if start.date() != day or s.get('location', {}).get('branch') != branch:
                    continue
                key = (p['jobID'], s['timestamp_GMT'])
                if key in seen:
                    continue
                seen.add(key)
                end = datetime.fromtimestamp(s['timestamp_GMT'] + s['duration'], NYC) if s.get('duration') else None
                kind, ages = p.get('prgm_type') or '', p.get('prgm_age') or ''
                events.append({
                    'id': f"{p['jobID']}-{s['timestamp_GMT']}",
                    'title': html.unescape(p['title']).strip(),
                    'category': CATEGORIES.get(kind, 'community'),
                    'start': start.isoformat(),
                    'end': end.isoformat() if end else None,
                    'allDay': False,
                    'venue': {'name': f'{branch} Library',
                              'address': address.replace(', Queens', ''), 'neighborhood': hood,
                              'lat': pos['lat'], 'lng': pos['lng']},
                    'price': None,
                    'priceUnknown': False,  # library programs are free
                    'description': ', '.join(x for x in (kind, f'for {ages}' if ages else '') if x),
                    'details': 'Registration required.' if p.get('rgstrtion') else '',
                    'url': SITE + p['callUrl'] if p.get('callUrl') else f'{SITE}/event/{p["jobID"]}',
                    'tags': ['Free'],
                })
                n += 1
        print(f'  {branch}: {n}')
    CACHE.write_text(json.dumps(cache, indent=1, sort_keys=True))
    OUT.write_text(json.dumps({
        'source': {'name': 'Queens Public Library', 'url': f'{SITE}/calendar'},
        'date': day.isoformat(),
        'fetchedAt': datetime.now(NYC).isoformat(timespec='seconds'),
        'events': sorted(events, key=lambda e: e['start']),
        'unplaced': [],
    }, indent=1, ensure_ascii=False))
    print(f'  {len(events)} programs')
    print(f'  wrote {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
