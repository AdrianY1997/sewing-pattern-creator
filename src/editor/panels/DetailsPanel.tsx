import { BookmarkPlus, ChevronDown, ChevronRight, FileText, Lightbulb } from 'lucide-react'
import { useState } from 'react'
import { pieceCut } from '../../blocks'
import { getTable } from '../../data'
import { OUT_OF_V1 } from '../layout/controls'
import { useEditorStore } from '../store/editorStore'
import { useCurrentBlock, useCurrentDraft, useCurrentPattern } from '../store/useDraft'
import { pieceActions } from '../canvas/pieceActions'
import { PieceEditor, ReplayIssues } from './PieceEditor'
import { PieceThumbnail } from './PieceThumbnail'
import { SelectionInspector } from './SelectionInspector'

const SEX_LABEL = { female: 'Mujer', male: 'Hombre' } as const

function SizeChips() {
  const system = useEditorStore((s) => s.system)
  const size = useEditorStore((s) => s.size)
  const setSize = useEditorStore((s) => s.setSize)
  return (
    <section className="details-section">
      <h3 className="section-title">Tallas disponibles</h3>
      <div className="size-chips" role="group" aria-label="Tallas disponibles">
        {getTable(system).sizes.map((s) => (
          <button
            key={s.id}
            type="button"
            className="chip"
            aria-pressed={s.id === size}
            data-size={s.id}
            onClick={() => setSize(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>
    </section>
  )
}

function PieceList() {
  const block = useCurrentBlock()
  const mode = useEditorStore((s) => s.viewMode)
  const trace = useCurrentDraft().render
  const pattern = useCurrentPattern()
  const selected = useEditorStore((s) => s.selectedPieceId)
  const selectPiece = useEditorStore((s) => s.selectPiece)
  const extracted = pattern.result.pattern.pieces
  const isExtracted = (id: string) => extracted.some((p) => p.id === id)
  const render = mode === 'pieces' ? pattern.render : trace
  const selectedPiece = mode === 'pieces' ? extracted.find((p) => p.id === selected) : undefined

  return (
    <section className="details-section">
      <div className="section-head">
        <h3 className="section-title">Piezas</h3>
        <div className="section-actions">
          <button
            type="button"
            className="btn btn-small"
            data-testid="separate-all"
            onClick={() => pieceActions.separateAll()}
          >
            Separar todas
          </button>
          {mode === 'pieces' && extracted.length > 1 && (
            <button
              type="button"
              className="btn btn-small"
              onClick={() => pieceActions.autoLayout()}
            >
              Organizar
            </button>
          )}
        </div>
      </div>
      {mode === 'pieces' && extracted.length === 0 && (
        <p className="muted small">Aún no hay piezas separadas.</p>
      )}
      <ul className="piece-list" data-view={mode}>
        {render.pieces.map((p) => (
          <li key={p.id}>
            <div className="piece-row">
              <button
                type="button"
                className="piece-item"
                data-testid="piece-item"
                data-piece={p.id}
                aria-pressed={selected === p.id}
                onClick={() => selectPiece(selected === p.id ? null : p.id)}
              >
                <PieceThumbnail render={render} pieceIds={[p.id]} size={28} />
                <span className="piece-name">{p.name}</span>
                <span className="muted">x{p.label?.count ?? pieceCut(block, p.id).count}</span>
              </button>
              {mode === 'trace' && (
                <button
                  type="button"
                  className="btn btn-small piece-separate"
                  data-testid="piece-separate"
                  disabled={isExtracted(p.id)}
                  title={
                    isExtracted(p.id) ? 'Ya está separada' : 'Separar como pieza independiente'
                  }
                  onClick={() => pieceActions.separate(p.id)}
                >
                  {isExtracted(p.id) ? 'Separada' : 'Separar'}
                </button>
              )}
            </div>
            {selectedPiece?.id === p.id && <PieceEditor piece={selectedPiece} />}
          </li>
        ))}
      </ul>
    </section>
  )
}

function NotesSection() {
  const [open, setOpen] = useState(true)
  const notes = useEditorStore((s) => s.notes)
  const setNotes = useEditorStore((s) => s.setNotes)
  return (
    <section className="details-section">
      <button
        type="button"
        className="collapse-head"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        Notas
      </button>
      {open && (
        <textarea
          className="notes"
          aria-label="Notas del patrón"
          placeholder="Agregar notas sobre el patrón…"
          rows={2}
          value={notes}
          onChange={(ev) => setNotes(ev.target.value)}
        />
      )}
    </section>
  )
}

/** Right panel: pattern details, sizes, pieces and notes. */
export function DetailsPanel() {
  const block = useCurrentBlock()
  const { render } = useCurrentDraft()
  const title = useEditorStore((s) => s.title)
  const size = useEditorStore((s) => s.size)
  const drawer = useEditorStore((s) => s.drawer)
  const sizeLabel = getTable(block.system).sizes.find((s) => s.id === size)?.label ?? size

  return (
    <aside
      className="card details-panel drawer drawer-right"
      aria-label="Detalles del patrón"
      data-open={drawer === 'right' || undefined}
    >
      <h2 className="card-title">
        <FileText size={18} aria-hidden />
        Detalles del patrón
      </h2>
      <div className="summary">
        <div className="summary-thumb">
          <PieceThumbnail render={render} size={84} />
        </div>
        <div>
          <div className="summary-title">{title || block.label}</div>
          <div className="muted small">
            {SEX_LABEL[block.sex]} | Talla {sizeLabel}
          </div>
        </div>
      </div>
      <SelectionInspector />
      <SizeChips />
      <ReplayIssues />
      <PieceList />
      <NotesSection />
      <button type="button" className="btn btn-soft" disabled title={OUT_OF_V1}>
        <BookmarkPlus size={16} />
        Guardar como plantilla
      </button>
      <div className="tip is-placeholder" title={OUT_OF_V1}>
        <Lightbulb size={16} aria-hidden />
        <div>
          <strong>Sugerencias</strong>
          <p className="muted small">Consejos de ajuste para el patrón actual.</p>
        </div>
      </div>
    </aside>
  )
}
