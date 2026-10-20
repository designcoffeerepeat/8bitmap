// Resident Advisor, New York (https://ra.co/events/us/newyork).
//
// RA's listings come from the site's own GraphQL endpoint, which other sites
// cannot call from the browser. tools/fetch_ra.py pulls one night of listings
// (venues already carry coordinates) and writes public/data/ra-events.json.

import { snapshotSource } from './snapshot.js';

export default snapshotSource({
  id: 'ra',
  name: 'Resident Advisor',
  url: 'https://ra.co/events/us/newyork',
  file: 'ra-events.json',
  // Shown as title, time and a link back to RA only.
  listingOnly: true,
});
