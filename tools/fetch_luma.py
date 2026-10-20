#!/usr/bin/env python3
"""Snapshot one day of Luma NYC events into public/data/luma-events.json.

The Luma NYC page (https://luma.com/nyc) loads its listings from Luma's public
discover API on api.lu.ma, and each event carries coordinates. Hosts can hide
an event's address until guests register; Luma then gives only a deliberately
shifted position, so those events are left off the map (kept under
"unplaced") rather than pinned somewhere they are not.

Usage:  python3 tools/fetch_luma.py [YYYY-MM-DD]     (default: today in NYC)
"""

import json
import re
import sys
import urllib.parse
from datetime import datetime
from pathlib import Path

from fetch_nycgov import NYC, get

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'data' / 'luma-events.json'
API = 'https://api.lu.ma/discover/get-paginated-events'
PAGE = 'https://luma.com/nyc'
PLACE_NYC = 'discplace-Izx1rQVSh8njYpP'


def local(iso_utc):
    return datetime.fromisoformat(iso_utc.replace('Z', '+00:00')).astimezone(NYC)


def fetch_day(day):
    """Listings come in start order, so stop once they pass the day."""
    rows, cursor = [], None
    for _ in range(40):
        params = {'discover_place_api_id': PLACE_NYC, 'pagination_limit': 50}
        if cursor:
            params['pagination_cursor'] = cursor
        data = get(f'{API}?{urllib.parse.urlencode(params)}')
        entries = data.get('entries', [])
        rows += [e for e in entries if local(e['event']['start_at']).date() == day]
        if not data.get('has_more') or not entries or local(entries[-1]['event']['start_at']).date() > day:
            return rows
        cursor = data['next_cursor']
    return rows


def category(name):
    t = name.lower()
    rules = [('film', r'film|screening|movie'), ('comedy', r'comedy|stand-?up|improv'),
             ('music', r'concert|music(?!al)|\bdj\b|jazz|live set'), ('food', r'tasting|dinner|brunch|coffee|wine|food|supper'),
             ('theater', r'theater|theatre|\bplay\b|musical\b'),
             ('art', r'\bart\b|gallery|exhibit|museum|opening reception|design|book|reading|poetry'),
             ('nightlife', r'party|happy hour|rave|club night|afterparty'),
             ('sports', r'\brun\b|run club|yoga|climb|pickleball|soccer|basketball|fitness')]
    for cat, rx in rules:
        if re.search(rx, t):
            return cat
    return 'community'


def to_raw(e):
    ev, g = e['event'], e['event'].get('geo_address_info') or {}
    c = ev['coordinate']
    full = g.get('full_address') or ''
    name = g.get('address') or full.split(',')[0]
    cal = (e.get('calendar') or {}).get('name')
    ticket = e.get('ticket_info') or {}
    if ticket.get('is_free'):
        price, unknown = None, False
    elif ticket.get('price'):
        cents = ticket['price'].get('cents') if isinstance(ticket['price'], dict) else None
        price, unknown = ({'min': round(cents / 100), 'max': round(cents / 100), 'currency': 'USD'}, False) if cents else (None, True)
    else:
        price, unknown = None, True
    return {
        'id': ev['api_id'],
        'title': ev['name'],
        'category': category(ev['name']),
        'start': local(ev['start_at']).isoformat(),
        'end': local(ev['end_at']).isoformat() if ev.get('end_at') else None,
        'venue': {'name': name, 'address': full, 'neighborhood': g.get('sublocality') or g.get('city') or '',
                  'lat': round(c['latitude'], 6), 'lng': round(c['longitude'], 6)},
        'price': price,
        'priceUnknown': unknown,
        'description': f'From the {cal} calendar on Luma' if cal else '',
        'details': '',
        'url': f"https://luma.com/{ev['url']}",
        'tags': [],
    }


def main():
    day = datetime.strptime(sys.argv[1], '%Y-%m-%d').date() if len(sys.argv) > 1 else datetime.now(NYC).date()
    print(f'Fetching Luma NYC events for {day}...')
    rows = fetch_day(day)
    events, unplaced = [], []
    for e in rows:
        ev = e['event']
        shown = (ev.get('geo_address_info') or {}).get('mode') == 'shown' and ev.get('coordinate')
        if ev.get('location_type') == 'offline' and shown:
            events.append(to_raw(e))
        else:
            unplaced.append({'title': ev['name'], 'address': 'address shown to guests only' if ev.get('location_type') == 'offline' else 'online',
                             'url': f"https://luma.com/{ev['url']}"})
    OUT.write_text(json.dumps({
        'source': {'name': 'Luma NYC', 'url': PAGE},
        'date': day.isoformat(),
        'fetchedAt': datetime.now(NYC).isoformat(timespec='seconds'),
        'events': events,
        'unplaced': unplaced,
    }, indent=1, ensure_ascii=False))
    print(f'  {len(events)} placed, {len(unplaced)} without a public address')
    print(f'  wrote {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
