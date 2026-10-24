import { describe, expect, it } from 'vitest'
import { isContinuous, pathSelfIntersections, piecePath } from '../core'
import { getMeasurements, getTable, type MenSize } from '../data'
import {
  MEN_SLEEVE_CONSTANTS,
  MEN_SLEEVE_DEFAULTS,
  draftMenSleeve,
  measureMenSleeve,
  menBodiceArmhole,
} from './menSleeve'
import { defaultBlockOptions, draftBlock, getBlock, pieceCut } from './registry'

const SIZES = getTable('es-men-easd').sizes.map((s) => s.id) as MenSize[]
const m48 = getMeasurements('es-men-easd', '48')
const d48 = draftMenSleeve(m48)
const arm48 = menBodiceArmhole(m48)

describe('draftMenSleeve — size 48 (docs/blocks/men-sleeve.md §5)', () => {
  it('reads the bodice armhole and its profundidad de sisa', () => {
    expect(arm48.back).toBeCloseTo(291.7, 1)
    expect(arm48.front).toBeCloseTo(265.73, 1)
    expect(arm48.depth).toBeCloseTo(115.48, 1)
  })

  const expected: Record<string, [number, number]> = {
    A: [0, 0],
    B: [0, 115.48],
    C: [0, 610],
    D: [-253.82, 115.48],
    E: [253.82, 115.48],
    F: [-140, 610],
    G: [140, 610],
    H: [-90.82, 24.84],
    I: [-169.21, 76.98],
    J: [-209.45, 100.78],
    K: [185.39, 97.53],
    L: [126.91, 57.74],
    M: [68.42, 17.95],
    N: [-187.16, 360.5],
    O: [187.16, 360.5],
  }
  for (const [name, [x, y]] of Object.entries(expected))
    it(`${name} = (${x}, ${y}) mm`, () => {
      const p = d48.points[name]
      expect(p, name).toBeDefined()
      expect(p.x).toBeCloseTo(x, 1)
      expect(p.y).toBeCloseTo(y, 1)
    })

  it('cap height = PS and the diagonals stay at half the armhole (± 1 mm)', () => {
    const r = measureMenSleeve(d48)
    expect(r.capHeight).toBeCloseTo(arm48.depth, 9)
    const diag = Math.hypot(d48.points.D.x, d48.points.D.y)
    expect(Math.abs(diag - (arm48.back + arm48.front) / 2)).toBeLessThan(1)
  })

  it('places the notches with the embebido share below each and the rest at the shoulder', () => {
    const r = measureMenSleeve(d48)
    const below = MEN_SLEEVE_DEFAULTS.capEase * MEN_SLEEVE_DEFAULTS.notchEaseShare
    expect(r.notches.back).toBeCloseTo(arm48.backBelowNotch + below, 1)
    expect(r.notches.front).toBeCloseTo(arm48.frontBelowNotch + below, 1)
    expect(r.notches.shoulder).toBeCloseTo(arm48.back + MEN_SLEEVE_DEFAULTS.capEase / 2, 1)
    const sleeve = d48.pieces[0]
    expect(sleeve.marks.filter((mk) => mk.kind === 'notch')).toHaveLength(3)
    expect(sleeve.marks.find((mk) => mk.id === 'sleeve.notch.back')?.data?.count).toBe(2)
  })

  it('hem = 2 × ancho bocamanga, length = largo de manga', () => {
    const r = measureMenSleeve(d48)
    expect(r.hemWidth).toBe(2 * m48.halfCuffWidth)
    expect(d48.points.C.y).toBe(m48.sleeveLength)
  })

  it('embebido option changes the cap', () => {
    for (const capEase of [0, 20]) {
      const r = measureMenSleeve(draftMenSleeve(m48, { capEase }))
      expect(r.cap.total).toBeCloseTo(arm48.back + arm48.front + capEase, 3)
    }
  })

  it('is registered as "men-sleeve" (cut x2) and drafts the same sleeve', () => {
    const block = getBlock('men-sleeve')
    expect(block.system).toBe('es-men-easd')
    expect(defaultBlockOptions(block)).toEqual({ capEase: '10' })
    expect(pieceCut(block, 'sleeve')).toEqual({ count: 2, material: 'Tela' })
    expect(draftBlock(block, '48')).toEqual(d48)
    const wide = measureMenSleeve(draftBlock(block, '48', { capEase: '20' }))
    expect(wide.cap.total).toBeCloseTo(arm48.back + arm48.front + 20, 3)
  })
})

describe.each(SIZES)('size %s', (size) => {
  const m = getMeasurements('es-men-easd', size)
  const arm = menBodiceArmhole(m)
  const d = draftMenSleeve(m)
  const r = measureMenSleeve(d)

  it('cap = bodice armhole + embebido (± 3 mm)', () => {
    const target = arm.back + arm.front + MEN_SLEEVE_DEFAULTS.capEase
    expect(Math.abs(r.cap.total - target)).toBeLessThanOrEqual(3)
  })

  it('underarm seams are equal', () => {
    expect(Math.abs(r.underarm.back - r.underarm.front)).toBeLessThan(1e-6)
  })

  it('bicep ≥ upper arm + minimum ease, hem fits the wrist', () => {
    expect(r.bicepWidth).toBeGreaterThanOrEqual(m.upperArm + MEN_SLEEVE_CONSTANTS.minBicepEase)
    expect(r.hemWidth).toBeGreaterThan(m.wrist)
  })

  it('has finite points, a closed non self-intersecting outline and stable ids', () => {
    for (const [n, v] of Object.entries(d.points)) expect(Number.isFinite(v.x + v.y), n).toBe(true)
    const path = piecePath(d, 'sleeve')
    expect(path.closed).toBe(true)
    expect(isContinuous(path, 1e-6)).toBe(true)
    expect(pathSelfIntersections(path, 0.01)).toEqual([])
    expect(Object.keys(d.segments).sort()).toEqual(Object.keys(d48.segments).sort())
  })
})
