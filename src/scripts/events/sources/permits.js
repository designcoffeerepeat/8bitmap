// NYC permitted street events (https://data.cityofnewyork.us/d/tvpp-9vvx).
//
// tools/fetch_permits.py reads one day of the city's permit list on NYC Open
// Data (street fairs, parades, plaza events, greenmarkets), places each street
// or park with NYC GeoSearch and writes public/data/permits-events.json.

import { snapshotSource } from './snapshot.js';

export default snapshotSource({
  id: 'permits',
  name: 'NYC Street Events',
  url: 'https://data.cityofnewyork.us/d/tvpp-9vvx',
  file: 'permits-events.json',
});
