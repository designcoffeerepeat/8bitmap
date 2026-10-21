// ArtRabbit New York (https://www.artrabbit.com/all-listings/united-states/new-york).
//
// tools/fetch_artrabbit.py reads the current and upcoming lists, keeps the
// exhibitions whose opening reception is on the day (cards carry coordinates)
// and writes public/data/artrabbit-events.json.

import { snapshotSource } from './snapshot.js';

export default snapshotSource({
  id: 'artrabbit',
  name: 'ArtRabbit',
  url: 'https://www.artrabbit.com/all-listings/united-states/new-york',
  file: 'artrabbit-events.json',
  optional: true,
});
