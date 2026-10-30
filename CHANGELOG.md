# 8bit.nyc releases

Each release from dev to the live site (main) gets a version number here, so it can be referred to later.

## v1.40 (2026-10-30)

Everything on dev since v1.8 (dev versions v1.9 to v1.40) goes live together as v1.40. doNYC, Resident Advisor and
The Skint stay parked.

- The event list follows the map view, with a Reset button, and hovering a pin scrolls to its listing. (v1.9, v1.10)
- A + dropdown flies the map to a neighborhood. (v1.11)
- Phone layout: full width event card and header; the open event tray covers the weather button. (v1.12, v1.13, v1.37)
- IMAX showings at AMC Lincoln Square. (v1.14)
- Everything from aul: the detailed map, weather and winter mode, alternate side parking, the subway map and alerts,
  airport security waits, the New Year's Eve countdown, the Disclaimer page and the Zoomers. (v1.15)
- Monster attack moves into the + menu, with the UFO, the robot and the giant marshmallow, plus character colour
  tweaks. (v1.16 to v1.26, v1.30, v1.31)
- Site menu small links. (v1.19, v1.23)
- Subway station names on hover and tap. (v1.27, v1.38)
- Legal clean-up: original characters, Luma parked, Accessibility page. (v1.28)
- The Cooper Union's public lectures and talks. (v1.29)
- Eventbrite organizers and NYC Council hearings. (v1.32 to v1.36)
- The neighborhoods in view show under the IN VIEW count. (v1.39)
- The Central Park South Zoomer is an original cyclist who stops to wave. (v1.40)

## aul (2026-10-26 to 2026-10-28, retired)

aul was a separate, more detailed version of the map at https://aul.8bit.nyc, built on the `aul` branch and
deployed to its own Worker (8bitmap-aul). All of it was merged into dev as v1.15 on 2026-10-28, and the site and
Worker were then taken down. The `aul` branch is kept as is, so its last state (aul v6) stays in git.

- aul v1: detailed map with real parks, roads, landmarks and airports.
- aul v2: subway alerts in the + menu, softer highways.
- aul v3: highways the same colour as the other streets.
- aul v4: weather button with chance of rain, an umbrella answer and winter mode; alternate side parking in the
  + menu with a full-year calendar; subway map with suspended stretches in red and a warning pin; Disclaimer page;
  New Year's Eve countdown, ball drop and fireworks; security wait pins over JFK, LaGuardia and Newark.
- aul v5: the red TKTS steps back in Times Square, and the first Zoomers (easter egg characters at full zoom):
  Times Square performers and tourists, the woman in green in Carroll Gardens, the subway dancers on the Manhattan
  Bridge, a cyclist, the Rent Is Too Damn High guy, the hero in Hunters Point, the McCarren Park pair, the
  Staten Island Ferry, and the big yellow bird and brown elephant at the Museum of the Moving Image.
- aul v6: Zoomers draw solid, with no white skeleton showing through.

## v1.8 (2026-10-23)

Everything on dev since v1.1 (dev versions v1.2 to v1.8) goes live together as v1.8.

- Times Square: a bigger open plaza along Broadway and 7th Ave (42nd to 48th St), the billboard building at its north
  end with a billboard on its front wall (8BIT / .NYC flashing when zoomed out, a tap flies in; YOUR AD/EVENT HERE
  when zoomed in, a tap opens Contact on Ad/Event Inquiry), and One Times Square with flashing screens and a
  twinkling New Year's Eve ball on top. (v1.4 to v1.8)
- On phones the event list tray slides up over the map controls instead of under them. (v1.3)
- Header logo reads 8bit.nyc with no gap between "8bit" and ".nyc" (also on the dev login page). (v1.2)
- On phones the map controls (zoom in, zoom out, reset) sit at the bottom right, 15% smaller, so the Sources and
  Categories dropdowns no longer cover them. The event card and MONSTER ATTACK! bar leave room for them. (v1.2)
- On phones the date and event count in the header stay on one line, with the font sized to fit the screen. (v1.2)

## v1.1 (2026-10-22)

- The site is called 8bit.nyc in the header, About, legal pages, login page and contact emails.
- New event source: Patchbay New York live music.
- The Sources dropdown is sorted A to Z by name, skipping a leading "The".
- The title box keeps the same size when switching between today and tomorrow.

## v1.0 (2026-10-22): public launch

- Password and coming soon page removed from the live site; dev keeps its password.
- Venue calendars for Astoria, Ridgewood, Red Hook, Forest Hills, Flushing, Coney Island, Staten Island, Hoboken,
  Jersey City and Public Records.
- Duplicate events from different sources merged into one listing.
- Trivia and quiz nights category, CATEGORIES dropdown, tap a category name to show only that category.
- Event title on pin hover; site menu with About, Privacy, Terms and the MONSTER ATTACK! toggle.
- SEO title, description and link preview image.
- Fix: eight sources (NYC.gov, Luma, permits, Ticketmaster, SeatGeek, ARTWRLD, Greenmarkets, National Parks) failed to
  load after the launch merge because their event files were left broken; repaired the same day.
