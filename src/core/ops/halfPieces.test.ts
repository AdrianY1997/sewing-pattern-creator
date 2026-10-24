import { describe, expect, it } from 'vitest'
import {
  MEN_BODICE_BLOCK,
  MEN_SLEEVE_BLOCK,
  MEN_TROUSERS_BLOCK,
  WOMEN_BODICE_BLOCK,
  WOMEN_SKIRT_BLOCK,
  WOMEN_SLEEVE_BLOCK,
  WOMEN_TROUSERS_BLOCK,
  draftBlock,
  isHalfPiece,
  pieceCut,
  type AnyBlockDef,
} from '../../blocks'
import { DraftBuilder } from '../draft'
import { vec } from '../vec'
import { edgeAllowance, pieceLayoutBBox } from './marks'
import { replay } from './replay'
import type { Operation, OperationInput, PatternPiece, ReplayOptions } from './types'

let n = 0
const ops = (...list: OperationInput[]) => list.map((o) => ({ ...o, id: `h-${++n}` }) as Operation)

const optionsFor = (block: AnyBlockDef): ReplayOptions => ({
  pieceDefaults: (id) => ({
    cutCount: pieceCut(block, id).count,
    fabric: pieceCut(block, id).material,
    halfPiece: isHalfPiece(block, id),
  }),
})

const separate = (block: AnyBlockDef, ...more: OperationInput[]) =>
  replay(
    draftBlock(block, block.defaultSize),
    ops({ type: 'extractAll' }, ...more),
    optionsFor(block),
  )

const get = (pieces: readonly PatternPiece[], id: string) => {
  const p = pieces.find((q) => q.id === id)
  if (!p) throw new Error(`no piece ${id}`)
  return p
}

describe('extractAll per piece', () => {
  it('a failing piece gives one issue naming it and the rest are extracted', () => {
    const b = new DraftBuilder()
    b.point('A', vec(0, 0))
    b.point('B', vec(100, 0))
    b.point('C', vec(100, 100))
    b.line('t.ab', 'A', 'B')
    b.line('t.bc', 'B', 'C')
    b.line('t.ca', 'C', 'A')
    b.piece('good', 'Buena', ['t.ab', 't.bc', 't.ca'])
    b.line('t.x', 'C', 'A')
    b.piece('bad', 'Mala', ['t.ab', 't.bc', 't.x'])
    b.piece('also', 'Otra', ['t.ab', 't.bc', 't.ca'])
    const built = b.build()
    // A segment of 'bad' vanishes from the draft: only that piece cannot be extracted.
    const segments = Object.fromEntries(
      Object.entries(built.segments).filter(([id]) => id !== 't.x'),
    )
    const draft = { ...built, segments }
    const r = replay(draft, ops({ type: 'extractAll' }))
    expect(r.pattern.pieces.map((p) => p.id)).toEqual(['good', 'also'])
    expect(r.issues).toHaveLength(1)
    expect(r.issues[0].message).toContain('"bad"')
  })
})

describe('half pieces default to al doblez', () => {
  const halves: [AnyBlockDef, string[]][] = [
    [WOMEN_BODICE_BLOCK, ['front', 'back']],
    [WOMEN_SKIRT_BLOCK, ['front', 'back']],
    [MEN_BODICE_BLOCK, ['front', 'back']],
  ]
  it.each(halves)(
    '%s: front and back are onFold, x1, fold edge without allowance',
    (block, ids) => {
      const { pattern, issues } = separate(block)
      expect(issues).toEqual([])
      for (const id of ids) {
        const p = get(pattern.pieces, id)
        expect(p.onFold).toBe(true)
        expect(p.cutCount).toBe(1)
        const centre = p.outline
          .map((r) => r.segment)
          .filter((s) => ['centerFront', 'centerBack'].includes(p.segments[s].role ?? ''))
        expect(centre.length).toBeGreaterThan(0)
        for (const s of centre) {
          expect(edgeAllowance(p, s)).toBe(0)
          expect(p.allowance[s]).toBe(0)
        }
      }
    },
  )

  const wholes: AnyBlockDef[] = [
    WOMEN_SLEEVE_BLOCK,
    MEN_SLEEVE_BLOCK,
    WOMEN_TROUSERS_BLOCK,
    MEN_TROUSERS_BLOCK,
  ]
  it.each(wholes)('%s: legs and sleeves are not half pieces', (block) => {
    const { pattern } = separate(block)
    for (const p of pattern.pieces) {
      expect(p.onFold).toBe(false)
      expect(p.cutCount).toBe(pieceCut(block, p.id).count)
    }
  })

  it('without the half-piece flag a centre edge does not fold', () => {
    const r = replay(draftBlock(WOMEN_SKIRT_BLOCK, '10'), ops({ type: 'extractAll' }))
    expect(get(r.pattern.pieces, 'front').onFold).toBe(false)
  })

  it('cutOnFold leaves a whole piece (onFold false, x1); a mirrored copy keeps onFold', () => {
    const cut = separate(WOMEN_SKIRT_BLOCK, {
      type: 'cutOnFold',
      pieceId: 'back',
      foldSegmentId: 'back.cb',
    })
    expect(cut.issues).toEqual([])
    const back = get(cut.pattern.pieces, 'back')
    expect(back.onFold).toBe(false)
    expect(back.cutCount).toBe(1)

    const mirrored = separate(WOMEN_SKIRT_BLOCK, {
      type: 'mirrorPiece',
      pieceId: 'front',
      axis: 'vertical',
      keepOriginal: true,
    })
    expect(get(mirrored.pattern.pieces, 'front~m').onFold).toBe(true)
  })
})

describe('placement uses the cut line', () => {
  it('after separating all, cut-line boxes of the skirt pieces are >= 30 mm apart', () => {
    const { pattern } = separate(WOMEN_SKIRT_BLOCK)
    const boxes = pattern.pieces.map(pieceLayoutBBox)
    expect(boxes).toHaveLength(2)
    const [a, b] = boxes
    const gapX = Math.max(b.minX - a.maxX, a.minX - b.maxX)
    const gapY = Math.max(b.minY - a.maxY, a.minY - b.maxY)
    expect(Math.max(gapX, gapY)).toBeGreaterThanOrEqual(30 - 1e-6)
  })

  it('autoLayout keeps >= gap between cut lines too', () => {
    const { pattern } = separate(
      WOMEN_SKIRT_BLOCK,
      { type: 'duplicatePiece', pieceId: 'front', newId: 'f2' },
      { type: 'autoLayout', gapMm: 30 },
    )
    const boxes = pattern.pieces.map(pieceLayoutBBox)
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const [a, b] = [boxes[i], boxes[j]]
        const gap = Math.max(b.minX - a.maxX, a.minX - b.maxX, b.minY - a.maxY, a.minY - b.maxY)
        expect(gap).toBeGreaterThanOrEqual(30 - 1e-6)
      }
  })
})
