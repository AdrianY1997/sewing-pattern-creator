import { describe, expect, it } from 'vitest'
import {
  MEASUREMENT_TABLES,
  allRows,
  findGradingIrregularities,
  getFullMeasurement,
  getHalfMeasurement,
  getMeasurement,
  getMeasurements,
  getTable,
  measurementLabel,
  type MeasurementSystem,
} from '.'

const systems = Object.keys(MEASUREMENT_TABLES) as MeasurementSystem[]

describe('table integrity', () => {
  for (const system of systems) {
    const table = getTable(system)
    it(`${system}: every row has one finite positive value per size`, () => {
      for (const row of allRows(table)) {
        expect(row.valuesCm, row.key).toHaveLength(table.sizes.length)
        for (const v of row.valuesCm) expect(Number.isFinite(v) && v > 0, row.key).toBe(true)
        expect(row.label.length).toBeGreaterThan(0)
        expect(['full', 'half', 'length']).toContain(row.kind)
      }
    })
    it(`${system}: keys are unique camelCase and metadata is present`, () => {
      const keys = allRows(table).map((r) => r.key)
      expect(new Set(keys).size).toBe(keys.length)
      for (const k of keys) expect(k).toMatch(/^[a-z][a-zA-Z]*$/)
      expect(table.system).toBe(system)
      expect(table.source.length).toBeGreaterThan(0)
      expect(table.unit).toBe('cm')
    })
    it(`${system}: getMeasurements returns every key in mm for every size`, () => {
      for (const size of table.sizes) {
        const m = getMeasurements(system, size.id as never) as Record<string, number>
        expect(Object.keys(m).sort()).toEqual(
          allRows(table)
            .map((r) => r.key)
            .sort(),
        )
      }
    })
  }

  it('women: SPEC §3.1 rows plus §3.4.1 complementary rows', () => {
    const t = getTable('co-women-industrial')
    expect(t.sex).toBe('female')
    expect(t.sizes.map((s) => s.id)).toEqual(['6', '8', '10', '12', '14', '16'])
    expect(t.rows).toHaveLength(15)
    expect(t.complementary).toHaveLength(9)
    expect(t.complementary.filter((r) => r.derived).map((r) => r.key)).toEqual(['thigh', 'knee'])
    for (const r of t.complementary) expect(r.method.length).toBeGreaterThan(0)
  })
  it('men: SPEC §3.2 rows plus §3.4.2 complementary rows', () => {
    const t = getTable('es-men-easd')
    expect(t.sex).toBe('male')
    expect(t.sizes.map((s) => s.id)).toEqual(['40', '42', '44', '46', '48', '50', '52', '54'])
    expect(t.rows).toHaveLength(15)
    expect(t.complementary.map((r) => r.key)).toEqual([
      'neck',
      'shoulderLength',
      'halfChestWidth',
      'upperArm',
      'wrist',
      'shirtLength',
      'thigh',
    ])
    expect(t.complementary.filter((r) => r.derived).map((r) => r.key)).toEqual([
      'upperArm',
      'shirtLength',
    ])
    for (const r of t.complementary) {
      expect(r.valuesCm).toHaveLength(8)
      expect(r.method.length).toBeGreaterThan(0)
    }
    expect(t.complementary.find((r) => r.key === 'wrist')?.valuesCm[4]).toBe(17.6)
    expect(t.complementary.find((r) => r.key === 'thigh')?.valuesCm[7]).toBe(61.7)
  })
})

describe('spot checks (mm)', () => {
  it('women', () => {
    const m = getMeasurements('co-women-industrial', '10')
    expect(m.bust).toBe(920)
    expect(m.shoulderLength).toBe(120)
    expect(getMeasurement('co-women-industrial', '14', 'shoulderLength')).toBe(125)
    expect(getMeasurement('co-women-industrial', '6', 'bodyRise')).toBe(273)
    expect(getMeasurement('co-women-industrial', '16', 'halfJeansBottomWidth')).toBe(200)
  })
  it('men', () => {
    const m = getMeasurements('es-men-easd', '48')
    expect(m.chest).toBe(480)
    expect(m.neckRadius).toBe(80)
    expect(getMeasurement('es-men-easd', '54', 'waistLength')).toBe(462)
    expect(getMeasurement('es-men-easd', '40', 'armholeDepth')).toBe(210)
  })
  it('rejects unknown sizes and keys', () => {
    expect(() => getMeasurements('es-men-easd', '56' as never)).toThrow()
    expect(() => getMeasurement('co-women-industrial', '10', 'chest' as never)).toThrow()
  })
})

describe('full / half helpers', () => {
  it('doubles half measurements (EASD chest is half)', () => {
    expect(getFullMeasurement('es-men-easd', '48', 'chest')).toBe(960)
    expect(getFullMeasurement('es-men-easd', '50', 'waist')).toBe(880)
    expect(getHalfMeasurement('es-men-easd', '48', 'chest')).toBe(480)
  })
  it('keeps full circumferences as they are', () => {
    expect(getFullMeasurement('co-women-industrial', '10', 'bust')).toBe(920)
    expect(getHalfMeasurement('co-women-industrial', '10', 'bust')).toBe(460)
    expect(getFullMeasurement('co-women-industrial', '10', 'halfBackWidth')).toBe(350)
  })
})

describe('grading irregularities', () => {
  it('detects the known men waist and talle cases', () => {
    const irr = findGradingIrregularities(getTable('es-men-easd'))
    const waist = irr.find((i) => i.key === 'waist')!
    expect(waist.expectedIncrement).toBe(2)
    expect(waist.steps).toEqual([
      { from: '48', to: '50', increment: 4 },
      { from: '52', to: '54', increment: 3 },
    ])
    const talle = irr.find((i) => i.key === 'waistLength')!
    expect(talle.expectedIncrement).toBe(0.5)
    expect(talle.steps).toContainEqual({ from: '52', to: '54', increment: 0.7 })
    expect(talle.steps.every((s) => ['48', '50', '52'].includes(s.from))).toBe(true)
  })
  it('does not flag constant or evenly graded rows', () => {
    const keys = findGradingIrregularities(getTable('es-men-easd')).map((i) => i.key)
    expect(keys).not.toContain('chest')
    expect(keys).not.toContain('hipDepth') // constant 16 cm
    expect(keys).not.toContain('kneeLength')
  })
  it('women original table grades evenly; only uneven complementary rows are flagged', () => {
    const irr = findGradingIrregularities(getTable('co-women-industrial'))
    const t = getTable('co-women-industrial')
    const original = new Set(t.rows.map((r) => r.key))
    expect(irr.filter((i) => original.has(i.key))).toEqual([])
    expect(irr.map((i) => i.key).sort()).toEqual(['halfJeansBottomWidth', 'thigh'])
  })
})

describe('measurementLabel', () => {
  it('marks every half measure "(1/2)" exactly once', () => {
    const men = getTable('es-men-easd')
    const chest = men.rows.find((r) => r.key === 'chest')!
    expect(measurementLabel(chest)).toBe('Pecho (1/2)')
    for (const t of Object.values(MEASUREMENT_TABLES))
      for (const r of [...t.rows, ...t.complementary]) {
        const label = measurementLabel(r)
        expect(label.includes('(1/2)')).toBe(r.kind === 'half' || r.label.includes('(1/2)'))
        expect(label.split('(1/2)').length).toBeLessThanOrEqual(2)
      }
  })
})
