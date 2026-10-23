// Times Square: the tiles cleared for it in geo.js (Broadway and 7th Ave from 42nd to 48th St, and the block east of it)
// are paved as one open plaza. The billboard and buildings around it come later.

import * as THREE from 'three';
import { COLS, ROWS, LANDMARKS, clearedTiles } from './map/geo.js';

const GROUND_H = 0.35;
const PAVING = '#a9a6b8';
const KERB = '#8c8fa3';

export function initTimesSquare(map) {
  const tsq = LANDMARKS.find((l) => l.id === 'tsq');
  const tiles = clearedTiles(tsq);
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ flatShading: true }), tiles.length * 2);
  const m = new THREE.Matrix4();
  const colour = new THREE.Color();
  tiles.forEach(({ col, row }, k) => {
    const x = col + 0.5 - COLS / 2;
    const z = row + 0.5 - ROWS / 2;
    // a kerb under each tile and lighter paving on top, so the plaza reads as one raised square
    m.compose(new THREE.Vector3(x, GROUND_H + 0.03, z), new THREE.Quaternion(), new THREE.Vector3(1, 0.06, 1));
    mesh.setMatrixAt(k * 2, m);
    mesh.setColorAt(k * 2, colour.set(KERB));
    m.compose(new THREE.Vector3(x, GROUND_H + 0.08, z), new THREE.Quaternion(), new THREE.Vector3(0.92, 0.04, 0.92));
    mesh.setMatrixAt(k * 2 + 1, m);
    mesh.setColorAt(k * 2 + 1, colour.set(PAVING));
  });
  map.world.add(mesh);
}
