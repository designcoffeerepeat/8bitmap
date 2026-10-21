// Venues' own calendars: Film Forum, Nitehawk, Smalls, Mezzrow, Jazzcultural, New York Comedy Club,
// Eastville Comedy Club, St. Marks Comedy Club, The PIT and QED.
//
// tools/fetch_venues.py reads each venue's schedule from its own website, places the venue
// from its address and writes public/data/venues-events.json. Each event names its venue as
// its publisher, so every venue has its own entry in the Sources dropdown.

import { snapshotSource } from './snapshot.js';

export default snapshotSource({
  id: 'venues',
  name: 'Venue calendars',
  url: 'https://filmforum.org/',
  file: 'venues-events.json',
  optional: true,
});
