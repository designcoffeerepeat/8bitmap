// The Skint (https://theskint.com/), free and cheap picks.
//
// The Skint publishes its listings as daily and weekend roundup posts.
// tools/fetch_skint.py reads the roundups covering a day from the site's
// WordPress API, places each listing (street address, data/venues.json, or a
// GeoSearch place name) and writes public/data/skint-events.json.

import { snapshotSource } from './snapshot.js';

export default snapshotSource({
  id: 'skint',
  name: 'The Skint',
  url: 'https://theskint.com/',
  file: 'skint-events.json',
});
