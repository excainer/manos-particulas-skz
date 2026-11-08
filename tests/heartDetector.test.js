// Pruebas del detector del corazón con manos sintéticas.
//   npm test
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeHeart, HeartDetector, HEART_CONFIG } from '../src/tracking/heartDetector.js';
import { GESTURES, toHands, randomVariation, rng } from './helpers/syntheticHands.js';

const { enter, exit } = HEART_CONFIG;
const FRAME = 1000 / 30; // la webcam entrega ~30 fps

// Puntuaciones de N variaciones aleatorias (con semilla) de un gesto.
function scores(gesture, n, seed, variation = {}) {
  const rand = rng(seed);
  return Array.from({ length: n }, () => {
    const v = randomVariation(rand, variation);
    return analyzeHeart(toHands(GESTURES[gesture](), v), v.aspect).score;
  });
}

describe('análisis instantáneo: corazones', () => {
  test('corazón ideal centrado → puntuación alta', () => {
    const a = analyzeHeart(toHands(GESTURES.heart()), 4 / 3);
    assert.ok(a.score > 0.95, `puntuación ${a.score}`);
    assert.equal(a.reason, 'corazón');
    assert.ok(Math.abs(a.center.x - 0.5) < 1e-6 && Math.abs(a.center.y - 0.5) < 0.1, 'centro en medio de la imagen');
  });

  test('500 variaciones (posición, tamaño, giro ±12°, 4:3 y 16:9, ruido, orden) → todas reconocidas', () => {
    const s = scores('heart', 500, 1);
    const min = Math.min(...s);
    assert.ok(min >= enter, `puntuación mínima ${min.toFixed(3)} < ${enter}`);
  });

  test('no depende del orden ni de las etiquetas izquierda/derecha', () => {
    const hands = toHands(GESTURES.heart());
    const swapped = [hands[1], hands[0]].map((h) => ({ ...h, handedness: h.handedness === 'Left' ? 'Right' : 'Left' }));
    assert.ok(Math.abs(analyzeHeart(hands).score - analyzeHeart(swapped).score) < 1e-9);
  });

  test('no depende de la distancia a la cámara (tamaño en la imagen)', () => {
    const small = analyzeHeart(toHands(GESTURES.heart(), { scale: 0.05 })).score;
    const big = analyzeHeart(toHands(GESTURES.heart(), { scale: 0.25 })).score;
    assert.ok(Math.abs(small - big) < 1e-9);
  });

  test('ruido fuerte (σ = 0,08 S): la gran mayoría sigue reconocida', () => {
    const s = scores('heart', 300, 2, { noise: 0.08 });
    const ok = s.filter((v) => v >= enter).length / s.length;
    assert.ok(ok >= 0.95, `solo ${(ok * 100).toFixed(1)} % reconocidos`);
  });
});

describe('análisis instantáneo: falsos positivos', () => {
  const negatives = {
    praying: 'manos en oración',
    twoPinches: 'dos pellizcos juntos',
    openSideBySide: 'manos abiertas, pulgares juntos',
    triangle: 'triángulo con los dedos estirados',
    invertedHeart: 'corazón invertido',
    heartHalvesApart: 'medio corazón en cada mano, separadas',
    halfHeartAndOpenHand: 'medio corazón + mano abierta',
  };

  for (const [gesture, label] of Object.entries(negatives)) {
    test(`${label} → nunca llega al umbral (300 variaciones)`, () => {
      const max = Math.max(...scores(gesture, 300, 3));
      assert.ok(max < exit, `puntuación máxima ${max.toFixed(3)} ≥ ${exit}`);
    });
  }

  test('una sola mano → 0', () => {
    assert.equal(analyzeHeart(toHands(GESTURES.oneHandOnly())).score, 0);
  });

  test('sin manos → 0', () => {
    assert.equal(analyzeHeart([]).score, 0);
    assert.equal(analyzeHeart(null).score, 0);
  });
});

// Simula una secuencia de fotogramas de la cámara a 30 fps.
// timeline: [[duraciónMs, gesto | null], ...]
function run(timeline, detector = new HeartDetector(), seed = 7) {
  const rand = rng(seed);
  const events = [];
  let t = 0;
  for (const [duration, gesture] of timeline) {
    const end = t + duration;
    for (; t < end; t += FRAME) {
      const hands = gesture ? toHands(GESTURES[gesture](), { noise: 0.03, rand }) : [];
      const r = detector.update(hands, t, 4 / 3);
      if (r.triggered) events.push(Math.round(t));
    }
  }
  return events;
}

describe('máquina de estados (activación única)', () => {
  test('mantener el corazón 2 s → se dispara UNA vez, tras ~400 ms', () => {
    const events = run([[300, null], [2000, 'heart']]);
    assert.equal(events.length, 1);
    const delay = events[0] - 300;
    assert.ok(delay >= HEART_CONFIG.holdMs && delay < HEART_CONFIG.holdMs + 100, `retardo ${delay} ms`);
  });

  test('corazón fugaz (200 ms) → no se dispara', () => {
    assert.equal(run([[200, 'heart'], [1000, null]]).length, 0);
  });

  test('mantenerlo 10 s → sigue siendo un único disparo', () => {
    assert.equal(run([[10000, 'heart']]).length, 1);
  });

  test('deshacer y repetir pasado el tiempo de espera → se dispara de nuevo', () => {
    const events = run([[1000, 'heart'], [3000, 'openSideBySide'], [1000, 'heart']]);
    assert.equal(events.length, 2);
  });

  test('repetirlo enseguida → espera al final del tiempo de espera (3 s)', () => {
    const events = run([[1000, 'heart'], [500, null], [4000, 'heart']]);
    assert.equal(events.length, 2);
    assert.ok(events[1] - events[0] >= HEART_CONFIG.cooldownMs, `separación ${events[1] - events[0]} ms`);
  });

  test('se pierde una mano 150 ms mientras se forma → se dispara igual', () => {
    const events = run([[200, 'heart'], [150, 'oneHandOnly'], [600, 'heart']]);
    assert.equal(events.length, 1);
  });

  test('se pierde una mano 500 ms mientras se forma → se reinicia la cuenta', () => {
    const detector = new HeartDetector();
    const events = run([[300, 'heart'], [500, 'oneHandOnly'], [300, 'heart']], detector);
    assert.equal(events.length, 0, 'no debe sumar el tiempo anterior a la pérdida');
  });

  test('el mismo array de manos repetido (sin fotograma nuevo) no recalcula ni rompe', () => {
    const detector = new HeartDetector();
    const hands = toHands(GESTURES.heart());
    let fired = 0;
    for (let t = 0; t < 1000; t += 16) if (detector.update(hands, t).triggered) fired++;
    assert.equal(fired, 1);
  });

  test('gestos que no son corazón durante 10 s → ningún disparo', () => {
    const timeline = ['praying', 'twoPinches', 'openSideBySide', 'triangle', 'invertedHeart', 'heartHalvesApart'].map(
      (g) => [1700, g],
    );
    assert.equal(run(timeline).length, 0);
  });
});
