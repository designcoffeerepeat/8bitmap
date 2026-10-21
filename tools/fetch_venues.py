#!/usr/bin/env python3
"""Snapshot one day of events from venues' own calendars into public/data/venues-events.json.

Each venue below publishes its own schedule on its website, and each one is read
on its own, so one site being down or changing its pages only loses that venue.
Only the title, time, a price when the venue gives one and a link back are kept;
no images or write-ups. Every event carries its venue as its publisher, so each
venue shows up on its own in the Sources dropdown.

  Film Forum            the week's showtimes on https://filmforum.org/
  Nitehawk Cinema       the day's showtimes at Williamsburg and Prospect Park
  Smalls, Mezzrow and Jazzcultural   the today-and-tomorrow sets on https://www.smallslive.com/
  New York Comedy Club  the calendar's event data (East 24th St, Upper West Side, East 4th St)
  Eastville Comedy Club the calendar's event data
  St. Marks Comedy Club the calendar page
  The PIT               the month calendar on https://thepit-nyc.com/calendar/

Venues are placed once from their street address with GeoSearch and remembered
in data/geocode-cache.json.

Usage:  python3 tools/fetch_venues.py [YYYY-MM-DD]     (default: today in NYC)
"""

import html
import json
import re
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

from fetch_nycgov import CACHE, DATA, NYC, geosearch, get

ROOT = Path(__file__).resolve().parent.parent
OUT = DATA / 'venues-events.json'

# name: (street address for GeoSearch, website)
VENUES = {
    'Film Forum': ('209 West Houston Street, Manhattan', 'https://filmforum.org/'),
    'Nitehawk Williamsburg': ('136 Metropolitan Avenue, Brooklyn', 'https://nitehawkcinema.com/williamsburg/'),
    'Nitehawk Prospect Park': ('188 Prospect Park West, Brooklyn', 'https://nitehawkcinema.com/prospectpark/'),
    'Smalls': ('183 West 10th Street, Manhattan', 'https://www.smallslive.com/'),
    'Mezzrow': ('163 West 10th Street, Manhattan', 'https://www.smallslive.com/'),
    'Jazzcultural': ('349 West 46th Street, Manhattan', 'https://www.smallslive.com/'),
    'New York Comedy Club': ('241 East 24th Street, Manhattan', 'https://newyorkcomedyclub.com/'),
    'New York Comedy Club Upper West Side': ('236 West 78th Street, Manhattan', 'https://newyorkcomedyclub.com/'),
    'New York Comedy Club on 4th Street': ('85 East 4th Street, Manhattan', 'https://newyorkcomedyclub.com/'),
    'Eastville Comedy Club': ('487 Atlantic Avenue, Brooklyn', 'https://www.eastvillecomedy.com/'),
    'St. Marks Comedy Club': ('12 St Marks Place, Manhattan', 'https://www.stmarkscomedyclub.com/'),
    'The PIT': ('154 West 29th Street, Manhattan', 'https://thepit-nyc.com/'),
}


def text(s):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s or ''))).strip()


def at(day, h, m):
    return datetime(day.year, day.month, day.day, h, m, tzinfo=NYC)


def clock(s):
    """'7:30 pm' | '9:00 PM' | '8pm' -> (h, m)."""
    m = re.match(r'(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m', s.strip(), re.I)
    if not m:
        return None
    h = int(m.group(1)) % 12 + (12 if m.group(3).lower() == 'p' else 0)
    return h, int(m.group(2) or 0)


def ld_events(body):
    """Every schema.org event in a page's ld+json blocks."""
    out = []
    for block in re.findall(r'<script type="application/ld\+json"[^>]*>(.*?)</script>', body, re.S):
        try:
            data = json.loads(block)
        except ValueError:
            continue
        for d in data if isinstance(data, list) else [data]:
            if isinstance(d, dict) and 'Event' in str(d.get('@type', '')):
                out.append(d)
    return out


def event(venue, title, start, url, category, end=None, price=None, description=''):
    return {'venue': venue, 'title': title, 'category': category, 'start': start, 'end': end,
            'price': price, 'url': url, 'description': description}


def film_forum(day):
    body = get('https://filmforum.org/', as_json=False)
    out = []
    # The front page has a tab per day of the coming week, each opening with the day of the month: <!-- 21 -->.
    for tab in re.findall(r'<div id="tabs-\d+">(.*?)</div>', body, re.S):
        n = re.match(r'\s*<!--\s*(\d+)\s*-->', tab)
        if not n or int(n.group(1)) != day.day:
            continue
        for p in re.findall(r'<p>(.*?)</p>', tab, re.S):
            film = re.search(r'<strong><a href="([^"]+)">(.*?)</a></strong>', p, re.S)
            times = re.findall(r'<span>(\d{1,2}):(\d{2})</span>', p)
            if not film or not times:
                continue
            # Times have no am or pm. Screenings run from late morning to late night, in order,
            # so 10 and 11 are morning until an afternoon show has come before them.
            slots, pm = [], False
            for h, m in times:
                h = int(h)
                if h == 12 or h < 10 or pm:
                    pm = True
                    h = h if h == 12 else h + 12
                slots.append(at(day, h % 24, int(m)))
            out.append(event('Film Forum', text(film.group(2)), slots[0], film.group(1), 'film',
                             description='Showtimes: ' + ', '.join(s.strftime('%-I:%M %p').lower() for s in slots)))
    return out


def nitehawk(day):
    out = []
    for slug, venue in (('williamsburg', 'Nitehawk Williamsburg'), ('prospectpark', 'Nitehawk Prospect Park')):
        offset = (day - datetime.now(NYC).date()).days
        body = get(f'https://nitehawkcinema.com/{slug}/{day.isoformat()}/{offset}/', as_json=False)
        for show in re.split(r'<li class="show-container', body)[1:]:
            title = re.search(r'<div class="show-title">(.*?)</div>', show, re.S)
            link = re.search(r'<a class="overlay-link" href="([^"?]+)', show)
            # The day's page lists each film's showtimes on that day as buttons: '3:45 pm'.
            slots = sorted({at(day, *clock(t)) for t in re.findall(r'class="showtime[^"]*"[^>]*>\s*(\d{1,2}:\d{2}\s*[ap]m)', show, re.I)})
            if title and slots:
                out.append(event(venue, text(title.group(1)), slots[0], link.group(1) if link else VENUES[venue][1], 'film',
                                 description='Showtimes: ' + ', '.join(s.strftime('%-I:%M %p').lower() for s in slots)))
    return out


def smalls(day):
    body = get('https://www.smallslive.com/', as_json=False)
    out = []
    label = f"{day.strftime('%a %b')} {day.day}"
    for card in re.findall(r'<article class="event-display-today-and-tomorrow(.*?)</article>', body, re.S):
        title = re.search(r'event-info-title">(.*?)<', card)
        venue = re.search(r'title5 venue">\s*Live at (.*?)\s*<', card)
        link = re.search(r'href="(/events/[^"]+)"', card)
        sets = [text(s) for s in re.findall(r'title5 sets">(.*?)<', card)]
        if not (title and venue and link) or label not in sets or venue.group(1) not in VENUES:
            continue
        # 'Sets at 6:00 PM & 7:30 PM' or 'From 11:45 PM - 4:00 AM'
        times = [clock(t) for t in re.findall(r'\d{1,2}:\d{2}\s*[AP]M', ' '.join(sets), re.I)]
        if not times:
            continue
        start = at(day, *times[0])
        end = None
        if sets[-1].startswith('From') and len(times) > 1:
            end = at(day, *times[1])
            end += timedelta(days=1) if end <= start else timedelta(0)
        out.append(event(venue.group(1), text(title.group(1)), start, 'https://www.smallslive.com' + link.group(1), 'music',
                         end=end, description=sets[-1]))
    return out


def seatengine_calendar(url, day, venues):
    """Comedy clubs whose calendar page lists its shows as schema.org ComedyEvents with full times."""
    out = []
    for e in ld_events(get(url, as_json=False)):
        try:
            start = datetime.fromisoformat(e['startDate']).astimezone(NYC)
        except (KeyError, ValueError):
            continue
        name = (e.get('location') or {}).get('name', '')
        if start.date() != day or name not in venues:
            continue
        offer = e.get('offers') or {}
        try:
            p = float(offer.get('price'))
            price = {'min': round(p), 'max': round(p), 'currency': offer.get('priceCurrency') or 'USD'} if p > 0 else None
        except (TypeError, ValueError):
            price = None
        out.append(event(venues[name], html.unescape(e.get('name', '')).strip(), start, e.get('url') or offer.get('url') or url,
                         'comedy', price=price))
    return out


def nycc(day):
    return seatengine_calendar('https://newyorkcomedyclub.com/calendar', day, {
        'New York Comedy Club': 'New York Comedy Club',
        'New York Comedy Club Upper West Side': 'New York Comedy Club Upper West Side',
        'New York Comedy Club on 4th Street': 'New York Comedy Club on 4th Street'})


def eastville(day):
    return seatengine_calendar('https://www.eastvillecomedy.com/calendar', day, {'Eastville Comedy Club': 'Eastville Comedy Club'})


def st_marks(day):
    body = get('https://www.stmarkscomedyclub.com/calendar', as_json=False)
    out = []
    want = f"{day.strftime('%B')} {day.day}, {day.year}"
    for card in re.findall(r'<a href="([^"]+)"[^>]*class="day-card[^"]*"[^>]*>(.*?)</a>', body, re.S):
        url, inner = card
        title = re.search(r'class="event-name show">(.*?)</div>', inner, re.S)
        when = [text(p) for p in re.findall(r'<p class="b-venue">(.*?)</p>', inner, re.S)]
        if not title or len(when) < 2 or when[0] != want or not clock(when[1]):
            continue
        out.append(event('St. Marks Comedy Club', text(title.group(1)), at(day, *clock(when[1])), url, 'comedy'))
    return out


def pit(day):
    month = day.strftime('%B+%Y')
    body = get(f'https://thepit-nyc.com/calendar/?month={month}', as_json=False)
    # Each day of the month view is a block whose id is midnight that day in New York, as a Unix time.
    stamp = int(at(day, 0, 0).timestamp())
    m = re.search(rf"<div id='day-{stamp}'(.*?)(?=<div id='day-\d+'|<div class=\"week)", body, re.S)
    out = []
    if not m:
        return out
    for show in re.findall(r'<li class="event (.*?)</ul></li>', m.group(1), re.S):
        title = re.search(r'<p class="event__title">(.*?)</p>', show, re.S)
        link = re.search(r'<a href="([^"]+)"', show)
        for t in re.findall(r'<section class="action__time">(.*?)</section>', show):
            if title and clock(t):
                out.append(event('The PIT', text(title.group(1)), at(day, *clock(t)), link.group(1) if link else VENUES['The PIT'][1], 'comedy'))
    return out


READERS = [film_forum, nitehawk, smalls, nycc, eastville, st_marks, pit]


def place(venue, cache):
    key = f'venue: {venue}'
    if key not in cache:
        addr = VENUES[venue][0]
        num = addr.split()[0]
        hit = next((r for r in geosearch(addr, size=3) if r['label'].startswith(num + ' ')), None)
        cache[key] = {k: hit[k] for k in ('lat', 'lng', 'label')} if hit else None
        time.sleep(0.2)
    return cache[key]


def main():
    day = datetime.strptime(sys.argv[1], '%Y-%m-%d').date() if len(sys.argv) > 1 else datetime.now(NYC).date()
    print(f'Fetching venue calendars for {day}...')
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    rows = []
    for read in READERS:
        try:
            got = read(day)
            print(f'  {read.__name__}: {len(got)}')
            rows += got
        except Exception as e:
            print(f'  could not read {read.__name__}: {e}', file=sys.stderr)
        time.sleep(1)
    events, unplaced, seen = [], [], set()
    for r in rows:
        key = (r['venue'], r['title'].lower(), r['start'])
        if key in seen:
            continue
        seen.add(key)
        pos = place(r['venue'], cache)
        if not pos:
            unplaced.append({'title': r['title'], 'venue': r['venue'], 'url': r['url']})
            continue
        slug = re.sub(r'[^a-z0-9]+', '-', r['venue'].lower()).strip('-')
        site = VENUES[r['venue']][1]
        events.append({
            'id': f"{slug}-{r['start'].strftime('%Y%m%d%H%M')}-{re.sub(r'[^a-z0-9]+', '-', r['title'].lower())[:40]}",
            'title': r['title'],
            'category': r['category'],
            'start': r['start'].isoformat(),
            'end': r['end'].isoformat() if r['end'] else None,
            'allDay': False,
            'venue': {'name': r['venue'], 'address': VENUES[r['venue']][0].split(',')[0], 'neighborhood': '',
                      'lat': round(pos['lat'], 6), 'lng': round(pos['lng'], 6)},
            'price': r['price'],
            'priceUnknown': r['price'] is None,
            'description': r['description'],
            'details': '',
            'url': r['url'],
            'tags': [],
            'publisher': {'id': f'venue-{slug}', 'name': r['venue'], 'url': site},
        })
    CACHE.write_text(json.dumps(cache, indent=1, sort_keys=True))
    OUT.write_text(json.dumps({
        'source': {'name': 'Venue calendars', 'url': 'https://filmforum.org/'},
        'date': day.isoformat(),
        'fetchedAt': datetime.now(NYC).isoformat(timespec='seconds'),
        'events': events,
        'unplaced': unplaced,
    }, indent=1, ensure_ascii=False))
    print(f'  {len(events)} placed, {len(unplaced)} without a location')
    print(f'  wrote {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
