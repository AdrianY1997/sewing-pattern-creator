# Brief para el agente de a0-to-domestic: receptor de importación

> Instrucciones para pegar al agente que trabaja en el repo **AdrianY1997/a0-to-domestic** (`E:\Proyectos\a0-to-domestic`).
> Contrato del lado emisor: [a0-to-domestic.md](./a0-to-domestic.md).

## Funcionalidad: importar documentos enviados por sewing-pattern-creator (protocolo postMessage v1)

### Contexto
La app sewing-pattern-creator (https://adriany1997.github.io/sewing-pattern-creator/, repo AdrianY1997/sewing-pattern-creator) traza patrones de costura y exporta un PDF vectorial de hoja única a tamaño real 1:1. Necesita enviar ese PDF a esta app para el mosaico doméstico sin que la persona tenga que descargarlo y volver a subirlo. El contrato completo está en `docs/integrations/a0-to-domestic.md` de ese repo. No se usa importación desde URL (el SPEC de este repo la prohíbe por SSRF): el PDF llega como bytes por `postMessage`.

### Protocolo (lado receptor, esta app)
1. **Ruta:** nueva ruta `/import`. En Pages es `#/import?source=sewing-pattern-creator`, porque el modo local y Pages usan HashRouter (`frontend/src/app/App.tsx`).
2. **Aviso de listo:** al montar, si existe `window.opener`, enviarle `{ type: 'a0td:ready', version: 1 }`. Como targetOrigin se usa el origen del emisor permitido, nunca `'*'`.
3. **Mensaje entrante:** escuchar `message` y aceptar solo si cumple todo esto:
   - `event.origin` está en la lista permitida. Se configura con `VITE_IMPORT_ORIGINS`, separada por comas; por defecto es `https://adriany1997.github.io`, que es el mismo origen que Pages.
   - `event.source === window.opener`.
   - Forma del mensaje: `{ type: 'a0td:import', version: 1, requestId: string, source: { app, version }, files: [{ name, mime: 'application/pdf', data: ArrayBuffer }], options?: { preset?: string } }`.
4. **Validación:** `mime === 'application/pdf'`, tamaño ≤ el límite actual de subida y número de páginas ≤ `A0TD_MAX_PAGES`. Rechazar cualquier campo desconocido o mal formado.
5. **Ingesta:** convertir cada archivo en `File` (`new File([data], name, { type: mime })`) y pasarlo por el mismo camino que el Dropzone: `uploadDocument`, vía `useUploads` (`frontend/src/features/home/useUploads.ts`, `frontend/src/api/upload.ts`). Así hereda la deduplicación SHA-256 y la ingesta por Pyodide en modo local, o el POST `/documents` en modo servidor. No hay que crear un camino de ingesta paralelo.
6. **Navegación:** tras la ingesta, ir al editor del documento. Si viene `options.preset`, aplicarlo igual que el `?preset=<id>` que ya existe (`EditorPage.tsx`).
7. **Respuesta al emisor:** con el mismo targetOrigin validado, enviar `{ type: 'a0td:import-ack', requestId, ok: true, documentId }`, o en caso de error `{ type: 'a0td:import-ack', requestId, ok: false, error: { code, message } }`. Códigos de error: `ORIGIN_NOT_ALLOWED`, `UNSUPPORTED_VERSION`, `INVALID_PAYLOAD`, `TOO_LARGE`, `INGEST_FAILED`. El emisor espera el ack hasta 60 s; si no llega, lo trata como `NO_ACK` y descarga el PDF.
8. **Interfaz de `/import`:**
   - Mientras espera: "Recibiendo patrón desde Sewing Pattern Creator…" con un spinner de Mantine.
   - Si en 20 s no llega ningún mensaje válido, o si no hay `window.opener`: "No se recibió ningún archivo" y un botón para ir al inicio y subirlo a mano.
   - Errores de validación: un mensaje claro en español.

### Lo que se puede suponer del PDF recibido
- La MediaBox mide el tamaño físico real, con 1 mm = 72/25,4 pt exactos. Puede ser cualquier tamaño, no necesariamente A0.
- Es vectorial.
- Incluye un cuadrado de prueba de 10 × 10 cm.
- Trae una página por talla.
- Por defecto se debe usar la escala 100 %, sin ningún aviso de "tamaño físico supuesto".

### Seguridad
- No hay importación desde URL.
- Se valida el origen y la forma del mensaje.
- Se ignoran los mensajes de cualquier otra ventana.
- La importación vale para un único mensaje: al aceptar el primero válido, deja de escuchar.

### Tests
- **Unitarios:** el validador del mensaje (formas válidas e inválidas, origen no permitido, versión no soportada, archivo demasiado grande).
- **E2E con Playwright:**
  - Una página emisora falsa servida en los tests hace `window.open('/…/#/import?source=sewing-pattern-creator')`, espera `a0td:ready`, envía un PDF de prueba de 300 × 400 mm y verifica que llega `import-ack ok:true` y que el editor muestra el documento a escala 100 %.
  - Un segundo test comprueba que un origen no permitido se rechaza.
- **Modos:** funciona en modo local o Pages y en modo Docker. En Docker el origen es distinto, así que el origen del emisor se añade a `VITE_IMPORT_ORIGINS`.

### Documentación
Añadir este contrato al SPEC.md del repo, en una sección "Integraciones", y mencionar `VITE_IMPORT_ORIGINS` en `docs/development.md`.
