// Shared trigger for the full-zoom easter eggs (the Brighton Beach sunbather, the flying van).
// A scene starts once its spot has sat near the middle of the screen at full zoom for a
// moment, steps every frame after that, and is cleared when the map zooms back out to about
// the default view, so it plays again from the start next time.

import * as THREE from 'three';

const IN_VIEW = 0.6; // the spot has to be this close to the middle of the screen (1 = the edge)
const RESET_ZOOM = 1.6; // zooming out past this (the default view is 1.15) clears the scene
const SETTLE = 0.4; // seconds at full zoom before it starts, so a pinch or scroll has finished

// spot: a world position; start(map) returns { step(dt), dispose() }
export function watchZoomEgg(map, spot, start) {
  let scene = null;
  let held = 0; // how long the spot has been in view at full zoom
  const ndc = new THREE.Vector3();

  map.onFrame((dt) => {
    if (scene) {
      if (map.zoom < RESET_ZOOM) {
        scene.dispose();
        scene = null;
      } else {
        scene.step(dt);
      }
      return;
    }
    const atMax = map.zoom >= map.maxZoom * 0.98;
    ndc.copy(spot).project(map.camera);
    const inView = Math.abs(ndc.x) < IN_VIEW && Math.abs(ndc.y) < IN_VIEW;
    held = atMax && inView ? held + dt : 0;
    if (held >= SETTLE) {
      held = 0;
      scene = start(map);
    }
  });
}
