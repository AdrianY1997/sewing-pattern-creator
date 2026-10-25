# Integración con a0-to-domestic

## Objetivo

Desde Exportar, botón "Enviar a a0-to-domestic". Envía el PDF de hoja única a tamaño real 1:1 (el mismo que genera la exportación "hoja única", con el cuadrado de prueba de 10 cm) a la app a0-to-domestic (https://adriany1997.github.io/a0-to-domestic/, repo AdrianY1997/a0-to-domestic), que hace el mosaico a A4/Carta. No se descarga ni se vuelve a subir ningún archivo.

## Protocolo v1 (`window.postMessage`)

1. El emisor genera el PDF y abre `https://adriany1997.github.io/a0-to-domestic/#/import?source=sewing-pattern-creator` con `window.open` dentro del gesto de clic del usuario. La URL de destino es configurable con `VITE_A0TD_URL`.
2. El receptor, al montar la ruta `/import`, envía a `window.opener`: `{ type: 'a0td:ready', version: 1 }`, con targetOrigin igual al origen del opener.
3. El emisor valida que `event.origin` sea el origen de A0TD_URL y que `event.source` sea la ventana abierta. Entonces envía:
   ```ts
   {
     type: 'a0td:import', version: 1, requestId: '<uuid>',
     source: { app: 'sewing-pattern-creator', version: '<app version>' },
     files: [{ name: '<titulo>-talla-<x>.pdf', mime: 'application/pdf', data: ArrayBuffer }],
     options?: { preset?: string }
   }
   ```
   El `ArrayBuffer` va como transferable.
4. El receptor valida el origen contra su lista permitida y comprueba `type`, `version`, `mime === 'application/pdf'`, tamaño ≤ su límite y número de páginas ≤ su máximo. Ingresa el archivo por su flujo normal de carga y navega al editor del documento.
5. El receptor responde `{ type: 'a0td:import-ack', requestId, ok: true, documentId }` o `{ ..., ok: false, error: { code, message } }`. Códigos: `ORIGIN_NOT_ALLOWED`, `UNSUPPORTED_VERSION`, `INVALID_PAYLOAD`, `TOO_LARGE`, `INGEST_FAILED`. El emisor añade dos códigos propios: `NO_ACK` (el receptor no confirma en 60 s tras el envío) y `PDF_FAILED` (no se pudo generar el PDF).

## Tiempos y reserva

Si no llega `a0td:ready` en 15 s, o si el navegador bloquea la ventana emergente, el emisor descarga el PDF y muestra "Abre a0-to-domestic y carga el archivo descargado" con un enlace. La pestaña abierta se queda abierta; el emisor no la cierra.

## Requisitos del PDF

- Página = caja delimitadora + 10 mm de margen.
- 1 unidad = 72/25.4 pt por mm exactos.
- MediaBox con el tamaño físico real, para que a0-to-domestic use la escala 100 %.
- Vectorial.
- Una página por talla si se exportan varias tallas.

## Seguridad

- Nunca se usa `'*'` como targetOrigin.
- Las dos partes validan origen y forma del mensaje.
- No hay importación desde URL (a0-to-domestic la prohíbe por SSRF).

## Pruebas

- e2e con Playwright, usando un receptor falso (una página de prueba que implementa el protocolo) para el emisor.
- Desde el lado de a0-to-domestic, un emisor falso.
