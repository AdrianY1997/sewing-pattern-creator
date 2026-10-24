/** Drafts derived from the store, memoised so panels and canvas share one computation. */
import { useMemo } from 'react'
import { blockSizes, draftBlock, getBlock, type AnyBlockDef, type BlockOptions } from '../../blocks'
import type { Draft } from '../../core'
import { buildDraftRender, type DraftRender } from '../canvas/draftGeometry'
import { useEditorStore } from './editorStore'

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

export const useCurrentBlock = (): AnyBlockDef => getBlock(useEditorStore((s) => s.blockId))

/** Draft of the current block, size and options. */
export const useCurrentDraft = (): { draft: Draft; render: DraftRender } => {
  const blockId = useEditorStore((s) => s.blockId)
  const size = useEditorStore((s) => s.size)
  const options = useEditorStore((s) => s.blockOptions)
  return useMemo(() => cachedDraft(blockId, size, options), [blockId, size, options])
}

/** Drafts of every size of the current block (nested sizes overlay). */
export const useAllSizeDrafts = (
  enabled: boolean,
): readonly { size: string; render: DraftRender }[] => {
  const blockId = useEditorStore((s) => s.blockId)
  const options = useEditorStore((s) => s.blockOptions)
  return useMemo(
    () =>
      enabled
        ? blockSizes(getBlock(blockId)).map((size) => ({
            size,
            render: cachedDraft(blockId, size, options).render,
          }))
        : [],
    [enabled, blockId, options],
  )
}
