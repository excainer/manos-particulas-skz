# Manos y partículas

Experimento: controlar un sistema de partículas 3D con las manos vía webcam.

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
5. Pulido visual (shaders, color, rendimiento)

## Gestos

| Gesto | Efecto |
|---|---|
| Puño | atrae las partículas cercanas y las hace girar en remolino |
| Mano abierta | las repele, abriendo un hueco |
| Pellizco (pulgar + índice) | ilumina las partículas cercanas y acelera el giro de la galaxia |
| Dos manos | separarlas agranda la galaxia, juntarlas la encoge |

## Parámetros de URL (desarrollo)

- `?autostart`: activa la cámara al cargar
- `?debug`: muestra los valores crudos de apertura y pellizco, para ajustar umbrales
- `?demo=fist|open|pinch|two`: manos simuladas, sin cámara
