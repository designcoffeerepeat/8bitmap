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

`src/scripts/events/live.js` lists sources (currently none) that only dev shows. The
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
src/scripts/events/sources/       one file per event source: nycgov.js, luma.js, permits.js,
                                  ticketmaster.js, seatgeek.js, dice.js, artwrld.js, artrabbit.js,
                                  artguide.js (live), venues.js, greenmarkets.js, nps.js, astoria.js, redhook.js,
                                  snapshot.js (shared reader),
                                  dummy.js (sample data, not loaded), template.js
public/data/*-events.json         one snapshot per source, written by the matching tools/fetch_*.py
public/data/tomorrow/*.json       the same snapshots for the next NYC day (EVENTS_DIR=public/data/tomorrow)
parked/                           doNYC, Resident Advisor, The Skint and Queens Public Library, removed until they agree to be listed
public/                           other static files copied as-is (favicon)
tools/fetch_nycgov.py             pulls one day of NYC.gov events and places them on the map
tools/fetch_luma.py               pulls one day of Luma NYC events
tools/fetch_permits.py            pulls one day of NYC permitted street events (street fairs, parades, greenmarkets)
tools/fetch_ticketmaster.py       pulls one day of Ticketmaster events (needs TICKETMASTER_API_KEY)
tools/fetch_seatgeek.py           pulls one day of SeatGeek events (needs SEATGEEK_CLIENT_ID)
tools/fetch_dice.py               pulls one day of DICE New York events
tools/fetch_artwrld.py            pulls the day's gallery openings, museum shows and art events from Artwrld
tools/fetch_artrabbit.py          pulls the day's New York opening receptions from ArtRabbit
tools/fetch_artguide.py           pulls the day's New York opening receptions from Artforum artguide
tools/fetch_venues.py             pulls the day's shows from venues' own calendars (Film Forum, Smalls, comedy clubs, bar trivia)
tools/fetch_astoria.py            pulls the day's events from Astoria venues' own calendars (Socrates Sculpture Park, Melrose Ballroom, Bohemian Hall)
tools/fetch_redhook.py            pulls the day's events from Red Hook's own calendars (Pioneer Works, Waterfront Museum, CB6)
tools/fetch_greenmarkets.py       lists the farmers markets, Greenmarkets and farm stands open on one day
tools/fetch_nps.py                pulls one day of National Park Service events in NYC (needs NPS_API_KEY)
data/geocode-cache.json           address lookups the fetch scripts reuse
```

## Refreshing the events

The map shows a snapshot of one day's events; clicking the date in the header switches to tomorrow's. A GitHub Action (`.github/workflows/refresh-events.yml`) runs every `tools/fetch_*.py`, once for today and once for tomorrow, and
refreshes them every morning and midday New York time and pushes the new snapshot, which redeploys the site.
You can also run it from the repo's Actions tab (Run workflow), or by hand with Python 3, then commit and push:

```sh
python3 tools/fetch_nycgov.py             # today in NYC
python3 tools/fetch_luma.py
python3 tools/fetch_permits.py
TICKETMASTER_API_KEY=... python3 tools/fetch_ticketmaster.py
SEATGEEK_CLIENT_ID=... python3 tools/fetch_seatgeek.py
python3 tools/fetch_dice.py
python3 tools/fetch_artwrld.py
python3 tools/fetch_artrabbit.py
python3 tools/fetch_artguide.py
python3 tools/fetch_venues.py
python3 tools/fetch_astoria.py
python3 tools/fetch_redhook.py
python3 tools/fetch_greenmarkets.py
NPS_API_KEY=... python3 tools/fetch_nps.py
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

### Luma

`fetch_luma.py` reads the discover API behind https://luma.com/nyc. Events come with coordinates. Hosts can keep an
address for registered guests only, and Luma then gives a shifted position, so those events are left off the map.

### NYC Street Events

`fetch_permits.py` reads the city's permitted event list on NYC Open Data (https://data.cityofnewyork.us/d/tvpp-9vvx).
It keeps street fairs, parades, plaza and Open Streets events, greenmarkets and sidewalk sales, plus Parks
permits whose names sound public (festivals, markets, 5Ks, movie nights), and skips sports bookings, film shoots,
block parties and private parties. A closed block is placed at one of its corners with GeoSearch, a park or plaza by
name; a name GeoSearch puts in several places is left unplaced. Permit times include setup, so some start early.
A market permit within 400 m of a market that `fetch_greenmarkets.py` already placed that day is skipped, so the
same market is not shown twice (the refresh runs the scripts in name order, so the markets come first).

### NYC Farmers Markets

`fetch_greenmarkets.py` reads the Health Department's yearly list of farmers markets on NYC Open Data
(https://data.cityofnewyork.us/d/8vwk-6iz2), which needs no key and gives each market's position, market days
("Saturday", "Tuesday & Friday", "Monday (1st and 3rd)") and hours. It keeps the markets open on the day asked for.
The list has no season dates, so markets not marked open year round are shown from June through November. Until a
new year's list is out, last year's is used.

### National Park Service

`fetch_nps.py` reads the NPS Data API (https://www.nps.gov/subjects/developer/) for events at the national parks in
the city (`PARKS` in the script: Statue of Liberty, Ellis Island, Governors Island, Gateway, Federal Hall, Castle
Clinton, Grant's Tomb and others). It needs a free key in `NPS_API_KEY`, read from a repository secret of that name
by the scheduled refresh; without one it skips the run, like Ticketmaster. Events without coordinates are placed at
their park, and an event with several times a day becomes one pin per time. NPS text is US government work and free
to reuse.

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

### Venue calendars

`fetch_venues.py` reads the schedules venues publish on their own websites, one reader per site, so a site that is
down or changes its pages only loses that venue: Film Forum's week of showtimes, Nitehawk's day pages for
Williamsburg and Prospect Park, the today-and-tomorrow sets on SmallsLIVE (Smalls, Mezzrow and Jazzcultural), the
schema.org event data on New York Comedy Club's and Eastville Comedy Club's calendars, The PIT's month calendar,
Other Half Brewing's NYC taproom events, NYC Trivia League's weekly list of bar trivia and bingo nights (each
bar placed from the coordinates on its listing page), and three Ridgewood calendars: H0L0's club nights, the
Onderdonk House's events and the Myrtle Avenue BID's plaza concerts and street festivals (placed at Herman Hochberg
Plaza, or on Myrtle Avenue when an event gives no place). H0L0's ticket links go to the ticket sellers it uses. A film is one event at its first showing, with the day's
showtimes in its description. Each event names its venue as its publisher (trivia nights name NYC Trivia League),
so they are listed one by one in the Sources dropdown. Venues are placed once from the street address in `VENUES`
and remembered in `data/geocode-cache.json`. Adding a venue means a reader function, an entry in `VENUES` and a
place in `READERS`. Only title, time, price when given and a link are kept.

Check a site's terms of use before adding it. St. Marks Comedy Club, QED, McNally Jackson and Apple forbid automated
access, so they are left out; Geeks Who Drink, The Strand, Greenlight, Barnes & Noble, Film at Lincoln Center,
Juilliard, BRIC, The Public Theater and TV Eye turn automated visits away. Nowadays lists its nights only on
Resident Advisor, and Trans-Pecos only through VenuePilot, so neither is read here.

### Astoria venues

`fetch_astoria.py` works the same way for Astoria, in its own file so neighbourhoods can be added without touching
each other: the Upcoming list on Socrates Sculpture Park's Public Programs page (read through the site's WordPress
page API, since the page itself only comes compressed in a format Python cannot read), the upcoming shows on Melrose
Ballroom's events page (start and end come from each show's add-to-calendar link), and the event list Bohemian Hall's
page carries for its events widget. Only title, time and a link are kept, and each venue is its own publisher.

Checked on 2026-10-22 and left out: Museum of the Moving Image turns automated visits away; Noguchi Museum's terms
forbid using the site for commercial purposes; Queens Public Library's terms allow personal, non-commercial use only;
Greater Astoria Historical Society has closed its events feed to the public; Astoria Bookshop's calendar loads from
another host (Bookmanager); SingleCut, Kaufman Arts District and Astoria Performing Arts Center could not be reached;
the Queens Council on the Arts and The Astor Room domains now belong to unrelated sites.

### Red Hook calendars

`fetch_redhook.py` covers Red Hook, which the big listing sites barely reach. It reads Pioneer Works' calendar
(https://pioneerworks.org/calendar, from the data in the page) and each program's own page for its discipline,
leaving out programs held somewhere else; the Waterfront Museum barge's open hours and shows; and Brooklyn
Community Board 6's community calendar, which also covers Carroll Gardens, Cobble Hill, Gowanus and Park Slope.
The last two come from the public feed of The Events Calendar plugin (`/wp-json/tribe/events/v1/events`). CB6
listings are kept only when they give a street address or a place GeoSearch knows by that exact name, and
election days and Nitehawk shows (already in the venue calendars) are left out. CB6's robots.txt asks for 10
seconds between requests, which the script keeps to when a day runs to a second page.

Checked 2026-10-22: Kentler International Drawing Space's terms forbid commercial use of the site's text, so it
is left out. BWAC has had no Red Hook space since its 2025 fire. Sunny's Bar keeps its calendar on Tockify and
Jalopy Theatre has moved to jalopytheatre.org, neither of which the build environment can reach yet.

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
