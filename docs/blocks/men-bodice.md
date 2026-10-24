# Cuerpo base / camisa base hombre: método de trazo

Implementación: `src/blocks/menBodice.ts` → `draftMenBodice(medidas, opciones) → Draft`.
Pruebas: `src/blocks/menBodice.test.ts`. Tabla de medidas: `es-men-easd` (SPEC §3.2 y §3.4.2, tallas 40–54; **pecho, cintura y cadera son medias medidas**).
Bloque del registro: `men-bodice` ("Cuerpo base / camisa hombre"), talla por defecto 48.

## 1. Fuentes

- **Sistema de la EASD Valencia.** La guía docente de Patronaje (2.º de Diseño de Moda, curso 2025-26, apartado 10 "Bibliografía") dice que el sistema que se imparte "corresponde al sistema de patronaje industrial Onofre Ayala", con apuntes propios del profesorado: https://www.easdvalencia.com/wp-content/uploads/guias_ftp/2025/2025_26%20GU%C3%8DAS%20DOCENTES%20GRADOS/DISE%C3%91O%20MODA/2%C2%BA%20CURSO/2DM_Patronaje_2025_26.pdf. **El método Onofre Ayala no está publicado en línea**: búsquedas por "Onofre Ayala patronaje", "radio de escote" + "profundidad de sisa" y similares (23/10/2026) solo devuelven las guías docentes. La bibliografía complementaria (Donnanno, *Técnicas de patronaje de moda* vol. 1; Aldrich; Gilewska…) tampoco tiene el trazo de camisa de hombre accesible.
- **Método usado: Tele Virtual Patronage ("Cómo cubrir un cuerpo"), "Trazado base de la camisa: el cuerpo"** (publicado el 18/12/2013, actualizado el 11/10/2025), escuela española, trazo proporcional de la camisa clásica de caballero, con cinco figuras:
  https://tevipa.com/blog/trazado-base-de-la-camisa-el-cuerpo/ (antes comocubriruncuerpo.org).
  Es el método público más cercano a la tabla EASD: usa **el quinto del cuello para la caja de cuello** (la tabla EASD da el "radio de escote" = cuello/5 exacto en las 8 tallas: 40/5 = 8 en la 48), una **línea de sisa a partir del largo de sisa**, el **ancho de espalda** en la "línea de avance de sisa", la **línea de talle** para centrar los arcos del hombro y la medida de pecho en **media medida** (P = 48 en la 48; lo confirman las figuras: el canesú de espalda a (P/10)+(P/20) mide 7,2 cm, no 14,4).
- Se consultaron y **descartaron** por no casar con las medidas EASD: Aldrich, *Metric Pattern Cutting for Menswear* (solo accesible el bloque de chaqueta en Valentina: https://github.com/SamOdum/sewing/blob/master/patterns/WA-mens-classic-jacket-block.val, usa "scye depth" + 2,5 cm, medio pecho + 10 cm y pinza de pecho; no hay bloque de camisa legible en línea); Kalasiris, "Patrón base caballero" (https://kalasirispb.blogspot.com/2018/04/patron-caballero.html, sin holguras ni curvas); Cerulean Closet y Kirty Cosplay (tallas por fórmula de estatura, sin radio de escote).

## 2. Medidas

| Método (Tevipa) | Tabla `es-men-easd` (clave) | Talla 48 (mm) |
|---|---|---|
| P, medida de pecho (patrón sobre medio cuerpo) | Pecho, media medida (`chest`) | 480 |
| Quinto de la medida de cuello (caja de cuello) | Radio de escote (`neckRadius`) | 80 |
| Largo de sisa (LS) | Profundidad de sisa (`armholeDepth`) | 230 |
| Línea de cintura (LC) | Largo de talle (`waistLength`) | 435 |
| Línea de avance de sisa (espalda) | Ancho de espalda, media (`halfBackWidth`) | 215 |
| (proporcional en el método) | Ancho de pecho (1/2), complementaria §3.4.2 (`halfChestWidth`) | 190 |
| Largo total (LT) | Largo total de camisa, complementaria (`shirtLength`) | 755 |
| (no la usa) | Altura de cadera (`hipDepth`): línea de cadera | 160 |
| (no la usa) | Cintura y cadera (`waist`, `hip`): solo se comprueba que queda holgura | 400 / 500 |

## 3. Opciones y holguras (valores por defecto)

| Opción | Defecto | Origen |
|---|---|---|
| `length` | `'shirt'` (largo de camisa); `'hip'` corta en la línea de cadera | Elección; el método llega al bajo de camisa |
| `ease.chest` | 80 mm sobre el medio pecho (16 cm en el contorno) | Método: "holgura de 8 cm… desplegando el patrón completo… 16 cm" |
| `ease.armholeDepth` | 40 mm bajo la profundidad de sisa | Método: "para la sisa daremos la mitad del total de holgura, o sea 4" |
| `ease.backWidth` | 5 mm sobre el ancho de espalda | **Elección** (ver §6.2) |
| `ease.chestWidth` | 10 mm sobre el ancho de pecho | **Elección** (ver §6.2) |
| `sideSeamShift` | 10 mm hacia el delantero | Método: "desplazaremos la línea de un centímetro hacia la mitad delante" |

Constantes (`MEN_BODICE_CONSTANTS`): subida del escote de espalda = radio/2 − 1 cm; hombro 1 cm más allá de la línea de avance de sisa; cruce de 0,5 cm de cada costado en la línea de sisa; la sisa toca las líneas de espalda y pecho a 1/3 del alto del cuadrado; bisectrices de 3 cm (espalda) y 2,5 cm (delantero) (**elección**); canesú de espalda a (P/10)+(P/20) de la nuca; canesú delantero paralelo al hombro a P/20.

## 4. Trazo paso a paso

Convenciones: origen en A (nuca, centro espalda en la línea superior), x a la derecha, y hacia **abajo**. **Espalda a la izquierda** (centro espalda x = 0) y **delantero a la derecha** (centro delantero x = W), como en el cuerpo base de mujer (la figura del método los pone al revés). Fórmulas en cm como en la fuente; el código trabaja en mm. Pasos **(M)** = del método; **(E)** = medida EASD en lugar de la proporción del método; **(C)** = elección propia (§6).

### Caja base (M, E)
1. **A** = (0, 0); **A1** = A + (pecho + 8) a 0°. W = |A A1| = media espalda + medio delantero.
2. **B** = A + (profundidad de sisa + 4) hacia abajo: línea de sisa B–B1.
3. **C** = A + largo de talle: línea de cintura C–C1. **D** = C + altura de cadera: línea de cadera D–D1 (E).
4. **E** = A + largo total de camisa (o = D con largo a cadera): bajo E–E1.

### Costado (M)
5. **F** en la línea de sisa a W/2 + 1 desde el centro espalda; **G**, **H**, **I** en la misma vertical a la altura de cintura, cadera y bajo.

### Cuadrado de sisa (E)
6. **J** en la línea de sisa a ancho de espalda + 0,5 desde el centro espalda (línea de avance de sisa J1–J).
7. **K** en la línea de sisa a ancho de pecho + 1 desde el centro delantero (J1, K1 en la línea superior).

### Escotes (M, E)
8. **L** = A + radio de escote a 0°; **M** = L + (radio/2 − 1) hacia arriba (punto de cuello de espalda): "subiremos por encima la mitad de dicho recorrido menos 1 cm".
9. **N** = A1 + radio a 180° (punto de cuello delantero); **O** = A1 + radio hacia abajo (escote en el centro delantero); **O1** = esquina de la caja de cuello.
10. Escote de espalda A → M y delantero N → O: curvas perpendiculares al centro espalda/delantero y al hombro (C).

### Hombros (M)
11. Arco con centro **C** (cintura en el centro espalda) y radio |C M|. **P** = intersección del arco con la línea de avance de sisa (x de J).
12. **Q** = P + 1 cm a lo largo del arco (punto de hombro de espalda): "desde esta cota daremos 1 cm más de recorrido". Hombro de espalda M–Q.
13. Arco con centro **C1** (cintura en el centro delantero) y radio |C1 N|; **R** = su intersección con el arco de centro N y radio |M Q| ("daremos el mismo valor al hombro delantero"). Hombro delantero N–R.

### Sisas (M, C)
14. **S** = (x de J, 2/3 de la profundidad de B) y **T** = (x de K, misma altura): el alto del cuadrado (de la línea superior a la de sisa) en tres partes; la sisa toca las líneas de espalda y pecho en el tercio inferior.
15. **X** = F + 0,5 cm hacia el delantero (fin de la sisa de espalda) y **Y** = F + 0,5 cm hacia la espalda (fin de la sisa delantera): "provocaremos un cruce de 0.5 cm en cada una de las costuras".
16. **U** = J + 3 cm por la bisectriz del ángulo S–J–X; **V** = K + 2,5 cm por la bisectriz de T–K–Y (C).
17. Sisa de espalda Q → S → U → X y delantera R → T → V → Y: perpendiculares al hombro arriba y al costado abajo (C).

### Costados (M)
18. Espalda X → G → I y delantero Y → G → I: el cruce de 0,5 cm se anula en la cintura (como en la figura) y el costado baja recto hasta el bajo. Camisa recta: sin pinzas ni entalle ("la medida de cintura la pondremos justa").

### Profundidad de sisa del trazado (M)
19. **Z** = mitad de Q–R ("uniremos con una línea la punta del hombro delante y la punta del hombro detrás"); **Z1** = su proyección en la línea de sisa. **PS** = |Z Z1|/2 ("la mitad de recorrido de esta última línea la llamaremos Profundidad de Sisa"); **Z2** = mitad de Z–Z1. PS es la altura de copa de la manga (`docs/blocks/men-sleeve.md`).

### Canesú (M, líneas internas)
20. **A2** en el centro espalda a (P/10)+(P/20) de A; línea perpendicular al centro espalda hasta la sisa de espalda: **A3**. Línea interna `back.yoke` (corte de la pieza inferior de espalda).
21. Paralela al hombro delantero a P/20 (figura del método; ver §6.4): **A4** en el escote y **A5** en la sisa. Línea interna `front.yoke`.

### Piezas
- **Espalda**: A → (centro espalda) E → I → G → X → (sisa) S, U → Q → M → (escote) A. Internas: canesú `back.yoke`, línea de cintura `back.waistLine`, línea de cadera `back.hipLine` (solo largo de camisa), hilo. Piquete doble en S.
- **Delantero**: O → (centro delantero) E1 → I → G → Y → (sisa) V, T → R → N → (escote) O. Internas: `front.yoke`, `front.waistLine`, `front.hipLine`, hilo. Piquete sencillo en T.
- Las sisas son `back.armhole.0–2` y `front.armhole.0–2` (el lector "Sisa" del editor suma los segmentos cuyo id contiene "armhole").
- Hilo: espalda paralelo al centro espalda a la mitad del ancho de espalda; delantero paralelo al centro delantero, a mitad entre la línea de pecho y el centro.
- Líneas de construcción: todo segmento con id `c.*` (caja, líneas de sisa, cintura y cadera, costado, cuadrado de sisa, caja de cuello, referencias de hombro, unión de hombros y PS).

## 5. Valores calculados a mano, talla 48 (mm)

W = 480 + 80 = 560; línea de sisa 230 + 40 = 270; radio de escote r = 80.

| Punto | Cálculo | Valor (x, y) |
|---|---|---|
| A1, B, C, D, E | W; 270; 435; 435 + 160; 755 | (560, 0), (0, 270), (0, 435), (0, 595), (0, 755) |
| F, G, I | 560/2 + 10 | (290, 270), (290, 435), (290, 755) |
| J | 215 + 5 | (220, 270) |
| K | 560 − (190 + 10) | (360, 270) |
| L, M | r; −(80/2 − 10) | (80, 0), (80, −30) |
| N, O | 560 − 80; r | (480, 0), (560, 80) |
| P | R_e = √(80² + 465²) = 471,83; 435 − √(471,83² − 220²) = 435 − 417,40 | (220, 17,60) |
| Q | P girado 10/471,83 = 0,021194 rad alrededor de C | (228,80, 22,35) |
| hombro | \|M Q\| = √(148,80² + 52,35²) | 157,74 |
| R | R_d = √(80² + 435²) = 442,30; a = (2·442,30² − 157,74²)/(2·442,30) = 414,17; h = 155,20; base = C1 + a·(−0,1809, −0,9835) = (485,08, 27,66); R = base − h·(0,9835, −0,1809) | (332,44, 55,73) |
| S, T | 270·2/3 = 180 | (220, 180), (360, 180) |
| X, Y | 290 ± 5 | (295, 270), (285, 270) |
| U | J + 30·(0,7071, −0,7071) | (241,21, 248,79) |
| V | K + 25·(−0,7071, −0,7071) | (342,32, 252,32) |
| Z, Z1 | mitad de Q–R | (280,62, 39,04), (280,62, 270) |
| PS | (270 − 39,04)/2 | 115,48 |
| A2 | 480/10 + 480/20 | (0, 72) |
| A3 | horizontal y = 72 ∩ sisa de espalda (curva, valor del programa) | (218,27, 72) |
| A4, A5 | paralela al hombro a 24 ∩ escote / sisa delantera (curvas, valor del programa) | (490,12, 21,83), (340,39, 78,39) |

Resultados talla 48 (largo de camisa): ancho en la línea de sisa espalda 290 / delantero 270 (suma 560 = pecho + 8, media por pieza 280 = 48/2 + 4); hombros 157,74 = 157,74 mm; costados 485,08 = 485,08 mm (165,08 + 320); sisa espalda 291,70 mm, delantera 265,73 mm (total 557,43); PS 115,48 mm. Holgura sobre la cintura W − 400 = 160 mm y sobre la cadera W − 500 = 60 mm por medio cuerpo.

## 6. Decisiones y desviaciones

1. **Método sustituto**: el sistema Onofre Ayala de la EASD no es consultable (§1). Se usa el trazo de camisa de Tevipa porque comparte las medidas de la tabla (quinto de cuello = radio de escote, largo de sisa, talle, ancho de espalda, pecho en media medida). Validar con prueba de tela y, si se consiguen los apuntes de la EASD, revisar.
2. **Anchos de espalda y pecho**: el método los saca de un cuadrado de sisa de ancho P/4 + 2 centrado en el costado, es decir espalda = 3P/8 + 4 y pecho = 3P/8 + 2 (en cm). Aquí se usan las medidas de la tabla: ancho de espalda EASD + 0,5 y ancho de pecho (§3.4.2) + 1. En la talla 48 coinciden exactamente con el método (22 y 20 cm); en las otras tallas siguen la gradación EASD (+0,5 por talla) en lugar de la proporcional (+0,75).
3. **Holgura de sisa**: la línea de sisa se baja 4 cm de la profundidad de sisa EASD (método). La tabla no aporta la holgura.
4. **Canesú delantero**: el texto dice P/10, pero la figura acotada del método marca **P/20** y la distancia dibujada coincide con P/20 (2,4 cm en la 48; con P/10 serían 4,8 cm, un canesú adelantado poco habitual). Se sigue la figura.
5. **Curvas**: el método traza escotes y sisas a mano. Aquí son Bézier por los puntos del método, perpendiculares al centro espalda/delantero, al hombro y al costado (requisito SPEC §5). Las bisectrices U y V (3 y 2,5 cm) son una elección: el método solo da el tercio de apoyo, y estas distancias reproducen la figura.
6. **Hombro**: igual en espalda y delantero (método), sin embebido de hombro. Es más largo que el "largo de hombro" de §3.4.2 (157,7 frente a 143 mm en la 48) porque la camisa clásica tiene el hombro caído 1 cm más allá del ancho de espalda.
7. **Cintura y cadera**: la camisa base es recta. La cintura y la cadera EASD no cambian el trazo; solo se marcan las líneas (internas) y las pruebas comprueban que queda holgura en todas las tallas (la cintura salta +4 de la 48 a la 50, véase la nota de §3.2).
8. **Cruce y tapeta**: la camisa del método añade una pretina de 3,5 cm en el centro delantero (el texto dice 0,75 cm y la figura 1,75 cm, la mitad de 3,5). Es un elemento del modelo, no de la base, así que el bloque termina en el centro delantero.
9. **Canesú de espalda**: los ajustes del método sobre la pieza inferior separada (bajar 0,75 cm en la sisa, subir 1 cm en el centro y 2 cm de pliegue) son operaciones de separación de piezas (F4); aquí solo se marca la línea.
