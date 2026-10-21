// National Park Service (https://www.nps.gov/state/ny/index.htm).
//
// tools/fetch_nps.py reads one day of events at NYC's national parks from the
// NPS Data API and writes public/data/nps-events.json. It needs an NPS_API_KEY,
// so the file only exists once a run has had the key.

import { snapshotSource } from './snapshot.js';

export default snapshotSource({
  id: 'nps',
  name: 'National Park Service',
  url: 'https://www.nps.gov/state/ny/index.htm',
  file: 'nps-events.json',
  optional: true,
});
