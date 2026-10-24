import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import {
  edgeAllowance,
  isFoldEdge,
  MAX_ALLOWANCE_MM,
  pieceKey,
  segmentLength,
  stripMeta,
  type MarkAnchor,
  type PatternPiece,
  type PieceMark,
  type SegmentRole,
} from '../../core'
import { pieceActions, selectedEdgeOf } from '../canvas/pieceActions'
import { useEditorStore } from '../store/editorStore'

export const ROLE_LABEL: Readonly<Record<SegmentRole, string>> = {
  hem: 'Bajo',
  centerFront: 'Centro delantero',
  centerBack: 'Centro espalda',
  fold: 'Doblez',
  waist: 'Cintura',
  neckline: 'Escote',
  armhole: 'Sisa',
  side: 'Costado',
  shoulder: 'Hombro',
  inseam: 'Entrepierna',
  outseam: 'Costado',
  crotch: 'Tiro',
  cap: 'Copa',
  underarm: 'Costura de manga',
  dart: 'Pinza',
  seam: 'Costura',
}

const cm = (mm: number) => `${(mm / 10).toFixed(1)} cm`

/** Role label of an edge (its id when it has no role). */
export const edgeLabel = (piece: PatternPiece, segmentId: string): string => {
  const role = piece.segments[segmentId]?.role
  return role ? ROLE_LABEL[role] : segmentId
}

/** Number input committed on blur or Enter (one operation per edit). */
function MmInput({
  value,
  label,
  disabled,
  title,
  testId,
  segment,
  onCommit,
}: {
  value: number
  label: string
  disabled?: boolean
  title?: string
  testId: string
  segment?: string
  onCommit: (mm: number) => void
}) {
  const text = String(Math.round(value * 10) / 10)
  return (
    <input
      // Remount when the committed value changes (undo, size change…).
      key={text}
      className="mm-input"
      type="number"
      min={0}
      max={MAX_ALLOWANCE_MM}
      step={1}
      defaultValue={text}
      aria-label={label}
      title={title}
      disabled={disabled}
      data-testid={testId}
      data-segment={segment}
      onBlur={(ev) => {
        const n = Number(ev.target.value)
        if (ev.target.value === text) return
        if (ev.target.value !== '' && Number.isFinite(n) && n >= 0 && n <= MAX_ALLOWANCE_MM)
          onCommit(n)
        else ev.target.value = text
      }}
      onKeyDown={(ev) => {
        const el = ev.target as HTMLInputElement
        if (ev.key === 'Enter') el.blur()
        if (ev.key === 'Escape') {
          el.value = text
          el.blur()
        }
      }}
    />
  )
}

/** "Márgenes": seam allowance per outline edge, plus one value for every edge. */
export function AllowanceSection({ piece }: { piece: PatternPiece }) {
  const defaultMm = useEditorStore((s) => s.advanced.seamAllowanceMm)
  const selectSegment = useEditorStore((s) => s.selectSegment)
  const selected = useEditorStore((s) => s.selectedSegmentId)
  const [allMm, setAllMm] = useState(String(defaultMm))
  const all = Number(allMm)
  const allValid = allMm !== '' && Number.isFinite(all) && all >= 0 && all <= MAX_ALLOWANCE_MM
  return (
    <section className="piece-section" aria-label="Márgenes" data-testid="allowance-section">
      <h4 className="piece-section-title">Márgenes</h4>
      <table className="allowance-table">
        <thead>
          <tr>
            <th scope="col">Borde</th>
            <th scope="col">Largo</th>
            <th scope="col" title="Margen de costura">
              Margen
            </th>
          </tr>
        </thead>
        <tbody>
          {piece.outline.map(({ segment: id }) => {
            const fold = isFoldEdge(piece, id)
            const key = pieceKey(piece.id, id)
            return (
              <tr key={id} data-segment={id} aria-selected={selected === key}>
                <th scope="row">
                  <button
                    type="button"
                    className="edge-name"
                    title={id}
                    onClick={() => selectSegment(key, piece.id)}
                  >
                    {edgeLabel(piece, id)}
                    <span className="mono muted">{id.replace(/^[^.]*\./, '')}</span>
                  </button>
                </th>
                <td className="num">{cm(segmentLength(stripMeta(piece.segments[id])))}</td>
                <td>
                  <MmInput
                    value={edgeAllowance(piece, id)}
                    label={`Margen de ${edgeLabel(piece, id)} (${id}) en mm`}
                    disabled={fold}
                    title={fold ? 'Doblez: sin margen' : undefined}
                    testId="allowance-input"
                    segment={id}
                    onCommit={(mm) => pieceActions.setAllowance(piece.id, [id], mm)}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="allowance-all">
        <input
          className="mm-input"
          type="number"
          min={0}
          max={MAX_ALLOWANCE_MM}
          step={1}
          value={allMm}
          aria-label="Margen para todos los bordes (mm)"
          onChange={(ev) => setAllMm(ev.target.value)}
        />
        <span className="muted small">mm</span>
        <button
          type="button"
          className="btn btn-small"
          data-testid="allowance-all"
          disabled={!allValid}
          onClick={() => pieceActions.setAllowance(piece.id, 'all', all)}
        >
          Aplicar a todos
        </button>
      </div>
    </section>
  )
}

const markLabel = (piece: PatternPiece, m: PieceMark): string => {
  const seg = typeof m.data?.segment === 'string' ? m.data.segment : null
  switch (m.kind) {
    case 'grainline':
      return `Hilo · ${Math.round(piece.grain.angleDeg)}°`
    case 'notch': {
      const kind = m.data?.count === 2 ? 'Piquete doble' : 'Piquete'
      if (!seg) return `${kind} (bloque)`
      const where =
        typeof m.data?.atRatio === 'number'
          ? `${Math.round(m.data.atRatio * 100)} %`
          : typeof m.data?.atMm === 'number'
            ? cm(m.data.atMm)
            : ''
      return `${kind} · ${edgeLabel(piece, seg)} ${where}`.trim()
    }
    case 'text':
      return `Texto «${String(m.data?.text ?? '')}»`
    case 'button':
      return `Botón ⌀ ${String(m.data?.diameterMm ?? '')} mm`
    case 'bustPoint':
      return 'Punto de busto'
    default:
      return m.kind
  }
}

/** Anchor of new text/button marks: the selected edge, else a centre edge, else the first edge. */
const anchorFor = (piece: PatternPiece, offsetMm: number): MarkAnchor => {
  const selected = selectedEdgeOf(piece.id)
  const centre = piece.outline.find((r) => {
    const role = piece.segments[r.segment]?.role
    return role === 'centerFront' || role === 'centerBack'
  })
  const segmentId =
    (selected && piece.outline.some((r) => r.segment === selected) ? selected : null) ??
    centre?.segment ??
    piece.outline[0].segment
  return { segmentId, ratio: 0.5, offsetMm }
}

/** "Marcas": the marks of the piece with delete buttons, and ways to add notches, text, buttons. */
export function MarksSection({ piece }: { piece: PatternPiece }) {
  // Re-render when the selected edge changes.
  useEditorStore((s) => s.selectedSegmentId)
  const edge = selectedEdgeOf(piece.id)
  const onOutline = !!edge && piece.outline.some((r) => r.segment === edge)
  const [notchMm, setNotchMm] = useState('')
  const [double, setDouble] = useState(false)
  const [text, setText] = useState('')
  const edgeLen = onOutline ? segmentLength(stripMeta(piece.segments[edge])) : 0
  const mm = Number(notchMm)
  const notchValid = onOutline && notchMm !== '' && Number.isFinite(mm) && mm >= 0 && mm <= edgeLen
  const grainChanged =
    piece.grain.angleDeg !== 0 || piece.grain.offset.x !== 0 || piece.grain.offset.y !== 0
  return (
    <section className="piece-section" aria-label="Marcas" data-testid="marks-section">
      <h4 className="piece-section-title">Marcas</h4>
      <ul className="mark-list">
        {piece.marks.map((m) => {
          const label = markLabel(piece, m)
          return (
            <li key={m.id} data-testid="mark-item" data-mark={m.id} data-kind={m.kind}>
              <span>{label}</span>
              {m.kind === 'grainline' ? (
                <button
                  type="button"
                  className="btn btn-small"
                  disabled={!grainChanged}
                  title="Volver al hilo del bloque"
                  onClick={() => pieceActions.resetGrainline(piece.id)}
                >
                  Restablecer
                </button>
              ) : (
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Eliminar ${label}`}
                  data-testid="mark-delete"
                  onClick={() => pieceActions.removeMark(piece.id, m)}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          )
        })}
      </ul>
      <form
        className="mark-add"
        onSubmit={(ev) => {
          ev.preventDefault()
          if (!notchValid || !edge) return
          pieceActions.addNotch(piece.id, edge, { atMm: mm }, double)
          setNotchMm('')
        }}
      >
        <span className="small">
          {onOutline
            ? `Piquete en ${edgeLabel(piece, edge)} a`
            : 'Piquete: selecciona un borde de la pieza'}
        </span>
        <input
          className="mm-input"
          type="number"
          min={0}
          max={Math.floor(edgeLen)}
          step={1}
          value={notchMm}
          disabled={!onOutline}
          aria-label="Distancia del piquete al inicio del borde (mm)"
          data-testid="notch-mm"
          onChange={(ev) => setNotchMm(ev.target.value)}
        />
        <span className="muted small">mm</span>
        <label className="meta-check small">
          <input
            type="checkbox"
            checked={double}
            disabled={!onOutline}
            onChange={(ev) => setDouble(ev.target.checked)}
          />
          Doble
        </label>
        <button type="submit" className="btn btn-small" disabled={!notchValid}>
          Añadir
        </button>
      </form>
      <form
        className="mark-add"
        onSubmit={(ev) => {
          ev.preventDefault()
          if (!text.trim()) return
          pieceActions.addText(piece.id, text.trim(), anchorFor(piece, 40))
          setText('')
        }}
      >
        <input
          className="text-input"
          type="text"
          value={text}
          placeholder="Texto de la pieza"
          aria-label="Texto de la marca"
          onChange={(ev) => setText(ev.target.value)}
        />
        <button type="submit" className="btn btn-small" disabled={!text.trim()}>
          Añadir texto
        </button>
        <button
          type="button"
          className="btn btn-small"
          onClick={() => pieceActions.addButton(piece.id, anchorFor(piece, 15), 12)}
        >
          Añadir botón
        </button>
      </form>
    </section>
  )
}
