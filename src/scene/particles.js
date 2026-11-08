// Sistema de partículas: un único THREE.Points con BufferGeometry
// (posiciones + velocidades en Float32Array) para manejar miles de partículas.
// TODO (paso 2): crear geometría y material.
// TODO (paso 4): reaccionar a los parámetros que llegan de GestureMapper
//   (p. ej. atractor en la posición de la mano, dispersión al abrirla).

export class ParticleSystem {
  constructor(scene, count = 5000) {
    this.scene = scene;
    this.count = count;
  }

  update(time, params = {}) {
    // Integrar velocidades, aplicar fuerzas, marcar position.needsUpdate.
  }
}
