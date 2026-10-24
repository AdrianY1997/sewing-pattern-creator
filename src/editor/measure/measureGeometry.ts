/**
 * Geometry of the "Medir" tool (pure, world mm): straight distance between two points, the length
 * along the outline when both lie on the same piece outline, and the length of contiguous segments.
 */
import {
  distance,
  isContiguousChain,
  lengthBetweenOnClosedPath,
  piecePath,
  projectOnSegment,
  segmentsLength,
  stripMeta,
  type Draft,
  type Vec,
} from '../../core'
import type { DraftRender } from '../canvas/draftGeometry'

/** A point counts as on an outline within this distance (mm). */
export const ON_OUTLINE_MM = 0.05

export interface PointsMeasure {
  readonly straight: number
  /** Both points on the outline of one piece: lengths along it, both ways round. */
  readonly outline: {
    readonly pieceId: string
    readonly short: number
    readonly long: number
  } | null
}

export function measurePoints(draft: Draft, a: Vec, b: Vec): PointsMeasure {
  let outline: PointsMeasure['outline'] = null
  for (const piece of draft.pieces) {
    let span
    try {
      span = lengthBetweenOnClosedPath(piecePath(draft, piece.id), a, b)
    } catch {
      continue
    }
    if (span.offA <= ON_OUTLINE_MM && span.offB <= ON_OUTLINE_MM && span.shortest > 1e-6) {
      outline = {
        pieceId: piece.id,
        short: span.shortest,
        long: Math.max(span.forward, span.backward),
      }
      break
    }
  }
  return { straight: distance(a, b), outline }
}

export interface ChainMeasure {
  readonly length: number
  readonly count: number
}

/** Total length of the segments (ids of the draft). */
export function measureChain(draft: Draft, ids: readonly string[]): ChainMeasure {
  const segs = ids.flatMap((id) => (draft.segments[id] ? [stripMeta(draft.segments[id])] : []))
  return { length: segmentsLength(segs), count: segs.length }
}

/** True when `id` continues the chain (shares an end with its last segment). */
export function continuesChain(draft: Draft, chain: readonly string[], id: string): boolean {
  if (chain.length === 0 || chain.includes(id)) return false
  const last = draft.segments[chain[chain.length - 1]]
  const next = draft.segments[id]
  if (!last || !next) return false
  return isContiguousChain([stripMeta(last), stripMeta(next)])
}

/** Visible segment nearest to `p` within `tolMm`, or null. */
export function segmentNear(
  draft: Draft,
  render: DraftRender,
  p: Vec,
  tolMm: number,
  visible: (layer: string) => boolean,
): string | null {
  let best: { id: string; d: number } | null = null
  for (const sg of render.segments) {
    if (!visible(sg.layer)) continue
    const s = draft.segments[sg.id]
    if (!s) continue
    const d = projectOnSegment(stripMeta(s), p).distance
    if (d <= tolMm && (!best || d < best.d)) best = { id: sg.id, d }
  }
  return best?.id ?? null
}
