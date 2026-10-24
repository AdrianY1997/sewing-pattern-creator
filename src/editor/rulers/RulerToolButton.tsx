import { ChevronDown, Ruler } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { RULER_IDS, getRuler, type RulerId } from '../../core'
import { useEditorStore } from '../store/editorStore'
import { useRulerStore } from './rulerStore'

/** "Reglas" in the canvas tool bar: a menu of the four rulers; choosing one puts it on the canvas. */
export function RulerToolButton() {
  const active = useEditorStore((s) => s.tool === 'ruler')
  const setTool = useEditorStore((s) => s.setTool)
  const rulerId = useRulerStore((s) => s.rulerId)
  const setRuler = useRulerStore((s) => s.setRuler)
  const setMode = useRulerStore((s) => s.setMode)
  // The tool bar scrolls (overflow), so the menu is fixed-positioned under the button.
  const [open, setOpen] = useState<{ left: number; top: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (ev: PointerEvent) => {
      if (!ref.current?.contains(ev.target as Node)) setOpen(null)
    }
    const esc = (ev: KeyboardEvent) => ev.key === 'Escape' && setOpen(null)
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', esc)
    }
  }, [open])

  const choose = (id: RulerId) => {
    setRuler(id)
    setMode('place')
    setTool('ruler')
    setOpen(null)
  }

  return (
    <div className="tool-menu" ref={ref}>
      <button
        type="button"
        className="tool"
        aria-label="Reglas"
        aria-pressed={active}
        aria-haspopup="menu"
        aria-expanded={open !== null}
        title="Reglas de patronaje a tamaño real: escuadra, curvígrafo, cadera, sastre"
        onClick={(ev) => {
          const r = ev.currentTarget.getBoundingClientRect()
          setOpen((o) => (o ? null : { left: r.left, top: r.bottom + 4 }))
        }}
      >
        <Ruler size={19} strokeWidth={1.6} aria-hidden />
        <span>
          Reglas <ChevronDown size={11} aria-hidden />
        </span>
      </button>
      {open && (
        <div className="tool-dropdown" role="menu" aria-label="Reglas" style={open}>
          {RULER_IDS.map((id) => (
            <button
              key={id}
              type="button"
              role="menuitemradio"
              aria-checked={active && id === rulerId}
              onClick={() => choose(id)}
            >
              {getRuler(id).name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
