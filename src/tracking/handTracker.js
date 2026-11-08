// Envoltorio de MediaPipe HandLandmarker (@mediapipe/tasks-vision).
// Enciende la webcam, carga el modelo y, en cada fotograma, devuelve los
// 21 puntos de cada mano detectada.
//
// Coordenadas de cada punto: x, y normalizadas a 0–1 sobre la imagen original
// (sin espejo; x=0 es el borde izquierdo de la imagen de la cámara), z relativa
// a la muñeca (negativa = más cerca de la cámara).

import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

// El runtime WASM y el modelo se descargan en tiempo de ejecución desde CDN
// (nada extra en el proyecto). La versión del WASM DEBE coincidir con la del
// paquete instalado (node_modules/@mediapipe/tasks-vision/package.json).
// Para trabajar sin conexión, copia los archivos a /public y cambia estas rutas.
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

export class HandTracker {
  constructor(video, { numHands = 2 } = {}) {
    this.video = video;
    this.numHands = numHands;
    this.landmarker = null;
    this.stream = null;
    this.running = false;
    this.lastVideoTime = -1;
    this.hands = [];
  }

  // onStatus(texto) informa del progreso para mostrarlo en la interfaz.
  async start(onStatus = () => {}) {
    if (this.running) return;

    onStatus('Solicitando acceso a la cámara…');
    // Cámara y modelo en paralelo: el permiso no espera a la descarga.
    const cameraReady = this.#openCamera();
    const modelReady = this.landmarker ? Promise.resolve() : this.#loadModel(onStatus);
    await Promise.all([cameraReady, modelReady]);

    this.running = true;
    this.lastVideoTime = -1;
  }

  stop() {
    this.running = false;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
    this.hands = [];
  }

  async #openCamera() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      // 640×480 basta para detectar manos y mantiene la inferencia rápida.
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      audio: false,
    });
    this.video.srcObject = this.stream;
    await this.video.play();
  }

  async #loadModel(onStatus) {
    onStatus('Cargando modelo de manos…');
    const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
    const options = (delegate) => ({
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: 'VIDEO',
      numHands: this.numHands,
      minHandDetectionConfidence: 0.6,
      minHandPresenceConfidence: 0.6,
      minTrackingConfidence: 0.5,
    });
    try {
      this.landmarker = await HandLandmarker.createFromOptions(fileset, options('GPU'));
    } catch (err) {
      console.warn('Delegado GPU no disponible, usando CPU:', err);
      this.landmarker = await HandLandmarker.createFromOptions(fileset, options('CPU'));
    }
  }

  // Llamar una vez por fotograma de render. Solo ejecuta la inferencia cuando la
  // cámara ha entregado un fotograma nuevo (la webcam va a ~30 fps y la pantalla
  // a 60+); si no, devuelve el resultado anterior (mismo array → fácil de comparar).
  detect(timestamp) {
    if (!this.running || this.video.readyState < 2) return this.hands;
    if (this.video.currentTime === this.lastVideoTime) return this.hands;
    this.lastVideoTime = this.video.currentTime;

    const result = this.landmarker.detectForVideo(this.video, timestamp);
    this.hands = result.landmarks.map((landmarks, i) => ({
      // Nota: MediaPipe asume imagen en espejo; con la cámara sin voltear,
      // 'Left'/'Right' salen invertidos respecto a tu mano real.
      handedness: result.handedness[i]?.[0]?.categoryName ?? 'Unknown',
      score: result.handedness[i]?.[0]?.score ?? 0,
      landmarks, // [{x, y, z} × 21]
      worldLandmarks: result.worldLandmarks?.[i] ?? null, // en metros, origen en la mano
    }));
    return this.hands;
  }
}

export { LANDMARK } from './landmarks.js';
export const HAND_CONNECTIONS = HandLandmarker.HAND_CONNECTIONS;
