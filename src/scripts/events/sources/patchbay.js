// Patchbay (https://patchbay.fm/new-york).
//
// tools/fetch_patchbay.py reads the day's New York shows from Patchbay's pages, places each
// venue from the address on one of its show pages (kept in data/patchbay-venues.json) and
// writes public/data/patchbay-events.json. Each show links to its Patchbay page, where every
// act on the bill can be previewed.

import { snapshotSource } from './snapshot.js';

export default snapshotSource({
  id: 'patchbay',
  name: 'Patchbay',
  url: 'https://patchbay.fm/new-york',
  file: 'patchbay-events.json',
  optional: true,
});
