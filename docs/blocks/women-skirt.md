# Falda base mujer (falda recta): método de trazo

Implementación: `src/blocks/womenSkirt.ts` → `draftWomenSkirt(medidas, opciones) → Draft`.
Pruebas: `src/blocks/womenSkirt.test.ts`. Tabla de medidas: `co-women-industrial` (SPEC §3.1, tallas 6–16) y largo de falda de las complementarias (SPEC §3.4.1).

## 1. Fuentes

- **Fashion Patrón, "2.13. p.1 Patrón falda base, trazado con explicación detallada"**: https://www.youtube.com/watch?v=4-WBjzzDAbg (caja, cintura, pinzas de costado).
- **Fashion Patrón, "2.13. p.2 Patrón falda base, trazado con explicación detallada"**: https://www.youtube.com/watch?v=w1jleqlbJWk (curva de cadera, subida del costado, pinzas de espalda y delantero, cintura).
- Los pasos de §4 se tomaron de los **subtítulos automáticos en español** de los dos vídeos (transcritos con `yt-dlp`); las fórmulas se dictan en voz alta y se citan entre comillas. Los vídeos de pago (patrón multitalla con tabla de variables, piezas, desvío del eje de la pinza) no se consultaron.
- El blog (https://fashionpatron.wordpress.com/) no tiene entrada escrita de la falda base, solo de la falda circular.

## 2. Medidas

| Fashion Patrón | Tabla `co-women-industrial` | Talla 10 |
|---|---|---|
| Contorno de cintura | `waist` | 680 |
| Contorno de cadera | `hip` | 960 |
| Alto de cadera ("se mide por el lado") | `hipDepth` | 200 |
| Largo de falda ("una medida variable"; 55 cm en el vídeo) | `skirtLength` (complementaria §3.4.1, a la rodilla) | 590 |

## 3. Opciones y holguras (valores por defecto)

| Opción | Defecto | Origen |
|---|---|---|
| `hipEase` | 30 mm en total (caja = cadera/2 + 1,5 cm) | Método: "2 o 3 cm… vamos a poner 3" |
| `waistEase` | 20 mm en total | Método: "para el patrón base será suficiente 2 cm para cuerpo entero" |
| `sideShare` | 0,5: los dos costados toman el 50 % del exceso (25 % cada uno) | Método: "pinza del costado 50 %… la mitad pertenecerá al trasero y la mitad al delantero" |
| `sideSeamShift` | 0 mm (opción del editor: 1 cm hacia el delantero) | Método: "vamos a sumar 1 cm por si tenéis culito… este desvío no siempre hace falta" |

Constantes del método (`WOMEN_SKIRT_CONSTANTS`): curva de cadera hasta 2 cm sobre la cadera; costado subido 1 cm en la cintura; curva de cadera 1 cm hacia fuera; eje de la pinza de espalda en la mitad de la cadera de espalda − 1,5 cm; ápice de espalda 4 cm sobre la cadera; eje de la pinza delantera al 40 % de la cintura delantera desde el centro; ápice delantero 8 cm sobre la cadera; centro espalda bajado 1 cm.

## 4. Trazo paso a paso

Convenciones: origen en A (cintura, centro espalda), x a la derecha, y hacia **abajo**. Media falda en una sola caja, como el cuerpo base: **espalda a la izquierda** (centro espalda x = 0) y **delantero a la derecha** (centro delantero x = W) ("esta parte de izquierda sería la parte de espalda, o sea, el culito"). Fórmulas en cm como en la fuente; el código trabaja en mm. Los pasos son **(F)** de los vídeos salvo los marcados **(E)** (elección propia, ver §6).

### Caja base (F)
1. **A1** = A + largo de falda a 270°. **A2** en A–A1 a alto de cadera.
2. **A3** = A2 + (cadera/2 + 1,5) a 0° (ancho de la caja W = media cadera + media holgura).
3. **A4** = (x de A3, y de A1), **A6** = (x de A3, y de A). A2–A3 línea de cadera, A–A6 cintura, A1–A4 bajo, A6–A4 centro delantero, A–A1 centro espalda.
4. **A5** = mitad de A2–A3 (+ desvío opcional hacia el delantero). **A7** = A5 bajado al bajo; **A8** = A5 subido a la cintura. A8–A7 línea de costado.

### Exceso de cintura y costados (F)
5. Exceso para media falda: D = ((cadera + 3) − (cintura + 2))/2.
6. **A9** = A8 + D·0,5/2 (costado del delantero), **A10** = A8 − D·0,5/2 (costado de espalda): "pinza del costado" del 50 %, la mitad a cada lado.

### Costado (F)
7. **A11** en el costado, 2 cm sobre la cadera ("para que la caída quede más fina… que aquí no quede un pico").
8. Subida del costado: **A12** = A8 + 1 cm hacia arriba; **A13** = (x de A9, y de A12), **A14** = (x de A10, y de A12) ("la línea del costado se aumenta 1 cm… para que la línea de abajo quede absolutamente recta").
9. **A15** = mitad de A9–A11, **A16** = mitad de A10–A11. **A17** = A15 + 1 cm hacia fuera, **A18** = A16 + 1 cm hacia fuera, perpendicular a cada línea ("la diferencia… en el delantero tiene que ser absolutamente igual que en el trasero").
10. Costado delantero: curva A13 → A17 → A11 y recta A11 → A7; costado de espalda: curva A14 → A18 → A11 y recta A11 → A7. **(E)** La curva es vertical en A11 y sale de A13/A14 hacia A17/A18.

### Pinza de espalda (F)
11. **A19** en la línea de cadera a |A2 A5|/2 − 1,5 desde el centro espalda ("no llevarla demasiado en medio… un poquito más cerca de la línea del centro"); **A20** = A19 subido a la cintura.
12. Ancho: método 30 % de D, la mitad a cada lado de A20. **(E)** Aquí el ancho se ajusta para que la cintura de espalda mida cintura/4 + 0,5 (paso 16). **A21** = A20 + ancho/2 (hacia el costado), **A22** = A20 − ancho/2.
13. **A23** (ápice) = A19 + 4 cm hacia arriba ("desde la línea de la cadera hasta arriba… 4 cm").
14. **A24** = A + 1 cm hacia abajo (bajada del centro espalda).

### Pinza delantera (F)
15. **A25** en la cintura a 40 % de |A6 A9| desde A6 ("en vez de 50 % la mitad, 40"); **A26** = A25 bajado a la cadera. Ancho: método 20 % de D. **(E)** Ajustado como la espalda. **A27** = A25 − ancho/2 (hacia el costado), **A28** = A25 + ancho/2. **A29** (ápice) = A26 + 8 cm hacia arriba.

### Cintura (F + E)
16. Espalda: curva A14 → A21 que sale del costado en ángulo recto y llega horizontal a la pinza; curva A22 → A24 horizontal en los dos extremos ("aquí poner 360° o 0°"). Delantero: curva A13 → A27 en ángulo recto con el costado y horizontal en la pinza; recta A28 → A6 ("en principio mejor recta"). **(E)** El ancho de cada pinza se calcula por bisección para que la cintura de cada pieza, medida sobre las curvas y sin la abertura de la pinza, sea cintura/4 + holgura/4.

### Piezas
- **Espalda** (cortar ×1 al doblez del centro espalda): A24 → A1 → A7 → A11 → (cadera) A14 → (cintura) A21 → A22 → (cintura) A24. Internas: piernas de la pinza A21–A23 y A22–A23, hilo.
- **Delantero** (cortar ×1 al doblez del centro delantero): A6 → A4 → A7 → A11 → (cadera) A13 → (cintura) A27 → A28 → A6. Internas: piernas de la pinza A27–A29 y A28–A29, hilo.
- Igual que en el cuerpo base, la abertura de la pinza (A21–A22, A27–A28) es parte del contorno y las piernas son líneas internas.
- Piquete de cadera (`kind: 'notch'`, sencillo) en A5 en los dos costados.
- Hilo: paralelo al centro espalda a mitad entre éste y la pinza; paralelo al centro delantero a mitad entre la pinza y el centro.
- Líneas de construcción `c.*`: cintura, cadera, centro espalda, línea de costado, subida del costado, guías A9–A11 y A10–A11, salidas de la curva de cadera, ejes de las pinzas.

## 5. Valores calculados a mano, talla 10 (mm)

W = 960/2 + 15 = 495; D = (990 − 700)/2 = 145; costado = 145·0,5/2 = 36,25 a cada lado. Cuarto de cintura objetivo 680/4 + 5 = 175; cuarto de cadera 960/4 + 7,5 = 247,5.

| Punto | Cálculo | Valor (x, y) |
|---|---|---|
| A1, A2 | largo 590, alto de cadera 200 | (0, 590), (0, 200) |
| A3, A4, A6 | W = 495 | (495, 200), (495, 590), (495, 0) |
| A5, A7, A8 | 495/2 | (247,5, 200), (247,5, 590), (247,5, 0) |
| A9 / A10 | 247,5 ± 36,25 | (283,75, 0) / (211,25, 0) |
| A11 | 200 − 20 | (247,5, 180) |
| A12, A13, A14 | y = −10 | (247,5, −10), (283,75, −10), (211,25, −10) |
| A15 / A16 | mitades | (265,63, 90) / (229,38, 90) |
| A17 | A15 + 10·(−0,9804, −0,1974) | (255,82, 88,03) |
| A18 | A16 + 10·(0,9804, −0,1974) | (239,18, 88,03) |
| A19, A20 | 247,5/2 − 15 = 108,75 | (108,75, 200), (108,75, 0) |
| A23 | 200 − 40 | (108,75, 160) |
| A24 | 0 + 10 | (0, 10) |
| A21 / A22 | pinza de espalda ajustada 37,71 | (127,60, 0) / (89,90, 0) |
| A25, A26 | 495 − 0,4·(495 − 283,75) = 410,5 | (410,5, 0), (410,5, 200) |
| A29 | 200 − 80 | (410,5, 120) |
| A27 / A28 | pinza delantera ajustada 36,93 | (392,04, 0) / (428,96, 0) |

Resultados talla 10 (por defecto): cintura después de pinzas 175,00 mm en la espalda y en el delantero; cadera 247,5 + 247,5 (= 960/2 + 15); costados 604,47 mm los dos (curva de 194,47 + recta de 410); pinza de espalda 37,7 mm (16 cm de larga desde la cintura), pinza delantera 36,9 mm (12 cm). Con el reparto literal del método las pinzas serían 43,5 (30 %) y 29,0 mm (20 %).

## 6. Decisiones y desviaciones

1. **Reparto de pinzas**: el método reparte el exceso 50 % costados (25 % cada uno), 30 % pinza de espalda y 20 % pinza delantera. Así la media cintura cuadra, pero cada cuarto no: la cintura de espalda queda 0,1·D (14,5 mm en la talla 10) más corta que la delantera. Igual que en el cuerpo base (`women-bodice.md` §6.2), aquí los costados entran lo mismo (25 % cada uno, para que las costuras de costado midan igual) y **cada pinza se ajusta** para que su cuarto de cintura mida exactamente cintura/4 + holgura/4. Las dos pinzas salen casi iguales (≈ 25 % del exceso cada una); la de espalda sigue siendo más larga (ápice a 4 cm de la cadera frente a 8 cm).
2. **Cintura medida sobre las curvas**: la subida de 1 cm en el costado y la bajada de 1 cm en el centro espalda alargan la cintura; el ajuste de la pinza lo compensa (por eso las pinzas no son exactamente 0,25·D = 36,25).
3. **Desvío del costado**: el método lo propone para caderas con más volumen detrás, pero dice que "no siempre hace falta". Por defecto es 0, así que cada cuarto de cadera mide cadera/4 + holgura/4; con la opción de 1 cm la espalda gana 1 cm en la cadera y el delantero lo pierde.
4. **Largo de falda**: el vídeo usa 55 cm fijos ("un poco por encima de la rodilla"). Aquí se usa el largo de falda de la tabla complementaria (§3.4.1, a la rodilla: 58–60,5 cm).
5. **Bajada del centro espalda**: el vídeo dice primero "unos 2 cm" y luego traza 1 cm (y su patrón multitalla tiene la variable "bajada cintura espalda 1 cm"). Se usan 1 cm. El delantero no baja ("1 cm desde la línea de costado hacia abajo es suficiente").
6. **Curvas**: Seamly2D usa splines ajustados a ojo. Aquí la cintura sale perpendicular al costado y llega horizontal a las pinzas y al centro espalda; la curva de cadera pasa por A17/A18 y es vertical en A11.
7. **Pinzas**: piernas rectas. El método las curva un poco hacia dentro y desvía el eje 0,5 cm (vídeo de pago); no se aplica. Tampoco se traza la "tapa" de la pinza ("subir los ejes de las pinzas" al crear las piezas), como en el cuerpo base.
8. **Piquete de cadera** en A5: añadido para casar los costados; el vídeo no lo menciona.
9. **Nombres**: el vídeo crea A13/A14 con "punto intersección XY a9 a12" y "a10 a12"; aquí A13 es el delantero y A14 la espalda, como su curva de espalda "A14 → … → A11".
