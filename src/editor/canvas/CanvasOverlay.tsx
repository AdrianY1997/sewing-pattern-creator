import { mmToCm, type Vec } from '../../core'
import type { NamedPoint, SnapKind, SnapResult } from './snap'
import { SNAP_LABEL } from './snap'
import { worldToScreen, type ViewTransform } from './viewTransform'

const cm = (mm: number) => mmToCm(mm).toFixed(1)

/** Marker glyph of each snap kind, centred on (0, 0), screen px. */
function SnapGlyph({ kind }: { kind: SnapKind }) {
  switch (kind) {
    case 'point':
      return <circle r={6} />
    case 'endpoint':
      return <rect x={-5} y={-5} width={10} height={10} />
    case 'intersection':
      return <path d="M-6 -6L6 6M-6 6L6 -6" />
    case 'midpoint':
      return <path d="M0 -6L6 5H-6Z" />
    case 'curve':
      return <path d="M0 -6L6 0L0 6L-6 0Z" />
    case 'grid':
      return <path d="M-6 0H6M0 -6V6" />
  }
}

/** Screen-space snap marker + type label (SVG, drawn above the world). */
export function SnapMarker({ result, view }: { result: SnapResult; view: ViewTransform }) {
  const p = worldToScreen(view, result.at)
  const label = SNAP_LABEL[result.kind]
  const w = label.length * 6.4 + 12
  return (
    <g
      className={`snap-marker snap-${result.kind}`}
      data-testid="snap-marker"
      data-kind={result.kind}
      transform={`translate(${p.x} ${p.y})`}
    >
      <SnapGlyph kind={result.kind} />
      <g transform="translate(10 10)" className="snap-label">
        <rect width={w} height={18} rx={4} />
        <text x={6} y={13}>
          {label}
        </text>
      </g>
    </g>
  )
}

/** Ring on the hovered named point (SVG, screen space). */
export function HoverRing({ at, view }: { at: Vec; view: ViewTransform }) {
  const p = worldToScreen(view, at)
  return <circle className="hover-ring" data-testid="hover-ring" cx={p.x} cy={p.y} r={7} />
}

/** HTML tooltip with the hovered point's name(s) and coordinates in cm. */
export function PointTooltip({
  points,
  view,
}: {
  points: readonly NamedPoint[]
  view: ViewTransform
}) {
  const at = points[0].at
  const p = worldToScreen(view, at)
  return (
    <div
      className="point-tooltip"
      data-testid="point-tooltip"
      role="tooltip"
      style={{ left: p.x + 12, top: p.y - 44 }}
    >
      <strong>{points.map((q) => q.name).join(' = ')}</strong>
      <span>
        X {cm(at.x)} · Y {cm(at.y)} cm
      </span>
    </div>
  )
}
