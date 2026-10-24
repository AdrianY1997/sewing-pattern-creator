# Pantalón base hombre: método de trazo

Implementación: `src/blocks/menTrousers.ts` → `draftMenTrousers(medidas, opciones) → Draft` (ayudas comunes en `src/blocks/trousersShared.ts`).
Pruebas: `src/blocks/menTrousers.test.ts`. Tabla de medidas: `es-men-easd` (SPEC §3.2, tallas 40–54).

## 1. Fuentes

- **Feller, "Patronaje Hombre"**, capítulo "Pantalón base" (método español en medias medidas, puntos 1…35, con cuadro de medidas por tallas 38–50): https://pdfcoffee.com/patronaje-hombre-by-feller-pdf-free.html (copia en Scribd: https://es.scribd.com/document/473794975/Patronaje-Hombre). **Método principal.** Usa exactamente las medidas de la tabla EASD: largo de cadera (16 cm, igual que la "altura de cadera" EASD), largo de tiro, largo de rodilla, largo de pantalón, ½ ancho de rodilla, ½ ancho de bajo y media cadera / media cintura. El patrón de Feller **incluye 1 cm de costura** en todo el contorno salvo el tiro trasero y el bajo; aquí se traza neto (§6).
- **Tele Virtual Patronage (Tevipa), "Patrón base del pantalón clásico de caballero"** (17/08/2013): https://tevipa.com/blog/patron-base-del-pantalon-clasico-de-caballero-conformacion-normal-atletica-y-junior/. Método español del mismo tipo (medias medidas, talla 48: cintura 43, cadera 50). Confirma la colocación de los anchos de rodilla y bajo (la mitad a cada lado de la raya, la espalda 2 cm más ancha por lado), el delantero **sin pinza** con una pinza trasera, y el igualado del costado trasero con dos arcos.
- No se encontró en abierto el método de pantalón de la EASD Valencia (la tabla de §3.2 circula sin el trazo: https://www.scribd.com/document/330121582/Tabla-Medidas-Hombre). Aldrich *Metric Pattern Cutting for Menswear* no es accesible en línea.

## 2. Medidas

| Medida (tabla EASD) | Clave | Convención | Uso | Talla 48 (mm) |
|---|---|---|---|---|
| Cintura | `waist` | **media** medida | cuarto de cintura = valor/2 | 400 (contorno 800) |
| Cadera | `hip` | **media** medida | cuarto de cadera = valor/2; ⅒ de media cadera en extensiones y centro espalda | 500 (contorno 1000) |
| Altura de cadera | `hipDepth` | largo | línea de cadera | 160 |
| Largo de tiro | `crotchDepth` | largo | línea de tiro | 215 |
| Largo de rodilla | `kneeLength` | largo | línea de rodilla | 500 |
| Largo total de pantalón | `trouserLength` | largo | bajo | 1060 |
| Ancho de rodilla | `halfKneeWidth` | ½ ancho | rodilla | 145 |
| Ancho de camal | `halfTrouserBottomWidth` | ½ ancho | bajo | 140 |
| Contorno de muslo (§3.4.2) | `thigh` | contorno completo | comprobación de holgura (§6) | 563 |

La tabla guarda cintura y cadera como medias medidas (`kind: 'half'`); el código nunca las divide entre 4: un cuarto del cuerpo es la mitad del valor de la tabla.

## 3. Opciones y holguras (valores por defecto)

| Opción | Defecto | Origen |
|---|---|---|
| `waistEase` | 0 (sobre el contorno completo) | Feller (neto: cintura = ½ media cintura exacta) |
| `hipEase` | 40 mm en total → 1 cm por cuarto | **Elección** (Feller neto da 0; ver §6) |
| `hipShift` | 20 mm: el delantero pierde 2 cm de cadera y la espalda los gana | Feller (neto: delantero ½ cadera − 2, espalda ½ cadera + 2) |
| `backInseamEase` | 5 mm: la entrepierna trasera mide 0,5 cm menos que la delantera | Feller (punto 30: "0,5 cm de holgura para el bies") |
| `crotchEase` | 0 en la función; **25 mm en el bloque** ("Holgura de tiro": 0, 1, 2, 2,5, 3, 4 cm) | **Elección** (§6.4): se suma al largo de tiro de la tabla |
| `crotchExtensionEase` | 0 en la función; **30 mm en el bloque** (fijo, no es opción de la interfaz) | **Elección** (§6.4): se suma a las extensiones de tiro delantera y trasera |

Constantes (`MEN_TROUSERS_CONSTANTS`): centro delantero 1 cm hacia dentro en la cintura; extensión trasera = ⅒ de media cadera + 1,5 cm desde el punto de tiro delantero; subida del centro espalda = ⅒ de media cadera − 1 cm; punto de curva trasero 1 cm más allá del delantero; pinza trasera 2 × 8 cm; rodilla y bajo: delantero 2 × ½ ancho − 2 cm, espalda 2 × ½ ancho + 2 cm.

## 4. Trazo paso a paso

Convenciones: x a la derecha, y hacia **abajo**, cintura en y = 0, raya (línea de plancha) en x = 0. Costados hacia la izquierda (−x), tiro hacia la derecha (+x). Delantero y espalda se trazan superpuestos en el mismo marco. **An = punto n de Feller** (A0 y los puntos de la raya A13–A15 se añaden). "½ cadera" y "½ cintura" son la mitad de la media medida EASD (= contorno/4). Fórmulas en cm; el código trabaja en mm.

### Marco: vertical del centro delantero y líneas horizontales
1. **A1** = cintura en el centro delantero. Desde A1 hacia abajo: **A2** = altura de cadera (línea de cadera), **A3** = largo de tiro (línea de tiro), **A4** = largo de rodilla, **A5** = largo total.

### Delantero
2. **A6** = A2 − (½ cadera − 2 + 1) en la línea de cadera (costado; −2 por el reparto de Feller, +1 de holgura). **A9** = costado en la línea de tiro (vertical de A6).
3. **A10** = A3 + ⅒ de media cadera (punto de tiro delantero).
4. **A13** = punto medio de A9–A10: la **raya**. Se escuadra hacia arriba (**A0** en la cintura) y hacia abajo: **A14** en la rodilla, **A15** en el bajo. La raya es el hilo de las dos piezas.
5. **A7** = A1 − 1 cm (centro delantero de cintura); centro delantero recto A7–A2.
6. **A8** = A7 − ½ cintura (costado de cintura; el delantero no lleva pinza).
7. Curva de tiro: **A11** = punto medio de A10–A2; **A12** = A11 + ⅓·(A3 − A11). Curva A2 → A12 → A10: sigue el centro delantero en A2 y llega horizontal a A10.
8. Rodilla: **A18**/**A19** = A14 ∓ (½ ancho de rodilla − 1). Bajo: **A16**/**A17** = A15 ∓ (½ ancho de bajo − 1).
9. Costado A8 → A6 (curva: sale en la dirección de la cuerda, llega vertical), A6 → A18 ("leve curva": vertical en la cadera, en la dirección del bajo en la rodilla), A18–A16 recta. Entrepierna A10 → A19 curva, A19–A17 recta.

### Espalda
10. **A20** = A2 (centro espalda en la cadera; ver §6, desviación 1).
11. **A21** = (x de A2) − ⅒ de media cadera, en la línea de cintura. Unir A20–A21 y prolongar: **A22** = A21 + (⅒ de media cadera − 1) sobre esa recta (centro espalda de cintura, subido). Centro espalda recto A22–A20.
12. **A24** = A20 − (½ cadera + 2 + 1) en la línea de cadera (costado trasero).
13. **A25**/**A26** = rodilla y bajo de costado 2 cm por fuera de A18/A16; **A28**/**A29** = 2 cm por fuera de A19/A17 en la entrepierna.
14. **A27** = A10 + (⅒ de media cadera + 1,5) en la línea de tiro.
15. **A30** sobre la recta A28→A27, en el punto en que la entrepierna trasera (curva A30 → A28 + recta A28–A29) mide la delantera − 0,5 cm. Queda algo por debajo de la línea de tiro (descenso natural del tiro trasero).
16. **A31** = A12 + 1 cm hacia A3. Curva de tiro A20 → A31 → A30: sigue el centro espalda en A20 y llega horizontal a A30.
17. **A23**: largo de cintura A22–A23 = ½ cintura + 2 (pinza). A23 es el punto de la circunferencia de centro A22 y ese radio en el que el costado trasero (A23 → A24 → A25 → A26) mide lo mismo que el delantero (el cruce de dos arcos de Tevipa, resuelto con la longitud total del costado). Cintura recta A22–A23.
18. Pinza: **A32** = punto medio de A22–A23; **A34**/**A35** a ±1 cm sobre la cintura; vértice **A33** = A32 + 8 cm sobre la perpendicular a la cintura.
19. Costado trasero A23 → A24, A24 → A25 (curvas como en el delantero), A25–A26 recta. Entrepierna A30 → A28 curva, A28–A29 recta.

### Piezas
- **Delantero**: A7 → A8 (cintura) → costado → A16 → A17 (bajo) → entrepierna → A10 → curva de tiro → A2 → A7. Interna: hilo en la raya. Piquetes sencillos en la cadera (A6) y la rodilla (A18, A19).
- **Espalda**: A22 → A34 → A35 → A23 (cintura con la abertura de pinza) → costado → A26 → A29 → entrepierna → A30 → curva de tiro → A20 → A22. Internas: piernas de pinza, hilo en la raya. Piquetes: cadera (A24) sencillo, rodilla (A25, A28) dobles.
- Ids de costuras: `*.crotch.0/1`, `*.inseam.0/1`, `*.outseam.0/1/2`, `front.cf`, `back.cb`, `front.waist`, `back.waist.*`, `*.hem`. Construcción: `c.crease`, `c.waist`, `c.hip`, `c.crotch`, `c.knee`, `c.hem`, `c.frontCentre`, `c.frontCurve`, `c.frontCurveRef`, `c.backCentre`, `c.backInseamRef`.
- Se cortan 2 de cada pieza.

## 5. Valores calculados a mano, talla 48 (mm)

Media cadera 500 (½ cadera = 250), media cintura 400 (½ cintura = 200). Cadera delantera = 250 − 20 + 10 = 240; extensión = 50; ancho en el tiro 290 → ±145; centro delantero x = −145 + 240 = 95.

| Punto | Cálculo | Valor (x, y) |
|---|---|---|
| A1 / A2 / A3 | altura de cadera 160; tiro 215 | (95, 0) / (95, 160) / (95, 215) |
| A6 / A9 | −145 | (−145, 160) / (−145, 215) |
| A7 / A8 | 95 − 10; 85 − 200 | (85, 0) / (−115, 0) |
| A10 | 95 + 50 | (145, 215) |
| A11 | (A10 + A2)/2 | (120, 187,5) |
| A12 | 120 − 25/3; 187,5 + 27,5/3 | (111,67, 196,67) |
| A13 / A14 / A15 | raya | (0, 215) / (0, 500) / (0, 1060) |
| A18 / A19 | 2·145 − 20 = 270 → ±135 | (∓135, 500) |
| A16 / A17 | 2·140 − 20 = 260 → ±130 | (∓130, 1060) |
| A20 | = A2 | (95, 160) |
| A21 | 95 − 50 | (45, 0) |
| A22 | A21 + 40·(−0,2983, −0,9545) | (33,07, −38,18) |
| A24 | 95 − (250 + 20 + 10) | (−185, 160) |
| A25 / A26 | −135 − 20; −130 − 20 | (−155, 500) / (−150, 1060) |
| A27 | 145 + 50 + 15 | (210, 215) |
| A28 / A29 | 135 + 20; 130 + 20 | (155, 500) / (150, 1060) |
| A30 | entrepierna trasera = 845,21 − 5 (resuelto sobre A28→A27) | (207,98, 225,49) |
| A31 | A12 + 10·(−0,6727, 0,7399) | (104,94, 204,07) |
| A23 | radio 200 + 20 = 220 desde A22; costado igualado | (−183,90, −1,76) |
| A32 / A33 | punto medio de A22–A23; + 80 en la perpendicular | (−75,41, −19,97) / (−62,17, 58,93) |

Resultados talla 48: entrepierna delantera 845,21 y trasera 840,21 mm (0,5 cm menos, para estirar al coser); costados 1063,35 mm los dos; cintura 200 mm por cuarto en las dos piezas (trasera después de la pinza de 20 mm) = 800/4; cadera 240 + 280 = 520 = 1000/2 + 20; rodilla 270 / 310 (contorno 580 = 4 × 145); bajo 260 / 300 (contorno 560 = 4 × 140); tiro (centro + curva) 240,4 delante y 361,0 detrás; ancho en la línea de tiro 289,4 + 312,4 = 601,8 → holgura de muslo 38,8 mm sobre 563.

## 6. Decisiones y desviaciones

1. **Trazo neto (sin costuras)**: Feller incluye 1 cm de costura. Se quita así: cintura delantera ½ cintura + 2 → ½ cintura; cadera delantera ½ cadera → ½ cadera − 2; cintura trasera ½ cintura + 3 (con 1 cm de costura de costado) → ½ cintura + 2 de pinza; cadera trasera ½ cadera + 3 → ½ cadera + 2; extensión delantera ⅒ + 1 → ⅒; rodilla y bajo: ½ ancho a cada lado de la raya → ½ ancho − 1 delante (y + 1 detrás). El paso 2→20 (1 cm) solo quitaba la costura del centro delantero, por eso A20 = A2. El punto 30 de Feller ("19–10 − 1,5 cm: 1 cm de costura y 0,5 de holgura") queda en entrepierna trasera = delantera − 0,5 cm.
2. **Línea de cadera**: Feller pone 1→2 = largo de cadera + 1 (el centímetro es la costura de cintura); neto, la cadera queda a la altura de cadera de la tabla. Tiro, rodilla y largo se miden desde la cintura neta.
3. **Holgura de cadera**: Feller neto no deja holgura de cadera (la ½ cadera se reparte −2 / +2). Se añaden 4 cm en total (1 cm por cuarto) para que el bloque se pueda llevar; es opción (`hipEase`).
4. **Tiro corto de la tabla**: el largo de tiro EASD (21,5 cm en la 48) solo queda 5,5 cm por debajo de la línea de cadera, cuando Feller trae 25 cm en su talla 48 y Aldrich da ~27 cm de "body rise". Se respeta la tabla (SPEC §3.2), pero el tiro sale corto: la holgura de muslo en la línea de tiro va de 10 mm (talla 40) a 59 mm (talla 54) y es 39 mm en la 48. Corrección: ver §6.4.
5. **Anchos de rodilla y bajo**: la tabla EASD los da como "ancho" sin decir dónde se colocan; se siguen Feller y Tevipa (mitad del ancho delantero a cada lado de la raya, espalda 2 cm más ancha por lado). Con el trazo neto, el contorno del pantalón en la rodilla es 4 × ancho de rodilla y en el bajo 4 × ancho de camal. Son anchos de bloque base, holgados (contorno de bajo 56 cm en la 48).
6. **Costado trasero**: A23 se resuelve numéricamente (circunferencia del largo de cintura) para que los costados midan igual (±10⁻⁶ mm), en lugar de copiar a mano el costado delantero como en Tevipa.
7. **Pinza trasera**: Feller la pone en el punto medio de la cintura, escuadrada con ella, de 2 × 8 cm. No hay pinza delantera (Feller y Tevipa).
8. **Curvas**: Béziers con las tangentes fijadas (tiro por A12 / A31, costado vertical en la cadera, entrepierna y costado tangentes a la recta de rodilla a bajo).
9. **Irregularidades de la tabla**: la cintura salta +4 entre 48 y 50 y +3 entre 52 y 54 (SPEC §3.2); se refleja en la cintura del pantalón tal cual.
10. **Holgura de tiro y de muslo**: ver §6.4.

### 6.4 Holgura de tiro y holgura de muslo

Holgura de muslo = ancho del patrón en la línea de tiro (delantero + espalda) − contorno de muslo de la tabla (§3.4.2). Con la tabla tal cual (largo de tiro 21,5 cm en la 48; Feller ≈ 25, Aldrich ≈ 27) queda entre 1 y 6 cm.

**El largo de tiro casi no controla la holgura de muslo.** Bajar la línea de tiro solo mueve el punto donde se mide el ancho sobre las curvas de costado y entrepierna: unos 0,04 cm de holgura por cada cm de tiro. Incluso con 28 cm de tiro la talla 40 no pasaría de unos 3 cm. El ancho en la línea de tiro lo fijan las **extensiones de tiro** (delantera ⅒ de media cadera, trasera ⅒ + 1,5 cm), que dependen de la cadera, no del tiro. Por eso hay dos ajustes:

1. `crotchEase` ("Holgura de tiro"), en mm, se suma al largo de tiro antes de trazar. Por defecto **25 mm**: 21,5 → 24 cm en la 48, el extremo bajo del rango Feller–Aldrich (24–28 cm; es lo mínimo que lo alcanza). Opciones: 0, 1, 2, 2,5 (defecto), 3 y 4 cm (hasta 25,5 cm en la 48).
2. `crotchExtensionEase` suma 30 mm a las dos extensiones (la delantera y la trasera). Es el valor mínimo en pasos de 0,5 cm que da ≥ 6 cm de holgura en todas las tallas con el tiro por defecto (con 25 mm la talla 40 se queda en 5,6 cm). El bloque lo aplica siempre; no es opción de la interfaz.

Holgura de muslo (cm) por talla, con el contorno de muslo de la tabla:

| Talla | 40 | 42 | 44 | 46 | 48 | 50 | 52 | 54 |
|---|---|---|---|---|---|---|---|---|
| Muslo (tabla) | 49,1 | 50,9 | 52,7 | 54,5 | 56,3 | 58,1 | 59,9 | 61,7 |
| Tiro de la tabla | 19,5 | 20,0 | 20,5 | 21,0 | 21,5 | 22,0 | 22,5 | 23,0 |
| Antes (tabla, sin ajustes) | 1,0 | 1,8 | 2,5 | 3,2 | 3,9 | 4,5 | 5,2 | 5,8 |
| Solo tiro +2,5 cm | 2,0 | 2,7 | 3,3 | 4,0 | 4,6 | 5,2 | 5,8 | 6,4 |
| **Después (tiro +2,5 y extensiones +3)** | **6,2** | **6,8** | **7,4** | **8,0** | **8,5** | **9,0** | **9,6** | **10,1** |

Mínimo 6,2 cm (talla 40), máximo 10,1 cm (talla 54). Con `crotchEase` y `crotchExtensionEase` a 0 el trazo es idéntico al anterior (prueba en `menTrousers.test.ts`); las costuras siguen igualadas (entrepierna trasera = delantera − 0,5 cm, costados iguales).
