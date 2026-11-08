// Sistema de partículas: varias capas de THREE.Points con shaders propios.
//
// Rendimiento: las posiciones se calculan UNA vez al crear las capas y se suben
// a la GPU. Toda la animación (rotación, parpadeo, flotación, entrada, ondas y
// las fuerzas de las manos) se calcula en el vertex shader a partir de unos pocos
// uniforms, así que cada fotograma solo se actualizan unos números, no miles de
// posiciones.
//
// Capas:
//   - galaxy:  disco espiral con rotación diferencial (el centro gira más rápido)
//   - stars:   cielo de estrellas lejanas alrededor de todo
//   - nebula:  pocas manchas grandes y tenues que dan color y profundidad
//   - cursor:  un orbe luminoso en la posición de cada mano
//   - aura:    nube de chispas orbitando cada mano (se contrae con el puño)
//
// Efectos de las manos (parámetros de GestureMapper):
//   - puño:            atrae las partículas cercanas y las hace girar en remolino
//   - mano abierta:    las repele, abriendo un hueco alrededor de la mano
//   - puño → abierta:  lanza una onda expansiva que recorre la galaxia
//   - pellizco:        las partículas cercanas se encienden y la galaxia gira más rápido
//   - dos manos:       la distancia entre ellas escala la galaxia

import * as THREE from 'three';

const INTRO_SECONDS = 3.0;
const WAVE_SECONDS = 2.0;

const ROTATE_GLSL = /* glsl */ `
  // Rotación de v alrededor del eje unitario k (fórmula de Rodrigues).
  vec3 rotateAround(vec3 v, vec3 k, float a) {
    float c = cos(a);
    float s = sin(a);
    return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
  }
`;

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uPhase;       // ángulo de giro acumulado (se acelera con el pellizco)
  uniform float uIntro;       // 0 → 1 durante la animación de entrada
  uniform float uPixelRatio;
  uniform float uSize;
  uniform float uSpin;
  uniform float uTwinkle;
  uniform float uInfluence;   // cuánto afectan las manos a esta capa (0 = nada)
  uniform vec3 uHandPos[2];   // posición de cada mano en el espacio local de la capa
  uniform vec4 uHandState[2]; // presencia, apertura, pellizco, fase del remolino
  uniform vec4 uWave[2];      // origen de la onda expansiva (local) y su edad en s (<0 = inactiva)
  uniform vec3 uSwirlAxis;    // eje del remolino (dirección de la cámara, en local)

  attribute vec3 aColor;
  attribute float aSize;
  attribute float aSeed;

  varying vec3 vColor;
  varying float vAlpha;

  ${ROTATE_GLSL}

  void main() {
    vec3 p = position;

    // Entrada escalonada: cada partícula llega en un momento distinto.
    float intro = smoothstep(0.0, 1.0, clamp(uIntro * 1.5 - aSeed * 0.5, 0.0, 1.0));
    float spins = step(0.001, uSpin); // las capas que giran también "nacen" desde el centro

    // Rotación diferencial alrededor del eje Y (+ giro extra durante la entrada).
    float r = length(p.xz);
    float angle = atan(p.z, p.x) + uPhase * uSpin * 0.9 / (r + 2.0) + (1.0 - intro) * 2.5 * spins;
    float grow = mix(1.0, mix(0.03, 1.0, intro), spins);
    r *= grow;
    p.x = cos(angle) * r;
    p.z = sin(angle) * r;
    p.y *= grow;

    // Flotación vertical suave, distinta para cada partícula.
    p.y += sin(uTime * 0.6 + aSeed * 6.2831) * 0.06 * uSpin;

    float boost = 0.0;
    if (uInfluence > 0.0) {
      // Fuerzas de las manos.
      for (int i = 0; i < 2; i++) {
        float presence = uHandState[i].x * uInfluence;
        if (presence < 0.001) continue;

        vec3 d = p - uHandPos[i];
        float fall = exp(-dot(d, d) / 22.0); // alcance ≈ 4.5 unidades
        float open = uHandState[i].y;
        float pinch = uHandState[i].z;

        // Puño: acercar a la mano y girar alrededor de ella.
        float attract = fall * (1.0 - open) * presence;
        d *= 1.0 - 0.8 * attract;
        d = rotateAround(d, uSwirlAxis, attract * uHandState[i].w);

        // Mano abierta: empujar hacia fuera.
        float repel = fall * open * presence;
        d += normalize(d + vec3(1e-4)) * repel * 3.0;

        p = uHandPos[i] + d;
        boost = max(boost, fall * pinch * presence);
      }

      // Ondas expansivas: un frente esférico que empuja y enciende lo que atraviesa.
      for (int i = 0; i < 2; i++) {
        float age = uWave[i].w;
        if (age < 0.0) continue;
        vec3 dw = p - uWave[i].xyz;
        float dl = length(dw);
        float band = exp(-pow((dl - age * 10.0) / 1.8, 2.0));
        float fade = 1.0 - age / ${WAVE_SECONDS.toFixed(1)};
        fade *= fade;
        p += dw / max(dl, 1e-3) * band * fade * 2.2 * uInfluence;
        boost = max(boost, band * fade);
      }
    }

    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    float depth = -mvPosition.z;
    gl_PointSize = min(uSize * aSize * (1.0 + boost * 1.5) * uPixelRatio / depth, 256.0 * uPixelRatio);

    // Parpadeo + desvanecer partículas pegadas a la cámara (evita manchas gigantes).
    float twinkle = 1.0 - uTwinkle * (0.35 - 0.35 * sin(uTime * (0.8 + aSeed * 2.5) + aSeed * 50.0));
    float nearFade = smoothstep(0.5, 3.0, depth);

    // El brillo extra tiñe de cian y aviva cada partícula en proporción a su propio brillo
    // (así la nebulosa, que es muy tenue, no se convierte en manchas blancas).
    float lum = max(aColor.r, max(aColor.g, aColor.b));
    vColor = mix(aColor, vec3(0.75, 1.0, 1.0) * lum, boost * 0.7) * (1.0 + boost * 0.5);
    vAlpha = twinkle * nearFade * intro;
  }
`;

// Aura: chispas que orbitan alrededor de cada mano, en el espacio del mundo.
const auraVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uSize;
  uniform vec3 uHandPos[2];   // posición de cada mano (mundo)
  uniform vec4 uAura[2];      // presencia, apertura, pellizco, -
  uniform vec3 uAuraColor[2];

  attribute float aHand;      // 0 o 1: a qué mano pertenece
  attribute vec3 aDir;        // dirección aleatoria (unitaria)
  attribute float aSeed;

  varying vec3 vColor;
  varying float vAlpha;

  ${ROTATE_GLSL}

  void main() {
    vec3 center = mix(uHandPos[0], uHandPos[1], aHand);
    vec4 st = mix(uAura[0], uAura[1], aHand);
    float presence = st.x;
    float open = st.y;
    float pinch = st.z;

    // Con el puño la nube se contrae y gira más rápido; abierta, se expande y calma.
    float radius = mix(0.35, 1.2, open) * (0.6 + 0.4 * aSeed) * (1.0 - 0.3 * pinch);
    vec3 axis = normalize(vec3(sin(aSeed * 12.0), 1.0, cos(aSeed * 7.0)));
    float speed = mix(3.5, 1.2, open) * (0.6 + aSeed);
    vec3 p = center + rotateAround(aDir, axis, uTime * speed + aSeed * 6.2831) * radius;

    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    float depth = max(-mvPosition.z, 0.5);
    gl_PointSize = uSize * (0.4 + aSeed * 0.8) * presence * (1.0 + 0.4 * pinch) * uPixelRatio / depth;

    vColor = mix(uAuraColor[0], uAuraColor[1], aHand);
    vAlpha = presence * (0.55 + 0.45 * sin(uTime * 4.0 + aSeed * 30.0));
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

// Color del orbe y del aura de cada mano según el gesto.
const GESTURE_COLORS = {
  abierta: new THREE.Color('#7ef9ff'),
  puño: new THREE.Color('#ff6fae'),
  pellizco: new THREE.Color('#ffffff'),
  neutra: new THREE.Color('#b48cff'),
};

const AURA_PER_HAND = 220;

const rand = (min, max) => min + Math.random() * (max - min);
const signedPow = (power) => Math.pow(Math.random(), power) * (Math.random() < 0.5 ? 1 : -1);
const approach = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

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

// Dos puntos (uno por mano); posición, color y tamaño se actualizan cada fotograma.
function buildCursors() {
  return {
    positions: new Float32Array(6),
    colors: new Float32Array(6),
    sizes: new Float32Array(2),
    seeds: new Float32Array([0.2, 0.7]),
  };
}

const sharedLayerOptions = {
  transparent: true,
  depthWrite: false, // las partículas se suman, no se tapan entre sí
  blending: THREE.AdditiveBlending,
};

export class ParticleSystem {
  constructor(scene, count = 5000) {
    this.scene = scene;
    this.count = count;

    // Uniforms compartidos por todas las capas (mismo objeto → un solo cambio por fotograma).
    this.time = { value: 0 };
    this.phase = { value: 0 };
    this.intro = { value: 0 };
    this.pixelRatio = { value: 1 };
    this.handState = { value: [new THREE.Vector4(), new THREE.Vector4()] };

    this.spinRate = 1;
    this.swirlPhase = [0, 0];
    this.prevGesture = ['neutra', 'neutra'];
    this.waveOrigin = [new THREE.Vector3(), new THREE.Vector3()];
    this.waveAge = [-1, -1];
    this.bloomBoost = 0;
    this.startTime = null;
    this.lastTime = null;
    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();
    this._q = new THREE.Quaternion();

    this.galaxy = this.#createLayer(buildGalaxy(count), { size: 55, spin: 1, core: 1, influence: 1 });
    this.stars = this.#createLayer(buildStarfield(Math.floor(count * 0.3)), { size: 160, spin: 0, core: 1 });
    this.nebula = this.#createLayer(buildNebula(70), { size: 2600, spin: 0.35, core: 0, influence: 0.5 });
    this.cursor = this.#createLayer(buildCursors(), { size: 700, spin: 0, core: 1, twinkle: 0.3 });
    this.aura = this.#createAura();
    this.handLayers = [this.galaxy, this.nebula];
  }

  #createLayer({ positions, colors, sizes, seeds }, { size, spin, core, influence = 0, twinkle = 1 }) {
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
        uPhase: this.phase,
        uIntro: this.intro,
        uPixelRatio: this.pixelRatio,
        uHandState: this.handState,
        uSize: { value: size },
        uSpin: { value: spin },
        uCore: { value: core },
        uTwinkle: { value: twinkle },
        uInfluence: { value: influence },
        // Propios de cada capa: dependen de su rotación/escala.
        uHandPos: { value: [new THREE.Vector3(), new THREE.Vector3()] },
        uWave: { value: [new THREE.Vector4(0, 0, 0, -1), new THREE.Vector4(0, 0, 0, -1)] },
        uSwirlAxis: { value: new THREE.Vector3(0, 0, 1) },
      },
      ...sharedLayerOptions,
    });

    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false; // la capa siempre es visible; evita recalcular su bounding sphere
    this.scene.add(points);
    return points;
  }

  #createAura() {
    const n = AURA_PER_HAND * 2;
    const hand = new Float32Array(n);
    const dirs = new Float32Array(n * 3);
    const seeds = new Float32Array(n);
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      hand[i] = i < AURA_PER_HAND ? 0 : 1;
      v.randomDirection();
      dirs.set([v.x, v.y, v.z], i * 3);
      seeds[i] = Math.random();
    }
    const geometry = new THREE.BufferGeometry();
    // "position" es obligatorio para Three.js; aquí no se usa (la posición sale de la mano).
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geometry.setAttribute('aHand', new THREE.BufferAttribute(hand, 1));
    geometry.setAttribute('aDir', new THREE.BufferAttribute(dirs, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

    const material = new THREE.ShaderMaterial({
      vertexShader: auraVertexShader,
      fragmentShader,
      uniforms: {
        uTime: this.time,
        uPixelRatio: this.pixelRatio,
        uSize: { value: 90 },
        uCore: { value: 0.6 },
        uHandPos: { value: [new THREE.Vector3(), new THREE.Vector3()] },
        uAura: { value: [new THREE.Vector4(), new THREE.Vector4()] },
        uAuraColor: { value: [GESTURE_COLORS.neutra.clone(), GESTURE_COLORS.neutra.clone()] },
      },
      ...sharedLayerOptions,
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    this.scene.add(points);
    return points;
  }

  setPixelRatio(pr) {
    this.pixelRatio.value = pr;
  }

  // Brillo extra sugerido para el bloom (pellizco + destello de las ondas).
  getBloomBoost() {
    return this.bloomBoost;
  }

  // params: salida de GestureMapper.update() (opcional). camera: para orientar el remolino.
  update(time, params = {}, camera = null) {
    const t = time / 1000;
    const dt = this.lastTime === null ? 0 : Math.min(t - this.lastTime, 0.1);
    this.lastTime = t;
    this.startTime ??= t;
    this.time.value = t;
    this.intro.value = Math.min(1, (t - this.startTime) / INTRO_SECONDS);

    // Giro de la galaxia: el pellizco lo acelera hasta 5×, y vuelve suavemente a 1×.
    const pinchMax = params.pinchMax ?? 0;
    this.spinRate = approach(this.spinRate, 1 + 4 * pinchMax, 3, dt);
    this.phase.value += dt * this.spinRate;

    // Inclinación lenta de la galaxia y giro muy lento del fondo: solo matrices, coste nulo.
    this.galaxy.rotation.x = Math.sin(t * 0.05) * 0.12;
    this.galaxy.scale.setScalar(params.galaxyScale ?? 1);
    this.stars.rotation.y = t * 0.004;

    const hands = params.hands ?? [];
    this.#updateWaves(hands, dt);
    this.#updateHands(hands, dt, camera);

    // Bloom: sube con el pellizco y destella al nacer cada onda.
    let flash = 0;
    for (const age of this.waveAge) if (age >= 0) flash = Math.max(flash, 1 - age / 0.5);
    this.bloomBoost = approach(this.bloomBoost, 0.12 * pinchMax + 0.6 * Math.max(flash, 0), 10, dt);
  }

  // Dispara una onda expansiva cuando una mano pasa de puño a abierta.
  #updateWaves(hands, dt) {
    for (let i = 0; i < 2; i++) {
      const h = hands[i];
      if (h && h.presence > 0.5 && this.prevGesture[i] === 'puño' && h.gesture === 'abierta') {
        this.waveOrigin[i].copy(h.position);
        this.waveAge[i] = 0;
      } else if (this.waveAge[i] >= 0) {
        this.waveAge[i] += dt;
        if (this.waveAge[i] > WAVE_SECONDS) this.waveAge[i] = -1;
      }
      this.prevGesture[i] = h?.gesture ?? 'neutra';
    }
  }

  #updateHands(hands, dt, camera) {
    // Estado compartido por todas las capas.
    for (let i = 0; i < 2; i++) {
      const h = hands[i];
      const presence = h?.presence ?? 0;
      const openness = h?.openness ?? 1;
      // La fase del remolino solo avanza mientras hay puño; sin puño vuelve a cero.
      const attract = (1 - openness) * presence;
      this.swirlPhase[i] = attract > 0.02 ? this.swirlPhase[i] + dt * 2.5 * attract : 0;
      this.handState.value[i].set(presence, openness, h?.pinch ?? 0, this.swirlPhase[i]);
    }

    // Posición de cada mano, ondas y eje del remolino en el espacio local de cada capa.
    if (camera) camera.getWorldDirection(this._v);
    for (const layer of this.handLayers) {
      layer.updateMatrixWorld();
      const u = layer.material.uniforms;
      for (let i = 0; i < 2; i++) {
        if (hands[i]) layer.worldToLocal(u.uHandPos.value[i].copy(hands[i].position));
        const w = u.uWave.value[i];
        if (this.waveAge[i] >= 0) {
          const o = layer.worldToLocal(this._w.copy(this.waveOrigin[i]));
          w.set(o.x, o.y, o.z, this.waveAge[i]);
        } else {
          w.w = -1;
        }
      }
      if (camera) {
        layer.getWorldQuaternion(this._q).invert();
        u.uSwirlAxis.value.copy(this._v).applyQuaternion(this._q).normalize();
      }
    }

    // Orbes y aura de las manos (2 vértices + uniforms: actualizarlos es trivial).
    const g = this.cursor.geometry;
    const pos = g.attributes.position;
    const col = g.attributes.aColor;
    const size = g.attributes.aSize;
    const au = this.aura.material.uniforms;
    for (let i = 0; i < 2; i++) {
      const h = hands[i];
      if (!h) {
        size.setX(i, 0);
        au.uAura.value[i].x = 0;
        continue;
      }
      const target = GESTURE_COLORS[h.gesture] ?? GESTURE_COLORS.neutra;
      const auraColor = au.uAuraColor.value[i].lerp(target, 1 - Math.exp(-8 * dt)); // cambio de color suave
      pos.setXYZ(i, h.position.x, h.position.y, h.position.z);
      col.setXYZ(i, auraColor.r, auraColor.g, auraColor.b);
      size.setX(i, h.presence * (1 + h.pinch * 0.6));
      au.uHandPos.value[i].copy(h.position);
      au.uAura.value[i].set(h.presence, h.openness, h.pinch, 0);
    }
    pos.needsUpdate = col.needsUpdate = size.needsUpdate = true;
  }
}
