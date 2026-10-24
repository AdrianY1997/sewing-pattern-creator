/**
 * State of the "Reglas" tool (UI state, not operations): which ruler is on the canvas, the last
 * pose of each ruler (persisted in localStorage), the sub-mode and the points of a pending trace.
 */
import { create } from 'zustand'
import { isRulerId, type RulerId, type RulerPose, type Vec } from '../../core'
import type { SnapResult } from '../canvas/snap'

/**
 * - place: drag the body to move it, the round handle to turn it (Shift: 15° steps), Alt + drag or
 *   the wheel over the ruler to slide it along its working edge
 * - align: the next click on a point moves the ruler so its nearest working edge passes through it
 * - trace: click two points, preview the curve along the edge, then apply
 */
export type RulerMode = 'place' | 'align' | 'trace'

export interface TracePoint {
  /** World position (mm). */
  readonly at: Vec
  readonly snap: SnapResult | null
}

export interface RulerState {
  readonly rulerId: RulerId
  readonly poses: Readonly<Partial<Record<RulerId, RulerPose>>>
  readonly mode: RulerMode
  /** Points clicked by "Trazar" (0, 1 or 2). */
  readonly tracePoints: readonly TracePoint[]
  /** Message of the last trace that could not be applied. */
  readonly message: string | null
  setRuler(id: RulerId): void
  setPose(id: RulerId, pose: RulerPose): void
  setMode(mode: RulerMode): void
  addTracePoint(p: TracePoint): void
  clearTrace(): void
  setMessage(message: string | null): void
}

const KEY = 'spc:rulers'

const validPose = (v: unknown): v is RulerPose => {
  if (typeof v !== 'object' || v === null) return false
  const p = v as Record<string, unknown>
  return (
    Number.isFinite(p.x) &&
    Number.isFinite(p.y) &&
    Number.isFinite(p.angleDeg) &&
    typeof p.flipped === 'boolean'
  )
}

/** Stored ruler and poses; anything malformed is dropped. */
export const loadRulerState = (): Pick<RulerState, 'rulerId' | 'poses'> => {
  const fallback = { rulerId: 'french' as RulerId, poses: {} }
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return fallback
    const v = JSON.parse(raw) as { rulerId?: unknown; poses?: Record<string, unknown> }
    const poses: Partial<Record<RulerId, RulerPose>> = {}
    for (const [id, pose] of Object.entries(v.poses ?? {}))
      if (isRulerId(id) && validPose(pose))
        poses[id] = { x: pose.x, y: pose.y, angleDeg: pose.angleDeg, flipped: pose.flipped }
    return { rulerId: isRulerId(v.rulerId) ? v.rulerId : fallback.rulerId, poses }
  } catch {
    return fallback
  }
}

const save = (s: Pick<RulerState, 'rulerId' | 'poses'>) => {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ rulerId: s.rulerId, poses: s.poses }))
  } catch {
    // storage unavailable: the pose lives for the session only
  }
}

export const useRulerStore = create<RulerState>()((set, get) => ({
  ...loadRulerState(),
  mode: 'place',
  tracePoints: [],
  message: null,
  setRuler: (rulerId) => {
    set({ rulerId, tracePoints: [], message: null })
    save(get())
  },
  setPose: (id, pose) => {
    set({ poses: { ...get().poses, [id]: pose } })
    save(get())
  },
  setMode: (mode) => set({ mode, tracePoints: [], message: null }),
  addTracePoint: (p) => {
    const pts = get().tracePoints
    set({ tracePoints: pts.length >= 2 ? [p] : [...pts, p], message: null })
  },
  clearTrace: () => set({ tracePoints: [], message: null }),
  setMessage: (message) => set({ message }),
}))
