// Punto de entrada: conecta los tres módulos y corre el bucle principal.
//
//   webcam ──► HandTracker ──► GestureMapper ──► ParticleSystem ──► render
//   (vídeo)    (21 puntos/mano)  (gestos → parámetros)  (Three.js)

import { createScene } from './scene/scene.js';
import { ParticleSystem } from './scene/particles.js';
import { HandTracker } from './tracking/handTracker.js';
import { GestureMapper } from './tracking/gestureMapper.js';

const canvas = document.getElementById('escena');
const video = document.getElementById('webcam');
const estado = document.getElementById('estado');
const btnIniciar = document.getElementById('btn-iniciar');

const { scene, render, onResize } = createScene(canvas);

// Menos partículas en pantallas pequeñas (móviles suelen tener GPU más modesta).
const isSmallScreen = Math.min(window.innerWidth, window.innerHeight) < 700;
const particles = new ParticleSystem(scene, isSmallScreen ? 18000 : 45000);
onResize((w, h, pr) => particles.setPixelRatio(pr));

const tracker = new HandTracker(video);
const mapper = new GestureMapper();

estado.textContent = 'Arrastra para orbitar · rueda para acercar';

// La cámara solo se pide tras un clic (los navegadores lo exigen para buena UX/permisos).
btnIniciar.addEventListener('click', async () => {
  // TODO (paso 3): tracker.start() → pedir webcam y cargar el modelo de MediaPipe
  estado.textContent = 'Seguimiento de manos aún no implementado';
});

function loop(time) {
  // TODO (paso 3): const hands = tracker.detect(time);
  // TODO (paso 4): const params = mapper.update(hands);
  particles.update(time /* , params */);
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
