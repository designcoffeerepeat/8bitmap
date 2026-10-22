// Hoboken's own calendars: the Hoboken Historical Museum, the Hoboken Public Library,
// Stevens' DeBaun Performing Arts Center, Mile Square Theatre and the City of Hoboken's park events.
//
// tools/fetch_hoboken.py reads each one from its own website and writes public/data/hoboken-events.json.
// Each event names its venue (or the library, DeBaun PAC or the city) as its publisher, so each has its own
// entry in the Sources dropdown.

import { snapshotSource } from './snapshot.js';

export default snapshotSource({
  id: 'hoboken',
  name: 'Hoboken calendars',
  url: 'https://hobokenmuseum.org/events/',
  file: 'hoboken-events.json',
  optional: true,
});
