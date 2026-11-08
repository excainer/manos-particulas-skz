// Secuencia especial: forma del corazón, línea de tiempo de 10 s y convivencia con los gestos.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildHeartTargets, heartField } from '../src/scene/heartShape.js';
import { ParticleSystem } from '../src/scene/particles.js';
import { GestureMapper } from '../src/tracking/gestureMapper.js';
import { messageVisible, HEART_MESSAGE } from '../src/ui/heartMessage.js';

describe('frase del momento', () => {
  test('texto exacto', () => {
    assert.equal(HEART_MESSAGE.join(' '), 'Antes de ti, estaba perdido en la oscuridad, sin ningún lugar adonde ir');
  });

  test('con la canción (183,3 s): aparece con el corazón formado y se va antes del regreso', () => {
    const d = 183.3;
    assert.equal(messageVisible(1.0, d), false, 'todavía formándose');
    assert.equal(messageVisible(2.5, d), true, 'corazón formado');
    assert.equal(messageVisible(120, d), true, 'a mitad de la canción');
    assert.equal(messageVisible(d - 2.0, d), false, 'el corazón ya vuelve a la galaxia');
  });

  test('sin música (10 s) también se ve unos segundos', () => {
    const visible = [];
    for (let t = 0; t < 10; t += 0.1) if (messageVisible(t, 10)) visible.push(t);
    assert.ok(visible.length * 0.1 > 4.5, `visible ${(visible.length * 0.1).toFixed(1)} s`);
  });
});

describe('forma del corazón', () => {
  const pts = buildHeartTargets(5000);

  test('todos los puntos están dentro (o en) la superficie del corazón', () => {
    for (let i = 0; i < pts.length; i += 3) {
      assert.ok(heartField(pts[i], pts[i + 1] + 0.1, pts[i + 2]) <= 1e-4, `punto ${i / 3} fuera`);
    }
  });

  test('proporciones de corazón: más ancho que profundo, punta abajo y lóbulos arriba', () => {
    const xs = [], ys = [], zs = [];
    for (let i = 0; i < pts.length; i += 3) xs.push(pts[i]), ys.push(pts[i + 1]), zs.push(pts[i + 2]);
    const span = (a) => Math.max(...a) - Math.min(...a);
    assert.ok(span(xs) > 2 && span(xs) < 2.6, `ancho ${span(xs)}`);
    assert.ok(span(ys) > 1.9 && span(ys) < 2.5, `alto ${span(ys)}`);
    assert.ok(span(zs) < span(xs) * 0.7, `profundidad ${span(zs)}`);
    // Abajo (punta) es estrecho; arriba (lóbulos) es ancho.
    const widthAt = (y0) => span(xs.filter((_, i) => Math.abs(ys[i] - y0) < 0.08));
    assert.ok(widthAt(-0.95) < widthAt(0.6) * 0.5, 'la punta debe ser mucho más estrecha que los lóbulos');
  });

  test('capa cerca de la superficie: el contorno se lee bien', () => {
    let nearSurface = 0;
    for (let i = 0; i < pts.length; i += 3) {
      const [x, y, z] = [pts[i], pts[i + 1] + 0.1, pts[i + 2]];
      if (heartField(x * 1.3, y * 1.3, z * 1.3) > 0) nearSurface++; // al agrandar un 30 % ya sale fuera
    }
    assert.ok(nearSurface / (pts.length / 3) > 0.95);
  });
});

function makeSystem() {
  const ps = new ParticleSystem(new THREE.Scene(), 2000);
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 300);
  camera.position.set(0, 7, 18);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return { ps, camera, u: ps.heartUniforms };
}

describe('línea de tiempo de la secuencia (10 s)', () => {
  test('sin activar, el corazón está inactivo', () => {
    const { ps, camera, u } = makeSystem();
    ps.update(1000, {}, camera);
    assert.equal(u.uHeartTime.value, -1);
    assert.equal(ps.heartPlaying, false);
  });

  test('se forma, late, vuelve y termina a los 10 s, sin manos (las manos pueden bajarse)', () => {
    const { ps, camera, u } = makeSystem();
    ps.update(0, {}, camera);
    assert.equal(ps.playHeart(1000), true);
    const at = (s) => {
      ps.update(1000 + s * 1000, {}, camera); // params vacíos: no hay ninguna mano
      return { t: u.uHeartTime.value, amount: ps.heartAmount, beat: u.uHeartBeat.value };
    };
    assert.ok(at(0.5).amount < 0.2, 'al principio apenas se ha formado');
    const mid = at(5);
    assert.ok(mid.amount > 0.99, `a mitad está completo (${mid.amount})`);
    // El latido aparece en la fase central.
    let maxBeat = 0;
    for (let s = 3; s < 7; s += 0.02) maxBeat = Math.max(maxBeat, at(s).beat);
    assert.ok(maxBeat > 0.9, `latido máximo ${maxBeat}`);
    // El regreso ocupa de 8 a 10 s: va bajando y llega a cero al final.
    const a85 = at(8.5).amount;
    const a95 = at(9.5).amount;
    assert.ok(a85 < 1 && a95 < a85 && a95 < 0.25, `regreso: ${a85.toFixed(2)} → ${a95.toFixed(2)}`);
    assert.ok(at(9.95).amount < 0.01, 'al final ha vuelto a la galaxia');
    assert.equal(at(10.2).t, -1, 'a los 10 s termina');
    assert.equal(ps.heartPlaying, false);
  });

  test('duración de la canción (3 min 10 s): late todo el tiempo y regresa en los 2 últimos segundos', () => {
    const { ps, camera, u } = makeSystem();
    const song = 190;
    ps.playHeart(0, { duration: song });
    const at = (s) => (ps.update(s * 1000, {}, camera), { amount: ps.heartAmount, t: u.uHeartTime.value });
    assert.equal(u.uHeartLeaveAt.value, song - 2);
    let maxBeat = 0;
    for (let s = 120; s < 125; s += 0.02) at(s), (maxBeat = Math.max(maxBeat, u.uHeartBeat.value));
    assert.ok(maxBeat > 0.9, `a los 2 minutos sigue latiendo (${maxBeat})`);
    assert.ok(at(187.5).amount > 0.99, 'antes del final sigue completo');
    assert.ok(at(189).amount < 1, 'en los últimos 2 s regresa');
    assert.equal(at(190.5).t, -1, 'termina con la canción');
    assert.equal(ps.heartPlaying, false);
  });

  test('sin duración válida (p. ej. sin música) usa 10 s; duraciones absurdas se corrigen', () => {
    const { ps } = makeSystem();
    ps.playHeart(0, { duration: NaN });
    assert.equal(ps.heartDuration, 10);
    const b = makeSystem().ps;
    b.playHeart(0, { duration: 1 });
    assert.equal(b.heartDuration, 6, 'mínimo 6 s para que dé tiempo a formarse y volver');
  });

  test('regresión: inicio registrado unos ms por delante del reloj de fotogramas → NO se cancela', () => {
    // En el navegador, el tiempo del fotograma (requestAnimationFrame) puede ir unos ms por
    // detrás de performance.now(). Antes eso daba un tiempo negativo y apagaba el corazón.
    const { ps, camera, u } = makeSystem();
    ps.playHeart(5016, { duration: 183.3 });
    ps.update(5004, {}, camera); // fotograma con marca de tiempo 12 ms "anterior"
    assert.equal(ps.heartPlaying, true, 'el corazón debe seguir activo');
    assert.equal(u.uHeartTime.value, 0);
    ps.update(6004, {}, camera);
    assert.ok(ps.heartPlaying && u.uHeartTime.value > 0.9);
  });

  test('si la música no arranca, la secuencia en curso se acorta a 10 s sin reiniciarse', () => {
    const { ps, camera, u } = makeSystem();
    ps.playHeart(0, { duration: 183.3 });
    ps.update(1000, {}, camera);
    ps.setHeartDuration(10);
    assert.equal(ps.heartDuration, 10);
    assert.equal(u.uHeartLeaveAt.value, 8);
    ps.update(5000, {}, camera);
    assert.ok(Math.abs(u.uHeartTime.value - 5) < 1e-9, 'sigue por donde iba');
    ps.update(10200, {}, camera);
    assert.equal(ps.heartPlaying, false, 'termina a los 10 s');
  });

  test('activación única: mientras se reproduce, otra activación se ignora', () => {
    const { ps, camera, u } = makeSystem();
    ps.playHeart(0);
    ps.update(3000, {}, camera);
    assert.equal(ps.playHeart(3000), false);
    ps.update(4000, {}, camera);
    assert.ok(Math.abs(u.uHeartTime.value - 4) < 1e-9, 'la secuencia no se reinicia');
    ps.update(10500, {}, camera);
    assert.equal(ps.playHeart(10500), true, 'al terminar se puede volver a lanzar');
  });

  test('centrado en el punto al que mira la cámara y de frente a ella', () => {
    const { ps, camera, u } = makeSystem();
    const target = new THREE.Vector3(1, 2, 3);
    ps.setHeartCenter(target);
    ps.playHeart(0);
    ps.update(2000, {}, camera);
    assert.ok(u.uHeartCenter.value.equals(target));
    const toCamera = camera.position.clone().sub(target).normalize();
    assert.ok(u.uHeartFwd.value.dot(new THREE.Vector3(0, 7, 18).normalize()) > 0.99 || u.uHeartFwd.value.dot(toCamera) > 0.9);
    assert.ok(u.uHeartScale.value > 0);
  });
});

// Mano abierta sintética (worldLandmarks en metros).
function openHand(handedness, dx) {
  const p = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  const mcpX = [-0.035, -0.012, 0.012, 0.033];
  [5, 9, 13, 17].forEach((m, k) => {
    p[m] = { x: mcpX[k], y: -0.09, z: 0 };
    for (let j = 1; j <= 3; j++) p[m + j] = { x: mcpX[k] * (1 + 0.3 * (j / 3)), y: -0.09 - 0.08 * (j / 3), z: 0 };
  });
  p[4] = { x: -0.08, y: -0.08, z: 0 };
  const landmarks = p.map((q) => ({ x: 0.5 + q.x * 1.6 + dx, y: 0.6 + q.y * 1.6, z: 0 }));
  return { handedness, score: 0.99, landmarks, worldLandmarks: p };
}

function cam() {
  const c = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 300);
  c.position.set(0, 7, 18);
  c.lookAt(0, 0, 0);
  c.updateMatrixWorld();
  return c;
}

describe('convivencia con los cuatro gestos', () => {
  const hands = [openHand('Left', -0.3), openHand('Right', 0.3)];

  test('sin gesto especial (suppress = 0) la salida es idéntica a la de siempre', () => {
    const a = new GestureMapper(cam());
    const b = new GestureMapper(cam());
    let pa, pb;
    for (let f = 0; f < 90; f++) {
      pa = a.update([...hands], f * 16.7);
      pb = b.update([...hands], f * 16.7, { suppress: 0 });
    }
    assert.deepEqual(
      pa.hands.map((h) => [h.presence, h.gesture]),
      pb.hands.map((h) => [h.presence, h.gesture]),
    );
    assert.equal(pa.galaxyScale, pb.galaxyScale);
  });

  test('durante el gesto: efectos de las manos apagados, escala congelada, gesto "corazón"', () => {
    const m = new GestureMapper(cam());
    let p;
    for (let f = 0; f < 90; f++) p = m.update([...hands], f * 16.7);
    const scaleBefore = p.galaxyScale;
    // Las manos se juntan mientras forman el gesto: sin supresión la galaxia se encogería.
    const together = [openHand('Left', -0.03), openHand('Right', 0.03)];
    for (let f = 90; f < 150; f++) p = m.update([...together], f * 16.7, { suppress: 1 });
    assert.ok(p.hands.every((h) => h.presence < 0.01), 'sin fuerzas de las manos');
    assert.ok(p.hands.every((h) => h.gesture === 'corazón'));
    assert.ok(Math.abs(p.galaxyScale - scaleBefore) < 0.02, `escala ${scaleBefore} → ${p.galaxyScale}`);
  });

  test('al soltar el gesto no salta la onda expansiva', () => {
    const { ps, camera } = makeSystem();
    const hand = { presence: 1, position: new THREE.Vector3(2, 0, 0), openness: 0, pinch: 0, gesture: 'corazón' };
    const params = { hands: [hand, { ...hand, position: new THREE.Vector3(-2, 0, 0) }] };
    for (let t = 0; t < 1000; t += 16) ps.update(t, params, camera);
    params.hands.forEach((h) => Object.assign(h, { gesture: 'abierta', openness: 1 }));
    ps.update(1016, params, camera);
    assert.deepEqual(ps.waveAge, [-1, -1]);
  });
});
