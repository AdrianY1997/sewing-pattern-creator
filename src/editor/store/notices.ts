/** Small messages shown over the editor (toasts, and warnings that wait for a click). */
import { create } from 'zustand'

export type NoticeKind = 'ok' | 'warn' | 'error'

export interface Notice {
  readonly id: number
  readonly kind: NoticeKind
  readonly text: string
}

export const useNotices = create<{ notices: readonly Notice[] }>(() => ({ notices: [] }))

let next = 1
export const TOAST_MS = 8000

export const dismissNotice = (id: number): void =>
  useNotices.setState((s) => ({ notices: s.notices.filter((n) => n.id !== id) }))

/** Show a message; it disappears after `ms` (0 = stays until dismissed). Returns its id. */
export const pushNotice = (kind: NoticeKind, text: string, ms = TOAST_MS): number => {
  const id = next++
  useNotices.setState((s) => ({ notices: [...s.notices, { id, kind, text }] }))
  if (ms > 0) setTimeout(() => dismissNotice(id), ms)
  return id
}
