"""Readers taken out of tools/fetch_venues.py on 2026-10-22 (parked, see parked/README.md).

Not runnable on its own: to bring one back, paste the function into tools/fetch_venues.py, add it to READERS,
and put its venues back in VENUES:

    'Smalls': ('183 West 10th Street, Manhattan', 'https://www.smallslive.com/'),
    'Mezzrow': ('163 West 10th Street, Manhattan', 'https://www.smallslive.com/'),
    'Jazzcultural': ('349 West 46th Street, Manhattan', 'https://www.smallslive.com/'),
    'Other Half Centre Street': ('195 Centre Street, Brooklyn', 'https://otherhalfbrewing.com/location/centre-street/'),
    'Other Half Domino Park': ('34 River Street, Brooklyn', 'https://otherhalfbrewing.com/location/domino-park/'),
    'Other Half Rockefeller Center': ('600 5th Avenue, Manhattan', 'https://otherhalfbrewing.com/location/rockefeller-center/'),
"""


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


def other_half(day):
    body = get('https://otherhalfbrewing.com/events', as_json=False)
    out = []
    label = f"{day.strftime('%b')} {day.day}"
    for href, cls, inner in re.findall(r'<a href="(https://otherhalfbrewing.com/event/[^"]+)" class="excerpt-box ([^"]*)">(.*?)</a>', body, re.S):
        if 'event_type-nyc' not in cls:
            continue
        when = re.search(r"excerpt-box-date'>(.*?) / <span class='excerpt-box-location[^']*'>(.*?)</span>", inner, re.S)
        title = re.search(r'excerpt-box-title[^>]*>(.*?)</h2>', inner, re.S)
        venue = f'Other Half {text(when.group(2))}' if when else ''
        # Only single-day listings on the day ('Oct 21'); ranges are happy hours, not events.
        if not (when and title) or text(when.group(1)) != label or venue not in VENUES:
            continue
        time.sleep(0.5)
        page = text(get(href, as_json=False))
        # The event page says 'October 21 2026 7:00 pm - 8:00 pm'.
        m = re.search(rf"{day.strftime('%B')} {day.day} {day.year} (\d{{1,2}}:\d{{2}} [ap]m)(?: - (\d{{1,2}}:\d{{2}} [ap]m))?", page)
        if not m:
            continue
        start = at(day, *clock(m.group(1)))
        end = at(day, *clock(m.group(2))) if m.group(2) else None
        title = text(title.group(1))
        out.append(event(venue, title, start, href, 'trivia' if 'trivia' in title.lower() else 'food',
                         end=end if end and end > start else None))
    return out
