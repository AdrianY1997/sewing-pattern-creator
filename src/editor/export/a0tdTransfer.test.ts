import { describe, expect, it, vi } from 'vitest'
import { useNotices } from '../store/notices'
import { startA0tdTransfer, useA0tdTransfer } from './a0tdTransfer'

const FILE = { name: 'x.pdf', bytes: new Uint8Array([1, 2, 3]) }
const noPopupWindow = { open: () => null, addEventListener() {}, removeEventListener() {} }

describe('a0td transfer outside the dialog', () => {
  it('blocked popup: downloads and leaves a toast, with no dialog involved', async () => {
    const download = vi.fn()
    startA0tdTransfer({
      file: Promise.resolve(FILE),
      download,
      baseUrl: 'https://receiver.test/',
      win: noPopupWindow as unknown as Window,
    })
    await new Promise((r) => setTimeout(r, 0))
    expect(download).toHaveBeenCalledWith(FILE)
    expect(useA0tdTransfer.getState().status).toMatchObject({ state: 'fallback' })
    expect(useNotices.getState().notices.some((n) => n.kind === 'warn')).toBe(true)
  })

  it('a malformed URL does not throw: fallback download', async () => {
    const download = vi.fn()
    const open = vi.fn()
    expect(() =>
      startA0tdTransfer({
        file: Promise.resolve(FILE),
        download,
        baseUrl: 'not a url',
        win: { ...noPopupWindow, open } as unknown as Window,
      }),
    ).not.toThrow()
    await new Promise((r) => setTimeout(r, 0))
    expect(open).not.toHaveBeenCalled()
    expect(download).toHaveBeenCalled()
    expect(useA0tdTransfer.getState().status).toMatchObject({
      state: 'fallback',
      reason: 'invalid-url',
    })
  })
})
