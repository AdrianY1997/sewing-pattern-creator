import { memo } from 'react'
import { pieceCut, type AnyBlockDef } from '../../blocks'
import { add, normalize, perp, scale as scaleVec, sub, type Vec } from '../../core'
import type { LayerVisibility } from '../store/layers'
import type { DraftRender, GrainlineRender, PieceRender } from './draftGeometry'

export interface DraftLayersProps {
  readonly render: DraftRender
  readonly block: AnyBlockDef
  /** Drafts of every size, for the Tallas layer (empty when hidden). */
  readonly sizes: readonly { readonly size: string; readonly render: DraftRender }[]
  readonly layers: LayerVisibility
  readonly selectedPieceId: string | null
  /** Pixels per mm: screen-constant sizes (dots, text) are divided by it. */
  readonly scale: number
  /** False while panning tools are active: clicks on pieces then pan instead of selecting. */
  readonly selectable: boolean
  readonly onSelectPiece: (pieceId: string) => void
}

const pts = (ps: readonly Vec[]) => ps.map((p) => `${p.x} ${p.y}`).join(' ')

/** Double-headed grainline arrow with heads `head` mm long. */
function Grainline({ g, head }: { g: GrainlineRender; head: number }) {
  const dir = normalize(sub(g.to, g.from))
  const side = scaleVec(perp(dir), head * 0.4)
  const arrow = (tip: Vec, back: Vec) => {
    const base = add(tip, scaleVec(back, head))
    return pts([tip, add(base, side), sub(base, side)])
  }
  return (
    <g className="grainline" data-testid="grainline">
      <line x1={g.from.x} y1={g.from.y} x2={g.to.x} y2={g.to.y} />
      <polygon points={arrow(g.from, dir)} />
      <polygon points={arrow(g.to, scaleVec(dir, -1))} />
    </g>
  )
}

function PieceLabel({ piece, block, px }: { piece: PieceRender; block: AnyBlockDef; px: number }) {
  const cut = pieceCut(block, piece.id)
  const fs = 14 * px
  return (
    <text
      className="piece-label"
      x={piece.centroid.x}
      y={piece.centroid.y - fs * 1.2}
      fontSize={fs}
      strokeWidth={4 * px}
      textAnchor="middle"
    >
      <tspan x={piece.centroid.x}>{piece.name}</tspan>
      <tspan x={piece.centroid.x} dy="1.2em">
        x{cut.count}
      </tspan>
      <tspan x={piece.centroid.x} dy="1.2em">
        ({cut.material})
      </tspan>
    </text>
  )
}

function Selection({ piece, px }: { piece: PieceRender; px: number }) {
  const v = 7 * px
  const h = 6 * px
  const b = piece.bbox
  const corners = [
    [b.minX, b.minY],
    [b.maxX, b.minY],
    [b.maxX, b.maxY],
    [b.minX, b.maxY],
  ]
  return (
    <g className="selection" data-testid="selection">
      <rect
        className="sel-box"
        x={b.minX}
        y={b.minY}
        width={b.maxX - b.minX}
        height={b.maxY - b.minY}
      />
      {corners.map(([x, y]) => (
        <rect
          key={`${x},${y}`}
          className="sel-handle"
          x={x - h / 2}
          y={y - h / 2}
          width={h}
          height={h}
        />
      ))}
      <path className="sel-outline" d={piece.d} />
      {piece.vertices.map((p, i) => (
        <rect key={i} className="sel-vertex" x={p.x - v / 2} y={p.y - v / 2} width={v} height={v} />
      ))}
    </g>
  )
}

/** Every canvas layer of a draft, in world units (mm). Hidden layers are not rendered at all. */
export const DraftLayers = memo(function DraftLayers(props: DraftLayersProps) {
  const { render, block, sizes, layers, selectedPieceId, scale, selectable, onSelectPiece } = props
  const px = 1 / scale
  const selected = render.pieces.find((p) => p.id === selectedPieceId)

  return (
    <>
      {layers.sizes && (
        <g className="layer-sizes" data-testid="layer-sizes">
          {sizes.flatMap(({ size, render: r }) =>
            r.pieces.map((p) => <path key={`${size}:${p.id}`} d={p.d} data-size={size} />),
          )}
        </g>
      )}
      {layers.guides && (
        <g className="layer-guides" data-testid="layer-guides">
          {render.guides.map((l) => (
            <path key={l.id} d={l.d} />
          ))}
        </g>
      )}
      {layers.seam && <g className="layer-seam" data-testid="layer-seam" />}
      {layers.outline && (
        <g className="layer-outline" data-testid="layer-outline">
          {render.pieces.map((p) => (
            <path
              key={p.id}
              d={p.d}
              className={p.id === selectedPieceId ? 'piece is-selected' : 'piece'}
              data-testid="piece-outline"
              data-piece={p.id}
              onPointerDown={(ev) => {
                if (ev.button !== 0 || !selectable) return
                ev.stopPropagation()
                onSelectPiece(p.id)
              }}
            >
              <title>{p.name}</title>
            </path>
          ))}
          {render.grainlines.map((g) => (
            <Grainline key={g.id} g={g} head={9 * px} />
          ))}
          {render.pieces.map((p) =>
            p.vertices.map((v, i) => (
              <circle key={`${p.id}:${i}`} className="vertex" cx={v.x} cy={v.y} r={2.5 * px} />
            )),
          )}
        </g>
      )}
      {layers.darts && (
        <g className="layer-darts" data-testid="layer-darts">
          {render.darts.map((l) => (
            <path key={l.id} d={l.d} />
          ))}
          {render.dartMarks.map((m) => (
            <circle key={m.id} cx={m.at.x} cy={m.at.y} r={3 * px} />
          ))}
        </g>
      )}
      {layers.outline && selected && <Selection piece={selected} px={px} />}
      {layers.outline && (
        <g className="layer-labels">
          {render.pieces.map((p) => (
            <PieceLabel key={p.id} piece={p} block={block} px={px} />
          ))}
        </g>
      )}
      {layers.notes && (
        <g className="layer-notes" data-testid="layer-notes">
          {render.points.map(({ name, at }) => (
            <g key={name}>
              <circle cx={at.x} cy={at.y} r={1.6 * px} />
              <text x={at.x + 4 * px} y={at.y - 4 * px} fontSize={11 * px} strokeWidth={3 * px}>
                {name}
              </text>
            </g>
          ))}
        </g>
      )}
    </>
  )
})
