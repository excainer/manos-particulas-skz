// Detector del gesto "corazón con las dos manos".
//
//    ╭─6─╮   ╭─6─╮     6 = articulación media del índice: cima de los lóbulos
//   5     8 8     5    8 = puntas de los índices: se tocan en el valle superior
//    \           /
//     \         /
//      4 ───── 4       4 = puntas de los pulgares: se tocan abajo, en la punta
//
// Módulo puro (sin Three.js ni MediaPipe) para poder probarlo en Node.
//
// Se trabaja con los `landmarks` de la imagen (0–1), NO con los `worldLandmarks`:
// estos últimos tienen el origen en el centro de cada mano y no permiten comparar
// una mano con la otra. La x se corrige por la proporción del vídeo y todas las
// distancias se dividen por S (tamaño medio de la mano: muñeca → base del corazón),
// así el resultado no depende de lo cerca que esté la persona.
//
// Cada criterio da un valor suave entre 0 y 1; la puntuación es su producto.
// Una máquina de estados exige mantener el gesto un momento y dispara UNA vez
// por gesto (evento `triggered`); para volver a dispararse hay que deshacerlo.

import { LANDMARK as L } from './landmarks.js';

// Umbrales en unidades de S. Cada par [a, b] es una rampa suave: el criterio vale
// 0 en `a` y 1 en `b` (si a > b, la rampa es descendente).
export const HEART_CONFIG = {
  indexGap: [0.9, 0.45], //    puntas de los índices juntas
  thumbGap: [0.9, 0.45], //    puntas de los pulgares juntas
  height: [0.35, 0.8], //      unión de pulgares claramente por debajo de la de índices
  // Punta del pulgar no por encima de su base. Tolera pulgares casi horizontales
  // (habituales en el corazón y sensibles al giro); su misión es descartar los
  // pulgares hacia arriba (manos en oración: ≈ −0,55).
  thumbsDown: [-0.25, 0.05],
  lobes: [-0.1, 0.15], //      articulación media del índice por encima de su punta
  tilt: [1.0, 0.5], //         eje del corazón casi vertical (desfase horizontal índices–pulgares)
  side: [0.0, 0.35], //        una muñeca a cada lado del eje
  sizeRatio: [0.45, 0.7], //   manos de tamaño parecido (misma distancia a la cámara)

  enter: 0.6, //    puntuación para empezar a contar
  exit: 0.3, //     puntuación por debajo de la cual el gesto se considera deshecho
  holdMs: 400, //   tiempo que hay que mantener el gesto para dispararlo
  releaseMs: 300, // tiempo deshecho necesario para rearmar el detector
  lostGraceMs: 250, // pérdida breve de una mano tolerada (pasa al juntar las manos)
  cooldownMs: 3000, // tiempo mínimo entre dos disparos
};

export const CRITERIA_LABELS = {
  indices: 'índices juntos',
  pulgares: 'pulgares juntos',
  altura: 'pulgares debajo',
  pulgaresAbajo: 'pulgares hacia abajo',
  lobulos: 'lóbulos arriba',
  simetria: 'simetría',
};

const clamp01 = (v) => Math.min(1, Math.max(0, v));
// Rampa suave generalizada: 0 en a, 1 en b (funciona también con a > b).
const ramp = (v, [a, b]) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
const mid = (p, q) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });

const EMPTY = Object.freeze({ score: 0, reason: 'faltan manos', criteria: null, metrics: null, center: null, size: 0 });

// Análisis instantáneo de un fotograma.
// hands: [{ landmarks: [{x, y, z} × 21], ... }] (salida de HandTracker.detect)
// Devuelve { score, criteria, metrics, center (imagen 0–1), size (imagen), reason }.
export function analyzeHeart(hands, videoAspect = 4 / 3, cfg = HEART_CONFIG) {
  if (!hands || hands.length < 2) return EMPTY;

  // Coordenadas con la x corregida por la proporción del vídeo (distancias reales).
  const [A, B] = hands
    .slice(0, 2)
    .map((h) => h.landmarks.map((p) => ({ x: p.x * videoAspect, y: p.y })))
    // Manos por posición horizontal, no por la etiqueta izquierda/derecha de MediaPipe
    // (con la cámara sin espejo sale invertida).
    .sort((a, b) => a[L.WRIST].x + a[L.MIDDLE_MCP].x - (b[L.WRIST].x + b[L.MIDDLE_MCP].x));

  const sizeA = dist(A[L.WRIST], A[L.MIDDLE_MCP]);
  const sizeB = dist(B[L.WRIST], B[L.MIDDLE_MCP]);
  const S = (sizeA + sizeB) / 2;
  if (!(S > 1e-6)) return { ...EMPTY, reason: 'manos degeneradas' };

  const iMid = mid(A[L.INDEX_TIP], B[L.INDEX_TIP]);
  const tMid = mid(A[L.THUMB_TIP], B[L.THUMB_TIP]);
  const axisX = (iMid.x + tMid.x) / 2;

  // En la imagen la y crece hacia abajo.
  const metrics = {
    indexGap: dist(A[L.INDEX_TIP], B[L.INDEX_TIP]) / S,
    thumbGap: dist(A[L.THUMB_TIP], B[L.THUMB_TIP]) / S,
    height: (tMid.y - iMid.y) / S,
    thumbsDown: Math.min(A[L.THUMB_TIP].y - A[L.THUMB_MCP].y, B[L.THUMB_TIP].y - B[L.THUMB_MCP].y) / S,
    lobes: Math.min(A[L.INDEX_TIP].y - A[L.INDEX_PIP].y, B[L.INDEX_TIP].y - B[L.INDEX_PIP].y) / S,
    tilt: Math.abs(iMid.x - tMid.x) / S,
    side: Math.min(axisX - A[L.WRIST].x, B[L.WRIST].x - axisX) / S,
    sizeRatio: Math.min(sizeA, sizeB) / Math.max(sizeA, sizeB),
  };

  const criteria = {
    indices: ramp(metrics.indexGap, cfg.indexGap),
    pulgares: ramp(metrics.thumbGap, cfg.thumbGap),
    altura: ramp(metrics.height, cfg.height),
    pulgaresAbajo: ramp(metrics.thumbsDown, cfg.thumbsDown),
    lobulos: ramp(metrics.lobes, cfg.lobes),
    simetria: ramp(metrics.tilt, cfg.tilt) * ramp(metrics.side, cfg.side) * ramp(metrics.sizeRatio, cfg.sizeRatio),
  };

  const score = Object.values(criteria).reduce((acc, v) => acc * v, 1);
  const centerAspect = mid(iMid, tMid);

  return {
    score,
    reason: score >= cfg.enter ? 'corazón' : weakestCriterion(criteria),
    criteria,
    metrics,
    center: { x: centerAspect.x / videoAspect, y: centerAspect.y }, // de vuelta a 0–1
    size: dist(iMid, tMid), // alto del corazón en unidades de imagen (y)
  };
}

function weakestCriterion(criteria) {
  let worst = null;
  for (const [k, v] of Object.entries(criteria)) if (worst === null || v < criteria[worst]) worst = k;
  return `falla: ${CRITERIA_LABELS[worst]}`;
}

// Estados: 'idle' → 'candidate' (mantener holdMs) → 'fired' (esperar a que se deshaga) → 'idle'
export class HeartDetector {
  constructor(config = {}) {
    this.cfg = { ...HEART_CONFIG, ...config };
    this.reset();
  }

  reset() {
    this.state = 'idle';
    this.analysis = EMPTY;
    this.lastHands = undefined;
    this.candidateSince = null;
    this.missingSince = null;
    this.lowSince = null;
    this.lastTrigger = -Infinity;
  }

  // Llamar una vez por fotograma. Solo recalcula cuando llega un fotograma nuevo
  // de la cámara (HandTracker devuelve el mismo array si no hay novedad).
  // Devuelve { state, triggered, score, analysis }; triggered es true solo en el
  // fotograma en que se reconoce el corazón.
  update(hands, timeMs, videoAspect = 4 / 3) {
    const cfg = this.cfg;
    if (hands !== this.lastHands) {
      this.lastHands = hands;
      this.analysis = analyzeHeart(hands, videoAspect, cfg);
    }
    const twoHands = (hands?.length ?? 0) >= 2;
    const score = this.analysis.score;
    let triggered = false;

    switch (this.state) {
      case 'idle':
        if (score >= cfg.enter && timeMs - this.lastTrigger >= cfg.cooldownMs) {
          this.state = 'candidate';
          this.candidateSince = timeMs;
          this.missingSince = null;
        }
        break;

      case 'candidate':
        if (!twoHands) {
          // Al juntar las manos MediaPipe a veces pierde una un instante.
          this.missingSince ??= timeMs;
          if (timeMs - this.missingSince > cfg.lostGraceMs) this.state = 'idle';
          break;
        }
        this.missingSince = null;
        if (score < cfg.exit) {
          this.state = 'idle';
        } else if (timeMs - this.candidateSince >= cfg.holdMs) {
          this.state = 'fired';
          triggered = true;
          this.lastTrigger = timeMs;
          this.lowSince = null;
        }
        break;

      case 'fired':
        // No se vuelve a disparar hasta que el gesto se deshace durante releaseMs.
        if (!twoHands || score < cfg.exit) {
          this.lowSince ??= timeMs;
          if (timeMs - this.lowSince >= cfg.releaseMs) this.state = 'idle';
        } else {
          this.lowSince = null;
        }
        break;
    }

    return { state: this.state, triggered, score, analysis: this.analysis };
  }
}
