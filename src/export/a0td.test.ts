import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  A0TD_DEFAULT_URL,
  a0tdErrorMessage,
  a0tdImportUrl,
  sendToA0td,
  type A0tdFile,
  type A0tdStatus,
} from './a0td'

const BASE = 'https://receiver.test/a0-to-domestic/'
const ORIGIN = 'https://receiver.test'

class FakePopup {
  posted: { msg: unknown; target: string; transfer: Transferable[] }[] = []
  postMessage(msg: unknown, target: string, transfer: Transferable[] = []) {
    this.posted.push({ msg, target, transfer })
  }
}

function fakeWindow(popup: FakePopup | null) {
  const target = new EventTarget()
  const opened: string[] = []
  const win = {
    open: (url: string) => {
      opened.push(url)
      return popup
    },
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
  } as unknown as Window
  const emit = (data: unknown, origin: string, source: unknown) =>
    target.dispatchEvent(Object.assign(new Event('message'), { data, origin, source }))
  return { win, opened, emit }
}

const FILE: A0tdFile = {
  name: 'cuerpo-talla-10.pdf',
  bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 1, 2, 3]),
}

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('a0-to-domestic sender', () => {
  beforeEach(() => vi.useRealTimers())
  afterEach(() => vi.useRealTimers())

  it('builds the import URL', () => {
    expect(a0tdImportUrl(A0TD_DEFAULT_URL)).toBe(
      'https://adriany1997.github.io/a0-to-domestic/#/import?source=sewing-pattern-creator',
    )
  })

  it('handshake: waits for ready from the opened window and origin, sends, reports the ack', async () => {
    const popup = new FakePopup()
    const { win, opened, emit } = fakeWindow(popup)
    const statuses: A0tdStatus[] = []
    const download = vi.fn()
    sendToA0td({
      file: Promise.resolve(FILE),
      onStatus: (s) => statuses.push(s),
      download,
      baseUrl: BASE,
      win,
    })
    expect(opened).toEqual([`${BASE}#/import?source=sewing-pattern-creator`])
    await flush()
    expect(popup.posted).toHaveLength(0)

    // Wrong origin, wrong source, wrong version: ignored.
    emit({ type: 'a0td:ready', version: 1 }, 'https://evil.test', popup)
    emit({ type: 'a0td:ready', version: 1 }, ORIGIN, {})
    emit({ type: 'a0td:ready', version: 2 }, ORIGIN, popup)
    expect(popup.posted).toHaveLength(0)

    emit({ type: 'a0td:ready', version: 1 }, ORIGIN, popup)
    expect(popup.posted).toHaveLength(1)
    const { msg, target, transfer } = popup.posted[0]
    expect(target).toBe(ORIGIN)
    const m = msg as {
      type: string
      version: number
      requestId: string
      source: { app: string }
      files: { name: string; mime: string; data: ArrayBuffer }[]
    }
    expect(m.type).toBe('a0td:import')
    expect(m.version).toBe(1)
    expect(m.source.app).toBe('sewing-pattern-creator')
    expect(m.files).toHaveLength(1)
    expect(m.files[0].mime).toBe('application/pdf')
    expect(m.files[0].name).toBe(FILE.name)
    expect(m.files[0].data).toBeInstanceOf(ArrayBuffer)
    expect(transfer).toEqual([m.files[0].data])
    expect(new Uint8Array(m.files[0].data)).toEqual(FILE.bytes)

    // An ack for another request or from another origin is ignored.
    emit({ type: 'a0td:import-ack', requestId: 'other', ok: true }, ORIGIN, popup)
    emit({ type: 'a0td:import-ack', requestId: m.requestId, ok: true }, 'https://evil.test', popup)
    expect(statuses.map((s) => s.state)).toEqual(['waiting', 'sent'])
    emit(
      { type: 'a0td:import-ack', requestId: m.requestId, ok: true, documentId: 'doc-1' },
      ORIGIN,
      popup,
    )
    expect(statuses[statuses.length - 1]).toEqual({ state: 'ok', documentId: 'doc-1' })
    expect(download).not.toHaveBeenCalled()
  })

  it('sends once the PDF is ready when ready arrives first', async () => {
    const popup = new FakePopup()
    const { win, emit } = fakeWindow(popup)
    let resolve!: (f: A0tdFile) => void
    const file = new Promise<A0tdFile>((r) => (resolve = r))
    sendToA0td({ file, onStatus: () => {}, download: () => {}, baseUrl: BASE, win })
    emit({ type: 'a0td:ready', version: 1 }, ORIGIN, popup)
    expect(popup.posted).toHaveLength(0)
    resolve(FILE)
    await flush()
    expect(popup.posted).toHaveLength(1)
  })

  it('reports error codes in Spanish', async () => {
    const popup = new FakePopup()
    const { win, emit } = fakeWindow(popup)
    const statuses: A0tdStatus[] = []
    sendToA0td({
      file: Promise.resolve(FILE),
      onStatus: (s) => statuses.push(s),
      download: () => {},
      baseUrl: BASE,
      win,
    })
    await flush()
    emit({ type: 'a0td:ready', version: 1 }, ORIGIN, popup)
    const { requestId } = popup.posted[0].msg as { requestId: string }
    emit(
      {
        type: 'a0td:import-ack',
        requestId,
        ok: false,
        error: { code: 'TOO_LARGE', message: 'big' },
      },
      ORIGIN,
      popup,
    )
    expect(statuses[statuses.length - 1]).toEqual({
      state: 'error',
      code: 'TOO_LARGE',
      message: a0tdErrorMessage('TOO_LARGE'),
    })
    expect(a0tdErrorMessage('ORIGIN_NOT_ALLOWED')).toMatch(/no acepta/)
  })

  it('popup blocked: downloads the PDF and shows the fallback', async () => {
    const { win } = fakeWindow(null)
    const statuses: A0tdStatus[] = []
    const download = vi.fn()
    sendToA0td({
      file: Promise.resolve(FILE),
      onStatus: (s) => statuses.push(s),
      download,
      baseUrl: BASE,
      win,
    })
    await flush()
    expect(download).toHaveBeenCalledWith(FILE)
    expect(statuses).toEqual([{ state: 'fallback', reason: 'blocked', url: BASE }])
  })

  it('no ready within 15 s: downloads the PDF, leaves the tab open', async () => {
    vi.useFakeTimers()
    const popup = new FakePopup()
    const { win, emit } = fakeWindow(popup)
    const statuses: A0tdStatus[] = []
    const download = vi.fn()
    sendToA0td({
      file: Promise.resolve(FILE),
      onStatus: (s) => statuses.push(s),
      download,
      baseUrl: BASE,
      win,
    })
    await vi.advanceTimersByTimeAsync(14_900)
    expect(download).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(200)
    expect(download).toHaveBeenCalledWith(FILE)
    expect(statuses[statuses.length - 1]).toEqual({
      state: 'fallback',
      reason: 'timeout',
      url: BASE,
    })
    // A late ready is ignored.
    emit({ type: 'a0td:ready', version: 1 }, ORIGIN, popup)
    expect(popup.posted).toHaveLength(0)
  })
})
