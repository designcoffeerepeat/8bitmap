// Venues' own calendars: Film Forum, Nitehawk, Smalls, Mezzrow, Jazzcultural, New York Comedy Club,
// Eastville Comedy Club, The PIT, Other Half Brewing and NYC Trivia League's bar nights.
//
// tools/fetch_venues.py reads each venue's schedule from its own website, places the venue
// from its address and writes public/data/venues-events.json. Each event names its venue as
// its publisher (trivia nights name NYC Trivia League), so each has its own entry in the Sources dropdown.

import { snapshotSource } from './snapshot.js';

export default snapshotSource({
  id: 'venues',
  name: 'Venue calendars',
  url: 'https://filmforum.org/',
  file: 'venues-events.json',
  optional: true,
});
