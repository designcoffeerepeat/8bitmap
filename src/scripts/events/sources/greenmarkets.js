// NYC farmers markets (https://data.cityofnewyork.us/d/8vwk-6iz2).
//
// tools/fetch_greenmarkets.py reads the Health Department's yearly list of
// Greenmarkets, farmers markets and farm stands on NYC Open Data, keeps the
// ones open that day (by their market days and hours) and writes
// public/data/greenmarkets-events.json. Markets carry coordinates.

import { snapshotSource } from './snapshot.js';

export default snapshotSource({
  id: 'greenmarkets',
  name: 'NYC Farmers Markets',
  url: 'https://data.cityofnewyork.us/d/8vwk-6iz2',
  file: 'greenmarkets-events.json',
});
