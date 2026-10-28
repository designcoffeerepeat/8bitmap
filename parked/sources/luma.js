// Luma NYC (https://luma.com/nyc).
//
// tools/fetch_luma.py reads one day from Luma's discover API (events carry
// coordinates; ones whose address is shown to guests only are left off) and
// writes public/data/luma-events.json.

import { snapshotSource } from './snapshot.js';

export default snapshotSource({
  id: 'luma',
  name: 'Luma',
  url: 'https://luma.com/nyc',
  file: 'luma-events.json',
});
