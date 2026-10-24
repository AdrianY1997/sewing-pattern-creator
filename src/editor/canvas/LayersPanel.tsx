import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { useEditorStore } from '../store/editorStore'
import { LAYERS } from '../store/layers'

/** Floating "Capas" panel: one checkbox per canvas layer. */
export function LayersPanel() {
  const [open, setOpen] = useState(true)
  const layers = useEditorStore((s) => s.layers)
  const setLayer = useEditorStore((s) => s.setLayer)

  return (
    <section className="float-panel layers-panel" aria-label="Capas">
      <button
        type="button"
        className="layers-head"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        Capas
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {open && (
        <ul>
          {LAYERS.map((l) => (
            <li key={l.id}>
              <label>
                <input
                  type="checkbox"
                  checked={layers[l.id]}
                  data-testid={`layer-toggle-${l.id}`}
                  onChange={(ev) => setLayer(l.id, ev.target.checked)}
                />
                <span
                  className={`swatch swatch-${l.swatch}`}
                  style={{ color: l.color }}
                  aria-hidden
                />
                {l.label}
              </label>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
