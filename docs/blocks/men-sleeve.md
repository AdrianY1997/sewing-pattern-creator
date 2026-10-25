# Manga base hombre (manga de camisa / chaqueta de una pieza): método de trazo

Implementación: `src/blocks/menSleeve.ts` → `draftMenSleeve(medidas, opciones) → Draft`.
Pruebas: `src/blocks/menSleeve.test.ts`. Tabla de medidas: `es-men-easd` (SPEC §3.2 y §3.4.2, tallas 40–54).
Bloque del registro: `men-sleeve` ("Manga base hombre"), cortar ×2.
La manga se monta en el cuerpo base de `docs/blocks/men-bodice.md`: las longitudes de sisa y la profundidad de sisa (PS) salen de `draftMenBodice` con las mismas medidas y las opciones por defecto (`menBodiceArmhole`).

## 1. Fuentes

- **Tele Virtual Patronage ("Cómo cubrir un cuerpo"), "Trazado base de la camisa: la manga"** (publicado el 19/12/2013, actualizado el 12/10/2025), continuación del cuerpo de camisa usado para el cuerpo base, con siete figuras:
  https://tevipa.com/blog/trazado-base-de-la-camisa-la-manga/
- El sistema de la EASD (Onofre Ayala, §1 de `men-bodice.md`) no está publicado; se usa la manga del mismo método que el cuerpo para que copa y sisa casen.

## 2. Medidas

| Método / origen | Tabla `es-men-easd` o cuerpo | Talla 48 (mm) |
|---|---|---|
| Profundidad de sisa (PS) del cuerpo = altura de copa | `measureMenBodice(...).armholeDepth` | 115,48 |
| Recorrido de la sisa de la camisa | sisa espalda + delantera (`back.armhole.*`, `front.armhole.*`) | 291,92 + 266,18 = 558,10 |
| Sisa bajo los piquetes (S → X, T → Y) | `back.armhole.1 + .2`, `front.armhole.1 + .2` | 132,84 / 138,45 |
| Largo total de manga | Largo de manga (`sleeveLength`) | 610 |
| Ancho del bajo | Ancho bocamanga, media medida (`halfCuffWidth`) | 140 |
| (comprobación) | Contorno de brazo (`upperArm`, estimado §3.4.2) | 320 |
| (comprobación) | Contorno de muñeca (`wrist`) | 176 |

## 3. Opciones y holguras (valores por defecto)

| Opción | Defecto | Origen |
|---|---|---|
| `capEase` (embebido total de copa) | 10 mm (editor: 0 / 1 / 2 cm) | **Elección** (§6.1): el método no lo fija; con diagonales = sisa/2 su copa da 9,1–10,8 mm según la talla (9,73 en la 48) |
| `notchEaseShare` | 0,25 del embebido bajo cada piquete; el resto (la mitad) entre los piquetes y el hombro | **Elección** |

Constantes del método (`MEN_SLEEVE_CONSTANTS`): cotas sobre la transversal delantera −1,2 / 0 / +1,2 cm a 1/4, 1/2 y 3/4 desde el costado; sobre la de espalda +1,5 cm a 1/3 desde la cima, 0 a 2/3 y −0,5 cm a la mitad del último tercio (5/6); costuras bajo brazo entradas 1 cm a mitad de recorrido. Holgura mínima de bíceps comprobada en las pruebas: 6 cm (**elección**; el método no la da).

## 4. Trazo paso a paso

Convenciones: origen en A (cima de la copa, "la parte más alta de la cabeza situada en el RH"), x a la derecha, y hacia **abajo**. Línea central RH en x = 0. **Espalda a la izquierda y delantero a la derecha**, como en la manga de mujer (la figura del método los pone al revés). Fórmulas en cm como en la fuente; el código trabaja en mm. **(M)** = del método; **(E)** = medida EASD; **(C)** = elección (§6).

### Copa (M)
1. **B** = A + PS hacia abajo: línea de ancho de manga por B ("calcularemos el valor encontrado de Profundidad de sisa").
2. Arco con centro A y radio = "la mitad del recorrido de la sisa de la camisa": sus cortes con la línea de ancho son **D** (espalda) y **E** (delantero). Ancho de manga = |D E| = 2·√(radio² − PS²).
3. **(C)** El radio se ajusta por bisección para que la copa mida sisa espalda + sisa delantera + embebido (paso 6). En la 48 pasa de 278,72 a 278,85 mm.

### Curva de la copa (M)
4. Transversal de espalda A–D: **H0** a 1/3 desde A, **I** a 2/3, **J0** a 5/6 (mitad del último tercio). **H** = H0 + 1,5 hacia fuera; **J** = J0 + 0,5 hacia dentro.
5. Transversal delantera E–A: **K0** a 1/4 desde E, **L** a 1/2, **M0** a 3/4. **K** = K0 + 1,2 hacia dentro; **M** = M0 + 1,2 hacia fuera.
6. Copa de espalda D → J → I → H → A y delantera A → M → L → K → E, horizontal en A y en D/E.

### Cuerpo de la manga (M, E)
7. **C** = A + largo de manga (E). **F**, **G** = C ∓ ancho bocamanga (E): el bajo mide 2 × ancho bocamanga.
8. Costuras bajo brazo D → F y E → G, entradas 1 cm a mitad de recorrido (**N**, **O**): "a mitad de su recorrido entraremos un cm".

### Piquetes (C)
9. **P** (doble, espalda ↔ S del cuerpo) en la copa a |S X| + embebido/4 desde D; **Q** (sencillo, delantero ↔ T) a |T Y| + embebido/4 desde E; **R** (hombro) a sisa espalda + (copa − sisas)/2 desde D.

### Pieza
- **Manga**: F → N → D → (copa espalda) A → (copa delantera) E → O → G → F. Copa `sleeve.capBack.0–3` y `sleeve.capFront.0–3`, bajo brazo `sleeve.underarmBack.0–1` / `sleeve.underarmFront.0–1`, bajo `sleeve.hem`.
- Hilo por la línea central RH. Piquetes P (×2), Q y R.
- Construcción `c.*`: línea central, ancho de manga, transversales, cotas y guías rectas del bajo brazo.

## 5. Valores calculados a mano, talla 48 (mm)

PS = 115,48; sisa = 558,10; radio (diagonal) ajustado d = 279,02 (método: 558,10/2 = 279,05).

| Punto | Cálculo | Valor (x, y) |
|---|---|---|
| B | PS | (0, 115,48) |
| D, E | ±√(279,02² − 115,48²) = ±√64 518 | (∓254,00, 115,48) |
| u (A→D) | (−254,00, 115,48)/279,02 | (−0,91034, 0,41387) |
| H | 93,01·u + 15·(−0,41387, −0,91034) | (−90,88, 24,84) |
| I | 186,01·u | (−169,34, 76,98) |
| J | 232,52·u − 5·(−0,41387, −0,91034) | (−209,60, 100,78) |
| K | E + 69,76·(−0,91034, −0,41387) − 12·(0,41387, −0,91034) | (185,54, 97,53) |
| L | E + 139,51·(−0,91034, −0,41387) | (127,00, 57,74) |
| M | E + 209,27·(−0,91034, −0,41387) + 12·(0,41387, −0,91034) | (68,47, 17,95) |
| C, F, G | 610; ±140 | (0, 610), (∓140, 610) |
| N | mitad de D–F (−197,00, 362,74) + 10·(0,97444, −0,22468) | (−187,26, 360,49) |
| O | simétrico de N | (187,26, 360,49) |

Resultados talla 48: copa 568,10 mm (espalda 283,41 + delantero 284,69) = sisa 558,10 + embebido 10; ancho de manga 508,01 mm (brazo 320 + 188,0 de holgura); bajo 280 mm; costuras bajo brazo 507,94 = 507,94 mm; piquetes a 135,34 mm de D (P), 140,95 mm de E (Q) y 296,92 mm de D (R, hombro).

## 6. Decisiones y desviaciones

1. **Embebido**: el método no lo nombra; su copa (diagonales = sisa/2 más las cotas) sale entre 0,9 y 1,1 cm más larga que la sisa. Se fija 1 cm por defecto y se ajusta la diagonal (no la altura de copa, que es la PS del método) para que la copa mida exactamente sisa + embebido en todas las tallas. El editor ofrece 0 / 1 / 2 cm.
2. **Largo y bajo**: el método descuenta 6 cm de puño del largo y quita P/10 a cada lado del bajo, dejando tela para los pliegues del puño (34,2 cm en la 48). La manga base no lleva puño ni pliegues: llega al largo de manga EASD y el bajo mide 2 × ancho bocamanga EASD (28 cm en la 48). Tampoco se redondea el bajo 1 cm en el RH, que pertenece a la manga con puño.
3. **Manga de camisa como base de chaqueta**: la copa baja (PS ≈ 11,5 cm) y el bíceps ancho (holgura ≈ 19 cm) son los de la camisa clásica. Para chaqueta habría que subir la copa y aumentar el embebido (2–4 cm), lo que queda para una transformación posterior.
4. **Piquetes**: el método no los sitúa. Se ponen como en la manga de mujer: un cuarto del embebido bajo cada piquete y la mitad repartida a los lados del piquete de hombro, que se cose a la costura de hombro.
5. **Curvas**: la copa entera D → A → E es una curva justa (`fairCurve`) por los puntos de las cotas, horizontal en la cima y en el bajo de la copa, con curvatura continua también en A y **una sola inflexión en cada mitad**; sus parámetros de forma se ajustan, se resuelve la diagonal, se reajustan y se vuelve a resolver (la copa mide exactamente sisa + embebido). La versión anterior (tangentes Catmull–Rom por mitades) tenía 8 inflexiones y saltos de curvatura del 200 %. Las costuras bajo brazo son Catmull–Rom por D, N, F (y E, O, G), así que miden lo mismo por simetría.
6. **Contorno de brazo**: es una medida "estimada (sin fuente)" de §3.4.2. Solo se usa para comprobar la holgura mínima del bíceps (6 cm), que se cumple con margen en todas las tallas (167 mm en la 40, 207 mm en la 54).
