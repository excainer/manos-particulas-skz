// Solo para desarrollo (?debug): calibración del detector del corazón con manos reales.
//
// - Panel con la puntuación, cada criterio (valor 0–1 y medida en unidades S),
//   el estado de la máquina de estados y el número de detecciones.
// - Grabación de muestras para las pruebas automáticas:
//     C → grabar un CORAZÓN       N → grabar OTRO gesto (falso positivo a evitar)
//   Tras pulsar, hay 3 s de cuenta atrás para colocar las manos; luego se graban
//   20 fotogramas de la cámara (~0,7 s) y se descarga un .json.
//   Copia esos archivos a tests/fixtures/heart/ y `npm test` los usará.
//
// El panel se crea desde aquí: fuera de ?debug no existe nada en la página.

import { HeartDetector, HEART_CONFIG, CRITERIA_LABELS } from '../tracking/heartDetector.js';

const COUNTDOWN_MS = 3000;
const FRAMES_TO_RECORD = 20;
const METRIC_OF = {
  indices: 'indexGap',
  pulgares: 'thumbGap',
  altura: 'height',
  pulgaresAbajo: 'thumbsDown',
  lobulos: 'lobes',
  simetria: 'tilt',
};

const STYLE = `
  #debug-corazon {
    position: fixed; top: 64px; left: 16px; z-index: 10;
    width: min(320px, calc(100% - 32px)); padding: 12px 14px;
    font: 12px/1.5 ui-monospace, Consolas, monospace; color: #dfe4ff;
    background: rgba(10, 12, 28, 0.78); backdrop-filter: blur(8px);
    border: 1px solid rgba(160, 180, 255, 0.2); border-radius: 10px;
    pointer-events: none;
  }
  #debug-corazon h4 { margin: 0 0 6px; font-size: 12px; color: #ff6fae; }
  #debug-corazon .fila { display: grid; grid-template-columns: 1fr 70px 46px; gap: 8px; align-items: center; }
  #debug-corazon .barra { height: 6px; border-radius: 3px; background: rgba(255,255,255,0.1); overflow: hidden; }
  #debug-corazon .barra > i { display: block; height: 100%; background: #7ef9ff; }
  #debug-corazon .total .barra > i { background: #ff6fae; }
  #debug-corazon .num { text-align: right; opacity: 0.75; }
  #debug-corazon .estado { margin-top: 8px; }
  #debug-corazon .disparo { color: #ff6fae; font-weight: 700; }
  #debug-corazon .ayuda { margin-top: 8px; opacity: 0.6; }
  #debug-corazon .grabando { margin-top: 8px; color: #ffd7a3; font-weight: 700; }
`;

const fmt = (v) => (v === undefined || v === null ? '–' : v.toFixed(2));
const round = (v) => Math.round(v * 1e5) / 1e5;

export function createCalibration({ tracker, video }) {
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.append(style);
  const panel = document.createElement('div');
  panel.id = 'debug-corazon';
  document.body.append(panel);

  const detector = new HeartDetector();
  let detections = 0;
  let flashUntil = 0;
  let lastRender = 0;
  let recording = null; // { label, startAt, frames: [], lastHands }
  let lastSaved = '';

  window.addEventListener('keydown', (e) => {
    if (e.repeat || recording) return;
    const key = e.key.toLowerCase();
    if (key !== 'c' && key !== 'n') return;
    if (!tracker.running) {
      lastSaved = 'Activa la cámara antes de grabar';
      return;
    }
    recording = {
      label: key === 'c' ? 'corazon' : 'no-corazon',
      startAt: performance.now() + COUNTDOWN_MS,
      frames: [],
      lastHands: null,
    };
  });

  const aspect = () => (video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 4 / 3);

  function record(time, hands) {
    if (!recording || time < recording.startAt || hands === recording.lastHands) return;
    recording.lastHands = hands;
    recording.frames.push({
      t: Math.round(time - recording.startAt),
      hands: hands.map((h) => ({
        handedness: h.handedness,
        score: round(h.score),
        landmarks: h.landmarks.map((p) => ({ x: round(p.x), y: round(p.y), z: round(p.z) })),
      })),
    });
    if (recording.frames.length >= FRAMES_TO_RECORD) save();
  }

  function save() {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    const name = `${recording.label}-${stamp}.json`;
    const data = {
      label: recording.label,
      recordedAt: new Date().toISOString(),
      videoAspect: round(aspect()),
      config: HEART_CONFIG,
      frames: recording.frames,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    const withTwo = recording.frames.filter((f) => f.hands.length >= 2).length;
    lastSaved = `Guardado ${name} (${withTwo}/${recording.frames.length} fotogramas con 2 manos)`;
    console.info('[corazón] muestra guardada', name, data);
    recording = null;
  }

  function render(time, result) {
    const { analysis, state, score } = result;
    const rows = Object.keys(CRITERIA_LABELS)
      .map((k) => {
        const v = analysis.criteria?.[k] ?? 0;
        const m = analysis.metrics?.[METRIC_OF[k]];
        return `<div class="fila"><span>${CRITERIA_LABELS[k]}</span><span class="barra"><i style="width:${(v * 100).toFixed(0)}%"></i></span><span class="num">${fmt(m)}</span></div>`;
      })
      .join('');

    let recText = '';
    if (recording) {
      const left = recording.startAt - time;
      recText =
        left > 0
          ? `Grabando "${recording.label}" en ${Math.ceil(left / 1000)}…`
          : `Grabando "${recording.label}"… ${recording.frames.length}/${FRAMES_TO_RECORD}`;
    }

    panel.innerHTML = `
      <h4>Calibración · corazón</h4>
      <div class="fila total"><span>PUNTUACIÓN</span><span class="barra"><i style="width:${(score * 100).toFixed(0)}%"></i></span><span class="num">${fmt(score)}</span></div>
      ${rows}
      <div class="estado">estado: ${state} · ${analysis.reason}${analysis.metrics ? ` · lado ${fmt(analysis.metrics.side)} · tamaños ${fmt(analysis.metrics.sizeRatio)}` : ''}</div>
      <div class="${time < flashUntil ? 'disparo' : ''}">detecciones: ${detections}${time < flashUntil ? '  ❤ ¡DETECTADO!' : ''}</div>
      ${recText ? `<div class="grabando">${recText}</div>` : ''}
      <div class="ayuda">${lastSaved || 'C: grabar corazón · N: grabar otro gesto'}</div>
    `;
  }

  return {
    update(time) {
      const hands = tracker.running ? tracker.hands : [];
      const result = detector.update(hands, time, aspect());
      if (result.triggered) {
        detections++;
        flashUntil = time + 1500;
        console.info('[corazón] detectado', result.analysis);
      }
      record(time, hands);
      // Refrescar el panel ~10 veces por segundo basta y evita trabajo en el DOM.
      if (time - lastRender > 100 || result.triggered) {
        lastRender = time;
        render(time, result);
      }
    },
  };
}
