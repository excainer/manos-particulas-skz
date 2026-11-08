// Escena base de Three.js: renderer, cámara, controles de ratón,
// posprocesado (bloom + viñeta/grano) y ajuste al redimensionar.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

const BLOOM_STRENGTH = 0.85;

// Pase final sobre la imagen ya en sRGB:
//  - viñeta: oscurece los bordes y centra la mirada (más profundidad)
//  - grano: un ruido de ±1 nivel de color que elimina las bandas en los degradados del bloom
const FinishShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 0.35 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uVignette;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      vec2 c = vUv - 0.5;
      float vignette = 1.0 - uVignette * smoothstep(0.25, 0.85, dot(c, c) * 2.2);
      float grain = (hash(gl_FragCoord.xy + fract(uTime) * 100.0) - 0.5) / 255.0 * 1.5;
      gl_FragColor = vec4(color.rgb * vignette + grain, 1.0);
    }
  `,
};

export function createScene(canvas) {
  // Límite de densidad de píxeles. En pantallas 3x el coste se dispara sin mejora
  // visible; además el gestor de calidad puede bajarlo si los fps caen.
  let pixelRatioCap = 2;
  const getPixelRatio = () => Math.min(window.devicePixelRatio, pixelRatioCap);

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

  // Posprocesado: escena → bloom → tone mapping/sRGB → viñeta y grano.
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    BLOOM_STRENGTH, // intensidad
    0.55, // radio
    0.05, // umbral
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const finish = new ShaderPass(FinishShader);
  composer.addPass(finish);

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

  function render(timeMs = 0) {
    controls.update(); // necesario cada fotograma por la inercia y el autogiro
    finish.uniforms.uTime.value = timeMs / 1000;
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
    // Calidad: cambia el límite de densidad de píxeles y recalcula los buffers.
    setPixelRatioCap(cap) {
      if (cap === pixelRatioCap) return;
      pixelRatioCap = cap;
      resize();
    },
    getPixelRatio,
    // Brillo extra del bloom (0 = normal); lo usan el pellizco y la onda expansiva.
    setBloomBoost(boost) {
      bloom.strength = BLOOM_STRENGTH + boost;
    },
  };
}
