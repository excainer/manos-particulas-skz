// Escena base de Three.js: renderer, cámara, y ajuste al redimensionar.
// TODO (paso 2): implementar con three.

export function createScene(canvas) {
  // const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  // const scene = new THREE.Scene();
  // const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100);
  // window.addEventListener('resize', ...);
  return {
    renderer: { render() {} }, // marcador de posición hasta el paso 2
    scene: null,
    camera: null,
  };
}
