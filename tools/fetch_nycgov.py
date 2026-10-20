#!/usr/bin/env python3
"""Snapshot one day of NYC.gov events into public/data/nycgov-events.json.

NYC.gov's events page (https://www.nyc.gov/main/events/) is filled in by the
browser from the city's Events Calendar API on api.nyc.gov. That API has no
coordinates, so each event is placed on the map by:

  1. NYC Parks events: the Parks Department feed on www.nycgovparks.org,
     which lists lat/lng for every event (matched by title and day).
  2. Everything else: NYC City Planning's GeoSearch (geosearch.planninglabs.nyc)
     on the listed address.

Events that cannot be placed (no address, "check website") are kept in the
file under "unplaced" so nothing is silently lost.

Usage:  python3 tools/fetch_nycgov.py [YYYY-MM-DD]     (default: today in NYC)
"""

import html
import json
import os
import math
import re
import string
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    from zoneinfo import ZoneInfo
    NYC = ZoneInfo('America/New_York')
except Exception:  # pragma: no cover
    NYC = timezone(timedelta(hours=-4))

ROOT = Path(__file__).resolve().parent.parent
# Snapshots land in public/data; the refresh workflow sets EVENTS_DIR=public/data/tomorrow
# for its second pass, which fetches the next NYC day.
DATA = ROOT / os.environ.get('EVENTS_DIR', 'public/data')
DATA.mkdir(parents=True, exist_ok=True)
OUT = DATA / 'nycgov-events.json'
CACHE = ROOT / 'data' / 'geocode-cache.json'
# Where each Parks event location sits, learnt whenever the Parks feed answers.
# nycgovparks.org refuses requests from GitHub's servers, so the scheduled
# refresh falls back to this to place Parks events at venues seen before.
PLACES = ROOT / 'data' / 'parks-places.json'

UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36'
EVENTS_PAGE = 'https://www.nyc.gov/main/events/'
PARKS_FEED = 'https://www.nycgovparks.org/xml/events_300_rss.json'
GEOSEARCH = 'https://geosearch.planninglabs.nyc/v2/search'
BOROUGHS = {'Mn': 'Manhattan', 'Bk': 'Brooklyn', 'Bx': 'Bronx', 'Qn': 'Queens', 'SI': 'Staten Island'}


def get(url, headers=None, as_json=True):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': '*/*', **(headers or {})})
    with urllib.request.urlopen(req, timeout=30) as r:
        body = r.read().decode('utf-8')
    return json.loads(body) if as_json else body


def api_info():
    """The gateway and public key the nyc.gov page itself loads for its calendar."""
    gateway = get('https://www.nyc.gov/bin/nyc/gateway.json')['API_GATEWAY']
    key = get('https://www.nyc.gov/bin/nyc/sc.ec.json')['API_KEY_EVENT_CAL']
    return gateway, {'Ocp-Apim-Subscription-Key': key, 'Referer': EVENTS_PAGE}


def fetch_day(day):
    gateway, headers = api_info()
    stamp = day.strftime('%m/%d/%Y')
    params = {'startDate': f'{stamp} 12:00 AM', 'endDate': f'{stamp} 11:59 PM', 'sort': 'DATE'}
    items, page = [], 1
    while True:
        q = urllib.parse.urlencode({**params, 'pageNumber': page}, quote_via=urllib.parse.quote)
        data = get(f'{gateway}calendar/search?{q}', headers)
        items += data.get('items', [])
        pag = data.get('pagination', {})
        if pag.get('isLastPage', True) or page >= pag.get('numPages', 1):
            return items
        page += 1


# ---- placing events --------------------------------------------------------

def norm(s):
    return re.sub(r'[^a-z0-9]+', ' ', html.unescape(s or '').lower()).strip()


def parks_index():
    """(date, title) and event URL -> {lat, lng} from the Parks Department feed.

    The city calendar sometimes shortens Parks URLs so several events share one,
    so the title on the day is the main key and the URL is the fallback."""
    try:
        feed = get(PARKS_FEED)
    except Exception as e:
        print(f'  Parks feed unavailable: {e}', file=sys.stderr)
        if os.environ.get('GITHUB_ACTIONS'):
            print(f'::warning::Parks feed unavailable ({e}); placing Parks events from data/parks-places.json')
        return {}
    out = {}
    for row in feed if isinstance(feed, list) else []:
        m = re.match(r'\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)', (row.get('coordinates') or '').split(';')[0])
        if not m:
            continue
        pos = {'lat': float(m.group(1)), 'lng': float(m.group(2))}
        out.setdefault(('title', row.get('startdate'), norm(row.get('title'))), pos)
        url = re.sub(r'^https?://', '', (row.get('link') or '').replace('\\/', '/')).rstrip('/')
        out.setdefault(('url', url), pos)
    return out


def parks_lookup(parks, ev, day):
    hit = parks.get(('title', day.isoformat(), norm(ev.get('name'))))
    if not hit and 'nycgovparks.org' in (ev.get('website') or ''):
        hit = parks.get(('url', re.sub(r'^https?://', '', ev['website'].split('?')[0]).rstrip('/')))
    return hit


def clean_address(a):
    return re.sub(r'\s+', ' ', html.unescape(a or '').replace('\\/', '/')).strip()


def geosearch(text, focus=None, size=1):
    params = {'text': text, 'size': size}
    if focus:
        params['focus.point.lat'], params['focus.point.lon'] = focus
    res = get(f'{GEOSEARCH}?{urllib.parse.urlencode(params)}')
    return [{'lat': f['geometry']['coordinates'][1], 'lng': f['geometry']['coordinates'][0],
             'label': f['properties'].get('label', ''), 'confidence': f['properties'].get('confidence', 0)}
            for f in res.get('features', [])]


def dist_m(p, q):
    return math.hypot(p['lat'] - q['lat'], (p['lng'] - q['lng']) * 0.76) * 111_000


def intersection(main, cross, borough):
    """GeoSearch has addresses, not intersections, so find where address points
    on the two streets come closest, re-centring the search a few times."""
    m, c = geosearch(f'{main}, {borough}', size=40), geosearch(f'{cross}, {borough}', size=40)
    best = None
    for _ in range(3):
        if not m or not c:
            return None
        d, p, q = min(((dist_m(p, q), p, q) for p in m for q in c), key=lambda t: t[0])
        best = (d, {'lat': (p['lat'] + q['lat']) / 2, 'lng': (p['lng'] + q['lng']) / 2, 'label': f'{main} & {cross}'})
        focus = (best[1]['lat'], best[1]['lng'])
        m, c = geosearch(f'{main}, {borough}', focus, 40), geosearch(f'{cross}, {borough}', focus, 40)
    return best


def geocode(address, borough, cache):
    """Street segments ('X between A and B Borough') become the nearer of the two
    corners; plain street addresses go straight to GeoSearch. Names that are not
    addresses ('Off-Broadway', a garden name) are left unplaced rather than guessed."""
    key = f'{address} | {borough}'
    if key in cache:
        return cache[key]
    hit = None
    try:
        seg = re.match(r'(.+?) between (.+?) and (.+?)(?: (Manhattan|Bronx|Brooklyn|Queens|Staten Island))?$', address, re.I)
        if seg:
            boro = seg.group(4) or borough
            corners = [intersection(seg.group(1), x, boro) for x in (seg.group(2), seg.group(3))]
            corners = [c for c in corners if c and c[0] < 120]
            if corners:
                hit = min(corners, key=lambda c: c[0])[1]
        elif re.match(r'\d', address):
            res = geosearch(f'{address}, {borough}')
            if res and res[0]['confidence'] >= 0.8:
                hit = {k: res[0][k] for k in ('lat', 'lng', 'label')}
    except Exception as e:
        print(f'  GeoSearch failed for "{address}": {e}', file=sys.stderr)
        return None
    cache[key] = hit
    return hit


# ---- mapping into the map's raw event shape ----------------------------------

def category(ev):
    text = f"{ev.get('name', '')} {ev.get('categories', '')}".lower()
    rules = [
        ('film', r'movie|film|screening'),
        ('food', r'greenmarket|farmers? market|farm stand|market\b|tasting'),
        ('art', r'exhibit|gallery|museum|art\b|arts\b|studio|dendrology|wreath|cultural|opening reception'),
        ('music', r'concert|music(?!al)|jazz|band\b'),
        ('theater', r'theater\b|theatre\b|broadway|musical\b|opera\b|ballet|dance performance|shakespeare'),
        ('comedy', r'comedy|stand-?up'),
        ('sports', r'swim team|running|race\b|basketball|soccer|tennis'),
        ('nightlife', r'ghost tour|fright|spooky|hallowscream|camping'),
    ]
    for cat, rx in rules:
        if re.search(rx, text):
            return cat
    return 'community'


def venue_category(venue, fallback='community'):
    """For a listing with no usable category: a museum or gallery is art, a stage is theater."""
    v = venue.lower()
    if re.search(r'cinema|movie theat', v):
        return 'film'
    if re.search(r'museum|gallery|galerie|kunsthalle', v):
        return 'art'
    if re.search(r'theat(er|re)\b|playhouse|broadway', v):
        return 'theater'
    return fallback


def strip_html(s):
    s = html.unescape((s or '').replace('\\/', '/').replace('\\n', ' '))
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', s)).strip()


def venue_parts(ev, borough):
    address = clean_address(ev.get('address'))
    seg = re.match(r'(.+?) (between .+?)(?: (?:Manhattan|Bronx|Brooklyn|Queens|Staten Island))?$', address, re.I)
    if seg:
        street, rest = (string.capwords(x.lower()) for x in seg.groups())
        return street, rest.replace('Between', 'between').replace(' And ', ' and '), address
    if ' in ' in address and ev.get('addressType') != 'Address':
        spot, place = address.split(' in ', 1)
        return place.strip(), spot.strip(), address
    return (ev.get('location') or address).strip(), address, address


def to_raw(ev, pos):
    boros = [BOROUGHS.get(b) for b in ev.get('boroughs') or [] if b in BOROUGHS]
    borough = boros[0] if len(boros) == 1 else ''
    name, addr, _ = venue_parts(ev, borough)
    tags = [t.strip() for t in (ev.get('categories') or '').split(',') if t.strip() and t.strip() != 'Featured']
    return {
        'id': f"{ev['id']}-{ev.get('sequence', 1)}",
        'title': strip_html(ev['name']),
        'category': category(ev),
        'start': ev['startDate'],
        'end': ev.get('endDate'),
        'allDay': bool(ev.get('allDay')),
        'timeLabel': ev.get('timePart', ''),
        'venue': {'name': name, 'address': addr, 'neighborhood': borough, 'lat': round(pos['lat'], 6), 'lng': round(pos['lng'], 6)},
        'price': None,
        'priceUnknown': True,  # neither feed lists prices
        'description': strip_html(ev.get('shortDesc')),
        'details': strip_html(ev.get('desc')),
        'url': ev.get('permalink') or EVENTS_PAGE,
        'website': ev.get('website'),
        'agency': ev.get('agencyName'),
        'tags': tags,
    }


def main():
    day = datetime.strptime(sys.argv[1], '%Y-%m-%d').date() if len(sys.argv) > 1 else datetime.now(NYC).date()
    print(f'Fetching NYC.gov events for {day}...')
    items = fetch_day(day)
    print(f'  {len(items)} listed')

    parks = parks_index()
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    places = json.loads(PLACES.read_text()) if PLACES.exists() else {}
    events, unplaced, canceled = [], [], 0
    for ev in items:
        if ev.get('canceled') or str(ev.get('name', '')).upper().startswith('CANCELED'):
            canceled += 1
            continue
        boros = [BOROUGHS.get(b) for b in ev.get('boroughs') or [] if b in BOROUGHS]
        borough = boros[0] if len(boros) == 1 else ''
        address = clean_address(ev.get('address'))
        place_key = f'{address} | {borough}'
        pos = parks_lookup(parks, ev, day)
        if pos and address:
            places[place_key] = {'lat': pos['lat'], 'lng': pos['lng']}
        if not pos and 'nycgovparks.org' in (ev.get('website') or ''):
            pos = places.get(place_key)
        if not pos:
            if address and not re.search(r'check website|various|tba', address, re.I) and borough:
                pos = geocode(address, borough, cache)
        if pos:
            events.append(to_raw(ev, pos))
        else:
            unplaced.append({'title': strip_html(ev['name']), 'address': clean_address(ev.get('address')), 'url': ev.get('permalink')})

    CACHE.parent.mkdir(parents=True, exist_ok=True)
    CACHE.write_text(json.dumps(cache, indent=1, sort_keys=True))
    PLACES.write_text(json.dumps(places, indent=1, sort_keys=True))

    # Never swap today's snapshot for a thinner one (say, a run where the Parks
    # feed was down); a new day always replaces yesterday's.
    if OUT.exists():
        old = json.loads(OUT.read_text())
        if old.get('date') == day.isoformat() and len(old.get('events', [])) > len(events):
            print(f'  kept the existing snapshot: it places {len(old["events"])} events, this run {len(events)}')
            return
    OUT.write_text(json.dumps({
        'source': {'name': 'NYC.gov Events Calendar', 'url': EVENTS_PAGE},
        'date': day.isoformat(),
        'fetchedAt': datetime.now(NYC).isoformat(timespec='seconds'),
        'events': events,
        'unplaced': unplaced,
    }, indent=1, ensure_ascii=False))
    print(f'  {len(events)} placed, {len(unplaced)} without a location, {canceled} canceled skipped')
    print(f'  wrote {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
