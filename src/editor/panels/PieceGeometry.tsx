import { useState } from 'react'
import {
  dartAngleDeg,
  dartLegIds,
  dartWidth,
  grainSegmentIds,
  type Dart,
  type PatternPiece,
} from '../../core'
import { pieceActions, selectedEdgeOf } from '../canvas/pieceActions'
import { useEditorStore } from '../store/editorStore'
import { edgeLabel } from './PieceMarks'

const cm = (mm: number) => `${(mm / 10).toFixed(1)} cm`

/** Spanish name of a dart from its id (derived ids keep the base name). */
export const dartLabel = (d: Dart): string => {
  const base = d.id.replace(/^[^.]*\./, '')
  const moved = /~t\d*$/.test(d.id) ? ' (trasladada)' : ''
  if (/bust/i.test(base)) return `Pinza de busto${moved}`
  if (/waist/i.test(base)) return `Pinza de cintura${moved}`
  return `Pinza ${base.replace(/~.*$/, '')}${moved}`
}

const safe = (f: () => number): number | null => {
  try {
    return f()
  } catch {
    return null
  }
}

/** "Pinzas": the darts of the piece with Cerrar, Trasladar, A frunce and Acortar. */
export function DartsSection({ piece }: { piece: PatternPiece }) {
  const pending = useEditorStore((s) => s.dartTransfer)
  const [shorten, setShorten] = useState('20')
  if (piece.darts.length === 0) return null
  const mm = Number(shorten)
  const shortenValid = shorten !== '' && Number.isFinite(mm) && mm > 0
  const A = pieceActions
  return (
    <section className="piece-section" aria-label="Pinzas" data-testid="darts-section">
      <h4 className="piece-section-title">Pinzas</h4>
      <ul className="dart-list">
        {piece.darts.map((d) => {
          const edge = d.type === 'edge'
          const width = safe(() => dartWidth(piece, d.id))
          const angle = safe(() => dartAngleDeg(piece, d.id))
          const waiting = pending?.pieceId === piece.id && pending.dartId === d.id
          return (
            <li key={d.id} className="dart-item" data-testid="dart-item" data-dart={d.id}>
              <div className="dart-head">
                <strong>{dartLabel(d)}</strong>
                <span className="muted small">
                  {edge ? '' : 'Interna · '}
                  {width !== null && cm(width)}
                  {angle !== null && ` · ${angle.toFixed(1)}°`}
                </span>
              </div>
              <div className="dart-actions" role="group" aria-label={`Acciones de ${dartLabel(d)}`}>
                <button
                  type="button"
                  className="btn btn-small"
                  disabled={!edge}
                  title={
                    edge
                      ? 'Cerrar la pinza: el vuelo se abre en el bajo (o la cintura), nunca en el doblez'
                      : 'Las pinzas internas no se pueden cerrar'
                  }
                  onClick={() => A.closeDart(piece.id, d.id)}
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  className="btn btn-small"
                  disabled={!edge}
                  aria-pressed={waiting}
                  title="Trasladar: después haz clic en el borde de destino"
                  onClick={() =>
                    waiting
                      ? useEditorStore.getState().setDartTransfer(null)
                      : A.startTransfer(piece.id, d.id)
                  }
                >
                  Trasladar
                </button>
                <button
                  type="button"
                  className="btn btn-small"
                  disabled={!edge}
                  title="Convertir la pinza en frunce"
                  onClick={() => A.dartToGather(piece.id, d.id)}
                >
                  A frunce
                </button>
                <button
                  type="button"
                  className="btn btn-small"
                  disabled={!shortenValid}
                  title={`Acortar ${shorten} mm desde el vértice`}
                  onClick={() => shortenValid && A.shortenDart(piece.id, d.id, mm)}
                >
                  Acortar
                </button>
              </div>
            </li>
          )
        })}
      </ul>
      <label className="dart-shorten small">
        Acortar
        <input
          className="mm-input"
          type="number"
          min={1}
          step={1}
          value={shorten}
          aria-label="Milímetros a acortar desde el vértice"
          onChange={(ev) => setShorten(ev.target.value)}
        />
        mm desde el vértice
      </label>
    </section>
  )
}

/** The selected segment of the piece: convert, add a point, split the piece along it. */
export function SegmentSection({ piece }: { piece: PatternPiece }) {
  useEditorStore((s) => s.selectedSegmentId)
  const id = selectedEdgeOf(piece.id)
  const seg = id ? piece.segments[id] : undefined
  if (!id || !seg) return null
  const onOutline = piece.outline.some((r) => r.segment === id)
  const grain = grainSegmentIds(piece).has(id)
  const leg = dartLegIds(piece).has(id)
  if (grain) return null
  const A = pieceActions
  const curve = seg.kind === 'cubic'
  return (
    <section className="piece-section" aria-label="Segmento" data-testid="segment-section">
      <h4 className="piece-section-title">
        {onOutline ? `Borde: ${edgeLabel(piece, id)}` : leg ? 'Pierna de pinza' : 'Línea interna'}
        <span className="mono muted small"> {id.replace(/^[^.]*\./, '')}</span>
      </h4>
      <div className="piece-actions" role="group" aria-label="Acciones del segmento">
        {!leg && (
          <button
            type="button"
            className="btn btn-small"
            onClick={() => A.convertSegment(piece.id, id, curve ? 'line' : 'curve')}
          >
            {curve ? 'Convertir en recta' : 'Convertir en curva'}
          </button>
        )}
        {!leg && (
          <button
            type="button"
            className="btn btn-small"
            title="Añadir punto en el centro del segmento"
            onClick={() => A.addPoint(piece.id, id, 0.5)}
          >
            Añadir punto
          </button>
        )}
        {!onOutline && !leg && (
          <button
            type="button"
            className="btn btn-small btn-primary"
            data-testid="split-piece"
            title="Separar la pieza en dos a lo largo de esta línea (de borde a borde)"
            onClick={() => A.splitPiece(piece.id, id)}
          >
            Separar por la línea
          </button>
        )}
      </div>
      {curve && (
        <p className="muted small">Con la herramienta Curva, arrastra las asas para cambiarla.</p>
      )}
    </section>
  )
}
