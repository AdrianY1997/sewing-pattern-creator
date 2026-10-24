import { describe, expect, it } from 'vitest'
import { getTable } from '../data'
import {
  BLOCKS,
  DEFAULT_BLOCK_ID,
  blockSizes,
  defaultBlockOptions,
  draftBlock,
  getBlock,
  isBlockSize,
  pieceCut,
  sanitizeBlockOptions,
} from './registry'

describe('block registry', () => {
  it('has unique ids and a valid default block', () => {
    const ids = BLOCKS.map((b) => b.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(getBlock(DEFAULT_BLOCK_ID).label).toBe('Cuerpo base mujer')
    expect(() => getBlock('nope')).toThrow(/Unknown block/)
  })

  it.each(BLOCKS.map((b) => [b.id, b] as const))('%s is consistent with its data', (_, block) => {
    const table = getTable(block.system)
    expect(table.sex).toBe(block.sex)
    expect(blockSizes(block)).toEqual(table.sizes.map((s) => s.id))
    expect(isBlockSize(block, block.defaultSize)).toBe(true)
    for (const o of block.options) expect(o.choices.map((c) => c.value)).toContain(o.default)
    const draft = draftBlock(block, block.defaultSize)
    const pieceIds = draft.pieces.map((p) => p.id)
    for (const v of block.views) expect(pieceIds).toContain(v.pieceId)
  })

  it('drafts every size and reacts to the block options', () => {
    const block = getBlock('women-bodice')
    const heights = blockSizes(block).map((size) => {
      const d = draftBlock(block, size)
      return d.points.A3.y
    })
    expect(heights).toEqual([...heights].sort((a, b) => a - b))
    expect(new Set(heights).size).toBe(heights.length)
    expect(draftBlock(block, '10', { length: 'hip' }).points.A3).toBeDefined()
    const waist = draftBlock(block, '10', { length: 'waist' })
    expect(waist.points.A54).toBeUndefined()
  })

  it('rejects sizes of another system', () => {
    const block = getBlock('women-bodice')
    expect(isBlockSize(block, '48')).toBe(false)
    expect(() => draftBlock(block, '48')).toThrow(/not in/)
  })

  it('builds, sanitizes options and cut info', () => {
    const block = getBlock('women-bodice')
    expect(defaultBlockOptions(block)).toEqual({ length: 'hip' })
    expect(sanitizeBlockOptions(block, { length: 'waist', extra: 1 })).toEqual({ length: 'waist' })
    expect(sanitizeBlockOptions(block, { length: 'knee' })).toEqual({ length: 'hip' })
    expect(pieceCut(block, 'front')).toEqual({ count: 1, material: 'Tela' })
  })
})
