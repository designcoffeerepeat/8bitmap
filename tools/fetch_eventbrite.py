#!/usr/bin/env python3
"""Snapshot one day of Eventbrite events from chosen NYC organizers into public/data/eventbrite-events.json.

Uses the official Eventbrite API (https://www.eventbrite.com/platform/api), which needs a private token in
the EVENTBRITE_TOKEN environment variable (a repository secret for the scheduled refresh). Eventbrite removed
city-wide search, so only the organizers listed in data/eventbrite-organizers.json are read. Its API terms
ask that every event shows its title and links straight to its Eventbrite page, which the map does; only the
title, time, place, whether it is free and the link are kept. Online-only events are left out. Without a
token the script says so and leaves the existing snapshot alone.

Usage:  python3 tools/fetch_eventbrite.py [YYYY-MM-DD]     (default: today in NYC)
"""

import json
import os
import re
import sys
import time
import urllib.parse
from datetime import datetime
from pathlib import Path

from fetch_nycgov import DATA, NYC, get

ROOT = Path(__file__).resolve().parent.parent
OUT = DATA / 'eventbrite-events.json'
ORGANIZERS = ROOT / 'data' / 'eventbrite-organizers.json'
API = 'https://www.eventbriteapi.com/v3'
PAGE = 'https://www.eventbrite.com/d/ny--new-york/events/'
# Eventbrite's category names -> the map's categories
CATEGORIES = {'Music': 'music', 'Performing & Visual Arts': 'theater', 'Film, Media & Entertainment': 'film',
              'Food & Drink': 'food', 'Sports & Fitness': 'sports', 'Health & Wellness': 'sports', 'Nightlife': 'nightlife'}


def organizer_events(org_id, token):
    rows, cont = [], None
    while True:
        params = {'token': token, 'status': 'live', 'order_by': 'start_asc', 'expand': 'venue,category'}
        if cont:
            params['continuation'] = cont
        data = get(f'{API}/organizers/{org_id}/events/?{urllib.parse.urlencode(params)}')
        rows += data.get('events') or []
        page = data.get('pagination') or {}
        if not page.get('has_more_items') or len(rows) >= 300:
            return rows
        cont = page.get('continuation')
        time.sleep(0.3)


def to_raw(ev, org):
    v = ev['venue']
    a = v.get('address') or {}
    start = datetime.fromisoformat(ev['start']['local']).replace(tzinfo=NYC)
    end = datetime.fromisoformat(ev['end']['local']).replace(tzinfo=NYC) if (ev.get('end') or {}).get('local') else None
    cat = (ev.get('category') or {}).get('name', '')
    title = (ev.get('name') or {}).get('text', '').strip()
    return {
        'id': str(ev['id']),
        'title': title,
        'category': 'comedy' if re.search(r'comedy|stand-?up', title, re.I) else CATEGORIES.get(cat, 'art' if 'Art' in cat else 'community'),
        'start': start.isoformat(),
        'end': end.isoformat() if end else None,
        'allDay': False,
        'venue': {'name': v.get('name') or org['name'], 'address': a.get('localized_address_display') or '',
                  'neighborhood': a.get('city') or '', 'lat': round(float(a['latitude']), 6), 'lng': round(float(a['longitude']), 6)},
        'price': None,
        'priceUnknown': not ev.get('is_free'),
        'description': f"By {org['name']} on Eventbrite",
        'url': ev.get('url') or PAGE,
        'tags': [],
    }


def main():
    day = datetime.strptime(sys.argv[1], '%Y-%m-%d').date() if len(sys.argv) > 1 else datetime.now(NYC).date()
    token = os.environ.get('EVENTBRITE_TOKEN')
    if not token:
        print('EVENTBRITE_TOKEN is not set; skipping Eventbrite and keeping the existing snapshot.')
        return
    orgs = json.loads(ORGANIZERS.read_text())['organizers']
    print(f'Fetching Eventbrite events for {day} from {len(orgs)} organizers...')
    events, unplaced, seen = [], [], set()
    for org in orgs:
        try:
            rows = organizer_events(org['id'], token)
        except Exception as e:
            # Eventbrite says what was wrong in the error body; it never contains the token.
            detail = e.read().decode('utf-8', 'replace')[:300] if hasattr(e, 'read') else ''
            print(f"  could not read {org['name']}: {e} {detail}", file=sys.stderr)
            continue
        kept = 0
        for ev in rows:
            if ev['id'] in seen or ev.get('online_event') or not (ev.get('start') or {}).get('local'):
                continue
            if datetime.fromisoformat(ev['start']['local']).date() != day:
                continue
            seen.add(ev['id'])
            a = (ev.get('venue') or {}).get('address') or {}
            if a.get('latitude') and a.get('longitude'):
                raw = to_raw(ev, org)
                # A show run several times a night is one pin at its first time, with every time listed.
                same = next((e for e in events if e['title'] == raw['title'] and e['venue']['name'] == raw['venue']['name']), None)
                if same:
                    same['times'].append(raw['start'])
                    continue
                raw['times'] = [raw['start']]
                events.append(raw)
                kept += 1
            else:
                unplaced.append({'title': (ev.get('name') or {}).get('text'), 'url': ev.get('url')})
        print(f"  {org['name']}: {kept}")
        time.sleep(0.5)
    for e in events:
        times = e.pop('times')
        if len(times) > 1:
            e['description'] += '. Times: ' + ', '.join(datetime.fromisoformat(t).strftime('%-I:%M %p').lower() for t in times)
    OUT.write_text(json.dumps({
        'source': {'name': 'Eventbrite', 'url': PAGE},
        'date': day.isoformat(),
        'fetchedAt': datetime.now(NYC).isoformat(timespec='seconds'),
        'events': events,
        'unplaced': unplaced,
    }, indent=1, ensure_ascii=False))
    print(f'  {len(events)} placed, {len(unplaced)} without a location')
    print(f'  wrote {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
