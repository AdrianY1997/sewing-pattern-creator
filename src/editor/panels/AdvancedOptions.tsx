import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { OUT_OF_V1, Select, Switch } from '../layout/controls'
import { useEditorStore } from '../store/editorStore'

const cmChoices = (values: readonly number[]) =>
  values.map((mm) => ({ value: String(mm), label: `${mm / 10} cm` }))

const SEAM_CHOICES = cmChoices([5, 10, 15])
const HEM_CHOICES = cmChoices([10, 20, 30, 40])

/** "Opciones avanzadas": stored in the editor state, applied by F4 operations. */
export function AdvancedOptions() {
  const [open, setOpen] = useState(true)
  const adv = useEditorStore((s) => s.advanced)
  const setAdvanced = useEditorStore((s) => s.setAdvanced)

  return (
    <section className="advanced">
      <button
        type="button"
        className="collapse-head"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        Opciones avanzadas
      </button>
      {open && (
        <div className="advanced-rows">
          <div className="adv-row">
            <Switch
              label="Margen de costura"
              checked={adv.seamAllowance}
              onChange={(v) => setAdvanced({ seamAllowance: v })}
            />
            <span>Margen de costura</span>
            <Select
              small
              label="Ancho del margen de costura"
              value={String(adv.seamAllowanceMm)}
              options={SEAM_CHOICES}
              disabled={!adv.seamAllowance}
              onChange={(v) => setAdvanced({ seamAllowanceMm: Number(v) })}
            />
          </div>
          <div className="adv-row">
            <Switch
              label="Dobladillo"
              checked={adv.hem}
              onChange={(v) => setAdvanced({ hem: v })}
            />
            <span>Dobladillo</span>
            <Select
              small
              label="Ancho del dobladillo"
              value={String(adv.hemMm)}
              options={HEM_CHOICES}
              disabled={!adv.hem}
              onChange={(v) => setAdvanced({ hemMm: Number(v) })}
            />
          </div>
          <div className="adv-row">
            <Switch
              label="Pinzas"
              checked={adv.darts}
              onChange={(v) => setAdvanced({ darts: v })}
            />
            <span>Pinzas</span>
            <span className="adv-value">{adv.darts ? 'Sí' : 'No'}</span>
          </div>
          <div className="adv-row is-placeholder" title={OUT_OF_V1}>
            <Switch label="Corte al bies" checked={adv.bias} disabled />
            <span>Corte al bies</span>
          </div>
        </div>
      )}
    </section>
  )
}
