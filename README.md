# Manos y partículas

Experimento: controlar un sistema de partículas 3D con las manos vía webcam.

**[▶ Probar la demo](https://excainer.github.io/manos-particulas-skz/)** — necesita webcam; todo se procesa en tu navegador, el vídeo no sale de tu equipo.

- **Three.js**: renderizado 3D
- **MediaPipe Hands** (`@mediapipe/tasks-vision`, HandLandmarker): detección de manos en el navegador
- **Vite**: servidor de desarrollo y empaquetado

## Estructura

```
index.html                  lienzo, vídeo de webcam y HUD
src/main.js                 conecta los módulos y corre el bucle
src/scene/scene.js          renderer, cámara, resize
src/scene/particles.js      sistema de partículas (THREE.Points)
src/tracking/handTracker.js webcam + MediaPipe → puntos de la mano
src/tracking/gestureMapper.js puntos → parámetros (posición, pellizco, apertura)
```

## Hoja de ruta

1. Estructura inicial ✅
2. Escena Three.js con partículas animadas (sin manos) ✅
3. Webcam + MediaPipe, dibujar los puntos detectados ✅
4. Mapear gestos a fuerzas sobre las partículas ✅
5. Pulido visual (shaders, color, rendimiento) ✅

## Gestos

| Gesto | Efecto |
|---|---|
| Puño | atrae las partículas cercanas y las hace girar en remolino |
| Mano abierta | las repele, abriendo un hueco |
| Puño → abierta | lanza una onda expansiva que recorre la galaxia |
| Pellizco (pulgar + índice) | ilumina las partículas cercanas y acelera el giro de la galaxia |
| Dos manos | separarlas agranda la galaxia, juntarlas la encoge |
| Corazón con las dos manos | la galaxia se reúne en un corazón 3D que late, con música y una frase |

## Ejecutar en local

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # pruebas (gestos y detector de corazón)
```

La música de la secuencia del corazón es *Hold My Hand* de HAN (Stray Kids), en `public/audio/cancion.mp3`.
Todos los derechos pertenecen a sus autores; se incluye sin fines comerciales.

## Parámetros de URL (desarrollo)

- `?autostart`: activa la cámara al cargar
- `?debug`: muestra fps, resolución de render y los valores crudos de apertura y pellizco
- `?demo=fist|open|pinch|two|wave`: manos simuladas, sin cámara

## Rendimiento

- Toda la animación se calcula en el vertex shader: por fotograma solo cambian unos pocos uniforms.
- Calidad adaptativa (`src/scene/quality.js`): si los fps bajan de 45, reduce la resolución de render
  por niveles; si se recuperan, la vuelve a subir (sin oscilar).
- MediaPipe solo procesa fotogramas nuevos de la cámara (~30 fps), no cada fotograma de render.
