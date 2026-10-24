# Cuerpo base mujer (base de blusa): método de trazo

Implementación: `src/blocks/womenBodice.ts` → `draftWomenBodice(medidas, opciones) → Draft`.
Pruebas: `src/blocks/womenBodice.test.ts`. Tabla de medidas: `co-women-industrial` (SPEC §3.1, tallas 6–16).

## 1. Fuentes

- **Fashion Patrón, "PATRÓN BASE CUERPO MUJER"** (24/09/2024), trazo en Seamly2D con puntos A…A30 y fórmulas paso a paso:
  https://fashionpatron.wordpress.com/2024/09/24/patron-base-cuerpo-mujer/
  - La entrada publica los pasos hasta la sisa delantera (A30). Del resto (cintura, pinzas, cadera) dice que está en el e-book de pago "Patrón base mujer", que no se pudo consultar.
  - La entrada trae una **figura completa del trazo, talla 38**, con todos los puntos A…A55 (imagen enlazada en la entrada, sección "PATRÓN BASE CUERPO MUJER (imagen: talla 38)"). Los pasos A31–A55 de este documento se **reconstruyen a partir de esa figura** (ver §4).
- **Fashion Patrón, "Trazado de patrón Base cuerpo mujer en Seamly2d / Valentina, método clásico"** (20/04/2026): capturas del mismo trazo (espalda, delantero y manga) en Seamly2D. Confirman la estructura (caja, pinza de costado, pinzas de cintura en rombo hasta la cadera):
  https://fashionpatron.wordpress.com/2026/04/20/trazado-de-patron-base-cuerpo-mujer-en-seamly2d-valentina-metodo-clasico/
- Vídeos del canal (no transcribibles desde aquí; solo se usan como referencia del título del método): "Trazado de patrón Base cuerpo mujer, método clásico" https://www.youtube.com/watch?v=DvWqZB97gdw y el canal https://www.youtube.com/@fashionpatron. Lista de lecciones: https://forum.seamly.io/t/new-tutorial-nueva-leccion-como-trazar-manga-base-how-to-draw-base-sleeve/11490

## 2. Medidas

Fashion Patrón nombra las medidas así en Seamly2D; correspondencia con la tabla de la app (todas en mm dentro del código):

| Seamly2D (Fashion Patrón) | Tabla `co-women-industrial` | Talla 10 |
|---|---|---|
| `@Contrno_pecho` | Contorno de pecho (`bust`) | 920 |
| `@Contrno_cintura` | Contorno de cintura (`waist`) | 680 |
| `@Contrno_cadera` | Contorno de cadera (`hip`) | 960 |
| `@Cuello` | Contorno de cuello (`neck`) | 380 |
| `@Hombro` | Largo de hombro (`shoulderLength`) | 120 |
| `@Largo_espalda` | Largo talle espalda (`backWaistLength`) | 425 |
| `@Largo_delantero` | Largo talle delantero (`frontWaistLength`) | 445 |
| `@Ancho_espalda` | Ancho de espalda (1/2) (`halfBackWidth`) | 175 |
| `@Ancho_pecho` | Ancho de pecho (1/2) (`halfChestWidth`) | 165 |
| `@Altura_cadera` | Alto de cadera (`hipDepth`) | 200 |
| `@Altura_pecho` | Alto de pecho (`bustDepth`) | 260 |
| (no listada en la entrada) | Separación de pecho (1/2) (`halfBustSpan`) | 100 |

Notas: los valores de la tabla de Fashion Patrón en la entrada son imágenes; el ancho de espalda y el de pecho se usan como **medias medidas** (A12 = ancho de espalda + 0,55 cm medido desde el centro espalda), lo que cuadra con la escala de la figura. La separación de pecho no está en la lista de la entrada, pero la figura sitúa el punto de busto A34 en la vertical A33–A48, a la mitad de la separación desde el centro delantero.

## 3. Opciones y holguras (valores por defecto)

| Opción | Defecto | Origen |
|---|---|---|
| `length` | `'hip'` (hasta la cadera); `'waist'` corta en la cintura | La figura llega a la cadera |
| `ease.bust` | 20 mm en total (caja = pecho/2 + 1 cm) | Método (A1) |
| `ease.backWidth` | 5,5 mm (ancho de espalda + 0,55 cm) | Método (A12) |
| `ease.chestWidth` | 4,5 mm (ancho de pecho + 0,45 cm) | Método (A13) |
| `ease.neckWidth` | 5 mm (cuello/6 + 0,5 cm) | Método (A6) |
| `ease.waist` | 20 mm en total → 5 mm por cuarto | **Elección**: la holgura de cintura no es legible en la fuente; se usa la misma que en el pecho (+1 cm por mitad) |
| `ease.hip` | 20 mm en total | **Elección**, mismo criterio |
| `armholeDepth` | `'bust/6+6'` (alternativa `'bust/10+10.5+neck/18'`) | El método da las dos; la figura de la talla 38 cuadra con pecho/6 + 6 |
| `sideSeamShift` | 7 mm (A16 = mitad − 0,7 cm hacia la espalda) | Método (A16) |
| `waistSideShare` | 0,25: cada costado toma el 25 % del exceso de cintura de la mitad | Medido en la figura (costados 2,26 cm de 9,04 cm de exceso total) |

Constantes leídas en la figura (`WOMEN_BODICE_CONSTANTS`): ápice de la pinza de espalda 2 cm bajo la línea de pecho; ápice superior de la pinza delantera 3 cm bajo el punto de busto; ápices inferiores 5 cm sobre la línea de cadera.

## 4. Trazo paso a paso

Convenciones: origen en A, x a la derecha, y hacia **abajo** (en Seamly2D el ángulo 270° = hacia abajo, 90° = hacia arriba). Espalda a la izquierda (centro espalda x = 0), delantero a la derecha (centro delantero x = W). Fórmulas en cm como en la fuente; el código trabaja en mm. Los pasos marcados **(F)** son de la entrada de Fashion Patrón; los marcados **(R)** son reconstruidos de la figura.

### Caja base (F)
1. **A1** = A + (pecho/2 + 1) a 0°. W = ancho de la caja = media espalda + medio delantero.
2. **A2** = A + largo talle espalda a 270° (cintura en el centro espalda).
3. **A3** = A2 + alto de cadera a 270° (cadera en el centro espalda).
4. **A4** = intersección de ejes (x de A1, y de A2): cintura en el centro delantero. **A5** = (x de A4, y de A3).

### Escote de espalda (F)
5. **A6** en la línea A–A1 a cuello/6 + 0,5 (ancho de escote).
6. **A7** en la línea A–A2 a |A A6|/3 (profundidad del escote de espalda).
7. **A8** = intersección de ejes de A6 y A7 (esquina de control). Escote A7–A6: "curva simple".

### Línea de sisa / pecho (F)
8. **A9** en A–A2 a pecho/6 + 6 (o pecho/10 + 10,5 + cuello/18). **A10** = intersección de ejes con A1.

### Hombro de espalda (F)
9. Línea A2–A6. Arco con centro A2 y radio |A2 A6| (45°–75°); arco con centro A6 y radio = largo de hombro (270°–360°).
10. **A11** = intersección de los dos arcos. Hombro A6–A11.

### Anchos y costado (F)
11. **A12** en A9–A10 a ancho de espalda + 0,55. **A13** desde A10 hacia A12 a ancho de pecho + 0,45.
12. **A14**, **A15** = pies de las perpendiculares desde A12 y A13 sobre la línea A–A1.
13. **A16** en A12–A13 a |A12 A13|/2 − 0,7 desde A12 (separación de sisas = costado).

### Sisa de espalda (F)
14. **A19** = pie de la perpendicular desde A11 sobre la línea A14–A12.
15. **A20** en A12→A19 a |A12 A19|/3 + 2.
16. **A21** en la bisectriz del ángulo A20–A12–A16 a |A13 A12|·0,2 + 0,3.
17. Sisa por A11, A20, A21, A16, en ángulo recto con el hombro en A11.

### Escote delantero (F)
18. **A22** en A4→A1 a largo talle delantero (queda por encima de la línea A–A1 cuando el talle delantero es mayor que el de espalda).
19. **A23** = A22 + |A A6| a 180° (punto cuello-hombro delantero).
20. **A24** en el centro delantero bajo A22 a |A22 A23| + 1 (profundidad del escote delantero).
21. **A25** = intersección de ejes de A23 y A24. Escote A23–A24: curva simple con ángulos 270° y 180°.

### Hombro delantero (F)
22. Arco con centro A4 y radio |A4 A23| (100°–125°); arco con centro A23 y radio = largo de hombro (165°–200°). **A26** = intersección. Hombro A23–A26.

### Sisa delantera (F)
23. **A27** = A16 + (largo delantero − largo espalda) a 90°: "subir la línea de la sisa a distancia de la pinza de pecho".
24. **A28** = pie de la perpendicular desde A27 sobre la línea A15–A13.
25. **A29** en A28→A15 a (|A12 A19| − 1)/3.
26. **A30** en la bisectriz del ángulo A27–A28–A29 a |A13 A12|·0,2 − 0,3.
27. Sisa por A26, A29, A30, A27, en ángulo recto con el hombro en A26.

### Cintura y costados (R)
28. **A17** = (x de A16, y de A2) en la línea de cintura; **A18** = (x de A16, y de A3) en la de cadera.
29. Cuarto de cintura objetivo Q = cintura/4 + holgura/4. Exceso de espalda = |A2 A17| − Q; exceso delantero = |A17 A4| − Q. Entrada de costado s = 0,25 × (exceso de espalda + exceso delantero), igual en los dos costados.
30. **A31** = A17 − s (cintura espalda), **A32** = A17 + s (cintura delantero). Costado espalda A16–A31; guía del costado delantero A27–A32.

### Punto de busto y pinza de costado (R)
31. **A33** en la línea de pecho a separación de pecho (1/2) desde el centro delantero.
32. **A34** (punto de busto) = vertical por A33 ∩ arco con centro A23 y radio alto de pecho (en la figura el arco pasa por A34 y su punto más bajo está en la vertical de A23).
33. **A35** = línea A27–A32 ∩ horizontal por A34 (centro de la pinza en el costado). **A36** y **A37** a ±(largo delantero − largo espalda)/2 de A35 sobre esa línea: la pinza toma exactamente lo que se subió A27.
34. **A38** en A34→A37 a |A34 A36| (pierna inferior igualada a la superior).
35. **A40** en la bisectriz de A36–A34–A38 a |A34 A36| (pico de la pinza, "tapa" en el costado). Costado delantero: A27–A36, A36–A40–A38, A38–A32.

### Pinzas de cintura (R)
36. Espalda: **A41** en la mitad de A2–A31; **A42** en la línea de pecho, **A44** 2 cm bajo A42; **A46**/**A47** a ±(exceso de espalda − s)/2 de A41.
37. Delantero: **A48** en la cintura bajo A34; **A50** 3 cm bajo A34; **A52**/**A53** a ±(exceso delantero − s)/2 de A48.
38. Con largo a cadera las pinzas son rombos: **A45** y **A51** a 5 cm sobre la línea de cadera (**A43**, **A49** en la cadera).

### Cadera (R)
39. Extensión e = (cadera/2 + holgura/2 − W)/2, igual a los dos lados de A18: **A54** = A18 + e (espalda), **A55** = A18 − e (delantero). Los costados se cruzan entre cintura y cadera, como en la figura.
40. Costado de cadera A31–A54 y A32–A55: curva vertical en la cintura y en la cadera ("cadera tangente a la vertical").

### Piezas
- **Espalda**: A2 → A7 → (escote) A6 → A11 → (sisa) A16 → A31 → (cadera) A54 → A3 → A2. Internas: piernas de la pinza (A46/A47 → A44 y → A45), cintura A2–A31, hilo.
- **Delantero**: A24 → A4 → A5 → A55 → (cadera) A32 → A38 → A40 → A36 → A27 → (sisa) A26 → A23 → (escote) A24. Internas: pinza de busto (A34–A36, A34–A38), pinza de cintura (A52/A53 → A50 y → A51), cintura A32–A4, hilo; marca del punto de busto en A34.
- Con largo a cintura, la cintura (A2–A31, A32–A4) pasa a ser contorno y las pinzas son triángulos.
- Hilo: espalda paralelo al centro espalda a mitad entre éste y la pinza; delantero paralelo al centro delantero a mitad entre la pinza y el centro.
- Líneas de construcción: todo segmento con id `c.*` (caja, línea de pecho, referencias de hombro, guías de sisa, guía de costado, ejes de pinza).

## 5. Valores calculados a mano, talla 10 (mm)

W = 920/2 + 10 = 470; ancho de escote = 380/6 + 5 = 68,33; A9 = 920/6 + 60 = 213,33.

| Punto | Cálculo | Valor (x, y) |
|---|---|---|
| A6 | (68,33, 0) | (68,33, 0) |
| A7 | 68,33/3 | (0, 22,78) |
| A11 | r1 = √(68,33² + 425²) = 430,46; a = r1 − 120²/(2 r1) = 413,73; h = √(r1² − a²) = 118,83; base = A2 + a·u; A11 = base + h·perp(u) | (183,00, 35,38) |
| A12 | 175 + 5,5 | (180,5, 213,33) |
| A13 | 470 − (165 + 4,5) | (300,5, 213,33) |
| A16 | 180,5 + 120/2 − 7 | (233,5, 213,33) |
| A20 | 213,33 − (177,95/3 + 20) | (180,5, 134,01) |
| A21 | A12 + 27·(0,7071, −0,7071) | (199,59, 194,24) |
| A22 | 425 − 445 | (470, −20) |
| A23 | 470 − 68,33 | (401,67, −20) |
| A24 | −20 + 68,33 + 10 | (470, 58,33) |
| A26 | r1 = √(68,33² + 445²) = 450,22; a = 434,22; h = 118,93 (arco desde A4) | (286,54, 13,86) |
| A27 | 213,33 − (445 − 425) | (233,5, 193,33) |
| A29 | 193,33 − (177,95 − 10)/3 | (300,5, 137,35) |
| A30 | A28 + 21·(−0,7071, −0,7071) | (285,65, 178,48) |
| A31 / A32 | Q = 680/4 + 5 = 175; excesos 58,5 y 61,5; s = 0,25·120 = 30 | (203,5, 425) / (263,5, 425) |
| A33 | 470 − 100 | (370, 213,33) |
| A34 | −20 + √(260² − 31,67²) = −20 + 258,06 | (370, 238,06) |
| A35 | A27 + 0,19307·(A32 − A27) | (239,29, 238,06) |
| A36 / A38 | A35 ∓ 10 en la guía; pierna 132,36 | (238,01, 228,15) / (238,02, 248,18) |
| A40 | A34 + 132,36·bisectriz | (237,64, 238,16) |
| A41, A46, A47 | 203,5/2; pinza 58,5 − 30 = 28,5 | 101,75; 87,5; 116 (y = 425) |
| A44 | 213,33 + 20 | (101,75, 233,33) |
| A50 | 238,06 + 30 | (370, 268,06) |
| A52, A53 | pinza 61,5 − 30 = 31,5 | 354,25; 385,75 (y = 425) |
| A45, A51 | 625 − 50 | y = 575 |
| A54 / A55 | e = (480 + 10 − 470)/2 = 10 | (243,5, 625) / (223,5, 625) |

Resultados talla 10 (por defecto, hasta la cadera): sisa espalda 203,2 mm, sisa delantero 224,8 mm; hombros 120 = 120 mm; costados 418,5 mm ambos (diferencia 0,03 mm, sin contar la pinza); cintura por cuarto después de pinzas 175 mm; pinza de busto 20 mm en el costado; pinza de cintura delantera 31,5 mm y de espalda 28,5 mm.

## 6. Decisiones y desviaciones

1. **A31–A55 reconstruidos**: el e-book con los pasos de cintura, pinzas y cadera es de pago. Se midió la figura de la talla 38 (escala 22,8 px/cm, comprobada con A9 = pecho/6 + 6 = 20,67 cm, A16 = 22,46 cm y la altura de cadera 20 cm) y se derivaron las reglas de §4: pinza de espalda en la mitad de la cintura de espalda, pinza delantera bajo el busto, ápices 2 cm / 3 cm / 5 cm, costados con el 25 % del exceso, pinza de costado = largo delantero − largo espalda centrada a la altura del busto, pico de pinza (A40) a la longitud de la pierna sobre la bisectriz.
2. **Reparto de la cintura**: en la figura la pinza de espalda (30 % del exceso) es mayor que la delantera (20 %) y los cuartos no son iguales. Aquí cada cuarto mide exactamente cintura/4 + holgura/4 y los dos costados entran lo mismo (para que las costuras de costado midan igual), así que la pinza delantera (31,5 mm) sale algo mayor que la de espalda (28,5 mm).
3. **Cadera**: la extensión se reparte por igual a los dos lados de A18 (como en la figura), así que los cuartos de cadera no son idénticos (243,5 / 246,5 mm en la talla 10) pero la suma es cadera/2 + holgura/2.
4. **Escotes**: la fuente usa una "curva simple" con esquina de control (A8, A25), vertical en el punto cuello-hombro. Aquí el escote sale perpendicular al centro espalda/delantero y llega **perpendicular al hombro**, para que al unir hombros el escote no haga pico (requisito SPEC §5).
5. **Sisas**: Seamly2D usa un spline interactivo; aquí es una cadena de Bézier que pasa por los mismos puntos de control (A11, A20, A21, A16 y A26, A29, A30, A27) con tangentes Catmull–Rom en los puntos interiores, perpendicular al hombro arriba y perpendicular al costado abajo.
6. **Erratas de la fuente**: la sisa delantera cita "A26, A32, A29, A30, A27"; A32 es un punto de cintura y no puede estar en la sisa, se omite. A31 no aparece en los pasos publicados. A24 no indica su línea: se toma en el centro delantero bajo A22 (cuadra con la figura). A39 (marca en el costado inferior, sobre la línea de doblez de la pinza) no se traza porque no cambia el contorno.
7. **A16**: "LongitudActual/2 − 0,7" se mide desde A12 (primer punto), lo que da el desplazamiento hacia la espalda que muestra la figura.
8. **Holguras de cintura y cadera**: no legibles; se eligen 2 cm en total (§3). La holgura de pecho es la del método (+1 cm por mitad).
9. **Sin holgura de hombro**: el método traza ambos hombros con el mismo largo, sin pinza ni embebido de espalda.
