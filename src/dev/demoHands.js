// Solo para desarrollo: genera parámetros de manos simuladas, con la misma forma
// que devuelve GestureMapper, para probar los efectos sin cámara.
//   ?demo=fist | open | pinch | two
import * as THREE from 'three';

const ramp = (t) => Math.min(1, t / 1.5); // aparece en 1,5 s

export function createDemoHands(kind) {
  const a = { presence: 0, position: new THREE.Vector3(), openness: 1, pinch: 0, gesture: 'abierta' };
  const b = { presence: 0, position: new THREE.Vector3(), openness: 1, pinch: 0, gesture: 'abierta' };
  const params = { hands: [a, b], galaxyScale: 1, pinchMax: 0, anyPresent: true };

  return function update(timeMs) {
    const t = timeMs / 1000;
    a.presence = ramp(t);
    a.position.set(4 + Math.sin(t * 0.7) * 1.5, 1.5, 3);

    if (kind === 'fist') Object.assign(a, { openness: 0, pinch: 0, gesture: 'puño' });
    if (kind === 'open') Object.assign(a, { openness: 1, pinch: 0, gesture: 'abierta' });
    if (kind === 'pinch') Object.assign(a, { openness: 0.8, pinch: 1, gesture: 'pellizco' });
    params.pinchMax = a.pinch * a.presence;

    if (kind === 'two') {
      Object.assign(a, { openness: 0, gesture: 'puño' });
      Object.assign(b, { presence: ramp(t), openness: 1, gesture: 'abierta' });
      a.position.set(-6, 1, 2);
      b.position.set(6, -1, 2);
      params.galaxyScale = 1 + 0.5 * ramp(t);
    }
    return params;
  };
}
