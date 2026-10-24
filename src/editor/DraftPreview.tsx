import { useMemo } from 'react'
import {
  segmentBBox,
  toSvgPathData,
  unionBBox,
  path,
  piecePath,
  stripMeta,
  type Draft,
  type Segment,
} from '../core'

export interface DraftPreviewProps {
  readonly draft: Draft
  readonly showLabels: boolean
  readonly showConstruction: boolean
}

/** Stroke colour per piece id (back = blue outline, front = magenta, like the method's figure). */
const PIECE_COLORS: Readonly<Record<string, string>> = {
  back: 'var(--piece-back)',
  front: 'var(--piece-front)',
}

const MARGIN = 25 // mm around the drawing
const LABEL_SIZE = 7 // mm

const d = (s: Segment) => toSvgPathData(path([s]))

/** Read-only SVG of a draft in a mm viewBox, fitted to its container. */
export function DraftPreview({ draft, showLabels, showConstruction }: DraftPreviewProps) {
  const { viewBox, construction, outlines, internals } = useMemo(() => {
    const segs = Object.values(draft.segments).map(stripMeta)
    const bb = unionBBox(segs.map(segmentBBox))
    const used = new Set<string>()
    for (const pc of draft.pieces) {
      pc.outline.forEach((r) => used.add(r.segment))
      pc.internalLines.forEach((id) => used.add(id))
    }
    return {
      viewBox: [
        bb.minX - MARGIN,
        bb.minY - MARGIN,
        bb.maxX - bb.minX + 2 * MARGIN,
        bb.maxY - bb.minY + 2 * MARGIN,
      ].join(' '),
      construction: segs.filter((s) => !used.has(s.id)),
      outlines: draft.pieces.map((pc) => ({
        id: pc.id,
        name: pc.name,
        d: toSvgPathData(piecePath(draft, pc.id)),
      })),
      internals: draft.pieces.flatMap((pc) =>
        pc.internalLines.map((id) => ({
          piece: pc.id,
          seg: stripMeta(draft.segments[id]),
          grain: pc.marks.some((mk) => mk.kind === 'grainline' && mk.data?.segment === id),
        })),
      ),
    }
  }, [draft])

  return (
    <svg
      className="draft-svg"
      data-testid="draft-svg"
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Trazo del cuerpo base: delantero y espalda"
    >
      <defs>
        <marker
          id="grain-arrow"
          viewBox="0 0 10 10"
          refX="5"
          refY="5"
          markerUnits="userSpaceOnUse"
          markerWidth="8"
          markerHeight="8"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" className="grain-head" />
        </marker>
      </defs>
      {showConstruction && (
        <g className="layer-construction" data-testid="construction-layer">
          {construction.map((s) => (
            <path key={s.id} d={d(s)} className="construction" />
          ))}
        </g>
      )}
      <g className="layer-internal">
        {internals.map(({ piece, seg, grain }) => (
          <path
            key={seg.id}
            d={d(seg)}
            className={grain ? 'grain' : 'internal'}
            stroke={grain ? undefined : PIECE_COLORS[piece]}
            markerStart={grain ? 'url(#grain-arrow)' : undefined}
            markerEnd={grain ? 'url(#grain-arrow)' : undefined}
          />
        ))}
      </g>
      <g className="layer-outline">
        {outlines.map((o) => (
          <path
            key={o.id}
            d={o.d}
            className="outline"
            stroke={PIECE_COLORS[o.id] ?? 'var(--layer-outline)'}
            data-piece={o.id}
          >
            <title>{o.name}</title>
          </path>
        ))}
      </g>
      {draft.pieces.flatMap((pc) =>
        pc.marks
          .filter((mk) => mk.kind === 'bustPoint')
          .map((mk) => (
            <circle key={mk.id} cx={mk.at.x} cy={mk.at.y} r={2.5} className="bust-point" />
          )),
      )}
      {showLabels && (
        <g className="layer-labels" data-testid="labels-layer">
          {Object.entries(draft.points).map(([name, p]) => (
            <g key={name}>
              <circle cx={p.x} cy={p.y} r={1.3} className="point" />
              <text x={p.x + 2} y={p.y - 2} fontSize={LABEL_SIZE} className="point-label">
                {name}
              </text>
            </g>
          ))}
        </g>
      )}
    </svg>
  )
}
