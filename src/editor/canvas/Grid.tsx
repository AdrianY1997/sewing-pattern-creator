import { memo } from 'react'
import { gridSpacing, visibleWorld, type Size, type ViewTransform } from './viewTransform'

/** Screen-space path data of the grid lines (crisp 1 px lines), split into minor and major. */
export const gridPaths = (view: ViewTransform, size: Size): { minor: string; major: string } => {
  const { minor, major } = gridSpacing(view.scale)
  const vis = visibleWorld(view, size)
  const minor_: string[] = []
  const major_: string[] = []
  const isMajor = (w: number) => Math.abs(w / major - Math.round(w / major)) < 1e-6
  const crisp = (px: number) => Math.round(px) + 0.5
  for (let w = Math.ceil(vis.minX / minor) * minor; w <= vis.maxX; w += minor) {
    const x = crisp(w * view.scale + view.x)
    ;(isMajor(w) ? major_ : minor_).push(`M${x} 0V${size.height}`)
  }
  for (let w = Math.ceil(vis.minY / minor) * minor; w <= vis.maxY; w += minor) {
    const y = crisp(w * view.scale + view.y)
    ;(isMajor(w) ? major_ : minor_).push(`M0 ${y}H${size.width}`)
  }
  return { minor: minor_.join(''), major: major_.join('') }
}

/** mm/cm grid that follows the view: 1 cm lines (1 mm when zoomed in), stronger every 10. */
export const Grid = memo(function Grid({ view, size }: { view: ViewTransform; size: Size }) {
  const { minor, major } = gridPaths(view, size)
  return (
    <g className="grid" data-testid="grid" aria-hidden>
      <path d={minor} className="grid-minor" />
      <path d={major} className="grid-major" />
    </g>
  )
})
