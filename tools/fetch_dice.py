#!/usr/bin/env python3
"""Snapshot one day of DICE New York events into public/data/dice-events.json.

DICE's browse pages (https://dice.fm/browse/new_york-5bbf4db0f06331478e9b2c59)
carry their listings as page data. Each category page (gigs, DJ, party, comedy
and so on) lists its next events in date order, so reading every category's
first page covers most of the day. Venues come with a street address but no
coordinates, so each venue is placed once with NYC GeoSearch and remembered in
data/geocode-cache.json.

Usage:  python3 tools/fetch_dice.py [YYYY-MM-DD]     (default: today in NYC)
"""

import json
import re
import sys
import time
from datetime import datetime
from pathlib import Path

from fetch_nycgov import CACHE, NYC, geosearch, get

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'data' / 'dice-events.json'
SITE = 'https://dice.fm'
BROWSE = f'{SITE}/browse/new_york-5bbf4db0f06331478e9b2c59'
CATEGORIES = {'music:gig': 'music', 'music:dj': 'nightlife', 'music:party': 'nightlife', 'culture:comedy': 'comedy',
              'culture:theatre': 'theater', 'culture:film': 'film', 'culture:sport': 'sports', 'culture:art': 'art',
              'culture:food': 'food'}


def page_data(url):
    body = get(url, as_json=False)
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', body, re.S)
    return json.loads(m.group(1))['props']['pageProps'] if m else {}


def listings():
    """(event, category) for every event on the browse page and each category's first page."""
    first = page_data(BROWSE)
    out = [(ev, None) for ev in first.get('events') or []]
    for f in first.get('primaryFilters') or []:
        time.sleep(0.5)
        try:
            out += [(ev, f['id']) for ev in page_data(SITE + f['activateLink'] if f['activateLink'].startswith('/') else f['activateLink']).get('events') or []]
        except Exception as e:
            print(f"  could not read {f.get('name')}: {e}", file=sys.stderr)
    return out


def venue_position(v, cache):
    """A venue placed from its street address with GeoSearch. Cached per DICE venue."""
    key = f"dice: {v.get('id')}"
    if key in cache:
        return cache[key]
    hit = None
    addr = (v.get('address') or '').strip()
    street = addr.split(',')[0].strip()
    num = re.match(r'(\d+(?:-\d+)?)\s+\S', street)
    try:
        if num:
            res = geosearch(addr.replace(', USA', '').replace(', United States', ''))
            # Only trust a hit on the same house number.
            if res and res[0]['confidence'] >= 0.8 and res[0]['label'].startswith(num.group(1) + ' '):
                hit = {k: res[0][k] for k in ('lat', 'lng', 'label')}
        if not hit:
            # Places GeoSearch knows by name ('Industry City', 'Brooklyn Navy Yard').
            name = re.sub(r'[^a-z0-9]+', ' ', v.get('name', '').lower()).strip()
            for r in geosearch(v.get('name', ''), size=5):
                if re.sub(r'[^a-z0-9]+', ' ', r['label'].split(',')[0].lower()).strip() == name and r['confidence'] >= 0.8:
                    hit = {k: r[k] for k in ('lat', 'lng', 'label')}
                    break
    except Exception as e:
        print(f"  could not place {v.get('name')}: {e}", file=sys.stderr)
        return None
    cache[key] = hit
    return hit


def main():
    day = datetime.strptime(sys.argv[1], '%Y-%m-%d').date() if len(sys.argv) > 1 else datetime.now(NYC).date()
    print(f'Fetching DICE events for {day}...')
    rows = listings()
    print(f'  {len(rows)} listed across categories')
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    events, unplaced, seen = [], [], {}
    for ev, cat in rows:
        start = datetime.fromisoformat(ev['dates']['event_start_date']).astimezone(NYC)
        if start.date() != day:
            continue
        if ev['id'] in seen:
            # Keep the most specific category any page gave it.
            if cat in CATEGORIES and seen[ev['id']] is not None and seen[ev['id']].get('category') == 'music':
                seen[ev['id']]['category'] = CATEGORIES[cat]
            continue
        url = f"{SITE}/event/{ev['id']}"
        v = (ev.get('venues') or [{}])[0]
        pos = venue_position(v, cache) if v.get('address') else None
        if not pos:
            seen[ev['id']] = None
            unplaced.append({'title': ev['name'], 'venue': v.get('name'), 'url': url})
            continue
        end = ev['dates'].get('event_end_date')
        end = datetime.fromisoformat(end).astimezone(NYC) if end else None
        p = ev.get('price') or {}
        cents = p.get('amount') if p.get('amount') is not None else p.get('amount_from')
        price = {'min': round(cents / 100), 'max': round(cents / 100), 'currency': p.get('currency', 'USD')} if cents is not None else None
        raw = {
            'id': ev['id'],
            'title': ev['name'].strip(),
            'category': CATEGORIES.get(cat, 'music' if (cat or '').startswith('music') else 'community') if cat else 'music',
            'start': start.isoformat(),
            'end': end.isoformat() if end and end.date() == start.date() else None,
            'venue': {'name': v.get('name', 'Venue TBA'), 'address': v.get('address', ''), 'neighborhood': '',
                      'lat': round(pos['lat'], 6), 'lng': round(pos['lng'], 6)},
            'price': price,
            'priceUnknown': price is None,
            'description': ev.get('one_liner') or '',
            'details': '',
            'url': url,
            'tags': [],
        }
        seen[ev['id']] = raw
        events.append(raw)
    CACHE.write_text(json.dumps(cache, indent=1, sort_keys=True))
    OUT.write_text(json.dumps({
        'source': {'name': 'DICE', 'url': BROWSE},
        'date': day.isoformat(),
        'fetchedAt': datetime.now(NYC).isoformat(timespec='seconds'),
        'events': events,
        'unplaced': unplaced,
    }, indent=1, ensure_ascii=False))
    print(f'  {len(events)} placed, {len(unplaced)} without a mappable venue')
    print(f'  wrote {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
