import { AlertTriangle } from 'lucide-react'
import type { PatternPiece } from '../../core'
import { getTable } from '../../data'
import { isFoldableEdge, pieceActions, selectedEdgeOf } from '../canvas/pieceActions'
import { useEditorStore } from '../store/editorStore'
import { useCurrentPattern } from '../store/useDraft'

/** Text/number field committed on blur or Enter (one operation per edit, not per keystroke). */
function MetaField({
  label,
  value,
  type = 'text',
  onCommit,
  testId,
}: {
  label: string
  value: string
  type?: 'text' | 'number'
  onCommit: (v: string) => void
  testId: string
}) {
  return (
    <label className="meta-field">
      <span>{label}</span>
      <input
        // Remount when the committed value changes (undo, size change…).
        key={value}
        type={type}
        min={type === 'number' ? 1 : undefined}
        step={type === 'number' ? 1 : undefined}
        defaultValue={value}
        data-testid={testId}
        onBlur={(ev) => ev.target.value !== value && onCommit(ev.target.value)}
        onKeyDown={(ev) => {
          if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur()
          if (ev.key === 'Escape') {
            ;(ev.target as HTMLInputElement).value = value
            ;(ev.target as HTMLInputElement).blur()
          }
        }}
      />
    </label>
  )
}

/** Actions and label fields of the selected extracted piece (Piezas view). */
export function PieceEditor({ piece }: { piece: PatternPiece }) {
  // Re-render when the selected edge changes (mirror on edge / fold).
  useEditorStore((s) => s.selectedSegmentId)
  const edge = selectedEdgeOf(piece.id)
  const A = pieceActions
  const id = piece.id
  return (
    <div className="piece-editor" data-testid="piece-editor" aria-label={`Editar ${piece.name}`}>
      <div className="piece-actions" role="group" aria-label="Acciones de la pieza">
        <button type="button" className="btn btn-small" onClick={() => A.mirror(id, 'vertical')}>
          Espejar ↔
        </button>
        <button type="button" className="btn btn-small" onClick={() => A.mirror(id, 'horizontal')}>
          Espejar ↕
        </button>
        <button
          type="button"
          className="btn btn-small"
          disabled={!edge}
          title={edge ? `Sobre ${edge}` : 'Selecciona una arista de la pieza'}
          onClick={() => edge && A.mirror(id, { segmentId: edge })}
        >
          Espejar en arista
        </button>
        <button
          type="button"
          className="btn btn-small"
          disabled={!isFoldableEdge(id, edge)}
          title={
            edge ? `Doblez en ${edge}` : 'Selecciona una arista recta (centro espalda/delantero)'
          }
          onClick={() => edge && A.cutOnFold(id, edge)}
        >
          Cortar al doblez
        </button>
        <button type="button" className="btn btn-small" onClick={() => A.rotate(id, 90)}>
          Rotar 90°
        </button>
        <button type="button" className="btn btn-small" onClick={() => A.rotate(id, 180)}>
          Rotar 180°
        </button>
        <button type="button" className="btn btn-small" onClick={() => A.duplicate(id)}>
          Duplicar
        </button>
        <button type="button" className="btn btn-small btn-danger" onClick={() => A.remove(id)}>
          Eliminar
        </button>
      </div>
      <div className="meta-fields">
        <MetaField
          label="Nombre"
          value={piece.name}
          testId="meta-name"
          onCommit={(v) => v.trim() && A.setMeta(id, { name: v.trim() })}
        />
        <MetaField
          label="×N"
          type="number"
          value={String(piece.cutCount)}
          testId="meta-count"
          onCommit={(v) => {
            const n = Number(v)
            if (Number.isInteger(n) && n >= 1) A.setMeta(id, { cutCount: n })
          }}
        />
        <MetaField
          label="Tela"
          value={piece.fabric}
          testId="meta-fabric"
          onCommit={(v) => v.trim() && A.setMeta(id, { fabric: v.trim() })}
        />
        <label className="meta-check">
          <input
            type="checkbox"
            checked={piece.onFold}
            onChange={(ev) => A.setMeta(id, { onFold: ev.target.checked })}
          />
          Al doblez
        </label>
      </div>
    </div>
  )
}

/** Non-blocking warning: operations that could not be applied to the current size. */
export function ReplayIssues() {
  const { issues } = useCurrentPattern().result
  const system = useEditorStore((s) => s.system)
  const size = useEditorStore((s) => s.size)
  if (issues.length === 0) return null
  const label = getTable(system).sizes.find((s) => s.id === size)?.label ?? size
  const n = issues.length
  return (
    <section className="replay-issues" role="status" data-testid="replay-issues">
      <div className="replay-issues-head">
        <AlertTriangle size={16} aria-hidden />
        <strong>
          {n === 1
            ? `1 operación no se pudo aplicar en la talla ${label}`
            : `${n} operaciones no se pudieron aplicar en la talla ${label}`}
        </strong>
      </div>
      <ul>
        {issues.map((i, k) => (
          <li key={`${i.opId}:${k}`}>{i.message}</li>
        ))}
      </ul>
    </section>
  )
}
