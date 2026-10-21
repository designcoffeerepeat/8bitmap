# Parked sources

doNYC, Resident Advisor and The Skint were taken off the map on 2026-10-21 (MK's call), because none of them has
agreed to be listed. Their code is kept here so any of them can come back if they say yes.

Nothing here runs: the refresh only runs `tools/fetch_*.py`, and the map only loads sources listed in
`src/scripts/events/index.js`.

To bring one back:

1. Move its fetcher back: `git mv parked/tools/fetch_donyc.py tools/` (the scripts import `fetch_nycgov` from `tools/`).
   For The Skint, also `git mv parked/data/venues.json data/`.
2. Move its source back: `git mv parked/sources/donyc.js src/scripts/events/sources/`.
3. Import it in `src/scripts/events/index.js` and add it to `ALL_SOURCES`. To show it on dev only at first, add its id
   (`donyc`, `ra` or `skint`) to `LIVE_HIDDEN` in `src/scripts/events/live.js`.
4. Add its name back to the source lists in `src/pages/index.astro`, `src/components/Terms.astro` and
   `src/components/PrivacyPolicy.astro`, and its section back to the main README.
5. Run the fetcher once (or the Refresh events workflow) so its snapshot exists.

## How each one worked

### doNYC

`fetch_donyc.py` reads doNYC's day pages (https://donyc.com/events/2026/10/17). Listings have no coordinates, so
the script reads each venue's street address once from one of its event pages and places it with GeoSearch, or by
name for parks and landmarks. Venues are remembered in `data/geocode-cache.json`, so the first run takes a few
minutes and later runs only look up new venues. The day pages do not show prices.

### Resident Advisor

`fetch_ra.py` reads the GraphQL endpoint behind https://ra.co/events/us/newyork. Most venues come with exact
coordinates; ones with none or only a rough position are placed from their address with GeoSearch.
A party that starts after midnight stays on the night RA lists it for.

### The Skint

`fetch_skint.py` reads The Skint's daily and weekend roundup posts through the site's WordPress API and picks out
the listings for the day. The Skint names venues rather than addresses ("caveat (les)"), so a listing is placed from
a street address or block in its text, from `data/venues.json`, or from a GeoSearch place with the same name (parks,
landmarks). Everything else is listed under `unplaced`. Adding a venue's address to `data/venues.json` places it
from then on. The text is free-form, so check the output now and then: prices and times are best guesses.

