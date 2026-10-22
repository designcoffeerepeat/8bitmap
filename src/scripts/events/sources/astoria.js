// Astoria venues' own calendars: Socrates Sculpture Park, Melrose Ballroom and Bohemian Hall.
//
// tools/fetch_astoria.py reads each venue's schedule from its own website, places the venue
// from its address and writes public/data/astoria-events.json. Each event names its venue as
// its publisher, so each has its own entry in the Sources dropdown.

import { snapshotSource } from './snapshot.js';

export default snapshotSource({
  id: 'astoria',
  name: 'Astoria venues',
  url: 'https://socratessculpturepark.org/',
  file: 'astoria-events.json',
  optional: true,
});
