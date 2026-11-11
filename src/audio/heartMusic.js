// Música de la secuencia especial.
//
// Archivo:
//   public/audio/cancion.mp3
// Si no existe o el navegador no deja reproducirlo, la secuencia funciona igual,
// sin música y con su duración por defecto.
//
// Los navegadores solo permiten reproducir audio después de que la persona haya
// interactuado con la página. Aquí eso está garantizado: la cámara se activa con
// un clic, y la música se prepara (load) en ese mismo clic.

const DEFAULT_SRC = `${import.meta.env?.BASE_URL ?? '/'}audio/cancion.mp3`;

export class HeartMusic {
  constructor(src = DEFAULT_SRC) {
    this.src = src;
    this.audio = null;
    this.available = false;
  }

  // Precarga el archivo para conocer su duración antes de que haga falta.
  prepare() {
    if (this.audio) return;
    const audio = new Audio();
    audio.preload = 'auto';
    audio.addEventListener('loadedmetadata', () => {
      this.available = Number.isFinite(audio.duration) && audio.duration > 0;
    });
    audio.addEventListener('error', () => {
      this.available = false;
      console.info('[música] no se encontró', this.src, '(la secuencia seguirá sin música)');
    });
    audio.src = this.src;
    audio.load();
    this.audio = audio;
  }

  // Duración en segundos, o null si no hay música disponible.
  get duration() {
    return this.available ? this.audio.duration : null;
  }

  get playing() {
    return !!this.audio && !this.audio.paused;
  }

  // Reproduce desde el principio. Devuelve true si de verdad está sonando.
  async play() {
    if (!this.audio) this.prepare();
    if (!this.available) return false;
    try {
      this.audio.currentTime = 0;
      this.audio.volume = 1;
      await this.audio.play();
      return true;
    } catch (err) {
      console.info('[música] el navegador no permitió reproducirla:', err?.name);
      return false;
    }
  }

  setVolume(v) {
    if (this.audio) this.audio.volume = Math.min(1, Math.max(0, v));
  }

  stop() {
    if (!this.audio) return;
    this.audio.pause();
    this.audio.currentTime = 0;
  }
}
