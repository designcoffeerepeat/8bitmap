# 8bit.nyc

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

Two branches (the detailed map's old `aul` branch and aul.8bit.nyc were folded into dev in v1.15 and retired):

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

### Dev password

`worker/index.js` runs in front of the static build on both Workers. Live (`SITE` is `live` in `wrangler.jsonc`)
is open to everyone. The dev workflow deploys with `SITE=dev` and `SITE_PASSWORD=alpha8bit01`, so on dev every page
asks for the password first. Logging in sets a cookie for 30 days, and `/logout` clears it. On live, `/login` and
`/logout` just go to the map. This is a shared password to keep unreleased changes private, not a real account system.
Keep `worker/index.js` itself: it also runs the contact form and the cookie consent check below.

### Contact form, legal pages and cookie consent

The menu in the title box opens Contact, About, Privacy Policy, Terms and Conditions, Disclaimer and Accessibility as modals
(`src/scripts/site.js`; the texts are `src/components/PrivacyPolicy.astro` and `src/components/Terms.astro`).
Each can be linked to directly as `/#contact`, `/#privacy` or `/#terms`. The empty ad slot opens Contact
on Ad/Event Inquiry, and so does the Times Square billboard on the map once you zoom in (`src/scripts/times-square.js`).

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
src/components/                   About, Privacy Policy, Terms, Disclaimer and Accessibility texts
src/scripts/map/geo.js            NYC tile grid: parks, beaches, bridges, skyline peaks, lat/lng to tile
src/scripts/map/land.json         land tiles for all five boroughs and the land around them (tools/build_land.py)
src/scripts/map/detail.json       finer ground detail: real parks, lakes, runways, major streets, highways (tools/build_detail.py)
src/scripts/map/places.js         landmark models (stadiums, arenas, museums, City Hall, airports...) and park, road and place names
src/scripts/map/renderer.js       three.js scene: voxel land and buildings, pins, labels, camera, picking
src/scripts/map/palette.js        colours for the city and for event categories
src/scripts/events/schema.js      the one event shape every source maps into
src/scripts/events/index.js       loads all sources, filters to today and the map area, de-duplicates, sorts
src/scripts/events/overlap.js     merges the same event listed by several sources, keeping the listing with the most
                                  information (SeatGeek always wins over Ticketmaster)
src/scripts/events/sources/       one file per event source: nycgov.js, permits.js,
                                  ticketmaster.js, seatgeek.js, artwrld.js,
                                  venues.js, greenmarkets.js, nps.js, astoria.js, redhook.js, foresthills.js, coneyisland.js, statenisland.js,
                                  snapshot.js (shared reader),
                                  dummy.js (sample data, not loaded), template.js
public/data/*-events.json         one snapshot per source, written by the matching tools/fetch_*.py
public/data/tomorrow/*.json       the same snapshots for the next NYC day (EVENTS_DIR=public/data/tomorrow)
parked/                           doNYC, Resident Advisor, The Skint, Queens Public Library, ArtRabbit, Artforum artguide,
                                  SmallsLIVE, Other Half Brewing and DICE, removed until they agree to be listed
public/                           other static files copied as-is (favicon)
tools/fetch_nycgov.py             pulls one day of NYC.gov events and places them on the map
tools/fetch_permits.py            pulls one day of NYC permitted street events (street fairs, parades, greenmarkets)
tools/fetch_ticketmaster.py       pulls one day of Ticketmaster events (needs TICKETMASTER_API_KEY)
tools/fetch_seatgeek.py           pulls one day of SeatGeek events (needs SEATGEEK_CLIENT_ID)
tools/fetch_artwrld.py            pulls the day's gallery openings, museum shows and art events from Artwrld
tools/fetch_venues.py             pulls the day's shows from venues' own calendars (Film Forum, comedy clubs, bar trivia, Flushing)
tools/fetch_astoria.py            pulls the day's events from Astoria venues' own calendars (Socrates Sculpture Park, Melrose Ballroom, Bohemian Hall)
tools/fetch_redhook.py            pulls the day's events from Red Hook's own calendars (Pioneer Works, Waterfront Museum, Sunny's, CB6)
tools/fetch_foresthills.py        pulls the day's events from Forest Hills' own calendars (Commonpoint Queens, Rove trivia)
tools/fetch_coneyisland.py        pulls the day's events from Coney Island's own calendars (Coney Island USA, Luna Park, Deno's Wonder Wheel)
tools/fetch_statenisland.py       pulls the day's events from Staten Island's own calendars (Children's Museum, Noble Maritime, Richmond Town, Alice Austen House)
tools/fetch_greenmarkets.py       lists the farmers markets, Greenmarkets and farm stands open on one day
tools/fetch_nps.py                pulls one day of National Park Service events in NYC (needs NPS_API_KEY)
tools/fetch_patchbay.py           pulls today's or tomorrow's New York live music from Patchbay
tools/fetch_amc.py                pulls one day of IMAX showings at AMC Lincoln Square 13 (needs AMC_API_KEY)
data/geocode-cache.json           address lookups the fetch scripts reuse
data/patchbay-venues.json         Patchbay venues' addresses and positions, read once per venue
```

## Refreshing the events

The map shows a snapshot of one day's events; clicking the date in the header switches to tomorrow's. A GitHub Action (`.github/workflows/refresh-events.yml`) runs every `tools/fetch_*.py`, once for today and once for tomorrow, and
refreshes them every morning and midday New York time and pushes the new snapshot, which redeploys the site.
You can also run it from the repo's Actions tab (Run workflow), or by hand with Python 3, then commit and push:

```sh
python3 tools/fetch_nycgov.py             # today in NYC
python3 tools/fetch_permits.py
TICKETMASTER_API_KEY=... python3 tools/fetch_ticketmaster.py
SEATGEEK_CLIENT_ID=... python3 tools/fetch_seatgeek.py
python3 tools/fetch_artwrld.py
python3 tools/fetch_venues.py
python3 tools/fetch_astoria.py
python3 tools/fetch_redhook.py
python3 tools/fetch_foresthills.py
python3 tools/fetch_coneyisland.py
python3 tools/fetch_statenisland.py
python3 tools/fetch_greenmarkets.py
NPS_API_KEY=... python3 tools/fetch_nps.py
python3 tools/fetch_patchbay.py           # today or tomorrow only
AMC_API_KEY=... python3 tools/fetch_amc.py
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
their park, except Gateway events at Sandy Hook (New Jersey), which are dropped. A tour run several times a day is
one pin at its first time, with every time listed in its description. NPS text is US government work and free
to reuse.

### Patchbay

`fetch_patchbay.py` reads https://patchbay.fm/new-york/today (or `/tomorrow`), whose pages carry each show as
schema.org MusicEvent data: title, start time, venue, every act on the bill and their genres. Patchbay has no terms
page; its robots.txt allows these pages and asks for 5 seconds between requests, which the script keeps. The list
has no street addresses, so the first show at a new venue is opened once for its address, which is placed with
GeoSearch (or the Census geocoder outside the city) and kept in `data/patchbay-venues.json`. A venue with no usable
address is tried again after two weeks. Patchbay only lists today and tomorrow by day, so the script takes no other
date. Shows listed under DJ or dance genres (house, techno, disco) are Nightlife, the rest Music. Each pin links to
the show's Patchbay page.

### Ticketmaster

`fetch_ticketmaster.py` reads the Discovery API (https://developer.ticketmaster.com) for events within 12 miles of
Manhattan. It needs a free key (the Consumer Key under My Apps) in `TICKETMASTER_API_KEY`; the scheduled refresh
reads it from a repository secret of that name. Without a key it skips the run and leaves the snapshot alone, and
the map shows no Ticketmaster events until the first run that has one.

### SeatGeek

`fetch_seatgeek.py` reads the SeatGeek Platform API (https://platform.seatgeek.com) for events within 12 miles of
Manhattan. It needs a free client id in `SEATGEEK_CLIENT_ID`, which the scheduled refresh reads from a repository
secret of that name. Without one it skips the run, like Ticketmaster.

### AMC Lincoln Square IMAX

`fetch_amc.py` reads AMC's official API (https://developers.amctheatres.com) for the day's showtimes at AMC Lincoln
Square 13 (Broadway at 68th Street) and keeps only the IMAX showings, one pin per showing, each linking to its
ticket page. It needs a vendor key in `AMC_API_KEY`, read from a repository secret of that name by the scheduled
refresh; without one it skips the run, like Ticketmaster.

### Categories

Each fetcher maps its source's own labels into the map's categories (`CATEGORIES` in `src/scripts/events/schema.js`).
Theater covers plays, musicals, opera and dance; art covers museums, galleries, exhibits and openings. When a
listing has no usable label, `venue_category()` in `tools/fetch_nycgov.py` decides from the venue name: a museum or
gallery is art, a theater or playhouse is theater, a cinema is film.
Trivia covers trivia and quiz nights: `normalizeEvent()` in `src/scripts/events/schema.js` moves any event whose
title says trivia or quiz, and every NYC Trivia League night (its Mixtape Bingo too), into trivia whatever its
source filed it under, so new sources get this without changes.

### Artwrld

`fetch_artwrld.py` reads three of Artwrld's New York pages, and everything it keeps is art:
the openings page (https://www.artwrld.com/city/new-york/openings) for gallery and museum exhibitions that open on
the day, with the reception time from the listing or the exhibition's own page (no time means all day); the
exhibitions page for museum shows on view that day, shown all day (gallery shows are left out, there are hundreds);
and the events page for talks and performances on the day. Museums are matched by name (`MUSEUM` in the script) and
placed once from one of their exhibition pages, then remembered in `data/geocode-cache.json`. Only the title, venue,
dates and a link are kept. Openings and events are only listed ahead of time, so a past day comes back mostly empty.

### Venue calendars

`fetch_venues.py` reads the schedules venues publish on their own websites, one reader per site, so a site that is
down or changes its pages only loses that venue: Film Forum's week of showtimes, Nitehawk's day pages for
Williamsburg and Prospect Park, the
schema.org event data on New York Comedy Club's and Eastville Comedy Club's calendars, The PIT's month calendar,
NYC Trivia League's weekly list of bar trivia and bingo nights (each
bar placed from the coordinates on its listing page), Public Records' event calendar (Gowanus), and three Ridgewood calendars: H0L0's club nights, the
Onderdonk House's events and the Myrtle Avenue BID's plaza concerts and street festivals (placed at Herman Hochberg
Plaza, or on Myrtle Avenue when an event gives no place), and six in and around Flushing: Queens Botanical Garden's
events feed, the New York Hall of Science's one-time public events, the Queens Night Market's next market night, and
the events lists of Kingsland Homestead (Queens Historical Society), Bowne House and Lewis Latimer House, and The Cooper Union's
public lectures, talks and performances (its month page, leaving out in-class lectures). H0L0's ticket links go to the ticket sellers it uses. A film is one event at its first showing, with the day's
showtimes in its description. Each event names its venue as its publisher (trivia nights name NYC Trivia League),
so they are listed one by one in the Sources dropdown. Venues are placed once from the street address in `VENUES`
and remembered in `data/geocode-cache.json`. Adding a venue means a reader function, an entry in `VENUES` and a
place in `READERS`. Only title, time, price when given and a link are kept.

Replacements for Luma (parked 2026-10-28) were checked the same day: The Cooper Union has no terms against reading its
events pages and its robots.txt allows them, so it is read here. NYU's and Columbia's calendars and the NYC Council's
Legistar API turn automated visits away or need a key, and The New School's events load from an /api path its
robots.txt keeps readers off, so they are left out for now.

Check a site's terms of use before adding it. St. Marks Comedy Club, QED, McNally Jackson and Apple forbid automated
access, Flushing Town Hall and the Kupferberg Center forbid republishing their content, and Queens Theatre turns
scripts away, so they are left out; Geeks Who Drink, The Strand, Greenlight, Barnes & Noble, Film at Lincoln Center,
Juilliard, BRIC, The Public Theater and TV Eye turn automated visits away. IFC Center's owner (AMC Networks) forbids
republishing its content, and Angelika's showtimes come only from a private API, so neither cinema is read here. Nowadays lists its nights only on
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
leaving out programs held somewhere else; the Waterfront Museum barge's open hours and shows; Sunny's Bar's music
nights, from the page data of the Tockify calendar its site embeds (https://tockify.com/sunnysmusic; robots.txt
keeps readers off Tockify's API, so only that page is read); and Brooklyn
Community Board 6's community calendar, which also covers Carroll Gardens, Cobble Hill, Gowanus and Park Slope.
The last two come from the public feed of The Events Calendar plugin (`/wp-json/tribe/events/v1/events`). CB6
listings are kept only when they give a street address or a place GeoSearch knows by that exact name, and
election days and Nitehawk shows (already in the venue calendars) are left out. CB6's robots.txt asks for 10
seconds between requests, which the script keeps to when a day runs to a second page.

Checked 2026-10-22: Kentler International Drawing Space's terms forbid commercial use of the site's text, so it
is left out. BWAC has had no Red Hook space since its 2025 fire. Jalopy Theatre's calendar now lives on
jalopytheatre.netlify.app, which the build environment cannot reach yet. Tockify's terms only load in a browser
and could not be read.

### Forest Hills calendars

`fetch_foresthills.py` covers Forest Hills, Queens. It reads Commonpoint Queens' public events (the Event category of
its feed from The Events Calendar plugin, `/wp-json/tribe/events/v1/events`, leaving out the thousands of registered
classes and virtual sessions) at Central Queens on 108th Street and its other NYC centers, and Rove's Thursday trivia
night as its home page announces it. Forest Hills Stadium already comes in through Ticketmaster and SeatGeek, the
Sunday Greenmarket through the farmers markets source and Forest Park through NYC.gov.

Checked 2026-10-22 and left out: Cinemart Cinemas' terms allow personal use only and forbid passing anything on for a
commercial or public purpose; Queens Public Library's terms allow personal, non-commercial use only; The
Church-in-the-Gardens' calendar is recovery groups, scouts and rehearsals rather than public events; Regal UA Midway
is a chain ticketing site.

### Coney Island calendars

`fetch_coneyisland.py` covers Coney Island and, as they are found, Brighton Beach and Manhattan Beach. It reads
Coney Island USA's events list (Burlesque at the Beach, sideshow nights, films and talks at 1208 Surf Avenue, with the
time taken from each listing's Add to Google Calendar link), the named events on Luna Park's park calendar (Halloween
Harvest days, DJ nights; plain opening hours are left out) and the special events on Deno's Wonder Wheel's season
calendar (fireworks, karaoke, dance shows; the daily ride hours are left out). The Cyclones already come in through
SeatGeek and the Amphitheater through Ticketmaster.

Checked 2026-10-22: none of the three has terms against automated reading, and their robots.txt allow these pages.
Left out for now: the New York Aquarium (its terms are on wcs.org, which the build cannot reach yet), Kingsborough
Community College (its calendar loads from widget.calendar.moderncampus.net, not reachable yet), On Stage at
Kingsborough (no season announced), the Alliance for Coney Island (its events page has no dates), the Coney Island
History Project (closed for the season, no dated listings), Brooklyn Public Library (shows automated visitors a bot
check page), Millennium Theatre (site down) and Tatiana (its domain is parked).

### Staten Island calendars

`fetch_statenisland.py` covers Staten Island, which the big listing sites barely reach. It reads the Staten Island
Children's Museum's feed from The Events Calendar plugin (`/wp-json/tribe/events/v1/events`, leaving out
members-only and private events), the Squarespace events pages of the Noble Maritime Collection and Historic
Richmond Town (`/events?format=json`, keeping only what starts and ends on the day, so exhibitions and season-long
tours are left out) and the Alice Austen House's events list. St. George Theatre sells through Ticketmaster, which
already lists its shows, and the island's parks come in through NYC.gov.

Checked 2026-10-22 and left out: Empire Outlets' terms allow personal, non-commercial use only; Kills Boro
Brewing's terms forbid reproducing any site content without written permission; Snug Harbor, the Staten Island
Museum and Wagner College sit behind a Cloudflare check that blocks automated readers, Staten Island Arts' server
refuses them, NYPL has a bot wall and the Staten Island Zoo refuses requests; the Conference House lists tours
only; Greenbelt Conservancy's and Flagship Brewing's calendars are empty or a year old; the CSI Center for the Arts'
calendar is school-group shows; the Jacques Marchais Museum's Wix calendar only loads in a browser; the
Garibaldi-Meucci Museum's site could not be reached.

### Jersey City calendars

`fetch_jerseycity.py` covers Jersey City, NJ, which is already drawn on the map's New Jersey shore. It reads the
city's own calendar from the Office of Cultural Affairs (jerseycityculture.org, The Events Calendar feed, leaving
out meetings and city-wide listings with no place), Art House Productions' Upcoming Events list from its Shopify
box office (`/collections/upcomingevents/products.json`, with each show's dates read from its description), Mana
Contemporary's event list (`/wp-json/wp/v2/event`, Jersey City events only) and the Historic Downtown SID's feed
(Groove on Grove and the Grove Street farmers market, empty between seasons). NYC GeoSearch stops at the Hudson,
so the places the city calendar uses most are written into `PLACES`, and other street addresses go to the US
Census geocoder and are remembered in `data/geocode-cache.json`.

Checked 2026-10-22 and left out: the Loew's Jersey Theatre's terms allow personal, non-commercial use only and
forbid automated collection; WFMU's terms forbid automated requests and data mining (Monty Hall); White Eagle
Hall, Jersey City Theater Center, the library's main site and Liberty Science Center turn automated visits away;
the Exchange Place Alliance's domain no longer runs its site.

## Adding a real event source

1. Copy `src/scripts/events/sources/template.js` to a new file and fill in `fetchEvents({ date, bounds })`.
   Return raw records with at least `title`, `start` (ISO time) and `venue.lat` / `venue.lng`.
2. Add the import to `SOURCES` in `src/scripts/events/index.js`.

Most listing sites block browser requests, so real sources should call a small backend that returns JSON.
On Cloudflare Pages that can be a Pages Function in a `functions/` folder at the repo root.
Each source shows up in the SOURCES dropdown on its own, which is always sorted A to Z by name, skipping a leading "The" (`renderSources()` in `app.js`), so a new source needs no ordering. A source can also set `publisher` on a record
(as `nycgov.js` does for NYC Parks listings) to list it under a different name.
Events outside the map bounds or not on the requested day are dropped automatically,
and the same show listed on several sites is merged by title, venue and start time.

## Tuning the map

- Shorelines and the map's edges come from `tools/build_land.py`, which turns the city's borough boundaries
  and the census county shapes around them into `src/scripts/map/land.json`. The map covers all five boroughs;
  change `BOUNDS` there and rerun it (`python3 tools/build_land.py`) to move the edges.
- Parks, roads and lakes: `tools/build_detail.py` reads the NYC Parks properties and the city's street centerline
  file from NYC Open Data and writes `src/scripts/map/detail.json`, which splits every tile into 4 x 4 finer pixels.
  The streets drawn are every highway plus `MAJOR_STREETS` in the script; lakes and runways are traced by hand there.
  Rerun it (`python3 tools/build_detail.py`) after changing them. A tile that is mostly park becomes a park tile (no
  buildings, trees), and a tile a highway or major street crosses is kept clear of buildings.
- Parks the city data leaves out (federal, state and New Jersey parks), airports, beaches and small islands are
  `[lat, lng]` polygons at the top of `geo.js`.
- Landmarks: the older ones are `LANDMARKS` in `geo.js`, the newer ones `PLACES` in `places.js`, each with a small
  model function made of boxes. `clear` empties the tiles around it of generic buildings and `top` is where event
  pins on those tiles sit.
- Layers: the renderer keeps the map in layers (`ground`, `roads`, `buildings`, `landmarks`, `labels`, `overlay`,
  `pins`). An overlay such as a subway map can draw lines with `map.addOverlayLine(points, { color, width })`, fade
  the city under it with `map.dimBase(0.6)`, hide a layer with `map.setLayerVisible('roads', false)` and add or
  remove text tags with `map.addAnchor` / `map.removeAnchor`. Pins always stay on top.
- Subway: the + menu's Subway section has SUBWAY MAP (every line and station, a few pixels wide at any zoom) and
  the lines hit by ACTIVE ALERTS / DELAYS or PLANNED WORK, from `/api/subway-alerts` (`worker/index.js`, which reads
  the MTA's live alerts feed and keeps it for two minutes). A headline like "No [L] trains between 8 Av and Bedford
  Av" is matched to the line's stations (`src/scripts/subway-spans.js`) and that stretch is drawn red with a ! pin
  that shows the alert. The lines and stations are `src/scripts/map/subway.json`, written by `tools/build_subway.py`
  from the MTA's subway GTFS before every dev build; the copy in git is empty, so a local build lists the lines
  without drawing them unless you run the script first. `node tools/check_subway_spans.mjs alerts.json` shows how
  the live alerts match.
- Weather: the button at the bottom left asks `/api/weather` (the National Weather Service's hourly forecast for
  Central Park, kept 15 minutes) and its card has the chance of rain, the umbrella answer and WINTER MODE, which
  covers the streets, roofs and trees in snow (`map.setWinter`, `src/scripts/weather.js`).
- Alternate side parking: the + menu shows today and tomorrow from `src/scripts/asp.json`, written by
  `tools/build_asp.py` from NYC DOT's yearly calendar (refreshed before every dev build), and the #asp modal shows the
  whole year (`src/components/AspCalendar.astro`). SHOW ON MAP keeps a chip at the bottom left.
- Airport security: shield pins over JFK, LaGuardia and Newark open a card with each terminal's general and PreCheck
  wait from `/api/airport-security` (the Port Authority's checkpoint feed, kept five minutes). Pins that are not
  events go through `map.setExtraPins` (`src/scripts/airport-security.js`).
- New Year's Eve: from 11:50 pm on December 31 (New York time) a countdown floats over the Times Square ball, which
  drops over the last minute, then ten minutes of fireworks; on January 1st tapping the ball drops it again
  (`src/scripts/new-year.js`). `?nye=90` sets the clock 90 seconds before midnight to try it.
- Zoomers: the easter egg characters that appear when the map is zoomed all the way in on their spot
  (`src/scripts/zoomers/`): Times Square's caped hero, masked wrestler, orange furry character and tourists; the subway dancers
  on a train over the Manhattan Bridge; Bill Cunningham at Fifth Avenue and 57th Street; the two guys on beach chairs in McCarren Park; the giant pigeon at the Museum of the Moving Image; and the Staten Island Ferry, which sails all day. `kit.js` builds the voxel people, walk cycles and
  speech bubbles, and shows a Zoomer as a pale ghost where a building hides it. A new Zoomer is a `start(map, spot)`
  that returns `{ step(dt), dispose() }`, hooked up with `zoomer()` or `watchZoomEgg`.
- `?at=lat,lng,zoom` in the address opens the map on that spot, e.g. `/?at=40.7499,-73.8467,3.5` for the US Open.
- Skyline heights come from `PEAKS` in `geo.js` (centre, spread, height).
- Tile size is `CELL` in `tools/build_land.py`; pixel chunkiness is the PX button (2x by default, then 3x, 4x).
