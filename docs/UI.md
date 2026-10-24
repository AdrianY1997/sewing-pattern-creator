# Guía de UI / estilo visual (editor F2)

Referencia: `docs/example-layout.png` (maqueta a 1536 px de ancho). El editor es **desktop-first**. La maqueta muestra una app de marca "PatronArte"; el nombre y el logo reales se definen aparte.

## 1. Regiones del layout (a 1536 px)

| Región | Ancho / alto aprox. | Contenido |
|---|---|---|
| Barra superior | alto 66 px, todo el ancho, azul marino | Logo + nombre + tagline (izq., ~155 px); título de la prenda con lápiz de edición y migas (`Mujer > Tops > Básicos`); deshacer/rehacer; toggle segmentado Vista 2D / Vista 3D; **Guardar** (botón contorno); **Exportar** (botón primario índigo); avatar |
| Riel de navegación | 155 px, marino oscuro | Inicio, Nuevo patrón (activo, fondo resaltado), Mis patrones, Biblioteca, Medidas, Proyectos; **Configuración** anclada abajo |
| Panel de configuración | ~235 px, blanco | Pestañas Diseño / Medidas / Ajustes (subrayado activo). Diseño: Tipo de prenda (select con icono), Modelo (2 tarjetas Frente/Espalda, seleccionada con borde índigo), Talla base (select, p. ej. "M (Colombia)"), Tipo de cuerpo (select con silueta), Estilo (select), Nivel de dificultad (chips Fácil/Intermedio/Avanzado), "Opciones avanzadas" (colapsable) con toggles: Margen de costura (1 cm), Dobladillo (2 cm), Pinzas (Sí), Corte al bies |
| Lienzo | ~815 px de ancho x ~700 px de alto, fondo gris claro con rejilla | Ver abajo |
| Panel derecho "Detalles del patrón" | ~320 px, blanco | Miniatura (frente/espalda) + nombre + "Mujer \| Talla M"; **Tallas disponibles** (chips, la seleccionada resaltada en índigo); **Piezas** (icono, nombre, xN); Notas (colapsable, textarea); botón "Guardar como plantilla"; tarjeta Sugerencias |
| Fila inferior | alto ~245 px, 3 tarjetas | Vista previa (selector + Frente/Espalda), Instrucciones de confección (pasos numerados + ilustraciones), Medidas del usuario (select de perfil, lista, Editar, "Ver todas las medidas") |

**Lienzo**
- Barra de herramientas superior (icono + etiqueta debajo): Seleccionar, Mover, Escalar, Rotar, Añadir punto, Eliminar punto, Curva, Recta, Simetría, Espejo (este último solo icono). Separadores verticales entre grupos. Herramienta activa con fondo índigo claro.
- Panel flotante **Capas** (arriba-izq., ~125 px, sombra suave, colapsable): checkbox + muestra de color/estilo de línea + nombre: Contorno, Costura, Tallas, Pinzas, Líneas guía, Notas.
- Abajo-izq.: control de zoom (lupa, −, `100%`, +, ajustar a pantalla).
- Abajo-der.: lectura del cursor `X: 12.4  Y: 8.7  cm` + botón de rejilla.

## 2. Tokens visuales

```css
:root {
  /* Marco (oscuro, fijo en ambos temas) */
  --nav-bg: #111a33;           /* barra superior y riel */
  --nav-bg-active: #1f2a4a;
  --nav-text: #cfd6e6;
  --nav-text-muted: #8591ad;

  /* Superficies */
  --app-bg: #f1f3f8;           /* fondo de la app */
  --panel-bg: #ffffff;
  --canvas-bg: #f6f8fc;
  --grid-line: #e1e6f0;
  --border: #e3e7ef;
  --text: #1c2236;
  --text-muted: #6b7491;

  /* Acento */
  --primary: #5b4ee0;          /* índigo/violeta */
  --primary-hover: #4a3dc9;
  --primary-soft: #e9e7fc;     /* fondos de selección */
  --on-primary: #ffffff;

  /* Lienzo (capas) */
  --layer-outline: #1d4ed8;    /* contorno, azul */
  --layer-seam: #e0309a;       /* margen de costura, magenta */
  --layer-sizes: #b86be0;      /* tallas */
  --layer-darts: #34b36b;      /* pinzas */
  --layer-guide: #8a94ad;      /* líneas guía */
  --layer-notes: #6b7491;
  --grainline: #7a859f;
  --selection: #5b4ee0;

  /* Forma */
  --radius-sm: 6px;            /* chips, inputs */
  --radius-md: 10px;           /* tarjetas, botones */
  --radius-lg: 14px;           /* paneles flotantes */
  --radius-full: 999px;        /* chips de dificultad, avatar */
  --shadow-float: 0 4px 16px rgb(17 26 51 / 0.12);

  /* Espaciado (px) */
  --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px; --sp-5: 24px; --sp-6: 32px;

  /* Tipografía */
  --font: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif;
  --fs-xs: 11px; --fs-sm: 12px; --fs-md: 14px; --fs-lg: 16px;
}
```

- Tipografía: Inter (o similar); títulos de panel 600 / 14-16 px, etiquetas 12-13 px, texto de lienzo 13-15 px.
- Bordes: 1 px `--border`; los paneles son tarjetas blancas con radio 10 px sobre `--app-bg`, separadas 8 px.
- Iconos: contorno (stroke 1.5-2 px), estilo **lucide-react**, 18-20 px en barra de herramientas, 16 px en listas.
- Tema: la maqueta es solo **claro**. Barra superior y riel son oscuros en cualquier caso. Un tema oscuro queda fuera de v1; si se añade, redefinir solo `--app-bg`, `--panel-bg`, `--canvas-bg`, `--grid-line`, `--border`, `--text*` bajo `[data-theme="dark"]` sin tocar los tokens de capas.

## 3. Convenciones de dibujo del lienzo

| Capa | Estilo |
|---|---|
| Contorno | Línea continua 1.5-2 px `--layer-outline`; vértices como puntos rellenos (r≈2.5 px) del mismo azul; muestra en Capas: punto azul |
| Costura (margen) | Offset a la distancia del margen (1 cm por defecto), línea **discontinua** (dash 4 3) 1.2 px `--layer-seam`; muestra: guion magenta |
| Tallas | Contornos de otras tallas, línea fina 1 px `--layer-sizes`, opacidad .7; muestra: punto violeta |
| Pinzas | Línea 1.2 px `--layer-darts`; muestra: punto verde |
| Líneas guía | Línea fina punteada (dash 2 3) `--layer-guide`; oculta por defecto |
| Notas | Texto y marcas `--layer-notes`; oculta por defecto |
| Hilo (grainline) | Flecha de doble punta, 1 px `--grainline`, vertical y centrada en la pieza; longitud ~60 % de la altura |
| Etiqueta de pieza | Centrada en el baricentro de la pieza, 3 líneas: nombre (p. ej. "Delantero"), `x1`, `(Tela)`; texto `--text` 14-15 px; en piezas estrechas (tirante, banda) se coloca al lado o debajo con 11-12 px |

- **Estado seleccionado:** contorno 2.5 px en `--selection`, vértices como cuadrados blancos con borde índigo (6-8 px), caja delimitadora fina con asas de esquina; relleno de la pieza `--primary-soft` al 25 %. Al pasar el cursor, el vértice crece y se tiñe de índigo.
- Rejilla: líneas `--grid-line` cada 1 cm (más marcada cada 10 cm), siguen el zoom; el toggle de rejilla la oculta.
- Las capas apagadas no se dibujan ni son seleccionables.
- Unidad en pantalla: cm (lectura X/Y); el modelo interno sigue el SPEC.

## 4. Alcance v1

| Elemento de la maqueta | Estado v1 |
|---|---|
| Vista 3D (toggle) | **Fuera de v1 / placeholder deshabilitado** (tooltip "Próximamente") |
| Instrucciones de confección | **Fuera de v1 / placeholder deshabilitado** |
| Nivel de dificultad | **Fuera de v1 / placeholder deshabilitado** |
| Biblioteca (riel) | **Fuera de v1 / placeholder deshabilitado** |
| Sugerencias | **Fuera de v1 / placeholder deshabilitado** |
| Avatar / cuentas | **Fuera de v1 / placeholder deshabilitado**: la app no tiene backend; ocultar o dejar un icono inerte |
| Mis patrones, Proyectos | Guardado local (navegador / archivo); lista simple o placeholder |
| Chips de tallas | Sistemas de tallas del SPEC: mujer 6-16 / XS-XXL; hombre 40-54 (no XS-XL fijo como en la maqueta) |
| Medidas del usuario / pestaña Medidas | Tablas de medidas del SPEC; "Perfil" = juego de medidas guardado; Editar abre la tabla completa |
| Tipo de prenda / Modelo / Estilo / Tipo de cuerpo | Bloques base del SPEC (cuerpo, manga, falda, pantalón; mujer y hombre); Frente/Espalda = vistas del bloque |
| Opciones avanzadas | Margen de costura, dobladillo y pinzas según F4; "Corte al bies" puede ser placeholder |
| Barra de herramientas | F2: Seleccionar, zoom/paneo. F4a: Mover (arrastra piezas separadas con snap; en el trazo mueve la vista), Rotar (arrastrar; Mayús = pasos de 15°), Simetría (eje vertical o arista seleccionada) y Espejo (eje horizontal) sobre la pieza seleccionada; F4b: **Añadir piquete** (clic sobre el contorno de una pieza separada, con snap) y asas del hilo en la pieza seleccionada; conmutador **Trazo / Piezas** a la derecha. Escalar, Añadir/Eliminar punto, Curva y Recta siguen deshabilitados |
| Capas, zoom, rejilla, lectura X/Y | F2 |
| Piezas y Detalles del patrón | F2; F4b: con una pieza separada seleccionada, secciones **Márgenes** (fila por arista: rol, largo, margen en mm; "Aplicar a todos") y **Marcas** (lista con eliminar; piquete a distancia escrita, texto, botón); "Guardar como plantilla" fuera de v1 si no hay almacenamiento |
| Deshacer/rehacer, Exportar | F4 / F6 (PDF, SVG) |

Los placeholders deshabilitados se muestran atenuados (opacidad .5, `cursor: not-allowed`) con tooltip "Fuera de v1".

## 5. Responsive

- Diseño **desktop-first**; el editor está pensado para pantallas >= 1200 px.
- < ~1200 px: el riel se reduce a iconos y los paneles laterales (configuración y detalles) pasan a **cajones** (drawers) abribles desde botones en la barra superior; el lienzo ocupa todo el ancho. La fila inferior se apila o se oculta tras pestañas.
- Móvil (< 768 px): basta con **solo visualización** (ver, zoom/paneo, exportar); la edición puede mostrar un aviso "Usa un equipo de escritorio".
