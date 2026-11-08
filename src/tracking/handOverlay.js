// Dibuja el esqueleto de las manos detectadas sobre la miniatura de la webcam.
// Es una vista de depuración: permite ver qué está detectando MediaPipe.

import { HAND_CONNECTIONS } from './handTracker.js';

const FINGERTIPS = new Set([4, 8, 12, 16, 20]);
const HAND_COLORS = ['#7ef9ff', '#ff6fae'];

export class HandOverlay {
  constructor(canvas, video) {
    this.canvas = canvas;
    this.video = video;
    this.ctx = canvas.getContext('2d');
    this.lastHands = null;
  }

  // Ajusta la resolución interna del canvas a la del vídeo (llamar al iniciar la cámara).
  syncSize() {
    this.canvas.width = this.video.videoWidth || 640;
    this.canvas.height = this.video.videoHeight || 480;
    this.lastHands = null;
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.lastHands = null;
  }

  draw(hands) {
    if (hands === this.lastHands) return; // sin fotograma nuevo → no redibujar
    this.lastHands = hands;

    const { ctx } = this;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    hands.forEach((hand, i) => {
      const color = HAND_COLORS[i % HAND_COLORS.length];
      const pts = hand.landmarks;

      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      for (const { start, end } of HAND_CONNECTIONS) {
        ctx.moveTo(pts[start].x * w, pts[start].y * h);
        ctx.lineTo(pts[end].x * w, pts[end].y * h);
      }
      ctx.stroke();

      ctx.globalAlpha = 1;
      for (let j = 0; j < pts.length; j++) {
        const r = FINGERTIPS.has(j) ? 6 : 3.5;
        ctx.fillStyle = FINGERTIPS.has(j) ? '#ffffff' : color;
        ctx.beginPath();
        ctx.arc(pts[j].x * w, pts[j].y * h, r, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }
}
