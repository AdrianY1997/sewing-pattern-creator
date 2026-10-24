/**
 * Pure (non-React) drafts and replayed patterns for (block, size, options, operations), memoised so
 * panels, canvas and the store share one computation:
 *   pattern = replay(draftBlock(block, size, options), operations).
 */
import {
  draftBlock,
  getBlock,
  isHalfPiece,
  pieceCut,
  type AnyBlockDef,
  type BlockOptions,
} from '../../blocks'
import {
  patternToWorldDraft,
  replay,
  unionBBox,
  type AllowanceDefaults,
  type Draft,
  type Operation,
  type ReplayOptions,
  type ReplayResult,
} from '../../core'
import { buildDraftRender, type DraftRender } from '../canvas/draftGeometry'
import { foldMarks, seamRender, type SeamRender } from '../canvas/seamGeometry'
import type { AdvancedOptions, EditorData } from './editorStore'

const CACHE_LIMIT = 48
const cache = new Map<string, { draft: Draft; render: DraftRender }>()

/** Draft + render data for (block, size, options), cached (drafts are pure functions). */
export const cachedDraft = (
  blockId: string,
  size: string,
  options: BlockOptions,
): { draft: Draft; render: DraftRender } => {
  const key = JSON.stringify([blockId, size, options])
  let hit = cache.get(key)
  if (!hit) {
    const draft = draftBlock(getBlock(blockId), size, options)
    hit = { draft, render: buildDraftRender(draft) }
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string)
    cache.set(key, hit)
  }
  return hit
}

/**
 * Seam allowance of freshly extracted pieces from "Opciones avanzadas": the seam allowance on
 * every edge (0 when switched off) and the hem allowance on hems (the seam allowance when off).
 */
export const allowanceDefaults = (adv: AdvancedOptions): AllowanceDefaults => {
  const seamMm = adv.seamAllowance ? adv.seamAllowanceMm : 0
  return { seamMm, hemMm: adv.hem ? adv.hemMm : seamMm }
}

/**
 * Replay options of a block: extracted pieces start with the block's "cortar ×N" and material and
 * with the seam allowance of "Opciones avanzadas".
 */
export const replayOptionsFor = (
  block: AnyBlockDef,
  allowance: AllowanceDefaults,
): ReplayOptions => ({
  pieceDefaults: (id) => {
    const cut = pieceCut(block, id)
    return { cutCount: cut.count, fabric: cut.material, halfPiece: isHalfPiece(block, id) }
  },
  allowance,
})

/** A replayed pattern with its world draft and render data (Piezas view). */
export interface PatternData {
  readonly result: ReplayResult
  /** Extracted pieces as one draft in world coordinates (ids `${pieceId}/${localId}`). */
  readonly world: Draft
  readonly render: DraftRender
  /** Cut lines (Costura layer). */
  readonly seams: readonly SeamRender[]
}

/** Render data of the extracted pieces, with their label fields and cut lines. */
export const buildPatternData = (result: ReplayResult): PatternData => {
  const world = patternToWorldDraft(result.pattern.pieces)
  const base = buildDraftRender(world)
  const meta = new Map(result.pattern.pieces.map((p) => [p.id, p]))
  const seams = result.pattern.pieces.flatMap((p) => seamRender(p) ?? [])
  const render: DraftRender = {
    ...base,
    pieces: base.pieces.map((r) => {
      const p = meta.get(r.id)
      return p ? { ...r, label: { count: p.cutCount, material: p.fabric, onFold: p.onFold } } : r
    }),
    foldMarks: result.pattern.pieces.flatMap(foldMarks),
    // Fit the view to the cut lines too.
    bbox: seams.length ? unionBBox([base.bbox, ...seams.map((s) => s.bbox)]) : base.bbox,
  }
  return { result, world, render, seams }
}

const patternCache = new WeakMap<readonly Operation[], Map<string, PatternData>>()

/** Replay of `ops` on the draft of (block, size, options), cached per operation list. */
export const cachedPattern = (
  blockId: string,
  size: string,
  options: BlockOptions,
  ops: readonly Operation[],
  allowance: AllowanceDefaults,
): PatternData => {
  let bySize = patternCache.get(ops)
  if (!bySize) patternCache.set(ops, (bySize = new Map()))
  const key = JSON.stringify([blockId, size, options, allowance])
  let hit = bySize.get(key)
  if (!hit) {
    const { draft } = cachedDraft(blockId, size, options)
    hit = buildPatternData(replay(draft, ops, replayOptionsFor(getBlock(blockId), allowance)))
    if (bySize.size >= CACHE_LIMIT) bySize.delete(bySize.keys().next().value as string)
    bySize.set(key, hit)
  }
  return hit
}

/** Pattern of the store's current block, size, options, operations and allowance defaults. */
export const statePattern = (s: EditorData, size = s.size): PatternData =>
  cachedPattern(s.blockId, size, s.blockOptions, s.operations, allowanceDefaults(s.advanced))
