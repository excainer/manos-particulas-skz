// Puntos de destino con forma de corazón 3D para el sistema de partículas.
//
// Superficie implícita clásica del corazón (y hacia arriba, z en profundidad):
//   (x² + 9/4·z² + y² − 1)³ − x²·y³ − 9/80·z²·y³ = 0
// Negativa dentro, positiva fuera. Para cada partícula se lanza un rayo en una
// dirección aleatoria desde el centro, se busca por bisección dónde corta la
// superficie y se coloca el punto en una capa fina bajo ella: así el corazón se
// lee bien (contorno definido) sin acumular partículas en su interior.
//
// Resultado en unidades propias: ancho ≈ 2,3, alto ≈ 2,2 (de −1 a ≈ 1,2,
// recentrado), profundidad ≈ 1,3. La escena lo escala y lo orienta hacia la cámara.

export function heartField(x, y, z) {
  const a = x * x + 2.25 * z * z + y * y - 1;
  return a * a * a - x * x * y * y * y - 0.1125 * z * z * y * y * y;
}

const Y_OFFSET = -0.1; // recentra verticalmente (la cima de los lóbulos sube más que la punta)

export function buildHeartTargets(count, rand = Math.random) {
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // Dirección aleatoria uniforme en la esfera.
    const u = rand() * 2 - 1;
    const phi = rand() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const dx = s * Math.cos(phi);
    const dy = u;
    const dz = s * Math.sin(phi);

    // Bisección del radio donde el rayo sale del corazón (el origen está dentro).
    let lo = 0;
    let hi = 2;
    for (let k = 0; k < 24; k++) {
      const m = (lo + hi) / 2;
      if (heartField(dx * m, dy * m, dz * m) < 0) lo = m;
      else hi = m;
    }

    // Capa fina bajo la superficie, más densa cerca del borde.
    const r = lo * (0.8 + 0.2 * Math.sqrt(rand()));
    out[i * 3] = dx * r;
    out[i * 3 + 1] = dy * r + Y_OFFSET;
    out[i * 3 + 2] = dz * r;
  }
  return out;
}
