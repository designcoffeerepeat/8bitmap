#!/usr/bin/env python3
"""Snapshot one day of NYC Council public hearings and meetings into public/data/council-events.json.

Uses the Council's Legistar Web API (https://council.nyc.gov/legislation/api/), which needs a free key in
the NYC_COUNCIL_TOKEN environment variable (a repository secret for the scheduled refresh). Hearings and
Stated Meetings are open to the public and almost all are at City Hall or 250 Broadway, so each is placed at
its building. Cancelled and deferred meetings and remote-only ones are left out. Without a key the script
says so and leaves the existing snapshot alone.

Usage:  python3 tools/fetch_council.py [YYYY-MM-DD]     (default: today in NYC)
"""

import json
import os
import re
import sys
import urllib.parse
from datetime import datetime
from pathlib import Path

from fetch_nycgov import DATA, NYC, get

ROOT = Path(__file__).resolve().parent.parent
OUT = DATA / 'council-events.json'
API = 'https://webapi.legistar.com/v1/nyc/events'
PAGE = 'https://legistar.council.nyc.gov/Calendar.aspx'
# where Council meetings are held: (match in the location, name, address, lat, lng)
BUILDINGS = [
    ('250 broadway', '250 Broadway', '250 Broadway, Manhattan', 40.71297, -74.00804),
    ('city hall', 'City Hall', 'City Hall Park, Manhattan', 40.71277, -74.00602),
]


def building(location):
    loc = (location or '').lower()
    return next((b for b in BUILDINGS if b[0] in loc), None)


def to_raw(ev, day):
    t = re.match(r'(\d{1,2}):(\d{2})\s*([AP])M', (ev.get('EventTime') or '').strip(), re.I)
    h = int(t.group(1)) % 12 + (12 if t.group(3).upper() == 'P' else 0) if t else 0
    start = datetime(day.year, day.month, day.day, h, int(t.group(2)) if t else 0, tzinfo=NYC)
    _, name, address, lat, lng = building(ev.get('EventLocation'))
    body = (ev.get('EventBodyName') or 'City Council').strip()
    title = body if body.lower().startswith(('city council', 'stated')) else f'Council hearing: {body}'
    room = re.sub(r'\s*-\s*(250 Broadway|City Hall).*$', '', (ev.get('EventLocation') or '').strip(), flags=re.I)
    return {
        'id': str(ev['EventId']),
        'title': title,
        'category': 'community',
        'start': start.isoformat(),
        'end': None,
        'allDay': not t,
        'venue': {'name': name, 'address': address, 'neighborhood': 'Civic Center', 'lat': lat, 'lng': lng},
        'price': None,
        'priceUnknown': False,
        'description': f'Public meeting of the NYC Council. {room}.' if room and room.lower() not in (name.lower(), '') else 'Public meeting of the NYC Council.',
        'url': ev.get('EventInSiteURL') or PAGE,
        'tags': [],
    }


def main():
    day = datetime.strptime(sys.argv[1], '%Y-%m-%d').date() if len(sys.argv) > 1 else datetime.now(NYC).date()
    token = os.environ.get('NYC_COUNCIL_TOKEN')
    if not token:
        print('NYC_COUNCIL_TOKEN is not set; skipping NYC Council and keeping the existing snapshot.')
        return
    print(f'Fetching NYC Council meetings for {day}...')
    q = {'token': token, '$filter': f"EventDate eq datetime'{day.isoformat()}'"}
    rows = get(f'{API}?{urllib.parse.urlencode(q)}')
    events, unplaced = [], []
    for ev in rows:
        status = (ev.get('EventAgendaStatusName') or '').lower()
        note = (ev.get('EventComment') or '').lower()
        if any(w in status + ' ' + note for w in ('cancel', 'defer', 'postpone')):
            continue
        if building(ev.get('EventLocation')):
            events.append(to_raw(ev, day))
        else:
            unplaced.append({'title': ev.get('EventBodyName'), 'url': ev.get('EventInSiteURL'), 'location': ev.get('EventLocation')})
    OUT.write_text(json.dumps({
        'source': {'name': 'NYC Council', 'url': PAGE},
        'date': day.isoformat(),
        'fetchedAt': datetime.now(NYC).isoformat(timespec='seconds'),
        'events': events,
        'unplaced': unplaced,
    }, indent=1, ensure_ascii=False))
    print(f'  {len(events)} placed, {len(unplaced)} elsewhere or remote')
    print(f'  wrote {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
