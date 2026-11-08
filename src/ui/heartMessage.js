// Frase que acompaña a la secuencia especial.
//
// Aparece cuando el corazón ya está formado: las palabras surgen una a una (de un leve
// desenfoque a nítidas), se queda mientras late y se desvanece justo antes de que el
// corazón vuelva a la galaxia. Mientras está visible, el resto de la interfaz (leyenda,
// miniatura de la cámara) se aparta para que el momento quede limpio.
//
// El texto y sus estilos se crean desde aquí: no hay rastro en el HTML ni en la hoja de estilos.

export const HEART_MESSAGE = ['Antes de ti, estaba perdido en la oscuridad,', 'sin ningún lugar adonde ir'];

const SHOW_AFTER = 2.2; // s desde el inicio: el corazón ya está formado
const HIDE_BEFORE_END = 2.6; // s antes del final: empieza a irse antes que el corazón
const WORD_STAGGER = 0.16; // s entre palabra y palabra

// Lógica pura (se prueba en Node): ¿debe verse la frase en este instante?
export function messageVisible(elapsed, duration) {
  return elapsed >= SHOW_AFTER && elapsed < duration - HIDE_BEFORE_END;
}

const STYLE = `
  .frase-momento {
    position: fixed;
    left: 50%;
    bottom: max(9vh, 56px);
    transform: translateX(-50%);
    width: min(92vw, 900px);
    margin: 0;
    text-align: center;
    font-family: "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif;
    font-style: italic;
    font-weight: 400;
    font-size: clamp(1.05rem, 2.6vw, 1.85rem);
    line-height: 1.5;
    letter-spacing: 0.02em;
    color: #ffe3ee;
    text-shadow: 0 0 18px rgba(255, 79, 134, 0.55), 0 0 2px rgba(255, 220, 235, 0.6);
    pointer-events: none;
    user-select: none;
    z-index: 5;
    transition: opacity 1.6s ease;
  }
  .frase-momento.saliendo { opacity: 0; }
  .frase-momento .linea { display: block; }
  .frase-momento .palabra {
    display: inline-block;
    opacity: 0;
    filter: blur(6px);
    transform: translateY(0.35em);
    animation: frase-palabra 1.4s ease forwards;
  }
  @keyframes frase-palabra {
    to { opacity: 1; filter: blur(0); transform: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    .frase-momento .palabra { animation-duration: 0.01s; animation-delay: 0s !important; }
  }

  /* El resto de la interfaz se aparta mientras dura el momento. */
  #ayuda, #camara, #hud { transition: opacity 1.2s ease; }
  body.momento #ayuda, body.momento #camara { opacity: 0; }
  body.momento #hud { opacity: 0.25; }
`;

export class HeartMessage {
  constructor(lines = HEART_MESSAGE) {
    this.lines = lines;
    this.el = null;
    this.visible = false;
    this.removeTimer = null;
  }

  // Llamar en cada fotograma con el estado de la secuencia (elapsed < 0 = no hay corazón).
  update(elapsed, duration) {
    const shouldShow = elapsed >= 0 && messageVisible(elapsed, duration);
    if (shouldShow && !this.visible) this.show();
    else if (!shouldShow && this.visible) this.hide();
  }

  show() {
    this.visible = true;
    clearTimeout(this.removeTimer);
    this.el?.remove();
    if (!document.getElementById('frase-momento-estilo')) {
      const style = document.createElement('style');
      style.id = 'frase-momento-estilo';
      style.textContent = STYLE;
      document.head.append(style);
    }

    const el = document.createElement('p');
    el.className = 'frase-momento';
    el.setAttribute('role', 'status'); // los lectores de pantalla también la anuncian
    let i = 0;
    for (const line of this.lines) {
      const lineEl = document.createElement('span');
      lineEl.className = 'linea';
      line.split(' ').forEach((word, w) => {
        const span = document.createElement('span');
        span.className = 'palabra';
        span.textContent = word;
        span.style.animationDelay = `${(i++ * WORD_STAGGER).toFixed(2)}s`;
        lineEl.append(span);
        if (w < line.split(' ').length - 1) lineEl.append(' ');
      });
      el.append(lineEl);
    }
    document.body.append(el);
    document.body.classList.add('momento');
    this.el = el;
  }

  hide() {
    this.visible = false;
    document.body.classList.remove('momento');
    if (!this.el) return;
    const el = this.el;
    el.classList.add('saliendo');
    this.removeTimer = setTimeout(() => el.remove(), 1800);
  }
}
