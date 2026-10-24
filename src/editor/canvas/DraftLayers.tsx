import { memo } from 'react'
import { pieceCut, type AnyBlockDef } from '../../blocks'
import { add, normalize, perp, scale as scaleVec, sub, type Vec } from '../../core'
import type { LayerVisibility } from '../store/layers'
import type { SizeOutline } from '../store/useDraft'
import type { DraftRender, GrainlineRender, NotchRender, PieceRender } from './draftGeometry'
import type { SeamRender } from './seamGeometry'

export interface DraftLayersProps {
  readonly render: DraftRender
  /** Cut lines of the extracted pieces (Costura layer); empty in the Trazo view. */
  readonly seams: readonly SeamRender[]
  readonly block: AnyBlockDef
  /** Outlines of every size, for the Tallas layer (empty when hidden). */
  readonly sizes: readonly SizeOutline[]
  readonly layers: LayerVisibility
  readonly selectedPieceId: string | null
  readonly selectedSegmentId: string | null
  /** Pixels per mm: screen-constant sizes (dots, text) are divided by it. */
  readonly scale: number
  /** False while panning tools are active: clicks on pieces then pan instead of selecting. */
  readonly selectable: boolean
  readonly onSelectPiece: (pieceId: string) => void
  readonly onSelectSegment: (segmentId: string, pieceId: string | null) => void
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

function Notch({ n, testId }: { n: NotchRender; testId: string }) {
  return (
    <g className="notch" data-testid={testId} data-notch={n.id}>
      {n.ticks.map(([a, b], i) => (
        <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
      ))}
    </g>
  )
}

function PieceLabel({ piece, block, px }: { piece: PieceRender; block: AnyBlockDef; px: number }) {
  const cut = piece.label ?? { ...pieceCut(block, piece.id), onFold: false }
  const fs = 14 * px
  const { x, y } = piece.labelAt
  return (
    <text
      className="piece-label"
      data-testid="piece-label"
      data-piece={piece.id}
      x={x}
      y={y - fs * 1.2}
      fontSize={fs}
      strokeWidth={4 * px}
      textAnchor="middle"
    >
      <tspan x={x}>{piece.name}</tspan>
      <tspan x={x} dy="1.2em">
        x{cut.count}
        {cut.onFold ? ' (al doblez)' : ''}
      </tspan>
      <tspan x={x} dy="1.2em">
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
  const { render, seams, block, sizes, layers, selectedPieceId, selectedSegmentId, scale } = props
  const { selectable, onSelectPiece, onSelectSegment } = props
  const px = 1 / scale
  const selected = render.pieces.find((p) => p.id === selectedPieceId)
  const visibleSegments = render.segments.filter((s) => layers[s.layer])
  const selectedSegment = visibleSegments.find((s) => s.id === selectedSegmentId)

  return (
    <>
      {layers.sizes && (
        <g className="layer-sizes" data-testid="layer-sizes">
          {sizes.map((o) => (
            <path key={o.key} d={o.d} data-size={o.size} />
          ))}
        </g>
      )}
      {layers.guides && (
        <g className="layer-guides" data-testid="layer-guides">
          {render.guides.map((l) => (
            <path key={l.id} d={l.d} />
          ))}
        </g>
      )}
      {layers.seam && (
        <g className="layer-seam" data-testid="layer-seam">
          {seams.map((s) => (
            <g key={s.pieceId} data-piece={s.pieceId}>
              <path className="cut-line" data-testid="seam-line" data-piece={s.pieceId} d={s.d} />
              {s.notches.map((n) => (
                <Notch key={n.id} n={n} testId="seam-notch" />
              ))}
            </g>
          ))}
        </g>
      )}
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
          {render.folds.map((l) => (
            <path key={l.id} className="fold-line" data-testid="fold-line" d={l.d} />
          ))}
          {render.styles.map((l) => (
            <path
              key={l.id}
              className="style-line"
              data-testid="style-line"
              data-segment={l.id}
              d={l.d}
            />
          ))}
          {render.foldMarks.map((f) => (
            <g key={f.id} className="fold-mark" data-testid="fold-mark" data-piece-fold={f.pieceId}>
              <path className="fold-bracket" d={f.d} />
              <path className="fold-arrows" d={f.arrows} />
              <text
                x={f.textAt.x}
                y={f.textAt.y}
                fontSize={11 * px}
                strokeWidth={3 * px}
                textAnchor="middle"
                dominantBaseline="middle"
                transform={`rotate(${f.angle} ${f.textAt.x} ${f.textAt.y})`}
              >
                DOBLEZ
              </text>
            </g>
          ))}
          {render.gathers.map((g) => (
            <g key={g.id} className="gather-mark" data-testid="gather-mark" data-mark={g.id}>
              <path d={g.d} />
              <text
                x={g.textAt.x}
                y={g.textAt.y}
                fontSize={11 * px}
                strokeWidth={3 * px}
                textAnchor="middle"
                dominantBaseline="middle"
                transform={`rotate(${g.angle} ${g.textAt.x} ${g.textAt.y})`}
              >
                {g.text}
              </text>
            </g>
          ))}
          {render.grainlines.map((g) => (
            <Grainline key={g.id} g={g} head={9 * px} />
          ))}
          {render.notches.map((n) => (
            <Notch key={n.id} n={n} testId="notch" />
          ))}
          {render.buttons.map((b) => (
            <g key={b.id} className="button-mark" data-testid="button-mark" data-mark={b.id}>
              <circle cx={b.at.x} cy={b.at.y} r={b.r} />
              <path
                d={`M${b.at.x - b.r * 0.5} ${b.at.y}H${b.at.x + b.r * 0.5}M${b.at.x} ${b.at.y - b.r * 0.5}V${b.at.y + b.r * 0.5}`}
              />
            </g>
          ))}
          {render.texts.map((t) => (
            <text
              key={t.id}
              className="text-mark"
              data-testid="text-mark"
              data-mark={t.id}
              x={t.at.x}
              y={t.at.y}
              fontSize={12 * px}
              strokeWidth={3 * px}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {t.text}
            </text>
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
      {selectedSegment && (
        <path
          className="seg-selected"
          data-testid="segment-selection"
          data-segment={selectedSegment.id}
          d={selectedSegment.d}
        />
      )}
      {selectable && (
        <g className="segment-hits" data-testid="segment-hits">
          {visibleSegments.map((sg) => (
            <path
              key={sg.id}
              className="seg-hit"
              d={sg.d}
              data-segment={sg.id}
              data-piece={sg.pieceId}
              onPointerDown={(ev) => {
                if (ev.button !== 0) return
                ev.stopPropagation()
                onSelectSegment(sg.id, sg.pieceId ?? null)
              }}
            />
          ))}
        </g>
      )}
      {layers.notes && (
        <g className="layer-notes" data-testid="layer-notes">
          {render.points.map(({ name, at }) => (
            <g key={name}>
              <circle cx={at.x} cy={at.y} r={1.6 * px} data-point={name} />
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
