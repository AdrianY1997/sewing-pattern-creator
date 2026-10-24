import { describe, expect, it } from 'vitest'
import {
  MAX_SCALE,
  MIN_SCALE,
  PX_PER_MM,
  fitBBox,
  gridSpacing,
  panBy,
  screenToWorld,
  visibleWorld,
  wheelZoomFactor,
  worldToScreen,
  zoomAt,
  zoomPercent,
  type ViewTransform,
} from './viewTransform'

const v: ViewTransform = { x: 120, y: -40, scale: 2.5 }

describe('view transform', () => {
  it('maps world ↔ screen both ways', () => {
    expect(worldToScreen(v, { x: 10, y: 20 })).toEqual({ x: 145, y: 10 })
    expect(screenToWorld(v, { x: 145, y: 10 })).toEqual({ x: 10, y: 20 })
    const p = { x: -33.3, y: 812.7 }
    const back = screenToWorld(v, worldToScreen(v, p))
    expect(back.x).toBeCloseTo(p.x, 9)
    expect(back.y).toBeCloseTo(p.y, 9)
  })

  it('zooms at a point keeping the world point under the cursor fixed', () => {
    const cursor = { x: 300, y: 250 }
    const before = screenToWorld(v, cursor)
    const z = zoomAt(v, cursor, 2)
    expect(z.scale).toBeCloseTo(5, 12)
    const after = screenToWorld(z, cursor)
    expect(after.x).toBeCloseTo(before.x, 9)
    expect(after.y).toBeCloseTo(before.y, 9)
    // zooming back restores the original view
    const back = zoomAt(z, cursor, 0.5)
    expect(back.x).toBeCloseTo(v.x, 9)
    expect(back.y).toBeCloseTo(v.y, 9)
  })

  it('clamps the zoom range', () => {
    expect(zoomAt(v, { x: 0, y: 0 }, 1e6).scale).toBe(MAX_SCALE)
    expect(zoomAt(v, { x: 0, y: 0 }, 1e-6).scale).toBe(MIN_SCALE)
  })

  it('pans by screen pixels', () => {
    expect(panBy(v, 5, -7)).toEqual({ x: 125, y: -47, scale: 2.5 })
  })

  it('fits a box centred in the viewport', () => {
    const box = { minX: 0, minY: 0, maxX: 500, maxY: 600 }
    const size = { width: 800, height: 700 }
    const f = fitBBox(box, size, 50)
    expect(f.scale).toBeCloseTo(1, 12) // (700 − 100) / 600
    const centre = worldToScreen(f, { x: 250, y: 300 })
    expect(centre.x).toBeCloseTo(400, 9)
    expect(centre.y).toBeCloseTo(350, 9)
    const vis = visibleWorld(f, size)
    expect(vis.minY).toBeCloseTo(-50, 9)
    expect(vis.maxY).toBeCloseTo(650, 9)
  })

  it('reports zoom as a percentage of real size', () => {
    expect(zoomPercent({ x: 0, y: 0, scale: PX_PER_MM })).toBe(100)
    expect(zoomPercent({ x: 0, y: 0, scale: PX_PER_MM / 2 })).toBe(50)
  })

  it('turns wheel deltas into symmetric zoom factors', () => {
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1)
    expect(wheelZoomFactor(100) * wheelZoomFactor(-100)).toBeCloseTo(1, 12)
  })

  it('adapts the grid spacing to the zoom', () => {
    expect(gridSpacing(10)).toEqual({ minor: 1, major: 10 })
    expect(gridSpacing(1.1)).toEqual({ minor: 10, major: 100 })
    expect(gridSpacing(0.2)).toEqual({ minor: 100, major: 1000 })
  })
})
