import { describe, expect, it } from 'vitest'
import { DraftBuilder, piecePath } from './draft'
import { offsetPath } from './offset'
import { isContinuous, pathBBox, segEnd } from './path'
import { bezierTangent } from './bezier'
import { vec } from './vec'

const buildRect = () => {
  const b = new DraftBuilder()
  b.point('A', vec(0, 0))
  b.point('B', vec(200, 0))
  b.point('C', vec(200, 400))
  b.point('D', vec(0, 400))
  b.line('AB', 'A', 'B')
  b.line('CB', 'C', 'B') // drawn "backwards" on purpose
  b.line('CD', 'C', 'D')
  b.curveWithTangents('DA', 'D', vec(0, -1), 'A', vec(0, -1))
  b.line('grain', vec(100, 50), vec(100, 350))
  b.piece('front', 'Delantero', ['AB', 'CB', 'CD', 'DA'], { internalLines: ['grain'] })
  return b
}

describe('DraftBuilder', () => {
  it('registers named points and segments with from/to names', () => {
    const d = buildRect().build()
    expect(d.version).toBe(1)
    expect(d.points.C).toEqual({ x: 200, y: 400 })
    expect(d.segments.AB).toMatchObject({ kind: 'line', id: 'AB', from: 'A', to: 'B' })
    expect(d.segments.grain.from).toBeUndefined()
  })
  it('auto-orients outline segments', () => {
    const d = buildRect().build()
    const piece = d.pieces[0]
    expect(piece.outline).toEqual([
      { segment: 'AB', reversed: false },
      { segment: 'CB', reversed: true },
      { segment: 'CD', reversed: false },
      { segment: 'DA', reversed: false },
    ])
    expect(piece.internalLines).toEqual(['grain'])
    expect(piece.marks).toEqual([])
  })
  it('is plain JSON (round-trips unchanged)', () => {
    const d = buildRect().build()
    expect(JSON.parse(JSON.stringify(d))).toEqual(d)
  })
  it('gives a closed, continuous piece path that can be offset', () => {
    const d = buildRect().build()
    const p = piecePath(d, 'front')
    expect(p.closed).toBe(true)
    expect(isContinuous(p, 1e-9)).toBe(true)
    expect(p.segments.map((s) => s.id)).toEqual(['AB', 'CB', 'CD', 'DA'])
    expect(segEnd(p.segments[1])).toEqual(vec(200, 400))
    const o = offsetPath(p, { AB: 10, CB: 10, CD: 30, DA: 0 })
    expect(pathBBox(o).maxY).toBeCloseTo(430, 6)
  })
  it('curveWithTangents through the builder respects tangents', () => {
    const b = new DraftBuilder()
    b.point('S', vec(70, 0))
    b.point('N', vec(0, 80))
    const c = b.curveWithTangents('neck', 'S', vec(0, 1), 'N', vec(-1, 0))
    expect(bezierTangent(c, 1).x).toBeCloseTo(-1, 12)
    expect(b.seg('neck')).toMatchObject({ from: 'S', to: 'N' })
  })
  it('smooth() registers chained curve segments', () => {
    const b = new DraftBuilder()
    b.point('P', vec(0, 0))
    b.point('Q', vec(50, 30))
    b.point('R', vec(100, 0))
    const curves = b.smooth('arm', ['P', 'Q', 'R'])
    expect(curves.map((c) => c.id)).toEqual(['arm.0', 'arm.1'])
    expect(b.build().segments['arm.1']).toMatchObject({ from: 'Q', to: 'R' })
  })
  it('rejects duplicates, unknown references and open outlines', () => {
    const b = buildRect()
    expect(() => b.point('A', vec(1, 1))).toThrow(/duplicate point/)
    expect(() => b.line('AB', 'A', 'C')).toThrow(/duplicate segment/)
    expect(() => b.p('Z')).toThrow(/unknown point/)
    expect(() => b.piece('x', 'X', ['AB', 'nope'])).toThrow(/unknown segment/)
    expect(() => b.piece('open', 'Abierta', ['AB', 'CB', 'CD'])).toThrow(/not closed/)
    expect(() => b.piece('gap', 'Hueco', ['AB', 'CD'])).toThrow()
    expect(() => b.piece('front', 'Otra', ['AB', 'CB', 'CD', 'DA'])).toThrow(/duplicate piece/)
  })
})
