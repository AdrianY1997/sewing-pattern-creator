import { useEffect, useRef } from 'react'
import { useEditorStore } from '../store/editorStore'
import { currentPatternPieces, isFoldableEdge, pieceActions, selectedEdgeOf } from './pieceActions'

export interface ContextMenuState {
  /** Viewport-relative position (px). */
  readonly x: number
  readonly y: number
  readonly pieceId: string
}

interface Item {
  readonly label: string
  readonly run: () => void
  readonly disabled?: boolean
}

/** Right-click menu of a piece (both views). Closes on Escape, outside click or after an action. */
export function PieceContextMenu({
  menu,
  onClose,
}: {
  menu: ContextMenuState
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const mode = useEditorStore((s) => s.viewMode)
  // Re-render when the selection (edge) changes.
  useEditorStore((s) => s.selectedSegmentId)

  useEffect(() => {
    const onDown = (ev: PointerEvent) => {
      if (!ref.current?.contains(ev.target as Node)) onClose()
    }
    const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && onClose()
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const { pieceId } = menu
  const extracted = currentPatternPieces().some((p) => p.id === pieceId)
  const edge = selectedEdgeOf(pieceId)
  const A = pieceActions
  const groups: Item[][] =
    mode === 'trace'
      ? [
          [
            { label: 'Separar', run: () => A.separate(pieceId), disabled: extracted },
            { label: 'Separar todas', run: () => A.separateAll() },
          ],
        ]
      : [
          [
            { label: 'Espejar vertical', run: () => A.mirror(pieceId, 'vertical') },
            { label: 'Espejar horizontal', run: () => A.mirror(pieceId, 'horizontal') },
            {
              label: 'Espejar sobre la arista',
              run: () => edge && A.mirror(pieceId, { segmentId: edge }),
              disabled: !edge,
            },
            {
              label: 'Cortar al doblez',
              run: () => edge && A.cutOnFold(pieceId, edge),
              disabled: !isFoldableEdge(pieceId, edge),
            },
          ],
          [
            { label: 'Rotar 90°', run: () => A.rotate(pieceId, 90) },
            { label: 'Rotar 180°', run: () => A.rotate(pieceId, 180) },
            { label: 'Duplicar', run: () => A.duplicate(pieceId) },
            { label: 'Eliminar', run: () => A.remove(pieceId) },
          ],
          [
            { label: 'Separar todas', run: () => A.separateAll() },
            { label: 'Organizar piezas', run: () => A.autoLayout() },
          ],
        ]

  return (
    <div
      ref={ref}
      className="context-menu"
      role="menu"
      aria-label="Acciones de la pieza"
      data-testid="piece-menu"
      style={{ left: menu.x, top: menu.y }}
      onContextMenu={(ev) => ev.preventDefault()}
    >
      {groups.map((g, gi) => (
        <div key={gi} className="context-group">
          {g.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              disabled={it.disabled}
              onClick={() => {
                it.run()
                onClose()
              }}
            >
              {it.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
