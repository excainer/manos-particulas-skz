// Sistema de partículas: varias capas de THREE.Points con un shader propio.
//
// Rendimiento: las posiciones se calculan UNA vez al crear las capas y se suben
// a la GPU. La animación (rotación de la galaxia, parpadeo, flotación) se hace
// en el vertex shader a partir de un uniform de tiempo, así que cada fotograma
// solo se actualiza un número, no miles de posiciones.
//
// Capas:
//   - galaxy:  disco espiral con rotación diferencial (el centro gira más rápido)
//   - stars:   cielo de estrellas lejanas alrededor de todo
//   - nebula:  pocas manchas grandes y tenues que dan color y profundidad
//
// TODO (paso 4): reaccionar a los parámetros que llegan de GestureMapper
//   (p. ej. atractor en la posición de la mano, dispersión al abrirla).

import * as THREE from 'three';

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uSize;
  uniform float uSpin;

  attribute vec3 aColor;
  attribute float aSize;
  attribute float aSeed;

  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec3 p = position;

    // Rotación diferencial alrededor del eje Y.
    float r = length(p.xz);
    float angle = atan(p.z, p.x) + uTime * uSpin * 0.9 / (r + 2.0);
    p.x = cos(angle) * r;
    p.z = sin(angle) * r;

    // Flotación vertical suave, distinta para cada partícula.
    p.y += sin(uTime * 0.6 + aSeed * 6.2831) * 0.06 * uSpin;

    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    float depth = -mvPosition.z;
    gl_PointSize = min(uSize * aSize * uPixelRatio / depth, 256.0 * uPixelRatio);

    // Parpadeo + desvanecer partículas pegadas a la cámara (evita manchas gigantes).
    float twinkle = 0.65 + 0.35 * sin(uTime * (0.8 + aSeed * 2.5) + aSeed * 50.0);
    float nearFade = smoothstep(0.5, 3.0, depth);

    vColor = aColor;
    vAlpha = twinkle * nearFade;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uCore;

  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;

    float glow = exp(-d * d * 28.0);              // halo suave
    float core = smoothstep(0.12, 0.0, d) * uCore; // núcleo brillante
    vec3 color = mix(vColor, vec3(1.0), core * 0.7);

    gl_FragColor = vec4(color, (glow + core) * vAlpha);
  }
`;

// Paleta de la galaxia (centro → borde) y acentos ocasionales.
const COLOR_CORE = new THREE.Color('#ffd7a3');
const COLOR_MID = new THREE.Color('#ff6fae');
const COLOR_EDGE = new THREE.Color('#4d7dff');
const ACCENTS = ['#7ef9ff', '#b48cff', '#ffffff'].map((c) => new THREE.Color(c));

const rand = (min, max) => min + Math.random() * (max - min);
const signedPow = (power) => Math.pow(Math.random(), power) * (Math.random() < 0.5 ? 1 : -1);

function buildGalaxy(count) {
  const radius = 13;
  const arms = 4;
  const twist = 0.42;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const seeds = new Float32Array(count);
  const c = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const inBulge = Math.random() < 0.12; // núcleo esférico central
    let x, y, z, t;

    if (inBulge) {
      const r = Math.pow(Math.random(), 2) * 2.2;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(rand(-1, 1));
      x = r * Math.sin(phi) * Math.cos(theta);
      y = r * Math.cos(phi) * 0.6;
      z = r * Math.sin(phi) * Math.sin(theta);
      t = r / radius;
    } else {
      const r = Math.pow(Math.random(), 1.5) * radius + 0.4;
      const branch = ((i % arms) / arms) * Math.PI * 2;
      const angle = branch + r * twist;
      const spread = 0.35 * r;
      x = Math.cos(angle) * r + signedPow(3) * spread;
      y = signedPow(3) * spread * 0.25;
      z = Math.sin(angle) * r + signedPow(3) * spread;
      t = r / radius;
    }

    positions.set([x, y, z], i * 3);

    // Color según la distancia al centro, con acentos y brillo variable.
    if (t < 0.35) c.lerpColors(COLOR_CORE, COLOR_MID, t / 0.35);
    else c.lerpColors(COLOR_MID, COLOR_EDGE, Math.min((t - 0.35) / 0.65, 1));
    if (Math.random() < 0.06) c.copy(ACCENTS[(Math.random() * ACCENTS.length) | 0]);
    c.multiplyScalar(rand(0.35, 1.0));
    colors.set([c.r, c.g, c.b], i * 3);

    // La mayoría pequeñas; unas pocas estrellas grandes y brillantes.
    sizes[i] = Math.random() < 0.015 ? rand(2.5, 4.0) : rand(0.5, 1.5);
    seeds[i] = Math.random();
  }
  return { positions, colors, sizes, seeds };
}

function buildStarfield(count) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const seeds = new Float32Array(count);
  const tints = ['#ffffff', '#cfe0ff', '#ffe7c7', '#a9c4ff'].map((h) => new THREE.Color(h));
  const c = new THREE.Color();
  const v = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    v.randomDirection().multiplyScalar(rand(50, 120));
    positions.set([v.x, v.y, v.z], i * 3);
    c.copy(tints[(Math.random() * tints.length) | 0]).multiplyScalar(rand(0.25, 1.0));
    colors.set([c.r, c.g, c.b], i * 3);
    sizes[i] = Math.random() < 0.02 ? rand(2.0, 3.0) : rand(0.6, 1.4);
    seeds[i] = Math.random();
  }
  return { positions, colors, sizes, seeds };
}

function buildNebula(count) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const seeds = new Float32Array(count);
  const tints = ['#3a1c7a', '#1b3f8f', '#7a1f5c', '#0f5f74'].map((h) => new THREE.Color(h));
  const c = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const r = rand(2, 16);
    const a = Math.random() * Math.PI * 2;
    positions.set([Math.cos(a) * r, rand(-1.5, 1.5), Math.sin(a) * r], i * 3);
    c.copy(tints[(Math.random() * tints.length) | 0]).multiplyScalar(rand(0.08, 0.16));
    colors.set([c.r, c.g, c.b], i * 3);
    sizes[i] = rand(0.7, 1.3);
    seeds[i] = Math.random();
  }
  return { positions, colors, sizes, seeds };
}

export class ParticleSystem {
  constructor(scene, count = 5000) {
    this.scene = scene;
    this.count = count;

    // Uniforms compartidos por todas las capas (mismo objeto → un solo cambio por fotograma).
    this.time = { value: 0 };
    this.pixelRatio = { value: 1 };

    this.galaxy = this.#createLayer(buildGalaxy(count), { size: 55, spin: 1, core: 1 });
    this.stars = this.#createLayer(buildStarfield(Math.floor(count * 0.3)), { size: 160, spin: 0, core: 1 });
    this.nebula = this.#createLayer(buildNebula(70), { size: 2600, spin: 0.35, core: 0 });
  }

  #createLayer({ positions, colors, sizes, seeds }, { size, spin, core }) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: this.time,
        uPixelRatio: this.pixelRatio,
        uSize: { value: size },
        uSpin: { value: spin },
        uCore: { value: core },
      },
      transparent: true,
      depthWrite: false, // las partículas se suman, no se tapan entre sí
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false; // la capa siempre es visible; evita recalcular su bounding sphere
    this.scene.add(points);
    return points;
  }

  setPixelRatio(pr) {
    this.pixelRatio.value = pr;
  }

  update(time, params = {}) {
    const t = time / 1000;
    this.time.value = t;
    // Inclinación lenta de la galaxia y giro muy lento del fondo: solo matrices, coste nulo.
    this.galaxy.rotation.x = Math.sin(t * 0.05) * 0.12;
    this.stars.rotation.y = t * 0.004;
  }
}
