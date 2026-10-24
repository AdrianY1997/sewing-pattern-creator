/**
 * Geometry engine (pure TypeScript: no React, no DOM).
 *
 * Conventions
 * - Units: millimetres (floats). Use mmToCm / cmToMm at the UI boundary.
 * - Coordinates: SVG-like. x grows to the right, y grows DOWNWARD.
 * - Angles: radians, measured from +x towards +y, i.e. a positive angle turns CLOCKWISE on screen.
 * - Segments (LineSeg, CubicBezier) carry a stable string `id`; operations derive new ids from it
 *   (`id.0`/`id.1` for splits, `id~off` for offsets) so they can be replayed across sizes.
 */
export * from './units'
export * from './vec'
export * from './poly'
export * from './bezier'
export * from './path'
export * from './intersect'
export * from './offset'
export * from './draft'
export * from './seam'
export * from './ops'
export * from './measure'
export * from './rulers'
