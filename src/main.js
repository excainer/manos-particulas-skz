// Punto de entrada: conecta los módulos y corre el bucle principal.
//
//   webcam ──► HandTracker ──► GestureMapper ──► ParticleSystem ──► render
//   (vídeo)    (21 puntos/mano)  (gestos → parámetros)  (Three.js)
//                   │
//                   └──► HandOverlay (esqueleto sobre la miniatura, depuración)

import { createScene } from './scene/scene.js';
import { ParticleSystem } from './scene/particles.js';
import { HandTracker } from './tracking/handTracker.js';
import { HandOverlay } from './tracking/handOverlay.js';
import { GestureMapper } from './tracking/gestureMapper.js';

const canvas = document.getElementById('escena');
const camara = document.getElementById('camara');
const video = document.getElementById('webcam');
const manosCanvas = document.getElementById('manos');
const estado = document.getElementById('estado');
const btnIniciar = document.getElementById('btn-iniciar');

const { scene, render, onResize } = createScene(canvas);

// Menos partículas en pantallas pequeñas (móviles suelen tener GPU más modesta).
const isSmallScreen = Math.min(window.innerWidth, window.innerHeight) < 700;
const particles = new ParticleSystem(scene, isSmallScreen ? 18000 : 45000);
onResize((w, h, pr) => particles.setPixelRatio(pr));

const tracker = new HandTracker(video);
const overlay = new HandOverlay(manosCanvas, video);
const mapper = new GestureMapper();

const IDLE_TEXT = 'Arrastra para orbitar · rueda para acercar';
estado.textContent = IDLE_TEXT;
let lastHandCount = -1; // nº de manos mostrado en el estado (-1 = forzar actualización)

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
    overlay.syncSize();
    btnIniciar.textContent = 'Detener cámara';
    lastHandCount = -1; // fuerza a actualizar el texto de estado
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
  btnIniciar.textContent = 'Activar cámara';
  estado.textContent = IDLE_TEXT;
}

// La cámara solo se pide tras un clic (los navegadores lo exigen para buena UX/permisos).
btnIniciar.addEventListener('click', () => {
  if (tracker.running) stopCamera();
  else startCamera();
});

// Desarrollo: ?autostart activa la cámara al cargar (útil para pruebas automáticas).
if (new URLSearchParams(location.search).has('autostart')) startCamera();

// El texto de estado solo se toca cuando cambia el número de manos (evita trabajo en el DOM).
function updateHandStatus(hands) {
  if (hands.length === lastHandCount) return;
  lastHandCount = hands.length;
  estado.textContent =
    hands.length === 0
      ? 'Cámara activa · muestra una mano'
      : `${hands.length} ${hands.length === 1 ? 'mano detectada' : 'manos detectadas'}`;
}

function loop(time) {
  if (tracker.running) {
    const hands = tracker.detect(time);
    overlay.draw(hands);
    updateHandStatus(hands);
    // TODO (paso 4): const params = mapper.update(hands);
  }
  particles.update(time /* , params */);
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
