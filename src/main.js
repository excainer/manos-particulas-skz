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
//   ?demo=heart[&heartT=5]  secuencia especial sin cámara (heartT la congela en ese segundo)

import { createScene } from './scene/scene.js';
import { ParticleSystem, DEFAULT_HEART_SECONDS } from './scene/particles.js';
import { QualityManager } from './scene/quality.js';
import { HandTracker } from './tracking/handTracker.js';
import { HandOverlay } from './tracking/handOverlay.js';
import { GestureMapper } from './tracking/gestureMapper.js';
import { HeartDetector } from './tracking/heartDetector.js';
import { HeartMusic } from './audio/heartMusic.js';
import { HeartMessage } from './ui/heartMessage.js';
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
const demoKind = urlParams.get('demo');
const demoHands = demoKind && demoKind !== 'heart' ? createDemoHands(demoKind) : null;

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
const heartDetector = new HeartDetector();
const music = new HeartMusic();
const message = new HeartMessage();
particles.setHeartCenter(controls.target); // centro de la pantalla

// Secuencia especial: el corazón se forma AL INSTANTE y dura lo mismo que la canción,
// que arranca a la vez desde el principio. El corazón nunca espera a la música: si la
// canción no está, el navegador no la deja sonar o tarda más de 3 s en arrancar, el
// corazón sigue con su duración por defecto (10 s).
const MUSIC_START_TIMEOUT_MS = 3000;
// timeMs: mismo reloj que los fotogramas (requestAnimationFrame) para que no haya desfases.
function startHeart(timeMs = lastFrameTime) {
  if (particles.heartPlaying) return;
  const songLength = music.duration; // null si no hay canción disponible
  particles.playHeart(timeMs, songLength ? { duration: songLength } : {});
  console.info(`[secuencia] corazón iniciado · ${particles.heartDuration.toFixed(1)} s`);
  if (!songLength) {
    console.info('[secuencia] sin música: archivo no disponible');
    return;
  }
  const timeout = new Promise((resolve) => setTimeout(() => resolve('timeout'), MUSIC_START_TIMEOUT_MS));
  Promise.race([music.play(), timeout]).then((result) => {
    if (result === true) {
      console.info('[secuencia] música sonando');
    } else {
      console.warn(`[secuencia] la música no arrancó (${result === 'timeout' ? 'tiempo agotado' : 'bloqueada'}); corazón de 10 s`);
      particles.setHeartDuration(DEFAULT_HEART_SECONDS);
    }
  });
}

if (demoKind === 'heart') {
  if (urlParams.has('heartT')) {
    particles.playHeart(performance.now(), { freezeAt: Number(urlParams.get('heartT')) });
  } else {
    // Igual que el gesto real (con música si el navegador lo permite sin clic previo).
    music.prepare();
    music.audio.addEventListener('loadedmetadata', startHeart, { once: true });
    music.audio.addEventListener('error', startHeart, { once: true });
  }
}
// Herramienta de calibración (?debug): se carga aparte y solo en ese modo; no afecta a la escena.
let calibration = null;
if (DEBUG) {
  import('./dev/calibration.js').then((m) => (calibration = m.createCalibration({ tracker, video })));
}

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
  music.prepare(); // dentro del clic: el navegador permitirá reproducirla más tarde
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
    // La presencia de las manos se atenúa durante el gesto especial: se mira la del mapper.
    const visibles = mapper.slots.filter((s) => s.presence > 0.5);
    const gestures = params.hands.filter((h, i) => mapper.slots[i].presence > 0.5).map((h) => h.gesture);
    if (visibles.length === 0) text = 'Cámara activa · muestra una mano';
    else if (gestures.includes('corazón')) text = '❤';
    else text = gestures.map((g) => (g === 'neutra' ? 'mano' : g)).join(' + ');
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

// La música baja de volumen mientras el corazón vuelve a la galaxia y se detiene al terminar.
let heartWasPlaying = false;
function updateMusic() {
  if (heartWasPlaying && !particles.heartPlaying) console.info('[secuencia] terminada');
  heartWasPlaying = particles.heartPlaying;
  if (!music.playing) return;
  if (!particles.heartPlaying) {
    music.stop();
    return;
  }
  const remaining = particles.heartDuration - particles.heartElapsed;
  music.setVolume(Math.min(1, remaining / 1.5));
}

// ?replay=archivo.json (solo con `npm run dev`): reproduce en bucle una grabación de
// tests/fixtures/heart como si fuera la cámara, por el mismo camino que las manos reales.
let replay = null;
if (urlParams.has('replay')) {
  fetch(`/tests/fixtures/heart/${encodeURIComponent(urlParams.get('replay'))}`)
    .then((r) => r.json())
    .then((sample) => {
      replay = { sample, start: null, index: -1, hands: [] };
      music.prepare();
      console.info(`[replay] ${urlParams.get('replay')}: ${sample.frames.length} fotogramas`);
    })
    .catch((err) => console.error('[replay] no se pudo cargar la grabación', err));
}
function replayHands(time) {
  const { frames } = replay.sample;
  replay.start ??= time;
  const t = (time - replay.start) % (frames.at(-1).t + 30);
  let i = 0;
  while (i + 1 < frames.length && frames[i + 1].t <= t) i++;
  if (i !== replay.index) {
    replay.index = i;
    replay.hands = frames[i].hands; // array nuevo = fotograma nuevo de "cámara"
  }
  return replay.hands;
}

let params = {};
let lastFrameTime = 0; // último tiempo de fotograma, para lo que se lanza fuera del bucle
function loop(time) {
  lastFrameTime = time;
  quality.tick(time);
  updateFps(time);

  if (demoHands) {
    params = demoHands(time);
  } else if (tracker.running || replay) {
    const hands = replay ? replayHands(time) : tracker.detect(time);
    overlay.draw(hands);
    const videoAspect = replay ? replay.sample.videoAspect : video.videoWidth / video.videoHeight || 4 / 3;
    // Gesto especial: se dispara una vez y la secuencia sigue aunque se bajen las manos.
    const heart = heartDetector.update(hands, time, videoAspect);
    if (heart.triggered) {
      console.info('[corazón] gesto reconocido');
      startHeart(time);
    }
    // Mientras las manos forman el gesto, los cuatro gestos normales se apartan.
    const suppress = Math.min(1, Math.max(0, (heart.score - 0.2) / 0.4));
    params = mapper.update(hands, time, { suppress });
    updateStatus(params);
  } else if (params.hands) {
    // Cámara detenida: seguir actualizando para que los efectos se apaguen suavemente.
    params = mapper.update([], time);
  }

  calibration?.update(time);

  // Con una mano a la vista, la cámara deja de girar sola para que el control sea estable.
  controls.autoRotate = !params.anyPresent;

  particles.update(time, params, camera);
  setBloomBoost(particles.getBloomBoost());
  updateMusic();
  message.update(particles.heartElapsed, particles.heartDuration);
  render(time);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
