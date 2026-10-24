/**
 * Debounced autosave: watches a value, and `delayMs` after the last change saves it. Independent
 * of the store and of IndexedDB so that it can be tested with fake timers.
 */
export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

export interface AutosaveOptions<S> {
  /** Subscribe to changes; returns the unsubscribe function. */
  readonly subscribe: (listener: () => void) => () => void
  readonly read: () => S
  /** True when `next` differs from the last saved value. */
  readonly changed: (saved: S, next: S) => boolean
  readonly save: (value: S) => Promise<void>
  readonly onStatus?: (status: SaveStatus) => void
  readonly delayMs?: number
}

export interface Autosaver {
  /** Save now. Without `force`, only when there are unsaved changes. */
  flush(force?: boolean): Promise<void>
  /** True while a change waits for the debounce or a save runs. */
  isDirty(): boolean
  /** Ignore changes (while a project is being loaded). */
  pause(): void
  /** Take the current value as saved and stop ignoring changes. */
  resume(): void
  dispose(): void
}

export const AUTOSAVE_DELAY_MS = 1500

export const createAutosaver = <S>(opts: AutosaveOptions<S>): Autosaver => {
  const delay = opts.delayMs ?? AUTOSAVE_DELAY_MS
  let baseline = opts.read()
  let timer: ReturnType<typeof setTimeout> | null = null
  let paused = false
  let chain: Promise<void> = Promise.resolve()
  const status = (s: SaveStatus) => opts.onStatus?.(s)

  const run = (): Promise<void> => {
    if (timer !== null) clearTimeout(timer)
    timer = null
    const value = opts.read()
    status('saving')
    chain = chain.then(async () => {
      try {
        await opts.save(value)
        baseline = value
        status(timer === null ? 'saved' : 'pending')
      } catch {
        status('error')
      }
    })
    return chain
  }

  const unsubscribe = opts.subscribe(() => {
    if (paused) return
    if (!opts.changed(baseline, opts.read())) return
    if (timer !== null) clearTimeout(timer)
    status('pending')
    timer = setTimeout(() => void run(), delay)
  })

  return {
    flush: (force = false) => {
      if (!force && timer === null) return chain
      return run()
    },
    isDirty: () => timer !== null,
    pause: () => {
      paused = true
      if (timer !== null) clearTimeout(timer)
      timer = null
    },
    resume: () => {
      baseline = opts.read()
      paused = false
    },
    dispose: () => {
      unsubscribe()
      if (timer !== null) clearTimeout(timer)
      timer = null
    },
  }
}
