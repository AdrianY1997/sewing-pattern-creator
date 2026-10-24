/**
 * Drafts and replayed patterns derived from the store, memoised so panels and canvas share one
 * computation:  pattern = replay(draftBlock(block, size, options), operations).
 */
import { useMemo } from 'react'
import {
  blockSizes,
  draftBlock,
  getBlock,
  pieceCut,
  type AnyBlockDef,
  type BlockOptions,
} from '../../blocks'
import {
  gradingAnchor,
  mapPath,
  patternToWorldDraft,
  pieceWorldPath,
  replay,
  toSvgPathData,
  type Draft,
  type Operation,
  type ReplayOptions,
  type ReplayResult,
} from '../../core'
import { buildDraftRender, type DraftRender } from '../canvas/draftGeometry'
import { useEditorStore, type ViewMode } from './editorStore'

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

/** Replay options of a block: extracted pieces start with the block's "cortar ×N" and material. */
export const replayOptionsFor = (block: AnyBlockDef): ReplayOptions => ({
  pieceDefaults: (id) => {
    const cut = pieceCut(block, id)
    return { cutCount: cut.count, fabric: cut.material }
  },
})

/** A replayed pattern with its world draft and render data (Piezas view). */
export interface PatternData {
  readonly result: ReplayResult
  /** Extracted pieces as one draft in world coordinates (ids `${pieceId}/${localId}`). */
  readonly world: Draft
  readonly render: DraftRender
}

/** Render data of the extracted pieces, with their label fields. */
export const buildPatternData = (result: ReplayResult): PatternData => {
  const world = patternToWorldDraft(result.pattern.pieces)
  const base = buildDraftRender(world)
  const meta = new Map(result.pattern.pieces.map((p) => [p.id, p]))
  const render: DraftRender = {
    ...base,
    pieces: base.pieces.map((r) => {
      const p = meta.get(r.id)
      return p ? { ...r, label: { count: p.cutCount, material: p.fabric, onFold: p.onFold } } : r
    }),
  }
  return { result, world, render }
}

const patternCache = new WeakMap<readonly Operation[], Map<string, PatternData>>()

/** Replay of `ops` on the draft of (block, size, options), cached per operation list. */
export const cachedPattern = (
  blockId: string,
  size: string,
  options: BlockOptions,
  ops: readonly Operation[],
): PatternData => {
  let bySize = patternCache.get(ops)
  if (!bySize) patternCache.set(ops, (bySize = new Map()))
  const key = JSON.stringify([blockId, size, options])
  let hit = bySize.get(key)
  if (!hit) {
    const { draft } = cachedDraft(blockId, size, options)
    hit = buildPatternData(replay(draft, ops, replayOptionsFor(getBlock(blockId))))
    bySize.set(key, hit)
  }
  return hit
}

export const useCurrentBlock = (): AnyBlockDef => getBlock(useEditorStore((s) => s.blockId))

/** Draft of the current block, size and options. */
export const useCurrentDraft = (): { draft: Draft; render: DraftRender } => {
  const blockId = useEditorStore((s) => s.blockId)
  const size = useEditorStore((s) => s.size)
  const options = useEditorStore((s) => s.blockOptions)
  return useMemo(() => cachedDraft(blockId, size, options), [blockId, size, options])
}

/** Pattern (operations replayed) of the current block, size and options. */
export const useCurrentPattern = (): PatternData => {
  const blockId = useEditorStore((s) => s.blockId)
  const size = useEditorStore((s) => s.size)
  const options = useEditorStore((s) => s.blockOptions)
  const ops = useEditorStore((s) => s.operations)
  return useMemo(() => cachedPattern(blockId, size, options, ops), [blockId, size, options, ops])
}

/** What the canvas shows: the construction (Trazo) or the extracted pieces (Piezas). */
export interface DisplayData {
  readonly mode: ViewMode
  readonly draft: Draft
  readonly render: DraftRender
}

export const useDisplay = (): DisplayData => {
  const mode = useEditorStore((s) => s.viewMode)
  const trace = useCurrentDraft()
  const pattern = useCurrentPattern()
  return useMemo(
    () =>
      mode === 'pieces'
        ? { mode, draft: pattern.world, render: pattern.render }
        : { mode, draft: trace.draft, render: trace.render },
    [mode, trace, pattern],
  )
}

/** One outline of the nested-sizes overlay (Tallas layer). */
export interface SizeOutline {
  readonly key: string
  readonly size: string
  readonly d: string
}

/**
 * Outlines of every size (Tallas layer). Trazo: the drafts as drafted (they share the
 * construction frame). Piezas: each extracted piece of each size, translated so its grading anchor
 * (see gradingAnchor in core/ops) coincides with the anchor of the same piece in the current size.
 */
export const useSizeOutlines = (enabled: boolean): readonly SizeOutline[] => {
  const blockId = useEditorStore((s) => s.blockId)
  const options = useEditorStore((s) => s.blockOptions)
  const mode = useEditorStore((s) => s.viewMode)
  const size = useEditorStore((s) => s.size)
  const ops = useEditorStore((s) => s.operations)
  return useMemo(() => {
    if (!enabled) return []
    const sizes = blockSizes(getBlock(blockId))
    if (mode === 'trace')
      return sizes.flatMap((sz) =>
        cachedDraft(blockId, sz, options).render.pieces.map((p) => ({
          key: `${sz}:${p.id}`,
          size: sz,
          d: p.d,
        })),
      )
    const current = cachedPattern(blockId, size, options, ops).result.pattern.pieces
    return sizes.flatMap((sz) => {
      const pieces = cachedPattern(blockId, sz, options, ops).result.pattern.pieces
      return current.flatMap((cur) => {
        const p = pieces.find((q) => q.id === cur.id)
        if (!p) return []
        const a = gradingAnchor(cur)
        const b = gradingAnchor(p)
        const dx = a.x - b.x
        const dy = a.y - b.y
        const moved = mapPath(pieceWorldPath(p), (q) => ({ x: q.x + dx, y: q.y + dy }))
        return [{ key: `${sz}:${p.id}`, size: sz, d: toSvgPathData(moved) }]
      })
    })
  }, [enabled, blockId, options, mode, size, ops])
}
