/**
 * Graduations of a ruler's working edges (ruler frame, mm): ticks every 1 mm / 5 mm / 1 cm along
 * the arc length, drawn from the edge into the body, and the centimetre numbers.
 */
import { add, perp, scale, type Vec } from '../vec'
import { edgeAt, type WorkingEdge } from './edge'
import type { Ruler } from './rulers'

export type TickLevel = 'mm' | 'half' | 'cm'

export interface Tick {
  readonly level: TickLevel
  readonly from: Vec
  readonly to: Vec
}

export interface TickLabel {
  readonly at: Vec
  /** Number shown (cm). */
  readonly value: number
  /** Edge heading at the label (radians, ruler frame). */
  readonly theta: number
}

/** Tick lengths (mm) per level. */
export const TICK_MM: Readonly<Record<TickLevel, number>> = { mm: 2, half: 3.5, cm: 5.5 }

export interface EdgeGraduations {
  readonly edgeId: string
  readonly ticks: readonly Tick[]
  readonly labels: readonly TickLabel[]
}

export function edgeGraduations(e: WorkingEdge): EdgeGraduations {
  const offset = e.labelOffsetMm ?? 0
  const ticks: Tick[] = []
  const labels: TickLabel[] = []
  // Graduation values are whole mm of (s + offset).
  const first = Math.ceil(offset)
  const last = Math.floor(e.totalLength + offset + 1e-9)
  for (let v = first; v <= last; v++) {
    const smp = edgeAt(e, v - offset)
    const level: TickLevel = v % 10 === 0 ? 'cm' : v % 5 === 0 ? 'half' : 'mm'
    const n = scale(perp(smp.tangent), e.bodySide)
    ticks.push({ level, from: smp.point, to: add(smp.point, scale(n, TICK_MM[level])) })
    if (level === 'cm' && v > 0)
      labels.push({ at: add(smp.point, scale(n, TICK_MM.cm + 3)), value: v / 10, theta: smp.theta })
  }
  return { edgeId: e.id, ticks, labels }
}

const gradCache = new Map<string, readonly EdgeGraduations[]>()

/** Graduations of every working edge of a ruler (cached). */
export const rulerGraduations = (ruler: Ruler): readonly EdgeGraduations[] => {
  let g = gradCache.get(ruler.id)
  if (!g) gradCache.set(ruler.id, (g = ruler.edges.map(edgeGraduations)))
  return g
}
