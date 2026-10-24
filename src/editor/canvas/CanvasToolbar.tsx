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
import { useEditorStore, type Tool } from '../store/editorStore'

interface ToolDef {
  readonly label: string
  readonly icon: LucideIcon
  /** Active tools of F2; the rest arrive with the editing operations (F4). */
  readonly tool?: Tool
  readonly hint?: string
  readonly iconOnly?: boolean
}

const GROUPS: readonly (readonly ToolDef[])[] = [
  [
    { label: 'Seleccionar', icon: MousePointer2, tool: 'select' },
    { label: 'Mover', icon: Move, tool: 'pan', hint: 'Mover la vista (arrastrar)' },
    { label: 'Escalar', icon: Scaling },
    { label: 'Rotar', icon: RotateCw },
    { label: 'Añadir punto', icon: CirclePlus },
    { label: 'Eliminar punto', icon: CircleMinus },
    { label: 'Curva', icon: Spline },
  ],
  [
    { label: 'Recta', icon: Slash },
    { label: 'Simetría', icon: FlipHorizontal2 },
  ],
  [{ label: 'Espejo', icon: FlipVertical2, iconOnly: true }],
]

/** Tool bar on top of the canvas (icon + label). */
export function CanvasToolbar() {
  const active = useEditorStore((s) => s.tool)
  const setTool = useEditorStore((s) => s.setTool)
  return (
    <div className="canvas-toolbar" role="toolbar" aria-label="Herramientas">
      {GROUPS.map((group, gi) => (
        <Fragment key={gi}>
          {gi > 0 && <span className="tool-sep" aria-hidden />}
          {group.map((t) => {
            const Icon = t.icon
            return (
              <button
                key={t.label}
                type="button"
                className="tool"
                aria-label={t.label}
                aria-pressed={t.tool ? active === t.tool : undefined}
                disabled={!t.tool}
                title={t.tool ? (t.hint ?? t.label) : `${t.label} · ${COMING_SOON}`}
                onClick={() => t.tool && setTool(t.tool)}
              >
                <Icon size={19} strokeWidth={1.6} aria-hidden />
                {!t.iconOnly && <span>{t.label}</span>}
              </button>
            )
          })}
        </Fragment>
      ))}
    </div>
  )
}
