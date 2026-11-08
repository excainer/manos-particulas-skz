// Calidad adaptativa: mide los fps reales y, si caen, baja la resolución de
// render (la densidad de píxeles). Es lo que más pesa en esta escena: bloom y
// miles de partículas con transparencia dependen del número de píxeles.
//
// Si los fps se recuperan, intenta subir un nivel; si tras subir vuelve a caer,
// se queda en el nivel inferior para no oscilar.

const CAPS = [2, 1.5, 1.25, 1, 0.75]; // límites de densidad de píxeles, de mejor a peor

export class QualityManager {
  constructor(setPixelRatioCap, { minFps = 45, goodFps = 57 } = {}) {
    // Solo los niveles que cambian algo en esta pantalla
    // (con densidad 1, los límites 2, 1.5 y 1.25 son idénticos a 1).
    const dpr = window.devicePixelRatio || 1;
    this.levels = [...new Set(CAPS.map((c) => Math.min(dpr, c)))];
    this.setPixelRatioCap = setPixelRatioCap;
    this.minFps = minFps;
    this.goodFps = goodFps;
    this.level = 0;
    this.maxLevel = 0; // el mejor nivel permitido (baja si una subida falla)
    this.fps = 60;
    this.lastTime = null;
    this.windowStart = null;
    this.frames = 0;
    this.goodSince = null;
    this.lastUpgrade = -Infinity;
  }

  get pixelRatioCap() {
    return this.levels[this.level];
  }

  // Llamar una vez por fotograma con el tiempo de requestAnimationFrame.
  tick(timeMs) {
    // Saltos grandes (pestaña en segundo plano, depurador…) no cuentan.
    if (this.lastTime !== null && timeMs - this.lastTime > 250) this.windowStart = null;
    this.lastTime = timeMs;
    if (this.windowStart === null) {
      this.windowStart = timeMs;
      this.frames = 0;
      return;
    }
    this.frames++;
    const elapsed = timeMs - this.windowStart;
    if (elapsed < 1000) return;

    // Una medida por segundo.
    this.fps = (this.frames * 1000) / elapsed;
    this.windowStart = timeMs;
    this.frames = 0;

    if (this.fps < this.minFps && this.level < this.levels.length - 1) {
      // Si acabamos de subir y no aguanta, ese nivel queda vetado.
      if (timeMs - this.lastUpgrade < 5000) this.maxLevel = this.level + 1;
      this.#apply(this.level + 1);
      this.goodSince = null;
    } else if (this.fps >= this.goodFps && this.level > this.maxLevel) {
      this.goodSince ??= timeMs;
      if (timeMs - this.goodSince > 8000) {
        this.#apply(this.level - 1);
        this.lastUpgrade = timeMs;
        this.goodSince = null;
      }
    } else {
      this.goodSince = null;
    }
  }

  #apply(level) {
    this.level = level;
    this.setPixelRatioCap(this.levels[level]);
  }
}
