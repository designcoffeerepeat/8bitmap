// Zoomers: the easter egg characters that appear when the map is zoomed all the way in on their spot.
// The shared pieces are in kit.js; each file below holds a few of them.

import { initTimesSquareZoomer } from './times-square.js';
import { initStreetZoomers } from './street.js';
import { initBridgeAndRiverZoomers } from './bridge-and-river.js';

export function initZoomers(map) {
  initTimesSquareZoomer(map);
  initStreetZoomers(map);
  initBridgeAndRiverZoomers(map);
}
