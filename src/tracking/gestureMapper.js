// Traduce puntos de la mano a parámetros de alto nivel para las partículas,
// y suaviza el ruido entre fotogramas. Así la escena no depende de MediaPipe.
// TODO (paso 4):
//   - posición de la palma → coordenadas del mundo 3D
//   - distancia pulgar–índice → "pellizco" (0–1)
//   - mano abierta / puño
//   - suavizado (lerp o filtro One Euro)

export class GestureMapper {
  update(hands) {
    return {
      handPresent: false,
      position: { x: 0, y: 0, z: 0 },
      pinch: 0,
      openness: 0,
    };
  }
}
