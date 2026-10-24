/**
 * Screen calibration (SPEC §6): the px/mm factor that makes 100 % zoom real size (1:1).
 * Pure math plus a tiny localStorage persistence (every access wrapped: storage may be blocked).
 */
import { PX_PER_MM } from './viewTransform'

/** ID-1 card (credit / ID card), ISO/IEC 7810. */
export const CARD_MM = { width: 85.6, height: 53.98 } as const

/** Length of the line measured with a physical ruler (mm). */
export const RULER_LINE_MM = 100

/** Fallback when the screen is not calibrated: CSS reference pixel, 96 dpi. */
export const DEFAULT_PX_PER_MM = PX_PER_MM

/** Plausible px/mm range (≈ 25 … 1270 dpi); values outside are rejected. */
export const MIN_PX_PER_MM = 1
export const MAX_PX_PER_MM = 50

export const isValidPxPerMm = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= MIN_PX_PER_MM && v <= MAX_PX_PER_MM

/** px/mm from the on-screen width (px) of a rectangle that matches a real card. */
export const pxPerMmFromCard = (rectWidthPx: number): number => rectWidthPx / CARD_MM.width

/** On-screen card rectangle (px) for a px/mm factor. */
export const cardSizePx = (pxPerMm: number): { width: number; height: number } => ({
  width: CARD_MM.width * pxPerMm,
  height: CARD_MM.height * pxPerMm,
})

/**
 * px/mm from the ruler check: a line drawn `RULER_LINE_MM` long at `currentPxPerMm` measures
 * `measuredMm` on the physical ruler, so the screen really shows currentPxPerMm·100/measured px
 * per mm.
 */
export const pxPerMmFromRuler = (currentPxPerMm: number, measuredMm: number): number =>
  (currentPxPerMm * RULER_LINE_MM) / measuredMm

const KEY = 'spc:calibration:pxPerMm'

/** Stored px/mm, or null when missing, invalid or storage is unavailable. */
export const loadCalibration = (): number | null => {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (raw === null) return null
    const v = Number(raw)
    return isValidPxPerMm(v) ? v : null
  } catch {
    return null
  }
}

/** Persist px/mm (null clears it). Returns false when storage is unavailable. */
export const saveCalibration = (pxPerMm: number | null): boolean => {
  try {
    if (pxPerMm === null) window.localStorage.removeItem(KEY)
    else window.localStorage.setItem(KEY, String(pxPerMm))
    return true
  } catch {
    return false
  }
}
