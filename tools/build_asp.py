"""Write src/scripts/asp.json: the days alternate side parking (street cleaning) rules are suspended.

Source: NYC DOT's yearly suspension calendar (https://www.nyc.gov/html/dot/html/motorist/alternate-side-parking.shtml),
published as an iCalendar file per year. Each event is one suspended day with the reason in its description,
e.g. "Alternate Side Parking suspended for All Saints' Day. Parking meters will be in effect."
Emergency suspensions (snow, storms) are announced on the day and are not in the calendar.

Usage:  python3 tools/build_asp.py            (this year and next, when DOT has published it)
"""
import datetime
import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'src' / 'scripts' / 'asp.json'
ICS = 'https://www.nyc.gov/html/dot/downloads/misc/{year}-alternate-side.ics'


def fetch(year):
    req = urllib.request.Request(ICS.format(year=year), headers={'User-Agent': '8bit.nyc'})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.read().decode('utf-8', 'replace')
    except Exception as e:
        print(f'{year}: {e}')
        return None


def days(text):
    text = re.sub(r'\r?\n[ \t]', '', text)  # unfold long lines
    out = {}
    for ev in re.findall(r'BEGIN:VEVENT(.*?)END:VEVENT', text, re.S):
        start = re.search(r'^DTSTART[^:]*:(\d{8})', ev, re.M)
        desc = re.search(r'^DESCRIPTION[^:]*:(.*)$', ev, re.M)
        if not start:
            continue
        d = start.group(1)
        note = desc.group(1).replace('\\,', ',').replace('\\n', ' ').strip() if desc else ''
        reason = re.search(r'suspended for (.+?)\.(?:\s+Parking|\s*$)', note, re.I)
        out[f'{d[:4]}-{d[4:6]}-{d[6:]}'] = {
            'reason': reason.group(1).strip() if reason else 'Holiday',
            'meters': 'meters will be in effect' in note.lower(),
        }
    return out


def main():
    year = datetime.date.today().year
    result = {}
    for y in (year, year + 1):
        text = fetch(y)
        if text:
            got = days(text)
            print(f'{y}: {len(got)} days')
            result.update(got)
    if not result:
        raise SystemExit('no calendar found')
    OUT.write_text(json.dumps(dict(sorted(result.items())), indent=1) + '\n')
    print(f'wrote {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
