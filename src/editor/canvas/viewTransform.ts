/**
 * Canvas view transform: world (mm, y down) ↔ screen (CSS px relative to the canvas viewport).
 * screen = world · scale + offset, with `scale` in px per mm.
 */
import type { BBox, Vec } from '../../core'

export interface ViewTransform {
  /** Screen position (px) of the world origin. */
  readonly x: number
  readonly y: number
  /** Pixels per millimetre. */
  readonly scale: number
}

export interface Size {
  readonly width: number
  readonly height: number
}

/** CSS pixels per mm at the nominal 96 dpi: the scale shown as 100 %. */
export const PX_PER_MM = 96 / 25.4

export const MIN_SCALE = PX_PER_MM * 0.05
export const MAX_SCALE = PX_PER_MM * 20

/** Zoom factor of one +/− button step. */
export const ZOOM_STEP = 1.25

export const IDENTITY_VIEW: ViewTransform = { x: 0, y: 0, scale: 1 }

export const worldToScreen = (v: ViewTransform, p: Vec): Vec => ({
  x: p.x * v.scale + v.x,
  y: p.y * v.scale + v.y,
})

export const screenToWorld = (v: ViewTransform, p: Vec): Vec => ({
  x: (p.x - v.x) / v.scale,
  y: (p.y - v.y) / v.scale,
})

export const clampScale = (scale: number): number => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))

/** Multiply the scale by `factor` keeping the world point under `screenPt` fixed. */
export const zoomAt = (v: ViewTransform, screenPt: Vec, factor: number): ViewTransform => {
  const scale = clampScale(v.scale * factor)
  const w = screenToWorld(v, screenPt)
  return { x: screenPt.x - w.x * scale, y: screenPt.y - w.y * scale, scale }
}

export const panBy = (v: ViewTransform, dx: number, dy: number): ViewTransform => ({
  ...v,
  x: v.x + dx,
  y: v.y + dy,
})

/** View that centres `box` in a viewport of `size`, leaving `padding` px on every side. */
export const fitBBox = (box: BBox, size: Size, padding = 40): ViewTransform => {
  const bw = Math.max(box.maxX - box.minX, 1e-6)
  const bh = Math.max(box.maxY - box.minY, 1e-6)
  const aw = Math.max(size.width - 2 * padding, 1)
  const ah = Math.max(size.height - 2 * padding, 1)
  const scale = clampScale(Math.min(aw / bw, ah / bh))
  const cx = (box.minX + box.maxX) / 2
  const cy = (box.minY + box.maxY) / 2
  return { x: size.width / 2 - cx * scale, y: size.height / 2 - cy * scale, scale }
}

/** Zoom as a percentage of real size (100 % = 1 mm on screen per mm at 96 dpi). */
export const zoomPercent = (v: ViewTransform): number => Math.round((v.scale / PX_PER_MM) * 100)

/** Wheel delta (px) → zoom factor; one notch (100 px) zooms by ~1.2. */
export const wheelZoomFactor = (deltaY: number): number => Math.exp(-deltaY * 0.0018)

/** World rectangle visible in a viewport of `size`. */
export const visibleWorld = (v: ViewTransform, size: Size): BBox => {
  const a = screenToWorld(v, { x: 0, y: 0 })
  const b = screenToWorld(v, { x: size.width, y: size.height })
  return { minX: a.x, minY: a.y, maxX: b.x, maxY: b.y }
}

export interface GridSpacing {
  /** Minor line spacing (mm). */
  readonly minor: number
  /** Major line spacing (mm), 10 × minor. */
  readonly major: number
}

/**
 * Grid spacing for a scale: 1 mm / 1 cm / 10 cm… minor lines, the smallest that stays at least
 * `minPx` apart on screen; major lines every 10 minor lines.
 */
export const gridSpacing = (scale: number, minPx = 8): GridSpacing => {
  let minor = 1
  while (minor * scale < minPx) minor *= 10
  return { minor, major: minor * 10 }
}
