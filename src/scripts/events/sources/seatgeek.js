// SeatGeek (https://seatgeek.com/cities/new-york).
//
// tools/fetch_seatgeek.py reads one day from the SeatGeek Platform API (venues
// carry coordinates) and writes public/data/seatgeek-events.json. It needs a
// SEATGEEK_CLIENT_ID, so the file only exists once a run has had the key.

import { snapshotSource } from './snapshot.js';

export default snapshotSource({
  id: 'seatgeek',
  name: 'SeatGeek',
  url: 'https://seatgeek.com/cities/new-york',
  file: 'seatgeek-events.json',
  optional: true,
});
