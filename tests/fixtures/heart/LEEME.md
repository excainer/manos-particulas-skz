# Muestras reales para calibrar el detector

1. `npm run dev` y abre `http://localhost:5173/?debug`
2. Activa la cámara.
3. Pulsa **C**, coloca las manos durante la cuenta atrás de 3 s y mantén el gesto mientras se graba.
   Pulsa **N** para grabar un gesto que NO debe detectarse (manos en oración, triángulo, aplauso…).
4. Copia los `.json` descargados a esta carpeta y ejecuta `npm test`.

- `corazon-*.json`: el detector debe dispararse.
- `no-corazon-*.json`: el detector no debe dispararse ni llegar al umbral.
