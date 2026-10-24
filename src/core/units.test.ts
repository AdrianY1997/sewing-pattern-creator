import { describe, expect, it } from 'vitest'
import { cmToMm, mmToCm } from './units'

describe('units', () => {
  it('converts mm to cm', () => expect(mmToCm(25)).toBe(2.5))
  it('converts cm to mm', () => expect(cmToMm(2.5)).toBe(25))
})
