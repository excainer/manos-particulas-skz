// Punto de entrada: conecta los módulos y corre el bucle principal.
//
//   webcam ──► HandTracker ──► GestureMapper ──► ParticleSystem ──► render
//   (vídeo)    (21 puntos/mano)  (gestos → parámetros)  (Three.js)
//                   │
//                   └──► HandOverlay (esqueleto sobre la miniatura, depuración)
//
// Parámetros de URL para desarrollo:
//   ?autostart              activa la cámara al cargar
//   ?debug                  muestra fps, calidad y los valores crudos de los gestos
//   ?demo=fist|open|pinch|two|wave  manos simuladas, sin cámara

import { createScene } from './scene/scene.js';
import { ParticleSystem } from './scene/particles.js';
import { QualityManager } from './scene/quality.js';
import { HandTracker } from './tracking/handTracker.js';
import { HandOverlay } from './tracking/handOverlay.js';
import { GestureMapper } from './tracking/gestureMapper.js';
import { createDemoHands } from './dev/demoHands.js';

const canvas = document.getElementById('escena');
const camara = document.getElementById('camara');
const video = document.getElementById('webcam');
const manosCanvas = document.getElementById('manos');
const estado = document.getElementById('estado');
const fpsLabel = document.getElementById('fps');
const ayuda = document.getElementById('ayuda');
const btnIniciar = document.getElementById('btn-iniciar');

const urlParams = new URLSearchParams(location.search);
const DEBUG = urlParams.has('debug');
const demoHands = urlParams.has('demo') ? createDemoHands(urlParams.get('demo')) : null;

const { scene, camera, controls, render, onResize, setPixelRatioCap, getPixelRatio, setBloomBoost } =
  createScene(canvas);
const quality = new QualityManager(setPixelRatioCap);

// Menos partículas en pantallas pequeñas (móviles suelen tener GPU más modesta).
const isSmallScreen = Math.min(window.innerWidth, window.innerHeight) < 700;
const particles = new ParticleSystem(scene, isSmallScreen ? 18000 : 45000);
onResize((w, h, pr) => particles.setPixelRatio(pr));

const tracker = new HandTracker(video);
const overlay = new HandOverlay(manosCanvas, video);
const mapper = new GestureMapper(camera, { target: controls.target });

const IDLE_TEXT = 'Arrastra para orbitar · rueda para acercar';
estado.textContent = IDLE_TEXT;
let lastStatus = ''; // texto de estado mostrado (solo se toca el DOM si cambia)

// Mensajes claros para los fallos habituales al pedir la cámara.
function describeError(err) {
  switch (err?.name) {
    case 'NotAllowedError':
      return 'Permiso de cámara denegado. Actívalo en la barra de direcciones y reintenta.';
    case 'NotFoundError':
      return 'No se encontró ninguna cámara.';
    case 'NotReadableError':
      return 'La cámara está en uso por otra aplicación.';
    default:
      return `Error: ${err?.message ?? err}`;
  }
}

async function startCamera() {
  btnIniciar.disabled = true;
  try {
    await tracker.start((msg) => (estado.textContent = msg));
    camara.hidden = false;
    ayuda.hidden = false;
    overlay.syncSize();
    mapper.setVideoAspect(video.videoWidth / video.videoHeight);
    btnIniciar.textContent = 'Detener cámara';
    lastStatus = ''; // fuerza a actualizar el texto de estado
  } catch (err) {
    console.error(err);
    tracker.stop();
    estado.textContent = describeError(err);
  } finally {
    btnIniciar.disabled = false;
  }
}

function stopCamera() {
  tracker.stop();
  overlay.clear();
  camara.hidden = true;
  ayuda.hidden = true;
  btnIniciar.textContent = 'Activar cámara';
  estado.textContent = IDLE_TEXT;
}

// La cámara solo se pide tras un clic (los navegadores lo exigen para buena UX/permisos).
btnIniciar.addEventListener('click', () => {
  if (tracker.running) stopCamera();
  else startCamera();
});

if (urlParams.has('autostart')) startCamera();

function updateStatus(params) {
  let text;
  if (DEBUG) {
    text = mapper.debugText() || 'Cámara activa · muestra una mano';
  } else {
    const visibles = params.hands.filter((h) => h.presence > 0.5);
    text =
      visibles.length === 0
        ? 'Cámara activa · muestra una mano'
        : visibles.map((h) => (h.gesture === 'neutra' ? 'mano' : h.gesture)).join(' + ');
  }
  if (text !== lastStatus) estado.textContent = lastStatus = text;
}

// ?debug: fps y resolución de render, una vez por segundo.
fpsLabel.hidden = !DEBUG;
let lastFpsUpdate = 0;
function updateFps(time) {
  if (!DEBUG || time - lastFpsUpdate < 1000) return;
  lastFpsUpdate = time;
  fpsLabel.textContent = `${Math.round(quality.fps)} fps · resolución ${getPixelRatio()}x`;
}

let params = {};
function loop(time) {
  quality.tick(time);
  updateFps(time);

  if (demoHands) {
    params = demoHands(time);
  } else if (tracker.running) {
    const hands = tracker.detect(time);
    overlay.draw(hands);
    params = mapper.update(hands, time);
    updateStatus(params);
  } else if (params.hands) {
    // Cámara detenida: seguir actualizando para que los efectos se apaguen suavemente.
    params = mapper.update([], time);
  }

  // Con una mano a la vista, la cámara deja de girar sola para que el control sea estable.
  controls.autoRotate = !params.anyPresent;

  particles.update(time, params, camera);
  setBloomBoost(particles.getBloomBoost());
  render(time);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
