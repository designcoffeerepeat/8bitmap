// Coney Island's own calendars: Coney Island USA (sideshow, burlesque, films), Luna Park
// and Deno's Wonder Wheel.
//
// tools/fetch_coneyisland.py reads each one from its own website and writes public/data/coneyisland-events.json.
// Each event names its venue as its publisher, so each has its own entry in the Sources dropdown.

import { snapshotSource } from './snapshot.js';

export default snapshotSource({
  id: 'coneyisland',
  name: 'Coney Island calendars',
  url: 'https://www.coneyisland.com/event',
  file: 'coneyisland-events.json',
  optional: true,
});
