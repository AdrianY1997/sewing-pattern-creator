import { describe, expect, it } from 'vitest'
import { cubic } from './bezier'
import {
  isContinuous,
  line,
  mirrorPath,
  path,
  pathBBox,
  pathLength,
  pathPointAtLength,
  pathSignedArea,
  reversePath,
  rotatePath,
  segEnd,
  toSvgPathData,
} from './path'
import { vec } from './vec'

const square = path(
  [
    line('top', vec(0, 0), vec(100, 0)),
    line('right', vec(100, 0), vec(100, 100)),
    line('bottom', vec(100, 100), vec(0, 100)),
    line('left', vec(0, 100), vec(0, 0)),
  ],
  true,
)

const dome = path(
  [
    line('base', vec(0, 0), vec(100, 0)),
    cubic('arc', vec(100, 0), vec(100, 80), vec(0, 80), vec(0, 0)),
  ],
  true,
)

describe('path measures', () => {
  it('length of a square', () => expect(pathLength(square)).toBe(400))
  it('bounding box uses curve extrema', () => {
    const bb = pathBBox(dome)
    expect(bb).toMatchObject({ minX: 0, minY: 0, maxX: 100 })
    expect(bb.maxY).toBeCloseTo(60, 9)
  })
  it('point at length crosses segment boundaries', () => {
    const p = pathPointAtLength(square, 150)
    expect(p.segmentId).toBe('right')
    expect(p.point.x).toBeCloseTo(100)
    expect(p.point.y).toBeCloseTo(50)
  })
  it('signed area sign follows winding', () => {
    expect(pathSignedArea(square)).toBeCloseTo(10000, 6)
    expect(pathSignedArea(reversePath(square))).toBeCloseTo(-10000, 6)
  })
})

describe('reverse', () => {
  it('reverses order and direction, keeping ids and continuity', () => {
    const r = reversePath(dome)
    expect(r.segments.map((s) => s.id)).toEqual(['arc', 'base'])
    expect(r.segments[0].p0).toEqual(vec(0, 0))
    expect(segEnd(r.segments[1])).toEqual(vec(0, 0))
    expect(isContinuous(r)).toBe(true)
    expect(pathLength(r)).toBeCloseTo(pathLength(dome), 9)
  })
})

describe('transforms', () => {
  it('rotate keeps lengths and moves points about the pivot', () => {
    const r = rotatePath(square, Math.PI / 2, vec(0, 0))
    expect(pathLength(r)).toBeCloseTo(400, 9)
    expect(r.segments[0].p0.x).toBeCloseTo(0)
    expect(segEnd(r.segments[0]).x).toBeCloseTo(0)
    expect(segEnd(r.segments[0]).y).toBeCloseTo(100)
  })
  it('mirror reflects geometry and preserves winding sign', () => {
    const m = mirrorPath(dome, vec(0, 0), vec(100, 0)) // across the base line
    expect(isContinuous(m)).toBe(true)
    expect(pathBBox(m).minY).toBeCloseTo(-60, 9)
    expect(Math.sign(pathSignedArea(m))).toBe(Math.sign(pathSignedArea(dome)))
    expect(pathLength(m)).toBeCloseTo(pathLength(dome), 9)
  })
  it('emits SVG path data', () => {
    expect(toSvgPathData(dome)).toBe('M 0 0 L 100 0 C 100 80 0 80 0 0 Z')
  })
})
