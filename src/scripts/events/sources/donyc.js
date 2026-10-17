// doNYC (https://donyc.com/).
//
// tools/fetch_donyc.py reads one day of doNYC's listing pages, places each
// venue from its street address with NYC GeoSearch, and writes
// public/data/donyc-events.json.

import { snapshotSource } from './snapshot.js';

export default snapshotSource({
  id: 'donyc',
  name: 'doNYC',
  url: 'https://donyc.com/',
  file: 'donyc-events.json',
});
