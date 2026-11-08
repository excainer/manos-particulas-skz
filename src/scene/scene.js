// Escena base de Three.js: renderer, cámara, controles de ratón,
// posprocesado con bloom (brillo) y ajuste al redimensionar.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// Limitar la densidad de píxeles: en pantallas 3x el coste se dispara sin mejora visible.
const getPixelRatio = () => Math.min(window.devicePixelRatio, 2);

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false, // el composer renderiza a texturas propias; el MSAA aquí no aporta
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(getPixelRatio());
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x02030a); // azul casi negro

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 300);
  camera.position.set(0, 7, 18);

  // Ratón: arrastrar = orbitar, rueda = zoom. Con inercia para que sea suave.
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.enablePan = false;
  controls.minDistance = 4;
  controls.maxDistance = 45;
  controls.rotateSpeed = 0.6;
  controls.zoomSpeed = 0.7;
  controls.autoRotate = true; // giro lento cuando no se toca
  controls.autoRotateSpeed = 0.25;

  // Posprocesado: escena → bloom → conversión de color / tone mapping.
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.85, // intensidad
    0.55, // radio
    0.05, // umbral
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const resizeListeners = [];

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pr = getPixelRatio();
    camera.aspect = w / h;
    // En vertical se abre el campo de visión para que la galaxia quepa.
    camera.fov = camera.aspect < 1 ? 75 : 60;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    for (const fn of resizeListeners) fn(w, h, pr);
  }
  window.addEventListener('resize', resize);
  resize();

  function render() {
    controls.update(); // necesario cada fotograma por la inercia y el autogiro
    composer.render();
  }

  return {
    renderer,
    scene,
    camera,
    controls,
    render,
    // Registra un callback de redimensionado y lo ejecuta una vez con los valores actuales.
    onResize(fn) {
      resizeListeners.push(fn);
      fn(window.innerWidth, window.innerHeight, getPixelRatio());
    },
  };
}
