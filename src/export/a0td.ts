/**
 * Sender side of the a0-to-domestic protocol v1 (docs/integrations/a0-to-domestic.md):
 * open the importer inside the click gesture, wait for `a0td:ready` from that window and origin,
 * send the single-sheet PDF as a transferable ArrayBuffer and report the `a0td:import-ack`.
 * Popup blocked, or no `a0td:ready` within 15 s: the PDF is downloaded instead.
 * Never posts with '*' as targetOrigin.
 */

export const A0TD_DEFAULT_URL = 'https://adriany1997.github.io/a0-to-domestic/'
export const A0TD_PROTOCOL_VERSION = 1
export const A0TD_READY_TIMEOUT_MS = 15_000
export const A0TD_ACK_TIMEOUT_MS = 60_000
export const APP_NAME = 'sewing-pattern-creator'
export const APP_VERSION = '0.0.0'

/** Target URL: `VITE_A0TD_URL`, or the published app. */
export const a0tdBaseUrl = (): string => {
  const env = import.meta.env.VITE_A0TD_URL as string | undefined
  return env && env.trim() ? env.trim() : A0TD_DEFAULT_URL
}

/** `<base>#/import?source=sewing-pattern-creator`. */
export const a0tdImportUrl = (base: string): string => {
  const u = new URL(base)
  u.hash = `#/import?source=${APP_NAME}`
  return u.toString()
}

export const A0TD_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  ORIGIN_NOT_ALLOWED: 'a0-to-domestic no acepta envíos desde este sitio.',
  UNSUPPORTED_VERSION: 'a0-to-domestic no admite esta versión del protocolo de importación.',
  INVALID_PAYLOAD: 'a0-to-domestic rechazó el archivo: los datos enviados no son válidos.',
  TOO_LARGE: 'El PDF es demasiado grande para a0-to-domestic (tamaño o número de páginas).',
  INGEST_FAILED: 'a0-to-domestic no pudo cargar el PDF.',
  NO_ACK: 'a0-to-domestic no confirmó la importación.',
  PDF_FAILED: 'No se pudo generar el PDF.',
}

export const a0tdErrorMessage = (code: string): string =>
  A0TD_ERROR_MESSAGES[code] ?? `Error desconocido de a0-to-domestic (${code}).`

export interface A0tdFile {
  readonly name: string
  readonly bytes: Uint8Array
}

export type A0tdStatus =
  | { readonly state: 'waiting' }
  | { readonly state: 'sent'; readonly requestId: string }
  | { readonly state: 'ok'; readonly documentId: string }
  | { readonly state: 'error'; readonly code: string; readonly message: string }
  | {
      readonly state: 'fallback'
      readonly reason: 'blocked' | 'timeout' | 'invalid-url'
      readonly url: string
    }

export interface A0tdImportMessage {
  readonly type: 'a0td:import'
  readonly version: 1
  readonly requestId: string
  readonly source: { readonly app: string; readonly version: string }
  readonly files: readonly {
    readonly name: string
    readonly mime: 'application/pdf'
    readonly data: ArrayBuffer
  }[]
  readonly options?: { readonly preset?: string }
}

export interface SendOptions {
  /** The PDF, possibly still being generated (the window must open first, in the gesture). */
  readonly file: Promise<A0tdFile>
  readonly onStatus: (s: A0tdStatus) => void
  /** Fallback: save the PDF locally. */
  readonly download: (f: A0tdFile) => void
  readonly baseUrl?: string
  readonly win?: Window
  readonly readyTimeoutMs?: number
  readonly ackTimeoutMs?: number
  readonly preset?: string
}

const newRequestId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/**
 * Starts the transfer. MUST be called synchronously from the click handler (it calls window.open).
 * Returns a function that stops listening.
 */
export function sendToA0td(opts: SendOptions): () => void {
  const win = opts.win ?? window
  let base = opts.baseUrl ?? a0tdBaseUrl()
  let origin = ''
  let importUrl = ''
  let invalidUrl = false
  try {
    origin = new URL(base).origin
    importUrl = a0tdImportUrl(base)
    if (origin === 'null') throw new TypeError('opaque origin')
  } catch {
    // A malformed VITE_A0TD_URL must not break the click: fall back to the download.
    invalidUrl = true
    base = A0TD_DEFAULT_URL
  }
  const popup = invalidUrl ? null : win.open(importUrl, '_blank')

  const fallback = (reason: 'blocked' | 'timeout' | 'invalid-url') => {
    opts.file.then(
      (f) => {
        opts.download(f)
        opts.onStatus({ state: 'fallback', reason, url: base })
      },
      () =>
        opts.onStatus({
          state: 'error',
          code: 'PDF_FAILED',
          message: a0tdErrorMessage('PDF_FAILED'),
        }),
    )
  }
  if (!popup) {
    fallback(invalidUrl ? 'invalid-url' : 'blocked')
    return () => {}
  }

  opts.onStatus({ state: 'waiting' })
  const requestId = newRequestId()
  let ready = false
  let file: A0tdFile | null = null
  let sent = false
  let finished = false
  let ackTimer: ReturnType<typeof setTimeout> | undefined

  const stop = () => {
    finished = true
    win.removeEventListener('message', onMessage)
    clearTimeout(readyTimer)
    clearTimeout(ackTimer)
  }
  const trySend = () => {
    if (finished || sent || !ready || !file) return
    sent = true
    // A standalone ArrayBuffer holding exactly the file, transferred (not copied).
    const data = file.bytes.slice().buffer as ArrayBuffer
    const msg: A0tdImportMessage = {
      type: 'a0td:import',
      version: A0TD_PROTOCOL_VERSION,
      requestId,
      source: { app: APP_NAME, version: APP_VERSION },
      files: [{ name: file.name, mime: 'application/pdf', data }],
      ...(opts.preset && { options: { preset: opts.preset } }),
    }
    popup.postMessage(msg, origin, [data])
    opts.onStatus({ state: 'sent', requestId })
    ackTimer = setTimeout(() => {
      stop()
      opts.onStatus({ state: 'error', code: 'NO_ACK', message: a0tdErrorMessage('NO_ACK') })
    }, opts.ackTimeoutMs ?? A0TD_ACK_TIMEOUT_MS)
  }
  function onMessage(ev: MessageEvent) {
    if (ev.origin !== origin || ev.source !== popup) return
    const d: unknown = ev.data
    if (!isObj(d)) return
    if (d.type === 'a0td:ready' && d.version === A0TD_PROTOCOL_VERSION) {
      if (ready) return
      ready = true
      clearTimeout(readyTimer)
      trySend()
    } else if (d.type === 'a0td:import-ack' && d.requestId === requestId && sent) {
      stop()
      if (d.ok === true)
        opts.onStatus({
          state: 'ok',
          documentId: typeof d.documentId === 'string' ? d.documentId : '',
        })
      else {
        const err = isObj(d.error) ? d.error : {}
        const code = typeof err.code === 'string' ? err.code : 'UNKNOWN'
        opts.onStatus({ state: 'error', code, message: a0tdErrorMessage(code) })
      }
    }
  }
  win.addEventListener('message', onMessage)
  const readyTimer = setTimeout(() => {
    if (ready || finished) return
    stop()
    fallback('timeout')
  }, opts.readyTimeoutMs ?? A0TD_READY_TIMEOUT_MS)
  opts.file.then(
    (f) => {
      file = f
      trySend()
    },
    () => {
      stop()
      opts.onStatus({ state: 'error', code: 'PDF_FAILED', message: a0tdErrorMessage('PDF_FAILED') })
    },
  )
  return stop
}
