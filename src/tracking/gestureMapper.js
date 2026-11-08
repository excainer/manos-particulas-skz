// Traduce los puntos de la mano a parámetros de alto nivel para las partículas.
// La escena no sabe nada de MediaPipe: solo recibe lo que devuelve update().
//
// Por mano (hasta 2, en "huecos" fijos según sea izquierda/derecha):
//   presence  0–1  aparece/desaparece de forma suave (sin saltos)
//   position  Vector3 en el mundo 3D, bajo la mano en pantalla
//   openness  0 = puño, 1 = mano abierta
//   pinch     0–1  pulgar e índice juntos (con los demás dedos estirados)
//   gesture   'abierta' | 'puño' | 'pellizco' | 'neutra'
// Global:
//   galaxyScale  escala de la galaxia controlada con dos manos
//   pinchMax     mayor pellizco entre las manos (acelera el giro)
//   anyPresent   hay al menos una mano visible

import * as THREE from 'three';
import { LANDMARK as L } from './landmarks.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
// Suavizado exponencial independiente de los fps.
const approach = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
const palmCenter = (p) => ({
  x: (p[L.WRIST].x + p[L.INDEX_MCP].x + p[L.MIDDLE_MCP].x + p[L.PINKY_MCP].x) / 4,
  y: (p[L.WRIST].y + p[L.INDEX_MCP].y + p[L.MIDDLE_MCP].y + p[L.PINKY_MCP].y) / 4,
  z: ((p[L.WRIST].z ?? 0) + (p[L.INDEX_MCP].z ?? 0) + (p[L.MIDDLE_MCP].z ?? 0) + (p[L.PINKY_MCP].z ?? 0)) / 4,
});

// Filtro One Euro: casi sin retardo en movimientos rápidos y sin temblor en reposo.
class OneEuro {
  constructor(minCutoff = 1.0, beta = 1.5, dCutoff = 1.0) {
    Object.assign(this, { minCutoff, beta, dCutoff });
    this.reset();
  }
  reset() {
    this.x = null;
    this.dx = 0;
  }
  static alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  filter(v, dt) {
    if (this.x === null) return (this.x = v);
    this.dx += OneEuro.alpha(this.dCutoff, dt) * ((v - this.x) / dt - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    return (this.x += OneEuro.alpha(cutoff, dt) * (v - this.x));
  }
}

// Medidas instantáneas de una mano detectada.
function measure(hand, videoAspect) {
  // Para la forma de la mano se usan los puntos en metros (worldLandmarks):
  // no dependen de lo lejos que esté la mano de la cámara.
  const shape = hand.worldLandmarks ?? hand.landmarks;
  const pc = palmCenter(shape);
  const palm = dist(shape[L.WRIST], shape[L.MIDDLE_MCP]) || 1e-6;

  // Apertura: distancia de corazón, anular y meñique al centro de la palma.
  // (El índice se excluye porque se dobla al pellizcar.)
  const openRatio =
    (dist(shape[L.MIDDLE_TIP], pc) + dist(shape[L.RING_TIP], pc) + dist(shape[L.PINKY_TIP], pc)) / 3 / palm;
  const openness = smoothstep(0.75, 1.25, openRatio);

  // Pellizco: pulgar e índice juntos, solo si la mano no está cerrada en puño.
  const pinchRatio = dist(shape[L.THUMB_TIP], shape[L.INDEX_TIP]) / palm;
  const pinch = (1 - smoothstep(0.25, 0.55, pinchRatio)) * smoothstep(0.25, 0.5, openness);

  // Posición en la imagen (0–1) y tamaño aparente de la palma (≈ cercanía a la cámara).
  const img = hand.landmarks;
  const ic = palmCenter(img);
  const imgPalm = Math.hypot((img[L.WRIST].x - img[L.MIDDLE_MCP].x) * videoAspect, img[L.WRIST].y - img[L.MIDDLE_MCP].y);

  return { x: ic.x, y: ic.y, size: imgPalm, openness, pinch, openRatio, pinchRatio };
}

class HandSlot {
  constructor() {
    this.fx = new OneEuro();
    this.fy = new OneEuro();
    this.fsize = new OneEuro(0.6, 0.5);
    this.nx = 0.5;
    this.ny = 0.5;
    this.size = 0.16;
    this.presence = 0;
    this.openness = 1;
    this.pinch = 0;
    this.gesture = 'neutra';
    this.raw = null; // últimas medidas sin suavizar (para depuración)
    this.targetOpenness = 1;
    this.targetPinch = 0;
    this.seen = false;
    this.position = new THREE.Vector3();
  }

  // Nueva medida de la cámara (o null si la mano no está).
  measure(m, dt) {
    this.seen = !!m;
    if (!m) return;
    if (this.presence < 0.05) {
      // Reaparece: empezar desde la nueva posición en vez de deslizarse desde la vieja.
      this.fx.reset();
      this.fy.reset();
      this.fsize.reset();
    }
    this.nx = this.fx.filter(m.x, dt);
    this.ny = this.fy.filter(m.y, dt);
    this.size = this.fsize.filter(m.size, dt);
    this.targetOpenness = m.openness;
    this.targetPinch = m.pinch;
    this.raw = m;
  }

  // Suavizado por fotograma de render.
  tick(dt) {
    this.presence = approach(this.presence, this.seen ? 1 : 0, this.seen ? 8 : 3, dt);
    this.openness = approach(this.openness, this.targetOpenness, 12, dt);
    this.pinch = approach(this.pinch, this.targetPinch, 14, dt);

    // Etiqueta discreta con márgenes para que no parpadee entre estados.
    if (this.pinch > 0.6) this.gesture = 'pellizco';
    else if (this.openness < 0.3) this.gesture = 'puño';
    else if (this.openness > 0.65 && this.pinch < 0.4) this.gesture = 'abierta';
    else if (this.gesture === 'pellizco' && this.pinch < 0.4) this.gesture = 'neutra';
  }
}

export class GestureMapper {
  constructor(camera, { target = new THREE.Vector3(), videoAspect = 4 / 3 } = {}) {
    this.camera = camera;
    this.target = target; // centro de la escena (punto al que mira la cámara)
    this.videoAspect = videoAspect;
    this.slots = [new HandSlot(), new HandSlot()];
    this.lastHands = null;
    this.lastTime = null;
    this.lastMeasureTime = null;
    this.galaxyScale = 1;
    this.suppress = 0;

    this._ndc = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._tmp = new THREE.Vector3();

    this.params = {
      hands: this.slots.map((s) => ({ presence: 0, position: s.position, openness: 1, pinch: 0, gesture: 'neutra' })),
      galaxyScale: 1,
      pinchMax: 0,
      anyPresent: false,
    };
  }

  setVideoAspect(aspect) {
    if (aspect > 0) this.videoAspect = aspect;
  }

  // hands: salida de HandTracker.detect(). timeMs: tiempo de requestAnimationFrame.
  // suppress (0–1): cuánto se parecen las manos a un gesto especial de dos manos.
  //   Mientras dura, los efectos de cada mano se atenúan, la escala de dos manos se
  //   congela y el gesto se marca 'corazón' (así al soltar no salta la onda expansiva).
  //   Con 0 (por defecto) el comportamiento es exactamente el de siempre.
  update(hands, timeMs, { suppress = 0 } = {}) {
    const dt = this.lastTime === null ? 1 / 60 : clamp((timeMs - this.lastTime) / 1000, 1e-3, 0.1);
    this.lastTime = timeMs;
    // Entra rápido y se libera despacio, para no soltar efectos a mitad del gesto.
    this.suppress = approach(this.suppress, clamp(suppress, 0, 1), suppress > this.suppress ? 15 : 3, dt);
    const keep = 1 - this.suppress;

    // Solo hay medidas nuevas cuando la cámara entregó otro fotograma.
    if (hands !== this.lastHands) {
      this.lastHands = hands;
      const mdt = this.lastMeasureTime === null ? 1 / 30 : clamp((timeMs - this.lastMeasureTime) / 1000, 1e-3, 0.2);
      this.lastMeasureTime = timeMs;

      // Asignar cada mano a un hueco fijo según izquierda/derecha.
      const assigned = [null, null];
      for (const h of hands) {
        let i = h.handedness === 'Right' ? 1 : 0;
        if (assigned[i]) i = 1 - i;
        if (!assigned[i]) assigned[i] = h;
      }
      this.slots.forEach((s, i) => s.measure(assigned[i] ? measure(assigned[i], this.videoAspect) : null, mdt));
    }

    let pinchMax = 0;
    let anyPresent = false;
    this.slots.forEach((s, i) => {
      s.tick(dt);
      this.#project(s);
      const out = this.params.hands[i];
      out.presence = s.presence * keep;
      out.openness = s.openness;
      out.pinch = s.pinch;
      out.gesture = this.suppress > 0.5 ? 'corazón' : s.gesture;
      pinchMax = Math.max(pinchMax, s.pinch * s.presence * keep);
      anyPresent ||= s.presence > 0.5;
    });

    // Dos manos: la distancia entre ellas (relativa al alto visible) escala la galaxia.
    // Durante un gesto especial la escala se queda como estaba.
    const [a, b] = this.slots;
    let targetScale = 1;
    if (this.suppress > 0.3) {
      targetScale = this.galaxyScale;
    } else if (a.presence > 0.5 && b.presence > 0.5) {
      const spread = a.position.distanceTo(b.position) / this.#viewHeightAtTarget();
      targetScale = THREE.MathUtils.mapLinear(clamp(spread, 0.2, 1.3), 0.2, 1.3, 0.55, 1.8);
    }
    this.galaxyScale = approach(this.galaxyScale, targetScale, 3, dt);

    this.params.galaxyScale = this.galaxyScale;
    this.params.pinchMax = pinchMax;
    this.params.anyPresent = anyPresent;
    return this.params;
  }

  // Lleva la posición de la mano (0–1 en la imagen) a un punto 3D: se lanza un rayo
  // desde la cámara y se corta con el plano que pasa por el centro de la escena
  // mirando a la cámara. Acercar la mano a la webcam la acerca también en 3D.
  #project(slot) {
    const cam = this.camera;
    // Espejo (1 - x) y un margen: el centro ~75 % de la imagen cubre toda la pantalla.
    const reach = 1.35;
    const x = clamp(((1 - slot.nx) * 2 - 1) * reach, -1, 1);
    const y = clamp(-(slot.ny * 2 - 1) * reach, -1, 1);
    this._dir.copy(this._ndc.set(x, y, 0.5).unproject(cam)).sub(cam.position).normalize();
    cam.getWorldDirection(this._fwd);
    const planeDist = this._tmp.copy(this.target).sub(cam.position).dot(this._fwd);
    const t = planeDist / Math.max(this._dir.dot(this._fwd), 1e-3);
    const towardCamera = clamp((slot.size - 0.16) * 45, -5, 6);
    slot.position.copy(cam.position).addScaledVector(this._dir, Math.max(t - towardCamera, 2));
  }

  #viewHeightAtTarget() {
    const d = this.camera.position.distanceTo(this.target);
    return 2 * d * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
  }

  // Texto con los valores crudos, para ajustar umbrales (?debug).
  debugText() {
    return this.slots
      .map((s, i) =>
        s.presence > 0.05 && s.raw
          ? `M${i + 1} ${s.gesture} · apertura ${s.raw.openRatio.toFixed(2)} · pellizco ${s.raw.pinchRatio.toFixed(2)}`
          : null,
      )
      .filter(Boolean)
      .join('  |  ');
  }
}
