import { BookmarkPlus, ChevronDown, ChevronRight, FileText, Lightbulb } from 'lucide-react'
import { useState } from 'react'
import { pieceCut } from '../../blocks'
import { getTable } from '../../data'
import { OUT_OF_V1 } from '../layout/controls'
import { useEditorStore } from '../store/editorStore'
import { useCurrentBlock, useCurrentDraft } from '../store/useDraft'
import { PieceThumbnail } from './PieceThumbnail'

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
  const { render } = useCurrentDraft()
  const selected = useEditorStore((s) => s.selectedPieceId)
  const selectPiece = useEditorStore((s) => s.selectPiece)
  return (
    <section className="details-section">
      <h3 className="section-title">Piezas</h3>
      <ul className="piece-list">
        {render.pieces.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              className="piece-item"
              data-testid="piece-item"
              aria-pressed={selected === p.id}
              onClick={() => selectPiece(selected === p.id ? null : p.id)}
            >
              <PieceThumbnail render={render} pieceIds={[p.id]} size={28} />
              <span className="piece-name">{p.name}</span>
              <span className="muted">x{pieceCut(block, p.id).count}</span>
            </button>
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
  const sizeLabel = getTable(block.system).sizes.find((s) => s.id === size)?.label ?? size

  return (
    <aside className="card details-panel" aria-label="Detalles del patrón">
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
      <SizeChips />
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
