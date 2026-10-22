# Parked sources

doNYC, Resident Advisor and The Skint were taken off the map on 2026-10-21 (MK's call), because none of them has
agreed to be listed. Their code is kept here so any of them can come back if they say yes.

Only bring one back when MK asks for that source by name. A general "release" of dev to live never restores them.

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

Queens Public Library was parked on 2026-10-22 before it ever reached live. Its robots.txt allows the calendar,
but its terms (Library Policies, Copyright & Disclaimer) allow personal, non-commercial use only and forbid
republishing, so it needs the library's permission first. To bring it back, follow the steps above with
`fetch_qpl.py` and `qpl.js`; it has no entries in the page or legal source lists.

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


### Queens Public Library

`fetch_qpl.py` reads the library calendar (https://www.queenslibrary.org/calendar) one branch and one day at a time
for the branches in `BRANCHES` (the Flushing area: Flushing, East Flushing, McGoldrick, Mitchell-Linden, Queensboro
Hill, Pomonok). The calendar filters by each branch's location code (`sm_pSsnVirtua`), not its name; the codes for
other branches are in the calendar page's `facetsInfoCal`. A desktop browser's user agent gets an empty page, so the
script names itself. It keeps in-person programs (skipping online, staff-only and cancelled ones) and only the
title, time, branch, program type and a link back.

## Parked on 2026-10-22 after the source audit

ArtRabbit, Artforum artguide, SmallsLIVE (Smalls, Mezzrow, Jazzcultural) and Other Half Brewing came off for their
terms, found in the source legality audit (MK's call):

- **Other Half Brewing:** its Terms of Service allow viewing the site for personal, non-commercial use only and forbid
  using "bots, scripts, or automated tools to access the Site".
- **SmallsLIVE:** its terms license the site "for personal non-commercial purposes only".
- **ArtRabbit:** its terms forbid "reproducing, copying ... any of the Website, including ... any information".
- **Artforum artguide:** its terms are Penske Media's (pmc.com), which could not be read from the build; parked until
  someone reads them in a browser.

ArtRabbit and artguide follow the steps above (`fetch_artrabbit.py`/`artrabbit.js`, `fetch_artguide.py`/`artguide.js`;
their names go back in the page and legal source lists, and their README sections are in git history). SmallsLIVE and
Other Half were readers inside `tools/fetch_venues.py`; they are kept in `parked/tools/venues_smalls_otherhalf.py`, with
the lines to paste back. Before bringing any of them back, get the site's written permission.

DICE was parked the same day (MK's call). It has no public API (only a partner API), its terms could not be read
from the build, and almost none of its venues publish their own calendar: they embed DICE's widget, so reading them
would still be reading DICE's data. Public Records was the one venue with its own calendar and is now in
`tools/fetch_venues.py`. MK is emailing DICE (draft in the project's research/emails/email-dice.txt). To bring DICE
back, follow the steps above with `fetch_dice.py` and `dice.js`; its README section is in git history.
