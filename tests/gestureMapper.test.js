// Regresión de los cuatro gestos existentes (abierta, puño, pellizco, dos manos).
// El detector del corazón no debe alterarlos.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GestureMapper } from '../src/tracking/gestureMapper.js';

// Mano vertical en metros (worldLandmarks), dedos hacia arriba.
function hand({ fingers = 'open', pinch = false, dx = 0, handedness = 'Right' }) {
  const p = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  const mcpX = [-0.035, -0.012, 0.012, 0.033];
  [5, 9, 13, 17].forEach((m, k) => {
    p[m] = { x: mcpX[k], y: -0.09, z: 0 };
    const len = [0.075, 0.085, 0.08, 0.065][k];
    for (let j = 1; j <= 3; j++) {
      const f = j / 3;
      p[m + j] =
        fingers === 'open'
          ? { x: mcpX[k] * (1 + 0.3 * f), y: -0.09 - len * f, z: 0 }
          : { x: mcpX[k] * 0.9, y: -0.09 + 0.045 * f, z: -0.03 * Math.sin(Math.PI * f) };
    }
  });
  p[1] = { x: -0.03, y: -0.02, z: 0 };
  p[2] = { x: -0.05, y: -0.04, z: 0 };
  p[3] = { x: -0.065, y: -0.06, z: 0 };
  p[4] = fingers === 'open' ? { x: -0.08, y: -0.08, z: 0 } : { x: -0.01, y: -0.07, z: -0.03 };
  if (pinch) {
    p[7] = { x: -0.05, y: -0.14, z: 0 };
    p[8] = { x: -0.06, y: -0.12, z: -0.01 };
    p[4] = { x: -0.065, y: -0.115, z: -0.01 };
  }
  const landmarks = p.map((q) => ({ x: 0.5 + q.x * 1.6 + dx, y: 0.6 + q.y * 1.6, z: q.z }));
  return { handedness, score: 0.99, landmarks, worldLandmarks: p };
}

function camera() {
  const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 300);
  cam.position.set(0, 7, 18);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  return cam;
}

// Simula 1,5 s de fotogramas nuevos con la misma mano.
function settle(hands) {
  const m = new GestureMapper(camera());
  let params;
  for (let f = 0; f < 90; f++) params = m.update([...hands], f * 16.7);
  return params;
}

describe('gestos existentes', () => {
  test('mano abierta', () => {
    const h = settle([hand({ fingers: 'open' })]).hands[1];
    assert.equal(h.gesture, 'abierta');
    assert.ok(h.openness > 0.65 && h.pinch < 0.1);
  });

  test('puño', () => {
    const h = settle([hand({ fingers: 'fist' })]).hands[1];
    assert.equal(h.gesture, 'puño');
    assert.ok(h.openness < 0.3);
  });

  test('pellizco', () => {
    const h = settle([hand({ fingers: 'open', pinch: true })]).hands[1];
    assert.equal(h.gesture, 'pellizco');
    assert.ok(h.pinch > 0.6);
  });

  test('dos manos: juntas encogen la galaxia, separadas la agrandan', () => {
    const near = settle([hand({ dx: -0.05, handedness: 'Left' }), hand({ dx: 0.05 })]);
    const far = settle([hand({ dx: -0.35, handedness: 'Left' }), hand({ dx: 0.35 })]);
    assert.ok(near.galaxyScale < 0.8, `escala juntas ${near.galaxyScale}`);
    assert.ok(far.galaxyScale > 1.4, `escala separadas ${far.galaxyScale}`);
  });
});
