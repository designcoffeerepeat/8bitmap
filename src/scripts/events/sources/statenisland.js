// Staten Island's own calendars: the Children's Museum, the Noble Maritime Collection,
// Historic Richmond Town and the Alice Austen House.
//
// tools/fetch_statenisland.py reads each schedule from its own website, places the venue
// from its address and writes public/data/statenisland-events.json. Each event names its venue
// as its publisher, so each has its own entry in the Sources dropdown.

import { snapshotSource } from './snapshot.js';

export default snapshotSource({
  id: 'statenisland',
  name: 'Staten Island calendars',
  url: 'https://www.historicrichmondtown.org/',
  file: 'statenisland-events.json',
  optional: true,
});
