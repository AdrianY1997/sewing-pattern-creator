/**
 * Drafts and replayed patterns derived from the store, memoised so panels and canvas share one
 * computation:  pattern = replay(draftBlock(block, size, options), operations).
 */
import { useMemo } from 'react'
import { blockSizes, getBlock, type AnyBlockDef } from '../../blocks'
import {
  gradingAnchor,
  mapPath,
  pieceWorldPath,
  toSvgPathData,
  type AllowanceDefaults,
  type Draft,
} from '../../core'
import type { DraftRender } from '../canvas/draftGeometry'
import type { SeamRender } from '../canvas/seamGeometry'
import { useEditorStore, type ViewMode } from './editorStore'
import { allowanceDefaults, cachedDraft, cachedPattern, type PatternData } from './patternData'

export * from './patternData'

/** Allowance defaults of the store, as a stable object per AdvancedOptions value. */
const useAllowanceDefaults = (): AllowanceDefaults => {
  const adv = useEditorStore((s) => s.advanced)
  return useMemo(() => allowanceDefaults(adv), [adv])
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
  const allowance = useAllowanceDefaults()
  return useMemo(
    () => cachedPattern(blockId, size, options, ops, allowance),
    [blockId, size, options, ops, allowance],
  )
}

/** What the canvas shows: the construction (Trazo) or the extracted pieces (Piezas). */
export interface DisplayData {
  readonly mode: ViewMode
  readonly draft: Draft
  readonly render: DraftRender
  /** Cut lines (Piezas view only). */
  readonly seams: readonly SeamRender[]
}

const NO_SEAMS: readonly SeamRender[] = []

export const useDisplay = (): DisplayData => {
  const mode = useEditorStore((s) => s.viewMode)
  const trace = useCurrentDraft()
  const pattern = useCurrentPattern()
  return useMemo(
    () =>
      mode === 'pieces'
        ? { mode, draft: pattern.world, render: pattern.render, seams: pattern.seams }
        : { mode, draft: trace.draft, render: trace.render, seams: NO_SEAMS },
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
  const allowance = useAllowanceDefaults()
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
    const current = cachedPattern(blockId, size, options, ops, allowance).result.pattern.pieces
    return sizes.flatMap((sz) => {
      const pieces = cachedPattern(blockId, sz, options, ops, allowance).result.pattern.pieces
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
  }, [enabled, blockId, options, mode, size, ops, allowance])
}
