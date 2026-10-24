/** Export source of the editor state: the replayed pattern of each chosen size. */
import { blockSizes, getBlock } from '../../blocks'
import { getTable } from '../../data'
import { APP_URL, formatExportDate, type ExportSource } from '../../export'
import type { EditorData } from '../store/editorStore'
import {
  allowanceDefaults,
  cachedDraft,
  cachedPattern,
  replayOptionsFor,
} from '../store/patternData'

/** Chosen sizes in table order (unknown ids dropped). */
export const orderedSizes = (blockId: string, sizes: readonly string[]): string[] =>
  blockSizes(getBlock(blockId)).filter((s) => sizes.includes(s))

/** The part of the editor state an export depends on. */
export type ExportState = Pick<
  EditorData,
  'blockId' | 'blockOptions' | 'operations' | 'advanced' | 'title' | 'size'
>

export function exportSource(
  s: ExportState,
  sizes: readonly string[],
  date = new Date(),
): ExportSource {
  const block = getBlock(s.blockId)
  const table = getTable(block.system)
  const allowance = allowanceDefaults(s.advanced)
  const ids = orderedSizes(s.blockId, sizes)
  return {
    title: s.title,
    sizes: ids.map((id) => {
      const data = cachedPattern(s.blockId, id, s.blockOptions, s.operations, allowance)
      return {
        id,
        label: table.sizes.find((z) => z.id === id)?.label ?? id,
        draft: cachedDraft(s.blockId, id, s.blockOptions).draft,
        pattern: data.result.pattern,
        issueCount: data.result.issues.length,
      }
    }),
    replayOptions: replayOptionsFor(block, allowance),
    referenceSize: ids.includes(s.size) ? s.size : ids[0],
    date: formatExportDate(date),
    appUrl: APP_URL,
  }
}

/** Save bytes or text as a file through a temporary link. */
export function downloadFile(data: Uint8Array | string, name: string, mime: string): void {
  const part: BlobPart = typeof data === 'string' ? data : (data.slice().buffer as ArrayBuffer)
  const url = URL.createObjectURL(new Blob([part], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
