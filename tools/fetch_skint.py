#!/usr/bin/env python3
"""Snapshot one day of The Skint's picks into public/data/skint-events.json.

The Skint (https://theskint.com/) posts its listings as daily and weekend
roundups on a WordPress site, so this reads the site's public WordPress API
and picks out the events in the roundups that cover the day. Each listing is a
line like:

  sat 10am-2pm: <b>brownstone boys stoop sale</b>: 375 vanderbilt ave (clinton hill). >>

Listings name a venue and neighbourhood rather than an address, so each one is
placed by, in order: a street address in the text, the venue table in
data/venues.json, or a NYC GeoSearch place whose name matches the venue.
Anything else is kept under "unplaced" rather than guessed.

Usage:  python3 tools/fetch_skint.py [YYYY-MM-DD]     (default: today in NYC)
"""

import html
import json
import re
import sys
import urllib.parse
from datetime import date, datetime, timedelta
from pathlib import Path

from fetch_nycgov import CACHE, DATA, NYC, geocode, geosearch, get, intersection

ROOT = Path(__file__).resolve().parent.parent
OUT = DATA / 'skint-events.json'
VENUES = ROOT / 'data' / 'venues.json'
API = 'https://theskint.com/wp-json/wp/v2/posts'
SITE = 'https://theskint.com/'

DAYS = {'mon': 0, 'tue': 1, 'tues': 1, 'wed': 2, 'weds': 2, 'thu': 3, 'thur': 3, 'thurs': 3, 'fri': 4, 'sat': 5, 'sun': 6}

# Neighbourhood names The Skint uses, by borough. Unknown names leave the event unplaced.
HOODS = {
    'Manhattan': """alphabet city, battery park, battery park city, central park, chelsea, chinatown, civic center,
        east harlem, east village, financial district, fidi, flatiron, gramercy, greenwich village, harlem,
        hell's kitchen, hells kitchen, hudson yards, inwood, kips bay, koreatown, les, lower east side, meatpacking,
        meatpacking district, midtown, midtown east, midtown west, morningside heights, murray hill, noho, nolita,
        roosevelt island, soho, times square, tribeca, two bridges, union square, upper east side, upper west side,
        ues, uws, washington heights, west village, yorkville, little italy, nomad, hamilton heights, sugar hill,
        lincoln square, lincoln center, theater district, garment district, manhattan""",
    'Brooklyn': """bay ridge, bed-stuy, bedford-stuyvesant, bensonhurst, boerum hill, brighton beach, brooklyn heights,
        brownsville, bushwick, carroll gardens, clinton hill, cobble hill, coney island, crown heights, ditmas park,
        downtown brooklyn, dumbo, east flatbush, east williamsburg, flatbush, fort greene, gowanus, gravesend,
        greenpoint, industry city, kensington, midwood, park slope, prospect heights, prospect lefferts gardens,
        prospect park, red hook, sheepshead bay, south slope, sunset park, vinegar hill, williamsburg,
        windsor terrace, brooklyn navy yard, navy yard, columbia waterfront, marine park, brooklyn""",
    'Queens': """astoria, flushing, forest hills, jackson heights, long island city, lic, ridgewood, rockaway, rockaways,
        sunnyside, woodside, elmhurst, corona, jamaica, bayside, maspeth, glendale, kew gardens, richmond hill,
        ditmars, flushing meadows, queens""",
    'Bronx': """mott haven, south bronx, fordham, belmont, riverdale, arthur avenue, pelham bay, hunts point,
        concourse, port morris, kingsbridge, bronx, the bronx""",
    'Staten Island': """st. george, st george, staten island, stapleton, tompkinsville, snug harbor""",
}
BOROUGH_OF = {n.strip(): boro for boro, names in HOODS.items() for n in names.split(',')}


def borough_for(hood):
    """The borough a neighbourhood name belongs to ('bushwick / bed-stuy' counts), or '' when it is not known."""
    h = ' '.join(hood.lower().replace('’', "'").split())
    for part in re.split(r'\s*/\s*|\s*,\s*', h):
        if part in BOROUGH_OF:
            return BOROUGH_OF[part]
    return ''


# ---- reading the roundups ---------------------------------------------------

def strip(s):
    s = re.sub(r'<[^>]+>', ' ', s or '')
    return re.sub(r'\s+', ' ', html.unescape(s).replace('’', "'").replace('‘', "'")).strip()


def post_range(title, posted):
    """The days a roundup covers, from titles like 'FRI-MON, 10/16-19' or 'WEDS, 10/14: ...'."""
    m = re.search(r'(\d{1,2})/(\d{1,2})(?:\s*-\s*(?:(\d{1,2})/)?(\d{1,2}))?', title)
    if not m:
        return None
    y = posted.year
    start = date(y, int(m.group(1)), int(m.group(2)))
    if start < posted - timedelta(days=60):
        start = date(y + 1, start.month, start.day)
    if m.group(4):
        end = date(start.year, int(m.group(3) or m.group(1)), int(m.group(4)))
        if end < start:
            end = date(start.year + 1, end.month, end.day)
    else:
        end = start
    return start, end


def roundups(day):
    posts = get(f'{API}?per_page=20&_fields=id,date,link,title,content')
    for p in posts:
        title = strip(p['title']['rendered'])
        if 'SPONSORED' in title.upper():
            continue
        rng = post_range(title, datetime.fromisoformat(p['date']).date())
        if rng and rng[0] <= day <= rng[1]:
            yield p, rng


def resolve_day(token, rng):
    """A weekday name or m/d date inside a roundup's range to a date."""
    m = re.fullmatch(r'(\d{1,2})/(\d{1,2})', token)
    if m:
        d = date(rng[0].year, int(m.group(1)), int(m.group(2)))
        return d if d >= rng[0] - timedelta(days=7) else date(d.year + 1, d.month, d.day)
    wd = DAYS.get(token)
    if wd is None:
        return None
    d = rng[0]
    while d.weekday() != wd:
        d += timedelta(days=1)
    return d


def covers(days_text, rng, day):
    """Whether a prefix like 'fri thru sun', 'sat + sun', 'tues thru 10/30' or 'daily' includes day."""
    t = days_text.lower()
    if re.search(r'\bdaily\b|\bevery day\b', t):
        return rng[0] <= day <= rng[1]
    tokens = re.findall(r'\d{1,2}/\d{1,2}|[a-z]+', t)
    hits, i = False, 0
    while i < len(tokens):
        d = resolve_day(tokens[i], rng)
        if d and i + 2 < len(tokens) and tokens[i + 1] == 'thru':
            end = resolve_day(tokens[i + 2], (d, d))
            if end and d <= day <= end:
                hits = True
            i += 3
            continue
        if d == day:
            hits = True
        i += 1
    return hits


TIME = r'(\d{1,2})(?::(\d\d))?\s*(am|pm)?'


def parse_time(prefix, day):
    """First time in the prefix, preferring one given for this weekday ('sat 12-6pm, sun 10:30am-5pm')."""
    low = prefix.lower().replace('noon', '12pm')
    names = [k for k, v in DAYS.items() if v == day.weekday()]
    m = None
    for n in names:
        m = re.search(rf'\b{n}\b\s+{TIME}(?:\s*-\s*{TIME})?', low)
        if m and (m.group(3) or m.group(6)):
            break
        m = None
    if not m:
        m = re.search(rf'\b{TIME}(?:\s*-\s*{TIME})?', low)
        while m and not (m.group(3) or m.group(6)):
            m = re.search(rf'\b{TIME}(?:\s*-\s*{TIME})?', low[m.end():]) and None
    if not m or not (m.group(3) or m.group(6)):
        return None, None

    def clock(h, mi, ap):
        h = int(h) % 12 + (12 if ap == 'pm' else 0)
        return h, int(mi or 0)

    h1, m1, ap1, h2, m2, ap2 = m.groups()
    if h2:
        ap2 = ap2 or ap1
        ap1 = ap1 or ('am' if ap2 == 'pm' and int(h1) % 12 > int(h2) % 12 else ap2)
    start = clock(h1, m1, ap1)
    end = clock(h2, m2, ap2) if h2 else None
    return start, end


def category(text):
    t = text.lower()
    rules = [
        ('film', r'movie|film|screening|cinema'),
        ('comedy', r'comedy|comedian|stand-?up|improv|storytell'),
        ('music', r'concert|music(?!al)|jazz|orchestra|band\b|dj\b|symphony|quartet|choir'),
        ('theater', r'theatre|theater|broadway|play\b|musical\b|opera\b|ballet|shakespeare'),
        ('food', r'food|bake sale|tasting|market\b|smorgasburg|wine|beer'),
        ('art', r'art\b|arts\b|gallery|exhibit|museum|open studios|opening reception|reading'),
        ('nightlife', r'party|dance|karaoke'),
        ('sports', r'race\b|run\b|basketball|soccer|shuffleboard'),
    ]
    for cat, rx in rules:
        if re.search(rx, t):
            return cat
    return 'community'


def price(text, free_default):
    # Promo savings are not prices ('save $10 with promo code ...').
    t = re.sub(r'save \$\d+(?:\.\d+)?|\$\d+(?:\.\d+)? off', '', text.lower())
    if re.search(r'free admission|\bfree\b(?! drink| popcorn| pizza| snacks)', t) and '$' not in t.split('free')[0][-40:]:
        if not re.search(r'\$\d', t):
            return None, False
    nums = [float(n) for n in re.findall(r'\$(\d+(?:\.\d+)?)', t)]
    if nums:
        lo, hi = min(nums), max(nums)
        fmt = lambda x: int(x) if x.is_integer() else x
        return {'min': fmt(lo), 'max': fmt(hi), 'currency': 'USD'}, False
    if free_default:
        return None, False
    return None, True


# ---- placing listings -------------------------------------------------------

def venue_options(rest):
    """(venue text, neighbourhood, borough) guesses for a listing, best first:
    'venue (neighbourhood)' with a known neighbourhood (last one first), then
    'venue, brooklyn', then 'at venue' / 'at 362 grand street in williamsburg'."""
    out = []
    for m in reversed(list(re.finditer(r'([^():;]+?)\s*\(([^()]+)\)', rest))):
        boro = borough_for(m.group(2))
        if boro:
            out.append((m.group(1).strip(), m.group(2).strip(), boro))
    for m in re.finditer(r'([^:;.]+?),\s*(brooklyn|queens|manhattan|the bronx|bronx|staten island)\b', rest, re.I):
        out.append((m.group(1).strip(), m.group(2), borough_for(m.group(2))))
    for m in re.finditer(r"\bat ([^.,;:()]+?)(?: in ([a-z' -]+?))?(?=[.,;:]|$)", rest):
        out.append((m.group(1).strip(), m.group(2) or '', borough_for(m.group(2) or '')))
    return out


def candidates(text):
    """Venue name guesses, longest first: the clause before '(neighbourhood)' cut after 'at', 'to', 'of', 'in'."""
    t = re.split(r'(?<!st)(?<!mt)\.\s|:\s', text)[-1].strip(' ,.')
    t = t.split(', ')[-1]
    out = [t]
    for sep in (' at ', ' to ', ' of ', ' in ', ' by '):
        if sep in f' {t} ':
            out.append(f' {t} '.rsplit(sep, 1)[-1].strip())
    # 'washington square park's garibaldi plaza' -> 'washington square park'
    out += [c.split("'s ", 1)[0] for c in out if "'s " in c]
    out = [re.sub(r"^(the back room of|a)\s+", '', c) for c in out]
    seen = []
    for c in out:
        c = c.strip(" ,.'")
        if c and c not in seen:
            seen.append(c)
    return seen


def norm(s):
    return re.sub(r'[^a-z0-9]+', ' ', s.lower().replace("'", '')).strip()


def place(name, boro, venues, cache):
    """Coordinates for a venue guess, or None."""
    # A street address, or a block ('w 54th street between 9th + 10th aves').
    street = r'(?:st|street|ave|avenue|aves|pl|place|rd|road|blvd|ln|dr|pkwy|way|sq|broadway)\b'
    corner = re.match(rf'^([a-z0-9 .]+? {street}|broadway)\s*(?:\+|&|and|at)\s*([a-z0-9 .]+? {street}|broadway)', name)
    if corner and boro and not re.match(r'\d+ ', name):
        # 'smith st + union st', 'madison ave + e 23rd st to broadway + 17th st'
        ck = f'corner: {corner.group(1)} & {corner.group(2)} | {boro}'
        if ck not in cache:
            try:
                best = intersection(corner.group(1), corner.group(2), boro)
            except Exception as e:
                print(f'  GeoSearch failed for "{name}": {e}', file=sys.stderr)
                return None
            cache[ck] = best[1] if best and best[0] < 120 else None
        if cache[ck]:
            return cache[ck]
    if (re.match(r'\d', name) or ' between ' in name) and boro:
        addr = re.sub(r'\baves\b', 'ave', re.sub(r'\s*\+\s*', ' and ', name))
        addr = re.sub(r'^(\d+[a-z]?(?:-\d+)? [^,]+?(?: (?:st|street|ave|avenue|pl|place|rd|road|blvd|ln|dr|pkwy|way|sq)\b\.?)).*$', r'\1', addr)
        hit = geocode(addr, boro, cache)
        if hit:
            return hit
    key = name.lower()
    for k in (key, re.sub(r'^the ', '', key)):
        if k in venues:
            addr, b = [x.strip() for x in venues[k].split('|')]
            return geocode(addr, b, cache)
    # A park or landmark GeoSearch knows by name.
    ck = f'place: {name} | {boro}'
    if ck in cache:
        return cache[ck]
    hit = None
    if len(norm(name)) >= 6:
        try:
            for r in geosearch(f'{name}, {boro}'.strip(' ,'), size=5):
                label = norm(r['label'].split(',')[0])
                if label in (norm(name), norm(re.sub(r'^the ', '', name))) and boro.lower() in r['label'].lower().replace('new york, ny', 'manhattan'):
                    hit = {k: r[k] for k in ('lat', 'lng', 'label')}
                    break
        except Exception as e:
            print(f'  GeoSearch failed for "{name}": {e}', file=sys.stderr)
            return None
    cache[ck] = hit
    return hit


# ---- main ---------------------------------------------------------------------

def listings(post, rng, day):
    content = post['content']['rendered']
    free_default = False
    for para in re.findall(r'<p[^>]*>(.*?)</p>', content, re.S):
        text = strip(para)
        if not text:
            continue
        b = re.search(r'<b>(.*?)</b>', para, re.S)
        if not b:
            continue
        prefix = strip(para[:b.start()])
        title = strip(b.group(1))
        if not prefix:
            # Section header such as 'cultural fests ... (free admission, unless noted otherwise):'
            free_default = 'free admission, unless noted' in text.lower()
            if re.fullmatch(r'(monday|tuesday|wednesday|thursday|friday|saturday|sunday|ongoing)', text.lower()):
                free_default = False
            continue
        prefix = re.sub(r'^[^a-z0-9]*(sponsored\s*:\s*)?', '', prefix.lower()).strip()
        if not re.match(r'(mon|tue|wed|thu|fri|sat|sun|daily|\d{1,2}/\d{1,2})', prefix):
            continue
        days_text = re.split(r'\(|\d{1,2}(?::\d\d)?\s*(?:am|pm)|\d{1,2}\s*-\s*\d', prefix)[0]
        if not covers(days_text, rng, day):
            continue
        # Each listing ends with a '>>' link to the event's own page.
        rest_html, link = para[b.end():], None
        for m in re.finditer(r'<a [^>]*href="([^"]+)"[^>]*>(.*?)</a>', rest_html, re.S):
            if strip(m.group(2)) == '>>':
                link, rest_html = html.unescape(m.group(1)), rest_html[:m.start()]
                break
        rest = strip(rest_html).lstrip(': ')
        start, end = parse_time(prefix, day)
        yield {
            'title': title,
            'prefix': prefix,
            'rest': re.sub(r'\s*>>\s*$', '', rest),
            'start': start,
            'end': end,
            'link': link or post['link'],
            'free_default': free_default,
        }


def titled(s):
    return ' '.join(w[:1].upper() + w[1:] for w in s.split(' ')) if s.islower() else s


def iso(day, hm):
    return datetime(day.year, day.month, day.day, hm[0], hm[1], tzinfo=NYC).isoformat()


def main():
    day = datetime.strptime(sys.argv[1], '%Y-%m-%d').date() if len(sys.argv) > 1 else datetime.now(NYC).date()
    print(f'Fetching The Skint picks for {day}...')
    venues = {k: v for k, v in json.loads(VENUES.read_text()).items() if not k.startswith('_')}
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    events, unplaced, seen = [], [], set()
    for post, rng in roundups(day):
        for li in listings(post, rng, day):
            if li['title'] in seen:
                continue
            seen.add(li['title'])
            pos, vname, hood = None, '', ''
            for text, h, boro in venue_options(li['rest']):
                for c in candidates(text):
                    pos = place(c, boro, venues, cache)
                    if pos:
                        vname, hood = c, h
                        break
                if pos:
                    break
            if not pos:
                unplaced.append({'title': li['title'], 'where': li['rest'][:160], 'url': li['link']})
                continue
            p, unknown = price(li['rest'], li['free_default'])
            desc = li['rest']
            events.append({
                'id': re.sub(r'[^a-z0-9]+', '-', li['title'].lower()).strip('-')[:60] + f'-{day:%m%d}',
                'title': titled(li['title']),
                'category': category(f"{li['title']} {desc}"),
                'start': iso(day, li['start'] or (0, 0)),
                'end': iso(day, li['end']) if li['end'] and li['start'] and li['end'] > li['start'] else None,
                'allDay': li['start'] is None,
                'venue': {'name': titled(vname), 'address': pos.get('label', ''),
                          'neighborhood': hood.upper() if len(hood) <= 3 else titled(hood), 'lat': round(pos['lat'], 6), 'lng': round(pos['lng'], 6)},
                'price': p,
                'priceUnknown': unknown,
                'description': desc[:220] + ('...' if len(desc) > 220 else ''),
                'details': f"{li['prefix']}: {desc}",
                'url': li['link'],
                'tags': [],
            })

    CACHE.write_text(json.dumps(cache, indent=1, sort_keys=True))
    OUT.write_text(json.dumps({
        'source': {'name': 'The Skint', 'url': SITE},
        'date': day.isoformat(),
        'fetchedAt': datetime.now(NYC).isoformat(timespec='seconds'),
        'events': events,
        'unplaced': unplaced,
    }, indent=1, ensure_ascii=False))
    print(f'  {len(events)} placed, {len(unplaced)} without a mappable venue')
    print(f'  wrote {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
