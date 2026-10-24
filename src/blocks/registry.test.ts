import { describe, expect, it } from 'vitest'
import { SEGMENT_ROLES } from '../core'
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

  it('registers the sleeve and skirt blocks with their options', () => {
    const sleeve = getBlock('women-sleeve')
    expect(sleeve.label).toBe('Manga base mujer')
    expect(defaultBlockOptions(sleeve)).toEqual({ capEase: '15' })
    expect(pieceCut(sleeve, 'sleeve')).toEqual({ count: 2, material: 'Tela' })
    const low = draftBlock(sleeve, '10')
    const high = draftBlock(sleeve, '10', { capEase: '42' })
    expect(high.points.B2.y).toBeGreaterThan(low.points.B2.y)

    const skirt = getBlock('women-skirt')
    expect(skirt.label).toBe('Falda base mujer')
    expect(draftBlock(skirt, '10').points.A5.x).toBeCloseTo(247.5, 9)
    expect(draftBlock(skirt, '10', { sideSeamShift: '10' }).points.A5.x).toBeCloseTo(257.5, 9)
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

  it.each(BLOCKS.map((b) => [b.id, b] as const))(
    '%s: every outline segment has a role, in every option',
    (_, block) => {
      const variants = [
        {},
        ...block.options.flatMap((o) => o.choices.map((c) => ({ [o.key]: c.value }))),
      ]
      for (const options of variants) {
        const draft = draftBlock(block, block.defaultSize, options)
        for (const piece of draft.pieces)
          for (const r of piece.outline) {
            const role = draft.segments[r.segment].role
            expect(role, `${piece.id} ${r.segment}`).toBeDefined()
            expect(SEGMENT_ROLES).toContain(role)
          }
      }
    },
  )
})
