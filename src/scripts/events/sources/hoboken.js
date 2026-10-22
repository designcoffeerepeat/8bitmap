// Hoboken's own calendars: the Hoboken Historical Museum, the Hoboken Public Library
// and Stevens' DeBaun Performing Arts Center.
//
// tools/fetch_hoboken.py reads each one from its own website and writes public/data/hoboken-events.json.
// Each event names its venue (or the library, or DeBaun PAC) as its publisher, so each has its own
// entry in the Sources dropdown.

import { snapshotSource } from './snapshot.js';

export default snapshotSource({
  id: 'hoboken',
  name: 'Hoboken calendars',
  url: 'https://hobokenmuseum.org/events/',
  file: 'hoboken-events.json',
  optional: true,
});
