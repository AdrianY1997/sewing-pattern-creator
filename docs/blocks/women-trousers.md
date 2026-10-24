# Pantalón base mujer: método de trazo

Implementación: `src/blocks/womenTrousers.ts` → `draftWomenTrousers(medidas, opciones) → Draft` (ayudas comunes en `src/blocks/trousersShared.ts`).
Pruebas: `src/blocks/womenTrousers.test.ts`. Tabla de medidas: `co-women-industrial` (SPEC §3.1 y complementarias §3.4.1, tallas 6–16).

## 1. Fuentes

- **Fashion Patrón, "Patrón base PANTALÓN de mujer"** (tienda Payhip, https://payhip.com/b/6aYRs): archivo de Seamly2D más un e-book de 99 páginas con el trazo "paso a paso, punto por punto". Es de pago y no publica fórmulas en abierto; el blog (https://fashionpatron.wordpress.com/) y el canal (https://www.youtube.com/@fashionpatron) no tienen lección de pantalón (revisado 23/10/2026). **No se pudo usar.**
- **Winifred Aldrich, *Metric Pattern Cutting for Women's Wear*** (bloque de pantalón clásico, "The trouser block"; 4.ª ed. pp. 98–99). Es el método de respaldo, y además es la fuente de las medidas complementarias de §3.4.1 (tiro, largo total, bota). El libro no es accesible en línea; se usan dos fuentes secundarias:
  - **Lim, H.-W. y Cassidy, T. (2017), "A comparative study of trouser pattern making methods"**, *J. Textile Eng. Fashion Technol.* 1(5):189–196, tablas 5–8 (comparan Aldrich, Armstrong, Bunka y ESMOD; acceso abierto CC BY-NC): https://eprints.whiterose.ac.uk/id/eprint/116914/8/JTEFT-01-00031.pdf. De ahí salen las proporciones del bloque clásico de Aldrich: cintura delantera W/4 + 2,25 (pinza 2), trasera W/4 + 4,25 (pinzas 4: dos pinzas a 1/3 de la cintura, largos 12 y 10 cm), cadera delantera H/4 + 0,5 y trasera H/4 + 1,5, extensión de tiro delantera 6,8 y trasera 12,8 cm (cadera 101,9), descenso del punto de tiro trasero 0,5 cm, rodilla y bajo traseros = delanteros + 2 cm.
  - **Aldrich, "Close fitting trouser/jeans block"** transcrito a Valentina (`close_fitting_trouser_jeans_block.val`, Valhalla's sewing patterns, https://sewing-patterns.trueelena.org/contemporary_womenswear/drafting_methods/aldrich/index.html). Da la **estructura** del trazo de Aldrich con fórmulas legibles: marco sobre la raya, centro espalda a 1/4 de la distancia centro delantero–raya, cintura de espalda 2 cm hacia dentro y 2 cm hacia arriba, distancias de las curvas de tiro sobre la bisectriz (3,25/3,5 cm delante y 4,5/4,75 cm detrás según la cadera sea < o ≥ 102 cm).

## 2. Medidas

| Medida (tabla) | Clave | Uso | Talla 10 (mm) |
|---|---|---|---|
| Contorno de cintura | `waist` | cintura por cuarto | 680 |
| Contorno de cadera | `hip` | cadera por cuarto, extensiones de tiro, curvas | 960 |
| Alto de cadera | `hipDepth` | línea de cadera | 200 |
| Tiro (cintura a asiento, sentada) | `bodyRise` | línea de tiro = tiro + 1 cm | 287 |
| Largo cintura a rodilla | `waistToKnee` | línea de rodilla | 590 |
| Largo total de pantalón | `trouserLength` | bajo | 1050 |
| Contorno de rodilla | `knee` | ancho de rodilla | 360 |
| Contorno de muslo | `thigh` | comprobación de holgura de muslo (§6) | 575 |
| Ancho de bota, recto (1/2) | `halfTrouserBottomWidth` | ancho del bajo (opción por defecto) | 225 |
| Ancho de bota, jean (1/2) | `halfJeansBottomWidth` | ancho del bajo (opción "jean") | 190 |

Todas son contornos completos salvo las dos de bota, que son el ancho plano de una pernera (media medida del contorno del bajo, como en Aldrich).

## 3. Opciones y holguras (valores por defecto)

| Opción | Defecto | Origen |
|---|---|---|
| `waistEase` | 10 mm en total (0,25 cm por cuarto) | Aldrich (Lim y Cassidy: W/4 + 2,25 con pinza de 2) |
| `frontHipEase` | 5 mm (cadera delantera = H/4 + 0,5) | Aldrich |
| `backHipEase` | 15 mm (cadera trasera = H/4 + 1,5) | Aldrich |
| `crotchEase` | 10 mm (línea de tiro = tiro + 1 cm) | Aldrich ("body rise + 1 cm") |
| `kneeEase` | 160 mm: rodilla delantera + trasera = contorno de rodilla + 16 cm | **Elección** (calibrada, ver §6) |
| `bottom` | `'straight'` (bota recta); `'jeans'` usa la bota de jean | Tabla §3.4.1 |

Constantes (`WOMEN_TROUSERS_CONSTANTS`): extensión delantera H/16 + 0,5 cm; extensión trasera H/8; centro delantero 1 cm hacia dentro en la cintura; centro espalda 2 cm hacia dentro y 2 cm hacia arriba; curvas de tiro 3,25 / 4,5 cm (3,5 / 4,75 si cadera ≥ 102 cm); pinza delantera 2 × 10 cm en la raya; dos pinzas traseras 2 × 12 cm y 2 × 10 cm; rodilla y bajo traseros = delanteros + 2 cm.

## 4. Trazo paso a paso

Convenciones: origen **A** en la raya (línea de plancha) a la altura de la cintura; x a la derecha, y hacia **abajo**. Costados hacia la izquierda (−x), tiro hacia la derecha (+x). El delantero y la espalda se trazan **superpuestos sobre el mismo marco** (misma raya y mismas líneas horizontales), como en Aldrich. Fórmulas en cm; el código trabaja en mm.

### Marco común (raya y líneas horizontales)
1. **A** = cintura en la raya (0, 0). Línea de cintura horizontal por A.
2. **A1** = A + (tiro + 1) hacia abajo: línea de tiro.
3. **A2** = A + alto de cadera hacia abajo: línea de cadera.
4. **A3** = A + largo cintura a rodilla: línea de rodilla.
5. **A4** = A + largo total: línea de bajo. La vertical A–A4 es la raya y el **hilo** de las dos piezas.

### Delantero
6. Ancho del delantero en la línea de tiro: cadera delantera (H/4 + 0,5) + extensión (H/16 + 0,5). La raya queda a la mitad: **A5** (costado) y **A6** (punto de tiro delantero) a ± la mitad de ese ancho desde A1.
7. **A7** = A5 + (H/4 + 0,5) en la línea de tiro: centro delantero. **A8** y **A9** = costado y centro delantero en la línea de cadera; **A10** = centro delantero en la cintura.
8. **A11** = A10 − 1 cm (centro delantero de cintura). Centro delantero recto A11–A9.
9. **A12** = A7 + 3,25 cm (3,5 si cadera ≥ 102) sobre la bisectriz del ángulo en A7. Curva de tiro A9 → A12 → A6: sale de A9 siguiendo la dirección del centro delantero y llega a A6 horizontal.
10. Cintura: **A13** = A11 − (cintura/4 + 0,25 + 2) en la línea de cintura (costado de cintura). Pinza de 2 cm centrada en la raya: **A14**, **A15** a ±1 cm de A; vértice **A16** = A + 10 cm.
11. Rodilla: ancho delantero = (rodilla + 16)/2 − 1, centrado en la raya: **A17** (costado), **A18** (entrepierna).
12. Bajo: ancho delantero = bota − 1, centrado en la raya: **A19** (costado), **A20** (entrepierna).
13. Costado: A13 → A8 curva (sale en la dirección de la cuerda y llega vertical a la cadera); A8 → A17 curva (vertical en la cadera, en la dirección del bajo en la rodilla); A17–A19 recta.
14. Entrepierna: A6 → A18 curva (sale en la dirección de la cuerda, llega en la dirección del bajo); A18–A20 recta.

### Espalda
15. **A21** = centro espalda en la línea de tiro, a 1/4 de la distancia A7–A1 desde A7 (x = 0,75·x de A7). **A22** = centro espalda en la línea de cadera.
16. **A23** = A22 llevado a la cintura, 2 cm hacia la raya y 2 cm hacia arriba (centro espalda de cintura). Centro espalda recto A23–A22.
17. **A24** = A22 − (H/4 + 1,5) en la línea de cadera (costado trasero).
18. **A25** = A21 + H/8 en la línea de tiro (extensión trasera). **A26** = A25 bajado lo necesario para que la entrepierna trasera mida lo mismo que la delantera (punto de tiro trasero; ver §6, desviación 3).
19. **A27** = A21 + 4,5 cm (4,75 si cadera ≥ 102) sobre la bisectriz. Curva de tiro A22 → A27 → A26: sigue la dirección del centro espalda en A22 y llega horizontal a A26.
20. Rodilla y bajo traseros = delanteros + 2 cm, centrados en la raya: **A37**/**A38** (rodilla, costado/entrepierna), **A39**/**A40** (bajo).
21. Cintura trasera: largo A23–A28 = cintura/4 + 0,25 + 4 (dos pinzas de 2). **A28** (costado de cintura) es el punto de la circunferencia de centro A23 y ese radio en el que el costado trasero mide lo mismo que el delantero. Cintura recta A23–A28.
22. Pinzas: centros **A29** y **A33** a 1/3 y 2/3 de A23–A28; piernas **A30**/**A31** y **A34**/**A35** a ±1 cm sobre la cintura; vértices **A32** (12 cm) y **A36** (10 cm) sobre la perpendicular a la cintura.
23. Costado trasero: A28 → A24, A24 → A37 (curvas como en el delantero), A37–A39 recta. Entrepierna A26 → A38 curva, A38–A40 recta.

### Piezas
- **Delantero**: A11 → A15 → A14 → A13 (cintura con la abertura de pinza) → costado → A19 → A20 (bajo) → entrepierna → A6 → curva de tiro → A9 → A11. Internas: piernas de pinza A14–A16, A15–A16; hilo en la raya. Piquetes: cadera (A8) y rodilla (A17, A18), sencillos.
- **Espalda**: A23 → A30 → A31 → A34 → A35 → A28 (cintura con las dos aberturas) → costado → A39 → A40 → entrepierna → A26 → curva de tiro → A22 → A23. Internas: cuatro piernas de pinza, hilo en la raya. Piquetes: cadera (A24) sencillo, rodilla (A37, A38) dobles.
- Ids de costuras: `*.crotch.0/1` (curvas de tiro), `*.inseam.0/1` (entrepierna), `*.outseam.0/1/2` (costado), `front.cf`, `back.cb`, `*.waist.*`, `*.hem`. Construcción: `c.crease`, `c.waist`, `c.hip`, `c.crotch`, `c.knee`, `c.hem`, `c.frontCentre`, `c.backCentre`, `c.frontCurve`, `c.backCurve`, `c.backExtension`.
- Se cortan 2 de cada pieza.

## 5. Valores calculados a mano, talla 10 (mm)

Cadera H = 960, cintura W = 680. Línea de tiro = 287 + 10 = 297. Cadera delantera = 240 + 5 = 245; extensión delantera = 960/16 + 5 = 65; ancho en el tiro = 310 → ±155.

| Punto | Cálculo | Valor (x, y) |
|---|---|---|
| A1, A2, A3, A4 | tiro + 10; alto de cadera; rodilla; largo | y = 297; 200; 590; 1050 |
| A5 / A6 | ∓ 310/2 | (−155, 297) / (155, 297) |
| A7 | −155 + 245 | (90, 297) |
| A8 / A9 | | (−155, 200) / (90, 200) |
| A11 | 90 − 10 | (80, 0) |
| A12 | 90 + 32,5·0,7071; 297 − 32,5·0,7071 | (112,98, 274,02) |
| A13 | 80 − (170 + 2,5 + 20) | (−112,5, 0) |
| A14 / A15 / A16 | ±10; 100 | (−10, 0) / (10, 0) / (0, 100) |
| A17 / A18 | (360 + 160)/2 − 10 = 250 → ±125 | (∓125, 590) |
| A19 / A20 | 225 − 10 = 215 → ±107,5 | (∓107,5, 1050) |
| A21 / A22 | 0,75 · 90 | (67,5, 297) / (67,5, 200) |
| A23 | 67,5 − 20; −20 | (47,5, −20) |
| A24 | 67,5 − (240 + 15) | (−187,5, 200) |
| A25 | 67,5 + 960/8 | (187,5, 297) |
| A26 | descenso resuelto = 3,50 | (187,5, 300,50) |
| A27 | 67,5 + 45·0,7071; 297 − 45·0,7071 | (99,32, 265,18) |
| A28 | radio 170 + 2,5 + 40 = 212,5 desde A23; costado igualado | (−164,13, −0,77) |
| A29 / A32 | A23 + 70,83·u, u = (−0,9959, 0,0905); vértice + 120·n | (−23,04, −13,59) / (−12,18, 105,92) |
| A33 / A36 | A23 + 141,67·u; vértice + 100·n | (−93,59, −7,18) / (−84,54, 92,41) |
| A37 / A38 | 250 + 20 = 270 → ±135 | (∓135, 590) |
| A39 / A40 | 215 + 20 = 235 → ±117,5 | (∓117,5, 1050) |

Resultados talla 10: entrepierna 754,94 mm delante y detrás (diferencia < 10⁻⁶ mm); costado 1056,70 mm delante y detrás; cintura después de pinzas 172,5 mm por cuarto (= 680/4 + 2,5) en las dos piezas; cadera 245 (delante) y 255 (detrás); rodilla 250 / 270; bajo 215 / 235; tiro (centro + curva) 328,4 delante y 392,1 detrás; ancho en la línea de tiro 306,1 + 340,3 = 646,4 → holgura de muslo 71 mm sobre 575.

## 6. Decisiones y desviaciones

1. **Método de respaldo**: el pantalón de Fashion Patrón es de pago (§1); se usa Aldrich, que además es la fuente de las medidas verticales y de bota de §3.4.1. Como el libro no está accesible, las proporciones del bloque clásico salen de las tablas de Lim y Cassidy (2017) y la estructura del trazo del bloque "close fitting trouser/jeans" de Aldrich (fórmulas exactas en el archivo .val). La numeración A…A40 es propia; no es la de Aldrich.
2. **Líneas de cadera y rodilla de la tabla**: Aldrich deriva la cadera y la rodilla del tiro y del largo (rodilla = mitad de tiro–bajo − 5 cm, que daría 623,5 mm en la talla 10); aquí se usan el alto de cadera de §3.1 (igual que el cuerpo y la falda) y el largo cintura a rodilla de §3.4.1.
3. **Descenso del punto de tiro trasero**: Aldrich baja A26 0,5 cm. Aquí el descenso se calcula para que la entrepierna trasera mida igual que la delantera (3,50 mm en la talla 10; de 2,29 mm en la 6 a 5,82 mm en la 16, en torno a los 5 mm de Aldrich), porque Aldrich no indica embebido en la entrepierna y la SPEC pide costuras iguales (±1 mm).
4. **Costado trasero**: el punto A28 se coloca sobre la circunferencia del largo de cintura para que el costado trasero mida lo mismo que el delantero (0,77 mm por encima de la línea de cintura en la talla 10; de 1,97 mm por encima en la 6 a 1,17 mm por debajo en la 16).
5. **Rodilla**: Aldrich no usa el contorno de rodilla (la rodilla sale de unir el punto de tiro con el bajo). Para usar la medida de §3.4.1 se fija rodilla delantera + trasera = contorno + 16 cm, con la trasera 2 cm más ancha. Los 16 cm se calibraron para que la talla 10 dé 25 / 27 cm, los valores de Aldrich en Lim y Cassidy (tabla 8).
6. **Muslo**: Aldrich tampoco usa el muslo. Se usa como comprobación: el ancho de las dos piezas en la línea de tiro menos el contorno de muslo debe ser holgura positiva (71 mm en la talla 10; entre 67 y 74 mm en todas las tallas; las pruebas exigen > 50 mm). El contorno de muslo de §3.4.1 es derivado (0,60 × cadera).
7. **Bajo**: delantero = bota − 1 cm y trasero = bota + 1 cm (Aldrich: "½ bota − 0,5" a cada lado de la raya), así que la media de las dos piezas es el ancho de bota de la tabla.
8. **Una sola pinza delantera**: Lim y Cassidy cuentan dos pinzas delanteras en Aldrich, pero la tabla 7 da 2 cm en total y 10 cm de largo; se traza una sola pinza de 2 × 10 cm en la raya, donde ellos la sitúan.
9. **Curvas**: Aldrich dibuja las curvas a mano. Aquí son Béziers con tangentes fijadas (tiro por el punto de la bisectriz; costado vertical en la cadera; entrepierna y costado tangentes a la recta de rodilla a bajo).
