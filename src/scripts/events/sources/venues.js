// Venues' own calendars: Film Forum, Nitehawk, Smalls, Mezzrow, Jazzcultural, New York Comedy Club,
// Eastville Comedy Club, The PIT, Other Half Brewing, NYC Trivia League's bar nights, and in Ridgewood
// H0L0, the Onderdonk House and the Myrtle Avenue BID, and in Flushing Queens Botanical Garden, the New York
// Hall of Science, the Queens Night Market, Kingsland Homestead, Bowne House and Lewis Latimer House.
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
