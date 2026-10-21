# 8-Bit NYC

An interactive 8-bit (voxel, pixelated) map of New York City showing today's events as pins.
Built with [Astro](https://astro.build) and [three.js](https://threejs.org), deployed on Cloudflare.

Live site: https://8bitmap.design-coffee-repeat.workers.dev

## Run it locally

You need [Node.js](https://nodejs.org) 22 or newer and [VS Code](https://code.visualstudio.com).

```sh
git clone https://github.com/designcoffeerepeat/8bitmap.git
cd 8bitmap
code .            # open in VS Code; accept the recommended extensions when asked
npm install
npm run dev       # http://localhost:4321
```

In VS Code you can also press F5 (Run and Debug, "Development server") to start the dev server.

| Command           | What it does                                  |
| ----------------- | --------------------------------------------- |
| `npm run dev`     | Local dev server with hot reload              |
| `npm run build`   | Production build into `dist/`                 |
| `npm run preview` | Serve the `dist/` build locally to check it   |

## Deploying

Two branches:

- `dev`: every change lands here first. Cloudflare builds it as a preview (see the Workers Builds
  check on the commit in GitHub for its link) so it can be tested before going live.
- `main`: the live site. Changes are merged from `dev` only after they are approved.
  The scheduled events refresh also commits here.

### Cloudflare

Cloudflare is connected to this GitHub repo. Every push to `main` deploys the live site.
Cloudflare offers two setup screens and this repo works with either:

- Workers (the default "Create" flow): build command `npm run build`, deploy command `npx wrangler deploy`.
  `wrangler.jsonc` tells it to serve the `dist/` folder.
- Pages: framework preset Astro, build command `npm run build`, build output directory `dist`.

Node version comes from `.node-version` (22).

### Password and coming soon page

`worker/index.js` runs in front of the static build on both Workers. It reads three vars from `wrangler.jsonc`:
`SITE_PASSWORD` (the shared password: `8bit01` on live, overridden to `alpha8bit01` by the dev workflow), `SITE` (`live`, or `dev` from the dev workflow) and
`DEV_URL`. On live, visitors without the password see a coming soon page at `/` with a link to the dev site and a
link to `/login`; on dev every page asks for the password first. Logging in sets a cookie for 30 days, and
`/logout` clears it. To open the site to everyone later, remove `main` and the `vars` from `wrangler.jsonc`.
This is a shared password to keep the map private for now, not a real account system.
Keep `worker/index.js` itself when opening the site up: it also runs the contact form and the cookie consent check below.

### Contact form, legal pages and cookie consent

The menu in the title box opens Contact, Privacy Policy and Terms and Conditions as modals
(`src/scripts/site.js`; the texts are `src/components/PrivacyPolicy.astro` and `src/components/Terms.astro`).
Each can be linked to directly as `/#contact`, `/#privacy` or `/#terms`. The empty ad slot opens Contact
on Ad/Event Inquiry.

The form posts to `/api/contact` in `worker/index.js`, which sends it with the `MAIL` send_email binding
from website@8bit.nyc. Ad/Event Inquiry is for sales@8bit.nyc and the other topics for info@8bit.nyc; Cloudflare
only lets a Worker send to verified destination addresses, so the worker emails the inboxes behind those
addresses directly (`TOPICS` and `INBOXES`, kept in step with `email-worker/index.js`), with the address in the subject.

Visitors from the EU, EEA, UK and Switzerland (by Cloudflare's country) get `data-consent="required"` on the page,
which keeps Google Analytics off until they accept in the cookie banner. Their choice is the `8bm_consent` cookie,
and Cookie Settings in the menu lets them change it. Add `?consent=eu` to the URL to see the banner from anywhere.

### Sources shown on dev only

`src/scripts/events/live.js` lists sources (currently Resident Advisor and The Skint) that only dev shows. The
dev workflow builds with `PUBLIC_SITE=dev`; any other build is a live build, which leaves those sources out of the
map and drops their snapshot files (today's and tomorrow's) from `dist/`. Their fetchers keep running, so dev stays current.

## Layout

```
src/pages/index.astro             page shell and HUD markup
src/styles/global.css             all styles (arcade look, mobile bottom sheet)
src/scripts/app.js                UI: filters, Today list, event card, map controls
src/scripts/site.js               site menu, Contact / Privacy / Terms modals, ad slot, cookie banner
src/components/                   Privacy Policy and Terms texts
src/scripts/map/geo.js            NYC tile grid: parks, beaches, bridges, skyline peaks, lat/lng to tile
src/scripts/map/land.json         land tiles for all five boroughs and the land around them (tools/build_land.py)
src/scripts/map/renderer.js       three.js scene: voxel land and buildings, pins, labels, camera, picking
src/scripts/map/palette.js        colours for the city and for event categories
src/scripts/events/schema.js      the one event shape every source maps into
src/scripts/events/index.js       loads all sources, filters to today and the map area, de-duplicates, sorts
src/scripts/events/sources/       one file per event source: nycgov.js, donyc.js, ra.js, skint.js, luma.js, permits.js,
                                  ticketmaster.js, seatgeek.js, dice.js, artwrld.js, artrabbit.js,
                                  artguide.js (live), snapshot.js (shared reader),
                                  dummy.js (sample data, not loaded), template.js
public/data/*-events.json         one snapshot per source, written by the matching tools/fetch_*.py
public/data/tomorrow/*.json       the same snapshots for the next NYC day (EVENTS_DIR=public/data/tomorrow)
public/                           other static files copied as-is (favicon)
tools/fetch_nycgov.py             pulls one day of NYC.gov events and places them on the map
tools/fetch_donyc.py              pulls one day of doNYC listings and places each venue once
tools/fetch_ra.py                 pulls one night of Resident Advisor listings
tools/fetch_luma.py               pulls one day of Luma NYC events
tools/fetch_skint.py              pulls The Skint's picks for one day from its roundup posts
tools/fetch_permits.py            pulls one day of NYC permitted street events (street fairs, parades, greenmarkets)
tools/fetch_ticketmaster.py       pulls one day of Ticketmaster events (needs TICKETMASTER_API_KEY)
tools/fetch_seatgeek.py           pulls one day of SeatGeek events (needs SEATGEEK_CLIENT_ID)
tools/fetch_dice.py               pulls one day of DICE New York events
tools/fetch_artwrld.py            pulls the day's gallery openings, museum shows and art events from Artwrld
tools/fetch_artrabbit.py          pulls the day's New York opening receptions from ArtRabbit
tools/fetch_artguide.py           pulls the day's New York opening receptions from Artforum artguide
data/geocode-cache.json           address lookups the fetch scripts reuse
data/venues.json                  street addresses for venues The Skint names without one
```

## Refreshing the events

The map shows a snapshot of one day's events; clicking the date in the header switches to tomorrow's. A GitHub Action (`.github/workflows/refresh-events.yml`) runs every `tools/fetch_*.py`, once for today and once for tomorrow, and
refreshes them every morning and midday New York time and pushes the new snapshot, which redeploys the site.
You can also run it from the repo's Actions tab (Run workflow), or by hand with Python 3, then commit and push:

```sh
python3 tools/fetch_nycgov.py             # today in NYC
python3 tools/fetch_donyc.py
python3 tools/fetch_ra.py
python3 tools/fetch_skint.py
python3 tools/fetch_luma.py
python3 tools/fetch_permits.py
TICKETMASTER_API_KEY=... python3 tools/fetch_ticketmaster.py
SEATGEEK_CLIENT_ID=... python3 tools/fetch_seatgeek.py
python3 tools/fetch_dice.py
python3 tools/fetch_artwrld.py
python3 tools/fetch_artrabbit.py
python3 tools/fetch_artguide.py
python3 tools/fetch_nycgov.py 2026-10-17  # or a given day (each script takes one)
EVENTS_DIR=public/data/tomorrow python3 tools/fetch_nycgov.py 2026-10-18  # tomorrow's snapshot, as the Action writes it
```

Run them all for the same day: each source only shows events on the day its own snapshot covers.

### NYC.gov

It reads the same Events Calendar API that https://www.nyc.gov/main/events/ uses, places NYC Parks events with the
Parks Department's coordinates and everything else with NYC City Planning GeoSearch, and skips canceled events.
Events with no usable address are listed under `unplaced` in the snapshot. The Parks feed refuses GitHub's servers,
so every run that reaches it records each Parks venue in `data/parks-places.json`, which the scheduled refresh uses instead. The page header shows the day the
snapshot covers, so an old snapshot shows that day's events rather than an empty map.

### doNYC

`fetch_donyc.py` reads doNYC's day pages (https://donyc.com/events/2026/10/17). Listings have no coordinates, so
the script reads each venue's street address once from one of its event pages and places it with GeoSearch, or by
name for parks and landmarks. Venues are remembered in `data/geocode-cache.json`, so the first run takes a few
minutes and later runs only look up new venues. The day pages do not show prices.

### Resident Advisor

`fetch_ra.py` reads the GraphQL endpoint behind https://ra.co/events/us/newyork. Most venues come with exact
coordinates; ones with none or only a rough position are placed from their address with GeoSearch.
A party that starts after midnight stays on the night RA lists it for.

### Luma

`fetch_luma.py` reads the discover API behind https://luma.com/nyc. Events come with coordinates. Hosts can keep an
address for registered guests only, and Luma then gives a shifted position, so those events are left off the map.

### The Skint

`fetch_skint.py` reads The Skint's daily and weekend roundup posts through the site's WordPress API and picks out
the listings for the day. The Skint names venues rather than addresses ("caveat (les)"), so a listing is placed from
a street address or block in its text, from `data/venues.json`, or from a GeoSearch place with the same name (parks,
landmarks). Everything else is listed under `unplaced`. Adding a venue's address to `data/venues.json` places it
from then on. The text is free-form, so check the output now and then: prices and times are best guesses.

### NYC Street Events

`fetch_permits.py` reads the city's permitted event list on NYC Open Data (https://data.cityofnewyork.us/d/tvpp-9vvx).
It keeps street fairs, parades, plaza and Open Streets events, greenmarkets and sidewalk sales, plus Parks
permits whose names sound public (festivals, markets, 5Ks, movie nights), and skips sports bookings, film shoots,
block parties and private parties. A closed block is placed at one of its corners with GeoSearch, a park or plaza by
name; a name GeoSearch puts in several places is left unplaced. Permit times include setup, so some start early.

### Ticketmaster

`fetch_ticketmaster.py` reads the Discovery API (https://developer.ticketmaster.com) for events within 12 miles of
Manhattan. It needs a free key (the Consumer Key under My Apps) in `TICKETMASTER_API_KEY`; the scheduled refresh
reads it from a repository secret of that name. Without a key it skips the run and leaves the snapshot alone, and
the map shows no Ticketmaster events until the first run that has one.

### SeatGeek

`fetch_seatgeek.py` reads the SeatGeek Platform API (https://platform.seatgeek.com) for events within 12 miles of
Manhattan. It needs a free client id in `SEATGEEK_CLIENT_ID`, which the scheduled refresh reads from a repository
secret of that name. Without one it skips the run, like Ticketmaster.

### DICE

`fetch_dice.py` reads DICE's New York browse page and the first page of each category (gigs, DJ, party, comedy and
so on). Those pages list events in date order but cannot be paged further from outside the app, so a very busy
category may be cut short. Venues are placed from their street address with GeoSearch and cached.

### Categories

Each fetcher maps its source's own labels into the map's categories (`CATEGORIES` in `src/scripts/events/schema.js`).
Theater covers plays, musicals, opera and dance; art covers museums, galleries, exhibits and openings. When a
listing has no usable label, `venue_category()` in `tools/fetch_nycgov.py` decides from the venue name: a museum or
gallery is art, a theater or playhouse is theater, a cinema is film.

### Artwrld

`fetch_artwrld.py` reads three of Artwrld's New York pages, and everything it keeps is art:
the openings page (https://www.artwrld.com/city/new-york/openings) for gallery and museum exhibitions that open on
the day, with the reception time from the listing or the exhibition's own page (no time means all day); the
exhibitions page for museum shows on view that day, shown all day (gallery shows are left out, there are hundreds);
and the events page for talks and performances on the day. Museums are matched by name (`MUSEUM` in the script) and
placed once from one of their exhibition pages, then remembered in `data/geocode-cache.json`. Only the title, venue,
dates and a link are kept. Openings and events are only listed ahead of time, so a past day comes back mostly empty.

### ArtRabbit

`fetch_artrabbit.py` pages through ArtRabbit's New York lists of shows on now
(https://www.artrabbit.com/all-listings/united-states/new-york) and opening soon (`.../upcoming`) and keeps the
shows whose opening reception falls on the day, as art. Each card carries the venue's coordinates and a line such
as "Opening: Tomorrow, 18:00" or "Opening: 24 Oct 2026, 5-7pm". ArtRabbit's "Today" and "Tomorrow" follow London
time, so the script reads them against the London date. Only the title, venue, reception time and a link are kept.

### Artforum artguide

`fetch_artguide.py` reads Artforum artguide's public listings API
(https://artguide.artforum.com/wp-json/wp/v2/ag-exhibition-event, about 25 pages of 100 worldwide) and keeps the
New York listings whose opening reception is on the day, as art, with the venue's coordinates, neighborhood and
reception hours from the listing. Some openings also appear on Artwrld or ArtRabbit under a slightly different
title, so the same reception can show up twice.

## Adding a real event source

1. Copy `src/scripts/events/sources/template.js` to a new file and fill in `fetchEvents({ date, bounds })`.
   Return raw records with at least `title`, `start` (ISO time) and `venue.lat` / `venue.lng`.
2. Add the import to `SOURCES` in `src/scripts/events/index.js`.

Most listing sites block browser requests, so real sources should call a small backend that returns JSON.
On Cloudflare Pages that can be a Pages Function in a `functions/` folder at the repo root.
Each source shows up in the SOURCES dropdown on its own. A source can also set `publisher` on a record
(as `nycgov.js` does for NYC Parks listings) to list it under a different name.
Events outside the map bounds or not on the requested day are dropped automatically,
and the same show listed on several sites is merged by title, venue and start time.

## Tuning the map

- Shorelines and the map's edges come from `tools/build_land.py`, which turns the city's borough boundaries
  and the census county shapes around them into `src/scripts/map/land.json`. The map covers all five boroughs;
  change `BOUNDS` there and rerun it (`python3 tools/build_land.py`) to move the edges.
- Parks, airports, beaches and small islands are `[lat, lng]` polygons at the top of `geo.js`.
- Skyline heights come from `PEAKS` in `geo.js` (centre, spread, height).
- Tile size is `CELL` in `tools/build_land.py`; pixel chunkiness is the PX button (2x by default, then 3x, 4x).
