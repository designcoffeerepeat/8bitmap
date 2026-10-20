#!/usr/bin/env python3
"""Snapshot one day of Artwrld art listings into public/data/artwrld-events.json.

Three Artwrld New York pages feed it, all kept as art:
- openings (https://www.artwrld.com/city/new-york/openings): gallery and museum
  exhibitions that open on the day. The reception time comes from the listing
  ("Opens today 6:00 - 8:00 PM") or the exhibition's own page; with no time the
  opening is shown all day.
- exhibitions (/city/new-york/exhibitions): every show on view. Only museum shows
  are kept, shown all day, since the hundreds of gallery shows would bury the map.
  The list has no coordinates, so each museum is placed once from one of its
  exhibition pages and remembered in data/geocode-cache.json.
- events (/city/new-york/events): talks, screenings and performances on the day,
  with the time and place from each event's page.
Only the title, venue, time, dates and a link are kept, no images or write-ups.

Usage:  python3 tools/fetch_artwrld.py [YYYY-MM-DD]     (default: today in NYC)
"""

import json
import re
import sys
import time
from datetime import datetime
from pathlib import Path

from fetch_nycgov import CACHE, NYC, get

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'data' / 'artwrld-events.json'
SITE = 'https://www.artwrld.com'
PAGE = '/city/new-york/openings'
EXHIBITIONS = '/city/new-york/exhibitions'
EVENTS = '/city/new-york/events'
# Museums and other non-profit spaces whose shows are worth a pin; gallery shows come in through openings.
MUSEUM = re.compile(r'museum|whitney museum|moma|guggenheim|metropolitan|new museum|drawing center|frick|morgan|noguchi|'
                    r'center of photography|cooper hewitt|hispanic society|studio museum|ps1\b|brooklyn museum', re.I)


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
    for m in re.finditer(r'"item":(\{[^{}]*"startDate"[^{}]*\})', page(PAGE, required=True)):
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
    body = page(f'/exhibit/{slug}')
    m = re.search(r'"Opening Reception"\}\],\["\$","div",null,\{[^{}]*"children":"([^"]+)"', body)
    return reception(m.group(1)) if m else None


def page(path, required=False):
    """A page's data, retried a few times. A detail page that will not load gives ''; a listing page raises."""
    for attempt in range(3):
        try:
            body = flight(get(f'{SITE}{path}', as_json=False))
            time.sleep(0.5)
            return body
        except Exception as e:
            print(f'  {path}: {e}', file=sys.stderr)
            if required and attempt == 2:
                raise
            time.sleep(2 * (attempt + 1))
    return ''


def position(body, slug):
    """The (lat, lng) Artwrld gives a listing on its own page, or None."""
    m = re.search(r'"slug":"' + re.escape(slug) + r'"[^{}]*?"lat":"([^"]*)","lng":"([^"]*)"', body)
    try:
        return round(float(m.group(1)), 6), round(float(m.group(2)), 6)
    except (AttributeError, ValueError):
        return None


def museum_shows(day):
    """Museum exhibitions on view on the day."""
    shows = {}
    for m in re.finditer(r'\{"id":"\d+","documentId":"[^"]+","slug":"[^"]+","city":"New York","type":"Exhibition"[^{}]*\}',
                         page(EXHIBITIONS, required=True)):
        it = json.loads(m.group(0))
        if (MUSEUM.search(it.get('gallery') or '') and (it.get('startDate') or '0') <= day.isoformat()
                and (it.get('endDate') or '9') >= day.isoformat()):
            shows.setdefault(it['id'], it)
    return list(shows.values())


def events_on(day):
    """(slug, title, venue, neighbourhood) for each event on the day in the events table."""
    rx = (r'"data-type":"event","data-date":"' + day.isoformat() + r'".*?"href":"/event/([^"]+)","children":"([^"]*)"'
          r'.*?"cx-col-venue","children":"([^"]*)".*?"cx-col-hood","children":"([^"]*)"')
    return re.findall(rx, page(EVENTS, required=True))


def short(d):
    return f'{d:%b} {d.day}'


def main():
    day = datetime.strptime(sys.argv[1], '%Y-%m-%d').date() if len(sys.argv) > 1 else datetime.now(NYC).date()
    print(f'Fetching Artwrld listings for {day}...')
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
    seen = {e['id'] for e in events}
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    shows = museum_shows(day)
    print(f'  {len(shows)} museum exhibitions on view')
    for it in shows:
        if it['id'] in seen:
            continue
        key = f"artwrld:{it['gallery']}"
        if key not in cache:
            pos = position(page(f"/exhibit/{it['slug']}"), it['slug'])
            if pos:
                cache[key] = {'lat': pos[0], 'lng': pos[1]}
        pos = cache.get(key)
        if not pos:
            unplaced.append({'title': it['title'], 'venue': it.get('gallery'), 'url': f"{SITE}/exhibit/{it['slug']}"})
            continue
        until = datetime.strptime(it['endDate'], '%Y-%m-%d').date() if it.get('endDate') else None
        events.append({
            'id': it['id'],
            'title': it['title'].strip(),
            'category': 'art',
            'start': datetime(day.year, day.month, day.day, tzinfo=NYC).isoformat(),
            'end': None,
            'allDay': True,
            'venue': {'name': it['gallery'], 'address': '', 'neighborhood': it.get('location', ''), 'lat': pos['lat'], 'lng': pos['lng']},
            'price': None,
            'priceUnknown': True,
            'description': 'Museum exhibition' + (f', on view until {short(until)}' if until else ''),
            'details': '',
            'url': f"{SITE}/exhibit/{it['slug']}",
            'tags': ['exhibition'],
        })
    talks = events_on(day)
    print(f'  {len(talks)} art events on the day')
    for slug, title, venue, hood in talks:
        body = page(f'/event/{slug}')
        pos = position(body, slug)
        when = re.search(r'"dateTime":"([^"]+)"', body)
        end = re.search(r'"slug":"' + re.escape(slug) + r'"[^{}]*?"endDate":"([^"]+)"', body)
        if not pos or not when:
            unplaced.append({'title': title, 'venue': venue, 'url': f'{SITE}/event/{slug}'})
            continue
        start = datetime.fromisoformat(when.group(1)).astimezone(NYC)
        end = datetime.fromisoformat(end.group(1).replace('Z', '+00:00')).astimezone(NYC) if end else None
        events.append({
            'id': f'event-{slug}',
            'title': title.strip(),
            'category': 'art',
            'start': start.isoformat(),
            'end': end.isoformat() if end and end > start and end.date() == start.date() else None,
            'allDay': False,
            'venue': {'name': venue, 'address': '', 'neighborhood': hood, 'lat': pos[0], 'lng': pos[1]},
            'price': None,
            'priceUnknown': True,
            'description': 'Art event',
            'details': '',
            'url': f'{SITE}/event/{slug}',
            'tags': ['event'],
        })
    CACHE.write_text(json.dumps(cache, indent=1, sort_keys=True))
    OUT.write_text(json.dumps({
        'source': {'name': 'Artwrld', 'url': SITE + PAGE},
        'date': day.isoformat(),
        'fetchedAt': datetime.now(NYC).isoformat(timespec='seconds'),
        'events': events,
        'unplaced': unplaced,
    }, indent=1, ensure_ascii=False))
    print(f'  {len(events)} placed, {len(unplaced)} without a location')
    print(f'  wrote {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
