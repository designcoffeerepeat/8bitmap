// Ticketmaster (https://www.ticketmaster.com/discover/new-york).
//
// tools/fetch_ticketmaster.py reads one day from the Discovery API (venues
// carry coordinates) and writes public/data/ticketmaster-events.json. It needs
// a TICKETMASTER_API_KEY, so the file only exists once a run has had the key.

import { snapshotSource } from './snapshot.js';

export default snapshotSource({
  id: 'ticketmaster',
  name: 'Ticketmaster',
  url: 'https://www.ticketmaster.com/discover/new-york',
  file: 'ticketmaster-events.json',
  optional: true,
});
