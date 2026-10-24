import {
  CircleMinus,
  CirclePlus,
  FlipHorizontal2,
  FlipVertical2,
  MousePointer2,
  Move,
  RotateCw,
  Scaling,
  Slash,
  Spline,
  type LucideIcon,
} from 'lucide-react'
import { Fragment } from 'react'
import { COMING_SOON } from '../layout/controls'
import { useEditorStore, type Tool, type ViewMode } from '../store/editorStore'
import { useCurrentPattern } from '../store/useDraft'
import { pieceActions, selectedEdgeOf } from './pieceActions'

type Action = 'mirrorV' | 'mirrorH'

interface ToolDef {
  readonly label: string
  readonly icon: LucideIcon
  /** A mode tool (stays pressed)… */
  readonly tool?: Tool
  /** …or a one-shot action on the selected piece. */
  readonly action?: Action
  readonly hint?: string
  readonly iconOnly?: boolean
}

const GROUPS: readonly (readonly ToolDef[])[] = [
  [
    { label: 'Seleccionar', icon: MousePointer2, tool: 'select' },
    {
      label: 'Mover',
      icon: Move,
      tool: 'move',
      hint: 'Mover piezas separadas (arrastrar); en el trazo, mover la vista',
    },
    { label: 'Escalar', icon: Scaling },
    {
      label: 'Rotar',
      icon: RotateCw,
      tool: 'rotate',
      hint: 'Rotar piezas separadas (arrastrar; Mayús: pasos de 15°)',
    },
    { label: 'Añadir punto', icon: CirclePlus },
    { label: 'Eliminar punto', icon: CircleMinus },
    { label: 'Curva', icon: Spline },
  ],
  [
    { label: 'Recta', icon: Slash },
    {
      label: 'Simetría',
      icon: FlipHorizontal2,
      action: 'mirrorV',
      hint: 'Espejar la pieza seleccionada (eje vertical, o sobre la arista seleccionada)',
    },
  ],
  [
    {
      label: 'Espejo',
      icon: FlipVertical2,
      iconOnly: true,
      action: 'mirrorH',
      hint: 'Espejar la pieza seleccionada (eje horizontal)',
    },
  ],
]

const VIEWS: readonly { readonly mode: ViewMode; readonly label: string }[] = [
  { mode: 'trace', label: 'Trazo' },
  { mode: 'pieces', label: 'Piezas' },
]

function runAction(action: Action, pieceId: string) {
  if (action === 'mirrorH') return pieceActions.mirror(pieceId, 'horizontal')
  const edge = selectedEdgeOf(pieceId)
  pieceActions.mirror(pieceId, edge ? { segmentId: edge } : 'vertical')
}

/** Tool bar on top of the canvas (icon + label) with the Trazo / Piezas view switch. */
export function CanvasToolbar() {
  const active = useEditorStore((s) => s.tool)
  const setTool = useEditorStore((s) => s.setTool)
  const mode = useEditorStore((s) => s.viewMode)
  const setViewMode = useEditorStore((s) => s.setViewMode)
  const selected = useEditorStore((s) => s.selectedPieceId)
  const pieces = useCurrentPattern().result.pattern.pieces
  const target = mode === 'pieces' && pieces.some((p) => p.id === selected) ? selected : null

  return (
    <div className="canvas-toolbar" role="toolbar" aria-label="Herramientas">
      {GROUPS.map((group, gi) => (
        <Fragment key={gi}>
          {gi > 0 && <span className="tool-sep" aria-hidden />}
          {group.map((t) => {
            const Icon = t.icon
            const enabled = t.tool !== undefined || (t.action !== undefined && target !== null)
            const title = t.tool
              ? (t.hint ?? t.label)
              : t.action
                ? target
                  ? t.hint
                  : `${t.label}: selecciona una pieza separada (vista Piezas)`
                : `${t.label} · ${COMING_SOON}`
            return (
              <button
                key={t.label}
                type="button"
                className="tool"
                aria-label={t.label}
                aria-pressed={t.tool ? active === t.tool : undefined}
                disabled={!enabled}
                title={title}
                onClick={() => {
                  if (t.tool) setTool(t.tool)
                  else if (t.action && target) runAction(t.action, target)
                }}
              >
                <Icon size={19} strokeWidth={1.6} aria-hidden />
                {!t.iconOnly && <span>{t.label}</span>}
              </button>
            )
          })}
        </Fragment>
      ))}
      <div className="view-switch" role="group" aria-label="Vista del lienzo">
        {VIEWS.map((v) => (
          <button
            key={v.mode}
            type="button"
            aria-pressed={mode === v.mode}
            onClick={() => setViewMode(v.mode)}
          >
            {v.label}
          </button>
        ))}
      </div>
    </div>
  )
}
