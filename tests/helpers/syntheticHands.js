// Manos sintéticas para las pruebas, en el formato que entrega HandTracker.
//
// Cada pose se define como la MITAD IZQUIERDA (la mano que aparece a la izquierda
// de la imagen) en unidades S (muñeca → base del corazón ≈ 1), con el origen en
// el centro del gesto, x hacia la derecha e y hacia abajo (como en la imagen).
// La mano derecha se obtiene por simetría.

// Índices: 0 muñeca · 1-4 pulgar · 5-8 índice · 9-12 corazón · 13-16 anular · 17-20 meñique
const POSES = {
  // Corazón clásico: índices curvados que se tocan arriba, pulgares abajo.
  heart: [
    [-1.35, 0.55], [-1.15, 0.45], [-0.85, 0.6], [-0.45, 0.85], [-0.08, 1.0],
    [-1.05, -0.65], [-0.75, -1.05], [-0.35, -0.95], [-0.08, -0.6],
    [-1.25, -0.45], [-0.95, -0.85], [-0.65, -0.85], [-0.5, -0.7],
    [-1.4, -0.35], [-1.15, -0.7], [-0.9, -0.65], [-0.8, -0.5],
    [-1.5, -0.2], [-1.3, -0.5], [-1.1, -0.4], [-1.0, -0.3],
  ],
  // Manos en oración: palmas juntas, dedos y pulgares hacia arriba.
  praying: [
    [-0.15, 0.6], [-0.22, 0.4], [-0.28, 0.1], [-0.22, -0.2], [-0.12, -0.45],
    [-0.12, -0.4], [-0.1, -0.8], [-0.08, -1.05], [-0.06, -1.25],
    [-0.1, -0.4], [-0.08, -0.85], [-0.06, -1.15], [-0.05, -1.4],
    [-0.12, -0.35], [-0.1, -0.8], [-0.08, -1.05], [-0.07, -1.25],
    [-0.15, -0.3], [-0.13, -0.65], [-0.11, -0.85], [-0.1, -1.0],
  ],
  // Dos gestos "OK" (pellizco) juntos: pulgar e índice de cada mano unidos a la misma altura.
  twoPinches: [
    [-0.9, 0.6], [-0.6, 0.45], [-0.4, 0.25], [-0.25, 0.0], [-0.12, -0.2],
    [-0.6, -0.35], [-0.35, -0.55], [-0.2, -0.4], [-0.12, -0.22],
    [-0.85, -0.4], [-0.85, -0.9], [-0.85, -1.2], [-0.85, -1.45],
    [-1.05, -0.35], [-1.1, -0.8], [-1.12, -1.05], [-1.14, -1.3],
    [-1.2, -0.25], [-1.3, -0.6], [-1.35, -0.8], [-1.4, -1.0],
  ],
  // Manos abiertas una junto a otra, pulgares tocándose, dedos hacia arriba.
  openSideBySide: [
    [-0.8, 0.6], [-0.55, 0.45], [-0.35, 0.3], [-0.18, 0.15], [-0.05, 0.05],
    [-0.55, -0.35], [-0.5, -0.8], [-0.47, -1.05], [-0.45, -1.3],
    [-0.78, -0.4], [-0.78, -0.9], [-0.78, -1.2], [-0.78, -1.45],
    [-1.0, -0.35], [-1.05, -0.8], [-1.08, -1.05], [-1.1, -1.3],
    [-1.2, -0.25], [-1.3, -0.6], [-1.35, -0.8], [-1.4, -1.0],
  ],
  // Triángulo: dedos estirados, índices formando el vértice superior, pulgares abajo.
  triangle: [
    [-1.3, 0.3], [-1.0, 0.35], [-0.7, 0.4], [-0.35, 0.5], [-0.05, 0.6],
    [-0.95, -0.5], [-0.65, -0.85], [-0.35, -1.15], [-0.05, -1.4],
    [-1.1, -0.65], [-0.85, -1.0], [-0.65, -1.25], [-0.5, -1.45],
    [-1.25, -0.55], [-1.05, -0.9], [-0.9, -1.1], [-0.8, -1.25],
    [-1.4, -0.4], [-1.25, -0.7], [-1.15, -0.85], [-1.05, -1.0],
  ],
};

export const POSE_NAMES = Object.keys(POSES);

const mirror = (half) => half.map(([x, y]) => [-x, y]);
const flipY = (half) => half.map(([x, y]) => [x, -y]);
const shift = (half, dx) => half.map(([x, y]) => [x + dx, y]);

// Pares de mitades [izquierda, derecha] en unidades S.
export const GESTURES = {
  heart: () => [POSES.heart, mirror(POSES.heart)],
  praying: () => [POSES.praying, mirror(POSES.praying)],
  twoPinches: () => [POSES.twoPinches, mirror(POSES.twoPinches)],
  openSideBySide: () => [POSES.openSideBySide, mirror(POSES.openSideBySide)],
  triangle: () => [POSES.triangle, mirror(POSES.triangle)],
  invertedHeart: () => [flipY(POSES.heart), mirror(flipY(POSES.heart))],
  heartHalvesApart: () => [shift(POSES.heart, -1.6), shift(mirror(POSES.heart), 1.6)],
  halfHeartAndOpenHand: () => [POSES.heart, mirror(POSES.openSideBySide)],
  oneHandOnly: () => [POSES.heart],
};

// Generador pseudoaleatorio con semilla (pruebas reproducibles).
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const gaussian = (rand) => Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());

// Convierte mitades en unidades S a manos como las de HandTracker (landmarks 0–1).
//   cx, cy    centro del gesto en la imagen (0–1)
//   scale     tamaño S en unidades de imagen (alto)
//   rotation  giro del gesto en grados (en el plano de la imagen)
//   aspect    proporción del vídeo (ancho/alto)
//   noise     ruido por punto, en unidades S (simula el temblor de MediaPipe)
//   sizeB     escala relativa de la segunda mano (manos a distinta distancia)
//   shuffle   orden aleatorio de las manos y etiquetas izquierda/derecha
export function toHands(halves, opts = {}) {
  const {
    cx = 0.5, cy = 0.5, scale = 0.12, rotation = 0, aspect = 4 / 3,
    noise = 0, sizeB = 1, shuffle = false, rand = Math.random,
  } = opts;
  const r = (rotation * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);

  const hands = halves.map((half, h) => {
    const k = h === 1 ? sizeB : 1;
    // La mano más pequeña se escala alrededor de su propia muñeca.
    const [wx, wy] = half[0];
    const landmarks = half.map(([x, y]) => {
      let X = wx + (x - wx) * k + gaussian(rand) * noise;
      let Y = wy + (y - wy) * k + gaussian(rand) * noise;
      [X, Y] = [X * cos - Y * sin, X * sin + Y * cos];
      return { x: cx + (X * scale) / aspect, y: cy + Y * scale, z: 0 };
    });
    return { handedness: h === 0 ? 'Right' : 'Left', score: 0.95, landmarks, worldLandmarks: null };
  });

  if (shuffle && hands.length === 2 && rand() < 0.5) {
    hands.reverse();
    hands.forEach((hand) => (hand.handedness = hand.handedness === 'Left' ? 'Right' : 'Left'));
  }
  return hands;
}

// Variación aleatoria realista de posición, tamaño, giro, cámara y ruido.
export function randomVariation(rand, { maxRotation = 12, noise = 0.04 } = {}) {
  return {
    cx: 0.3 + rand() * 0.4,
    cy: 0.3 + rand() * 0.4,
    scale: 0.07 + rand() * 0.15,
    rotation: (rand() * 2 - 1) * maxRotation,
    aspect: rand() < 0.5 ? 4 / 3 : 16 / 9,
    sizeB: 0.85 + rand() * 0.3,
    noise,
    shuffle: true,
    rand,
  };
}
