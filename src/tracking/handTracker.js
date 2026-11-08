// Envoltorio de MediaPipe HandLandmarker (@mediapipe/tasks-vision).
// Devuelve, por cada mano detectada, 21 puntos normalizados (x, y en 0–1; z relativa).
// TODO (paso 3):
//   - navigator.mediaDevices.getUserMedia({ video: true }) → this.video.srcObject
//   - FilesetResolver.forVisionTasks(<ruta wasm>)
//   - HandLandmarker.createFromOptions(..., { runningMode: 'VIDEO', numHands: 2 })
//   - detect(): landmarker.detectForVideo(video, timestamp)

export class HandTracker {
  constructor(video) {
    this.video = video;
    this.landmarker = null;
  }

  async start() {}

  detect(timestamp) {
    return []; // [{ handedness: 'Left'|'Right', landmarks: [{x,y,z} × 21] }]
  }
}
