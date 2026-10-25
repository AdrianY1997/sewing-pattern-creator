# Manga base mujer (manga montada de una pieza): método de trazo

Implementación: `src/blocks/womenSleeve.ts` → `draftWomenSleeve(medidas, opciones) → Draft`.
Pruebas: `src/blocks/womenSleeve.test.ts`. Tabla de medidas: `co-women-industrial` (SPEC §3.1, tallas 6–16).
La manga se monta en el cuerpo base de `docs/blocks/women-bodice.md`: las longitudes de sisa salen de `draftWomenBodice` con las mismas medidas y las opciones por defecto (`womenBodiceArmhole`).

## 1. Fuentes

- **Fashion Patrón, vídeo "2.7. Trazado de Patrón de la manga base"** (curso gratuito de Seamly2D, módulo 2): https://www.youtube.com/watch?v=Xh2S-Bn-LAA. Es la manga del mismo patrón base cuerpo mujer. Los pasos de §4 se tomaron de los **subtítulos automáticos en español** del vídeo (transcritos con `yt-dlp`); las fórmulas se dictan en voz alta y se citan entre comillas.
- **Entrada del blog** "2.7. Trazado de Patrón de la manga base en Seamly2D / Valentina" (20/04/2026): https://fashionpatron.wordpress.com/2026/04/20/2-7-trazado-de-patron-de-la-manga-base-en-seamly2d-valentina/. Trae una **captura del trazo** (puntos B…B25, junto al cuerpo base A…A60) y la miniatura del vídeo con la pieza terminada y sus piquetes (B20, B17 y B21 en la copa). El vídeo completo y la pieza con piquetes están en un vídeo de pago (https://payhip.com/b/WhEYI) que no se pudo consultar.
- Anuncio de la lección en el foro de Seamly: https://forum.seamly.io/t/new-tutorial-nueva-leccion-como-trazar-manga-base-how-to-draw-base-sleeve/11490

## 2. Medidas

| Fashion Patrón | Tabla `co-women-industrial` / origen | Talla 10 |
|---|---|---|
| Contorno de brazo | `upperArm` | 300 |
| Largo de manga (del final del hombro a la muñeca, brazo algo doblado) | `sleeveLength` | 610 |
| Contorno de muñeca | `wrist` (solo para comprobar la holgura del puño) | 160 |
| Sisa de espalda (curva A11–A16) | `draftWomenBodice` → `back.armhole.*` | 203,42 |
| Sisa delantera (curva A26–A27) | `draftWomenBodice` → `front.armhole.*` | 224,84 |
| Sisa de espalda bajo el punto de control (A20–A16, segmentos 2 + 3) | `back.armhole.1 + .2` | 103,78 |
| Sisa delantera bajo el punto de control (A29–A27, segmentos 2 + 3) | `front.armhole.1 + .2` | 99,93 |

## 3. Opciones y holguras (valores por defecto)

| Opción | Defecto | Origen |
|---|---|---|
| `capEase` (embebido total de copa) | 15 mm (opciones del editor: 1,5 / 3 / 4,2 cm) | **Elección** (ver §6.1): el método no fija el embebido |
| `bicepEase` | 40 mm (ancho de manga = contorno de brazo + 4 cm) | Método: "yo recomendaría poner tres o cuatro cm… vamos a poner cuatro" |
| `wristReduction` | 50 mm (medio puño = medio ancho de manga − 5 cm) | Método: "ancho de manga, la mitad, menos 5 cm" |
| `notchEase` | 3,5 mm (embebido bajo cada piquete de control) | Método: "yo recomiendo poner unos 0,35 cm" |
| `armhole` | sisas de `draftWomenBodice` (misma talla, opciones por defecto) | Método: la manga se traza en el mismo archivo "porque necesitaremos las medidas de las sisas" |

Constantes del método (`WOMEN_SLEEVE_CONSTANTS`): altura de copa = sisa/3; B10 a la mitad + 2 cm; salida de 2 cm en B8 y B11; entrada de 0,5 cm en B9 (espalda) y de 1,5 cm en B12 (delantero, "la sisa delantera es más profunda").

## 4. Trazo paso a paso

Convenciones: origen en B (cima de la copa), x a la derecha, y hacia **abajo**. Línea central de la manga x = 0. **Espalda a la izquierda, delantero a la derecha** ("esta parte de izquierda será la espalda… esta parte derecha… se cosera al delantero"). Fórmulas en cm como en la fuente; el código trabaja en mm. Todos los pasos son **(F)** del vídeo salvo los marcados **(E)** (elección propia, ver §6).

### Largo, copa y ancho (F)
1. **B1** = B + largo de manga a 270° (hacia abajo).
2. Altura de copa: "la suma de estas dos sisas dividido entre tres" → **B2** en B–B1 a (sisa espalda + sisa delantera)/3. **(E)** Después se ajusta la altura para que la copa mida sisas + embebido (paso 9).
3. **B3** = B2 + (contorno de brazo + 4)/2 a 0°; **B4** = B2 + |B2 B3| a 180°. Línea de ancho de manga B4–B3.
4. **B5** = B1 + (|B2 B3| − 5) a 0°; **B6** = B1 + |B1 B5| a 180° (ancho de puño). Costuras bajo brazo B4–B6 y B3–B5.

### Puntos de la copa (F)
5. Espalda: diagonal B4–B en tres partes iguales: **B7** a |B4 B|/3 desde B4, **B8** a 2·|B4 B|/3; **B9** = mitad de B4–B7.
6. Delantero: diagonal B–B3 "en cuatro partes pero no iguales": **B10** a |B B3|/2 + 2 desde B; **B11** = mitad de B–B10; **B12** = mitad de B10–B3.
7. Perpendiculares a la diagonal: **B13** = B8 + 2 hacia fuera; **B14** = B11 + 2 hacia fuera; **B15** = B9 + 0,5 hacia dentro; **B16** = B12 + 1,5 hacia dentro.
8. Curva de copa de espalda B4 → B15 → B7 → B13 → B y de delantero B → B14 → B10 → B16 → B3, "con una curva la espalda y con otra el delantero", horizontales en B ("0°") y en B4/B3 ("180°", para que la copa no quede doblada).

### Ajuste de la copa (E)
9. Altura de copa h tal que copa espalda + copa delantero = sisa espalda + sisa delantera + embebido, por bisección sobre h con los pasos 2–8 fijos. Con h = sisa/3 el embebido sale libre (ver §6.1).

### Reparto del embebido y piquetes (F)
10. **B18** en la copa a "sisa de espalda" desde B4; **B19** en la copa a "sisa delantera" desde B3. Entre B18 y B19 está el sobrante que forma el volumen de la copa.
11. **B21** (piquete de hombro) en la mitad del sobrante, a lo largo de la copa: a sisa espalda + embebido/2 desde B4. Es el "desvío del centro de la copa" del método ("la manga se quedará mucho más recta"): se cose al punto de hombro A11/A26.
12. **B20** (piquete de espalda, ↔ A20) en la copa a |A20 A16| + 0,35 desde B4. **B17** (piquete delantero, ↔ A29) en la copa a |A29 A27| + 0,35 desde B3. Bajo los piquetes solo entran 0,35 cm por lado; el resto del embebido va entre los piquetes y B21.

### Pieza
- **Manga** (cortar ×2, en pareja): B6 → B4 → (copa espalda) B → (copa delantero) B3 → B5 → B6. Segmentos estables `sleeve.underarm.back`, `sleeve.capBack.0…3`, `sleeve.capFront.0…3`, `sleeve.underarm.front`, `sleeve.hem`.
- Piquetes (`kind: 'notch'`): `sleeve.notch.front` en B17, **sencillo** (`count: 1`); `sleeve.notch.back` en B20, **doble** (`count: 2`); `sleeve.notch.shoulder` en B21 (cima de la copa).
- Hilo: vertical (paralelo a B–B1) por B21, de 3 cm bajo la línea de ancho de manga a 6 cm del bajo.
- Líneas de construcción `c.*`: línea central, ancho de manga, diagonales de copa y las cuatro perpendiculares (B8–B13, B11–B14, B9–B15, B12–B16).

## 5. Valores calculados a mano, talla 10 (mm)

Sisas del cuerpo talla 10: 203,42 + 224,84 = 428,26. Altura de copa del método 428,26/3 = 142,75 (embebido libre 39,4). Con embebido 15 la copa debe medir 443,26 y la bisección da **h = 123,31**.
Medio ancho de manga = (300 + 40)/2 = 170. |B4 B| = |B B3| = √(170² + 123,31²) = 210,01; dirección B4→B u = (0,8095, −0,5871); normal exterior espalda (−0,5871, −0,8095), delantero (0,5871, −0,8095).

| Punto | Cálculo | Valor (x, y) |
|---|---|---|
| B1 | largo de manga 610 | (0, 610) |
| B2 | h | (0, 123,31) |
| B3 / B4 | ±170 | (170, 123,31) / (−170, 123,31) |
| B5 / B6 | ±(170 − 50) | (120, 610) / (−120, 610) |
| B7 | B4 + 70,00·u | (−113,33, 82,21) |
| B8 | B4 + 140,01·u | (−56,67, 41,10) |
| B9 | mitad B4–B7 | (−141,67, 102,76) |
| B10 | B + (105,01 + 20)·(0,8095, 0,5871) | (101,19, 73,40) |
| B11 / B12 | mitades B–B10 / B10–B3 | (50,59, 36,70) / (135,59, 98,35) |
| B13 | B8 + 20·(−0,5871, −0,8095) | (−68,41, 24,91) |
| B14 | B11 + 20·(0,5871, −0,8095) | (62,34, 20,51) |
| B15 | B9 − 5·(−0,5871, −0,8095) | (−138,73, 106,80) |
| B16 | B12 − 15·(0,5871, −0,8095) | (126,79, 110,49) |
| B18 | copa a 203,42 desde B4 | (−15,38, 1,15) |
| B19 | copa a 224,84 desde B3 | (−0,44, 0,00) |
| B21 | copa a 203,42 + 7,5 = 210,92 desde B4 | (−7,93, 0,31) |
| B20 | copa a 103,78 + 3,5 = 107,28 desde B4 | (−91,92, 53,68) |
| B17 | copa a 99,93 + 3,5 = 103,43 desde B3 | (95,68, 62,74) |

Resultados talla 10 (por defecto): copa espalda 218,86 + copa delantero 224,40 = **443,26 mm = sisas 428,26 + embebido 15,00**. Desde B21: espalda 210,92 (sisa + 7,5) y delantero 232,34 (sisa + 7,5); bajo los piquetes 3,5 por lado, entre piquetes y hombro 4,0 por lado. Ancho de manga 340 (brazo + 40); puño 240 (muñeca + 80); costuras bajo brazo 489,25 = 489,25.

## 6. Decisiones y desviaciones

1. **Embebido y altura de copa**: el método no da un embebido. Fija la altura de copa (sisa/3) y acepta lo que sale: en su ejemplo (talla 38 española) 1,5 cm en la espalda y 2,7 cm en el delantero, 4,2 cm en total, "una diferencia absolutamente normal". Con la tabla colombiana y el cuerpo base de la app, sisa/3 da un embebido de 29,9 / 34,6 / 39,4 / 44,4 / 49,1 / 54,2 mm (tallas 6…16), que crece con la talla y es mucho para una manga base de tejido plano. Aquí el embebido es un parámetro: **1,5 cm por defecto** (valor de la especificación cuando el método no lo da), con 3 cm y 4,2 cm (el del ejemplo del método) como opciones del editor, y la **altura de copa se ajusta** por bisección para cumplirlo exactamente. Talla 10: h = 123,3 mm con 1,5 cm, 135,4 con 3 cm, 144,8 con 4,2 cm (método: 142,8).
2. **Curvas**: Seamly2D usa un spline interactivo ajustado a ojo. Aquí la copa entera B4 → B → B3 es una curva justa (`fairCurve`) que pasa exactamente por los mismos puntos (B4, B15, B7, B13, B, B14, B10, B16, B3), horizontal en B4, B y B3 como pide el vídeo (180° / 0°), con curvatura continua también en B (salto < 1 %) y **una sola inflexión en cada mitad** (el hueco bajo el piquete que pasa a la copa). Sus parámetros de forma se ajustan a la altura del método, se resuelve la altura, se reajustan y se vuelve a resolver, así que la copa es justa y mide exactamente sisa + embebido. La versión anterior (tangentes Catmull–Rom por mitades) tenía 6 inflexiones y saltos de curvatura de hasta el 194 %.
3. **Nombres de puntos**: en el vídeo el punto delantero de "sisa delantera desde B3" se llama primero B17, se borra y se recrea, y el piquete delantero acaba llamándose B17. Aquí: B17 = piquete delantero, B18/B19 = fin de la sisa de espalda/delantera sobre la copa, B20 = piquete de espalda, B21 = piquete de hombro (como en la miniatura). Los puntos auxiliares B22–B25 de la captura (cruce de la curva con la diagonal y extremos del hilo) no se trazan porque no cambian la pieza.
4. **Piquetes**: en la miniatura del vídeo el piquete de B17 (delantero) parece doble y el de B20 (espalda) sencillo. Aquí se usa la convención industrial habitual: **delantero sencillo, espalda doble**, y un piquete en la cima de la copa (B21).
5. **Hilo**: el método desplaza el centro de la manga a B19 (aquí B21) "para que la manga quede recta". El hilo se traza vertical por B21.
6. **Puño**: el método no usa el contorno de muñeca: el puño es el ancho de manga − 10 cm, para que pase la mano cerrada ("si ponemos el contorno de muñeca no vamos a poder poner la manga"). Las pruebas comprueban que el puño es ≥ muñeca + 2 cm (en el ejemplo del método, 22 cm de puño para 20 cm de muñeca). En la talla 10 sale 24 cm para 16 cm de muñeca.
7. **Sisas**: se toman del cuerpo base con opciones por defecto (largo a la cadera; la sisa no depende del largo). Si el usuario cambia la holgura del cuerpo, la manga se puede trazar con otra sisa (opción `armhole`).
8. **Codo**: el vídeo menciona la medida hasta el codo para "próximos trazados" pero no la usa en la manga base; no se traza línea de codo.
