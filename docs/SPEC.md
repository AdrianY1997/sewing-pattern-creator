# Sewing Pattern Creator — Especificación v1

## 1. Objetivo

App para trazar patrones de costura base (patronaje industrial) en todas las tallas a partir de tablas de medidas, editarlos (separar piezas, espejar, pinzas, márgenes de costura) con reglas de patronaje a tamaño real, y exportarlos a escala 1:1 (A0 u hoja única tamaño real).

## 2. Decisiones técnicas

- Web app SPA: Vite + React + TypeScript (strict). Instalable como PWA, funciona offline. Sin backend en v1.
- Render: SVG en el canvas del editor (precisión vectorial, fácil de exportar).
- Unidad interna: milímetros (float). La UI muestra cm con 1 decimal.
- Estado: Zustand. Persistencia: IndexedDB (idb-keyval) + exportar/importar proyecto como `.json`.
- PDF: pdf-lib (vectorial, 1 mm = 72/25.4 pt exacto). Exportación SVG nativa. DXF (AAMA/ASTM) queda para v2.
- Tests: Vitest (motor geométrico y trazados), Playwright (E2E y verificación de exportes).
- UI en español.
- Despliegue: la app se publica en GitHub Pages (https://adriany1997.github.io/sewing-pattern-creator/) mediante GitHub Actions (`.github/workflows/deploy.yml`) en cada push a `main`, tras lint, typecheck, test y build. El `base` de Vite es `'/sewing-pattern-creator/'` y el enrutado es por hash.
- Estructura de carpetas:
  - `src/core`: geometría, sin React.
  - `src/blocks`: trazados paramétricos.
  - `src/data`: tablas de medidas.
  - `src/editor`: UI/canvas.
  - `src/export`: exportación.

## 3. Tablas de medidas (datos incluidos)

Se guardan como datos tipados con metadatos: sistema, sexo, origen, y si cada medida es contorno completo o media medida.

### 3.1 Mujer — Tallas industriales Colombia (Fashion Patrón)

Contornos completos, en cm.

| Medida | 6 (XS) | 8 (S) | 10 (M) | 12 (L) | 14 (XL) | 16 (XXL) | Dif. |
|---|---|---|---|---|---|---|---|
| Contorno de pecho | 84 | 88 | 92 | 96 | 100 | 104 | +4 |
| Contorno de cintura | 60 | 64 | 68 | 72 | 76 | 80 | +4 |
| Contorno de cadera | 88 | 92 | 96 | 100 | 104 | 108 | +4 |
| Largo de hombro | 11.5 | 11.75 | 12 | 12.25 | 12.5 | 12.75 | +0.25 |
| Alto de cadera | 18 | 19 | 20 | 21 | 22 | 23 | +1 |
| Alto de pecho | 24 | 25 | 26 | 27 | 28 | 29 | +1 |
| Contorno de cuello | 36 | 37 | 38 | 39 | 40 | 41 | +1 |
| Largo talle delantero | 43.5 | 44 | 44.5 | 45 | 45.5 | 46 | +0.5 |
| Largo talle espalda | 41.5 | 42 | 42.5 | 43 | 43.5 | 44 | +0.5 |
| Ancho de pecho (1/2) | 15.5 | 16 | 16.5 | 17 | 17.5 | 18 | +0.5 |
| Ancho de espalda (1/2) | 16.5 | 17 | 17.5 | 18 | 18.5 | 19 | +0.5 |
| Separación de pecho (1/2) | 9 | 9.5 | 10 | 10.5 | 11 | 11.5 | +0.5 |
| Contorno de brazo | 26 | 28 | 30 | 32 | 34 | 36 | +2 |
| Largo de manga | 59 | 60 | 61 | 62 | 63 | 64 | +1 |
| Contorno muñeca | 14 | 15 | 16 | 17 | 18 | 19 | +1 |

### 3.2 Hombre — EASD Valencia, tallas españolas

Pecho, cintura y cadera son MEDIAS medidas (talla = 1/2 contorno de pecho). Medidas en cm.

| Medida | 40 | 42 | 44 | 46 | 48 | 50 | 52 | 54 |
|---|---|---|---|---|---|---|---|---|
| Radio de escote | 7.2 | 7.4 | 7.6 | 7.8 | 8 | 8.2 | 8.4 | 8.6 |
| Altura de cadera | 16 | 16 | 16 | 16 | 16 | 16 | 16 | 16 |
| Pecho | 40 | 42 | 44 | 46 | 48 | 50 | 52 | 54 |
| Cintura | 32 | 34 | 36 | 38 | 40 | 44 | 46 | 49 |
| Cadera | 42 | 44 | 46 | 48 | 50 | 52 | 54 | 56 |
| Ancho de espalda | 19.5 | 20 | 20.5 | 21 | 21.5 | 22 | 22.5 | 23 |
| Largo de talle | 41.5 | 42 | 42.5 | 43 | 43.5 | 44.5 | 45.5 | 46.2 |
| Largo de manga | 60 | 60 | 60 | 61 | 61 | 62 | 63 | 64 |
| Profundidad de sisa | 21 | 21.5 | 22 | 22.5 | 23 | 23.5 | 24 | 24.5 |
| Largo de tiro | 19.5 | 20 | 20.5 | 21 | 21.5 | 22 | 22.5 | 23 |
| Largo de rodilla | 48 | 48.5 | 49 | 49.5 | 50 | 50.5 | 51 | 51.5 |
| Largo total de pantalón | 104 | 104.5 | 105 | 105.5 | 106 | 106.5 | 107 | 107.5 |
| Ancho bocamanga | 12 | 12.5 | 13 | 13.5 | 14 | 14.5 | 15 | 15.5 |
| Ancho de camal | 12 | 12.5 | 13 | 13.5 | 14 | 14.5 | 15 | 15.5 |
| Ancho de rodilla | 12.5 | 13 | 13.5 | 14 | 14.5 | 15 | 15.5 | 16 |

Notas de datos: la cintura de hombre salta +4 entre 48→50 y +3 entre 52→54, y el largo de talle de la 54 es 46.2. Se respetan tal cual el original; la app los marca como "irregularidad de escalado" pero no los corrige.

### 3.3 Medidas propias

- El usuario puede crear tablas o medidas individuales (duplicar una talla y editarla).
- Medidas complementarias con valor por defecto editable cuando la tabla no las trae: las de §3.4 por talla, más altura de copa de manga (derivada de sisa) y holguras (ease) por bloque. El valor por defecto de largo de falda pasa a ser el de §3.4 (antes 60 cm fijos).
- El pantalón base de mujer entra en v1 usando las medidas de §3.4. El usuario puede sobrescribir cualquier valor (tabla original o complementario) por talla o de forma individual; los valores sobrescritos se marcan en la UI.

### 3.4 Medidas complementarias

Medidas que las tablas 3.1 y 3.2 no traen y que los bloques base necesitan. Se guardan aparte de las tablas originales (3.1 y 3.2 no se modifican), con su método de obtención en los metadatos, y son editables por el usuario. Las filas marcadas "derivado" no vienen de una tabla publicada: son estimaciones y deben validarse con prueba de tela.

#### 3.4.1 Mujer — complementarias (contornos completos, en cm; salvo "(1/2)" = media medida)

Fuente principal: Winifred Aldrich, *Metric Pattern Cutting for Women's Wear*, 6.ª ed., tabla "Standard body measurements – women's sizing" (mujer de 160–172 cm). Reproducción consultada: https://courses.ideate.cmu.edu/99-361/s2021a/wp-content/uploads/2021/02/Standard-Measurements-Metric-Pattern-Cutting-1.pdf
Correspondencia de tallas: las tallas Colombia 6–16 se emparejan con las columnas Aldrich 8–18 por contorno de pecho (84, 88, 92, 96, 100, 104). Solo se toman medidas verticales y de bajo (no dependen de cintura/cadera, que difieren 4 cm entre ambos sistemas). Nota: Fashion Patrón no publica estas medidas en las fuentes accesibles; no se encontró una tabla colombiana (SENA u otra) legible con ellas.

| Medida | 6 | 8 | 10 | 12 | 14 | 16 | Dif. | Fuente / método |
|---|---|---|---|---|---|---|---|---|
| Largo cintura a rodilla | 58 | 58.5 | 59 | 59.5 | 60 | 60.5 | +0.5 | Aldrich "waist to knee" (directo) |
| Largo de falda (a la rodilla) | 58 | 58.5 | 59 | 59.5 | 60 | 60.5 | +0.5 | = cintura a rodilla (Aldrich); editable (la 14 coincide con el antiguo 60 por defecto) |
| Largo total de pantalón (cintura a piso) | 103 | 104 | 105 | 106 | 107 | 108 | +1 | Aldrich "waist to floor" (directo) |
| Tiro (cintura a asiento, sentada) | 27.3 | 28 | 28.7 | 29.4 | 30.1 | 30.8 | +0.7 | Aldrich "body rise" (directo) |
| Contorno de muslo | 53 | 55 | 57.5 | 60 | 62.5 | 65 | +2.4 | Derivado: 0.60 × contorno de cadera (3.1), redondeado a 0.5. Contraste: ANSUR II, media 61.6 cm bajo el glúteo (https://www.nathantailors.com/en/blog/ideal-thigh-size-women-data-2026) |
| Contorno de rodilla | 34 | 35 | 36 | 37 | 38 | 39 | +1 | Derivado: +1 por talla, anclado en 37 para la talla 12 (orden de magnitud de ANSUR II sobre la rodilla). Sin fuente publicada por talla |
| Contorno de tobillo | 23.5 | 24 | 24.5 | 25 | 25.5 | 26 | +0.5 | Aldrich "ankle" (directo) |
| Ancho de bota, recto (1/2) | 21.5 | 22 | 22.5 | 23 | 23.5 | 24 | +0.5 | Aldrich "trouser bottom width" (directo; ancho plano por pernera) |
| Ancho de bota, ajustado/jean (1/2) | 18.5 | 19 | 19 | 19.5 | 19.5 | 20 | +0.5 (irregular) | Aldrich "jeans bottom width" (directo) |

Notas: Aldrich da el tiro como altura sentada desde cintura natural; la cintura Colombia es 4 cm menor que la Aldrich de la misma columna, lo que no afecta a las medidas verticales. El largo de entrepierna no se tabula: el bloque lo calcula como largo total − tiro y se puede sobrescribir. Muslo y rodilla son las únicas filas derivadas.

#### 3.4.2 Hombre — complementarias (convención EASD: pecho/cintura/cadera = medias medidas; aquí cada fila indica su convención)

No existe en línea una única tabla masculina por tallas 40–54 con todas estas medidas; se combinan dos tablas métricas publicadas (en cm) y cada fila indica de cuál sale (revisado 23/10/2026):

- **[OTT]** Ottobre Design, tabla "Men 46–60" (cm, tallas europeas 46–60 = pecho 92–120): https://www.ottobredesign.com/pages/men-46-60 (leída en la página HTML; el PDF "tabla para anotar" ya no está disponible, 404). Trae largo de hombro y contorno de cuello (también ancho de espalda y largo de espalda a cintura), pero NO muñeca, brazo ni muslo.
- **[KER]** Gareth Kershaw, *Patternmaking for Menswear* (Laurence King, 2013), cap. 1 "Size charts", "Sample European body size chart" (EU34–EU44 = pecho 88–108 cm; medidas corporales tomadas con escáner 3D). Consultada a través de una copia de texto en línea del libro; las imágenes de las tablas están adjuntas en https://forum.seamly.io/t/patternmaking-for-menswear-by-gareth-kershaw/1773. Trae cuello (base), largo de hombro, ancho de espalda y de pecho, muñeca y muslo; NO trae contorno de brazo/bíceps ni largo de camisa.
- **Correspondencia de tallas**: las tallas EASD 44–54 se emparejan con las columnas Kershaw/Ottobre por contorno de pecho (88, 92, 96, 100, 104, 108 cm = 2 × talla). Para las tallas 40 y 42 (pecho 80 y 84) ninguna fuente llega: se EXTRAPOLA linealmente con la gradación que las propias tablas publican (marcado "extrapolado"). No se interpola entre columnas porque las tallas coinciden exactamente. No hubo conversión de pulgadas.

| Medida | 40 | 42 | 44 | 46 | 48 | 50 | 52 | 54 | Convención | Fuente / método |
|---|---|---|---|---|---|---|---|---|---|---|
| Contorno de cuello | 36 | 37 | 38 | 39 | 40 | 41 | 42 | 43 | completo | **Fuente**: [OTT] "Neck circumference" (46–54: 39…43, directo) y [KER] "Neck base circumference" (44–54: 38…43, directo; coinciden en las tallas comunes). 40–42: extrapolado con +1 por talla (pendiente de ambas tablas; contraste: Fashion Frozen da cuello 37 para pecho 84, https://fashionfrozen.com/tabella-taglie-e-vestibilita-uomo/). Sin cambio respecto a la estimación previa. Se conserva el radio de escote de 3.2 |
| Largo de hombro | 13.1 | 13.4 | 13.7 | 14 | 14.3 | 14.6 | 14.9 | 15.2 | medida lineal | **Fuente**: [OTT] "Shoulder length" (46–54: 14…15.2, directo) y [KER] "Shoulder length" (44–54: 13.7…15.2, directo; coinciden). 40–42: extrapolado con +0.3 por talla (gradación de ambas tablas). Sin cambio respecto a la estimación previa |
| Ancho de pecho (1/2) | 17 | 17.5 | 18 | 18.5 | 19 | 19.5 | 20 | 20.5 | media medida | **Parcialmente fuente**: ancho de espalda EASD (3.2) − 2.5. El 2.5 sale de [KER]: ancho de espalda − ancho de pecho = 5 cm en todas las tallas (completo; 2.5 en media medida; p. ej. 39 − 34 en la 48). No se toma el valor absoluto de [KER] (17 en media medida para la 48) porque su "ancho de espalda" (39 completo) se mide entre las líneas verticales de las axilas y no coincide con el de EASD (43 completo). Antes: espalda − 2 (cambio −0.5) |
| Contorno de brazo | 27.2 | 28.4 | 29.6 | 30.8 | 32 | 33.2 | 34.4 | 35.6 | completo | **estimado (sin fuente)**: 32 en la 48, gradación +1.2 por talla. Ni [OTT] ni [KER] traen bíceps/brazo, y no se pudo leer Aldrich *Menswear* (solo existe en línea la tabla de mujer), ASTM D6240 (de pago), ni las tablas de Alvanon (Scribd/PDF solo con definiciones). Contraste de orden de magnitud: Craft Yarn Council, "Upper arm" para hombre (tallas S–XL, 30.5 / 33 / 38 / 39.5 cm; tabla de punto con saltos irregulares), https://www.craftyarncouncil.com/standards/man-size, que interpolado en pecho 92–100 da 31.3–33.5 cm, a ≤ 0.5 cm de los valores de esta fila |
| Contorno de muñeca | 16.8 | 17 | 17.2 | 17.4 | 17.6 | 17.8 | 18 | 18.2 | completo | **Fuente**: [KER] "Wrist circumference" (44–54: 17.2…18.2, directo; gradación +0.2 por talla). 40–42: extrapolado con +0.2 por talla. Antes: 16.8 en la 48 con +0.4 por talla; cambia +1.6 (40), +1.4 (42), +1.2 (44) |
| Largo total de camisa | 73.5 | 74 | 74.5 | 75 | 75.5 | 76.5 | 77.5 | 78.2 | medida lineal | **estimado (sin fuente estándar)**: largo de talle (3.2) + 32; hereda su irregularidad en 50–54. El largo de camisa es una medida de diseño, no corporal, y no existe tabla estándar: se buscaron las tablas de Ottobre, Kershaw (solo traen largo de espalda a cintura: 44.7 en la 48) y marcas. Contraste: Tapered Menswear, largo de espalda de camisa por pecho (cm): 74 (S, pecho 89–94), 75 (M, 94–99), 77 (L, 99–104), 79 (XL, 104–109), https://taperedmenswear.com/pages/size-guide; Opalona 77 cm (M). Esos 74–79 cm coinciden con 75–78.2 de esta fila a ≤ 1.5 cm |
| Contorno de muslo | 49.1 | 50.9 | 52.7 | 54.5 | 56.3 | 58.1 | 59.9 | 61.7 | completo | **Fuente**: [KER] "Thigh circumference" (44–54: 52.7…61.7, directo; medido a 5 cm bajo la entrepierna, el punto más ancho de la pierna; +1.8 por talla). 40–42: extrapolado con +1.8 por talla. Reemplaza la estimación 0.60 × cadera, que sobrestimaba 3.7 cm en la 48 (cambio −1.4 a −5.3 según talla). Contraste: media de 57 cm en el punto más ancho (https://www.nathantailors.com/guides/average-male-body-measurements) |

Notas: la app marca como "derivado/estimado" solo las filas "estimado (sin fuente)" (contorno de brazo, largo total de camisa) y como "parcial" el ancho de pecho; el resto vienen de [OTT]/[KER] en 44–54 y son extrapolación lineal en 40–42. [KER] es un modelo de ajuste europeo (corpulencia media) y las medidas de EASD se midieron en otra población: validar con prueba de tela. Contorno de rodilla y de tobillo no se añaden: el pantalón masculino usa ancho de rodilla y ancho de camal de 3.2. Para cerrar las dos filas pendientes habría que consultar Aldrich *Metric Pattern Cutting for Menswear* (cap. "Standard body measurements"; trae brazo y muslo por talla de pecho 88–112) en papel.

## 4. Bloques base (trazados paramétricos)

Cada bloque es una función pura `draft(medidas, opciones) → Draft` en TypeScript, que construye puntos con nombre (A, B, C… como en un método de patronaje), líneas y curvas. Mismo código → todas las tallas.

- Mujer: cuerpo base delantero + espalda (con pinzas de busto y cintura), manga base, falda base delantera + trasera, pantalón base delantero + trasero (usa las medidas complementarias de §3.4).
- Hombre: cuerpo base / camisa delantero + espalda, manga base, pantalón base delantero + trasero.
- Holguras por defecto configurables por bloque.
- Al trazar, las piezas de un bloque salen juntas en un mismo marco de trazo (p. ej. delantero y espalda superpuestos en el rectángulo base, como en el método tradicional).

## 5. Motor geométrico (`src/core`)

- Primitivas: punto, segmento, Bézier cúbica, path (cerrado/abierto), pieza.
- Construcción: punto a distancia/ángulo, intersecciones línea-línea y línea-curva, perpendiculares, punto sobre curva a longitud dada, longitud de curva (para casar sisa con copa de manga, verificar costuras).
- Curvas con restricciones de tangencia: escote perpendicular al centro delantero/espalda, sisa perpendicular al costado en el fondo, cadera tangente a la vertical, etc.
- Offset de path (márgenes de costura) con esquinas resueltas (ángulo recto/espejo en las esquinas).
- IDs estables en puntos y aristas para que las operaciones puedan reproducirse en otras tallas (sección 7).

## 6. Reglas de patronaje a tamaño real

- Herramientas tipo plantilla: regla recta / escuadra L, curvígrafo (curva francesa), regla de cadera, regla de sastre. Geometrías fijas en mm, como las reglas físicas.
- El usuario coloca, rota y desliza la regla sobre el lienzo y traza el tramo de curva entre dos puntos; el tramo trazado se convierte en Bézier editable.
- Vista "tamaño real" 1:1 en pantalla con calibración: el usuario ajusta en pantalla un rectángulo del tamaño de una tarjeta (85.6 × 53.98 mm) o mide 10 cm con una regla física; se guarda el factor px/mm.
- Ajuste a puntos (snap) a puntos con nombre, extremos, intersecciones y cuadrícula.

## 7. Edición de piezas

- Separar/sustraer piezas: del trazo conjunto se extrae una región cerrada como pieza independiente (el original queda).
- Espejar: sobre un eje cualquiera o "cortar al doblez" (genera la pieza completa a partir de la mitad y marca la línea de doblez).
- Mover, rotar, duplicar, alinear.
- Pinzas: crear, cerrar/trasladar (rotación alrededor del vértice/pivote), convertir en recogido.
- Márgenes de costura por arista (valores distintos por tramo, por defecto 1 cm, dobladillo configurable).
- Marcas: piquetes, hilo/sentido del hilo, línea de doblez, botones/ojales, texto.
- Etiqueta de pieza: nombre, talla, "cortar ×N", tela.
- Deshacer/rehacer ilimitado.
- Las ediciones se registran como una lista de operaciones que referencian IDs estables. Al cambiar de talla la lista se vuelve a aplicar al trazo nuevo. Si una operación ya no se puede aplicar, se avisa (no falla en silencio).

### 7.1 Registro de operaciones (F4a, `src/core/ops`)

`pattern = replay(draftBlock(bloque, talla, opciones), operaciones)`. Cada operación es JSON `{ id, type, ...params }` y solo referencia IDs del trazo (pieza, segmento, punto) o números que escribe el usuario (mm, grados). `replay` nunca lanza: una operación que no se puede aplicar se salta y devuelve `{ opId, message }` en `issues`; el editor lo muestra en el panel derecho sin bloquear.

| Operación | Efecto |
|---|---|
| `extractPiece { pieceId }` / `extractAll` | Copia la geometría de la pieza (segmentos, líneas internas, marcas, puntos) a una pieza independiente con su propia transformación afín; el trazo conjunto no cambia. Idempotente por `pieceId`. La pieza nueva se coloca a la derecha de las ya separadas, a 30 mm. |
| `transformPiece { pieceId, translate?, rotateDeg?, pivot? }` | Rota (grados, horario en pantalla) alrededor de `'center'` (centro de la caja) o de un punto con nombre, y luego traslada (mm). |
| `mirrorPiece { pieceId, axis, keepOriginal }` | Eje `'vertical'`/`'horizontal'` por el centro de la caja, o `{ segmentId }`. Con `keepOriginal` añade una copia `${pieceId}~m` (`~m2`…). |
| `cutOnFold { pieceId, foldSegmentId }` | Despliega la pieza sobre un borde recto (y los bordes colineales contiguos, p. ej. `back.cb` + `back.cbHip`): la mitad espejada lleva IDs `${id}~m`, el hilo no se duplica y queda marcada la línea de doblez. |
| `duplicatePiece { pieceId, newId }`, `deletePiece`, `setPieceMeta { name?, cutCount?, fabric?, onFold? }` | Copiar, borrar (solo piezas separadas) y editar la etiqueta. |
| `autoLayout { gapMm = 30 }` | Estantes: de mayor a menor alto, filas de hasta 1500 mm, cajas separadas ≥ `gapMm` (sin solapes). |

- Rotar y espejar cambian solo la transformación de la pieza: los IDs de segmento se conservan y las operaciones siguientes los siguen resolviendo.
- **Anclaje de escalado** (tallas anidadas en la vista Piezas): las tallas de cada pieza se superponen alineadas en (1) el inicio de la línea de doblez si se desplegó; si no, (2) el primer punto del contorno sobre la línea de centro (inicio, en orden de recorrido, del primer segmento `*.cb*` / `*.cf*`; p. ej. el punto de escote en el centro espalda); si no hay, (3) la esquina superior izquierda de la caja. Como los IDs son iguales en todas las tallas, (1) y (2) eligen el mismo punto de construcción en todas.
- El editor guarda `operations[]` con el proyecto y pilas de deshacer/rehacer de listas de operaciones; un arrastre (Mover/Rotar) genera una sola operación al soltar.

## 8. Escalado (todas las tallas)

- Selector de talla y vista de tallas anidadas (todas superpuestas con color por talla).
- Exportar varias tallas a la vez.

## 9. Exportación

- PDF vectorial a escala 1:1 exacta:
  - A0 (841 × 1189 mm), varias hojas A0 si no cabe.
  - Hoja única a tamaño real (página = caja delimitadora + margen), para plóter/copistería.
- Cada exporte lleva un cuadrado de prueba de 10 × 10 cm.
- Selección de piezas, tallas y capas (márgenes, marcas, construcción) a exportar.
- SVG con unidades en mm.
- Disposición automática simple (colocación de piezas sin solaparse) con ajuste manual.
- Enviar a a0-to-domestic para mosaico doméstico (ver docs/integrations/a0-to-domestic.md)

## 10. Persistencia

- Proyectos en IndexedDB; lista de proyectos; autoguardado.
- Exportar/importar `.json` del proyecto (con versión de esquema).

## 11. Calidad / criterios de aceptación

- Tests unitarios del motor geométrico (intersecciones, longitudes, offset).
- Tests de cada bloque: para tallas de referencia (mujer 10, hombre 48) los puntos clave coinciden con valores esperados documentados, las costuras emparejadas tienen la misma longitud (±1 mm) y la copa de manga respeta la sisa más su embebido.
- Test E2E del PDF: el tamaño de página y el cuadrado de prueba miden exactamente lo esperado en mm.
- Playwright: flujo trazar → separar → espejar → margen → exportar.

## 12. Fases

- **F0:** Andamiaje (Vite/React/TS, Vitest, Playwright, lint, estructura de carpetas) y CI/CD a GitHub Pages (`deploy.yml`).
- **F1:** Datos de medidas + motor geométrico + bloque cuerpo base mujer.
- **F2:** Editor de lienzo (zoom/paneo, capas, selección, snap, calibración y vista 1:1).
- Layout y estilo según docs/UI.md (referencia: docs/example-layout.png)
- **F3:** Resto de bloques (manga, falda, pantalón mujer, bloques hombre, pantalón hombre).
- **F4:** Operaciones de edición (separar, espejar, pinzas, márgenes, marcas, deshacer).
- **F5:** Reglas de patronaje a tamaño real.
- **F6:** Exportación (PDF A0 / hoja única, SVG), integración a0-to-domestic.
- **F7:** Escalado anidado y reproducción de operaciones entre tallas.
- **v2:** DXF-AAMA, transformaciones (desplazar y abrir), app de escritorio (Tauri) si hace falta acceso a plóter.

## 13. Fuera de alcance v1

Backend/cuentas, colaboración, simulación 3D, marcadas de corte optimizadas (nesting avanzado).
