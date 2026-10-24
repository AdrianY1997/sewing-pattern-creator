import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CARD_MM,
  DEFAULT_PX_PER_MM,
  RULER_LINE_MM,
  cardSizePx,
  isValidPxPerMm,
  loadCalibration,
  pxPerMmFromCard,
  pxPerMmFromRuler,
  saveCalibration,
} from './calibration'

describe('screen calibration math', () => {
  it('defaults to 96 dpi', () => {
    expect(DEFAULT_PX_PER_MM).toBeCloseTo(96 / 25.4, 12)
  })

  it('derives px/mm from the matched card width', () => {
    expect(pxPerMmFromCard(85.6 * 5)).toBeCloseTo(5, 12)
    expect(pxPerMmFromCard(cardSizePx(4.2).width)).toBeCloseTo(4.2, 12)
    const s = cardSizePx(5)
    expect(s.width / s.height).toBeCloseTo(CARD_MM.width / CARD_MM.height, 12)
    expect(s.height).toBeCloseTo(269.9, 9)
  })

  it('derives px/mm from a 10 cm line measured with a ruler', () => {
    expect(RULER_LINE_MM).toBe(100)
    // A line drawn 100 mm at 4 px/mm (400 px) that measures 80 mm → 5 px/mm.
    expect(pxPerMmFromRuler(4, 80)).toBeCloseTo(5, 12)
    expect(pxPerMmFromRuler(4, 100)).toBeCloseTo(4, 12)
    // Round trip: at the new factor, 100 mm takes exactly the measured pixels' worth.
    const k = pxPerMmFromRuler(DEFAULT_PX_PER_MM, 93)
    expect((100 * DEFAULT_PX_PER_MM) / k).toBeCloseTo(93, 9)
  })

  it('rejects implausible factors', () => {
    expect(isValidPxPerMm(3.78)).toBe(true)
    expect(isValidPxPerMm(0)).toBe(false)
    expect(isValidPxPerMm(500)).toBe(false)
    expect(isValidPxPerMm(Number.NaN)).toBe(false)
    expect(isValidPxPerMm('4')).toBe(false)
  })
})

describe('calibration persistence', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('saves, loads and clears the factor', () => {
    expect(loadCalibration()).toBeNull()
    expect(saveCalibration(4.5)).toBe(true)
    expect(loadCalibration()).toBe(4.5)
    saveCalibration(null)
    expect(loadCalibration()).toBeNull()
  })

  it('ignores invalid stored values', () => {
    localStorage.setItem('spc:calibration:pxPerMm', 'abc')
    expect(loadCalibration()).toBeNull()
    localStorage.setItem('spc:calibration:pxPerMm', '9999')
    expect(loadCalibration()).toBeNull()
  })

  it('survives blocked storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(loadCalibration()).toBeNull()
    expect(saveCalibration(4)).toBe(false)
  })
})
