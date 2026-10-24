import { ArrowRight, Pencil, User } from 'lucide-react'
import { getTable, type MeasurementKey } from '../../data'
import { COMING_SOON, Select } from '../layout/controls'
import { useEditorStore } from '../store/editorStore'
import { formatCm } from './format'

/** Measurements summarised in the card (the first ones present in the table). */
const SUMMARY_KEYS: readonly MeasurementKey[] = [
  'bust',
  'chest',
  'waist',
  'hip',
  'backWaistLength',
  'waistLength',
  'shoulderLength',
]
const SUMMARY_COUNT = 5

/** "Medidas del usuario": profile = the current table and size; full list in the Medidas tab. */
export function UserMeasurementsCard() {
  const system = useEditorStore((s) => s.system)
  const size = useEditorStore((s) => s.size)
  const setLeftTab = useEditorStore((s) => s.setLeftTab)
  const table = getTable(system)
  const index = table.sizes.findIndex((s) => s.id === size)
  const sizeLabel = table.sizes[index]?.label ?? size
  const rows = SUMMARY_KEYS.flatMap((k) => table.rows.filter((r) => r.key === k)).slice(
    0,
    SUMMARY_COUNT,
  )

  return (
    <section className="card bottom-card user-measures" aria-label="Medidas del usuario">
      <div className="card-head">
        <h2 className="card-title">
          <User size={18} aria-hidden />
          Medidas del usuario
        </h2>
      </div>
      <div className="profile-row">
        <span className="muted small">Perfil:</span>
        <Select
          small
          label="Perfil de medidas"
          value="table"
          options={[{ value: 'table', label: `Tabla · talla ${sizeLabel}` }]}
        />
        <button type="button" className="btn btn-small" disabled title={COMING_SOON}>
          <Pencil size={14} />
          Editar
        </button>
      </div>
      <dl className="measure-list">
        {rows.map((r) => (
          <div key={r.key}>
            <dt>{r.label}</dt>
            <dd>{formatCm(r.valuesCm[index])}</dd>
          </div>
        ))}
      </dl>
      <button type="button" className="link-btn" onClick={() => setLeftTab('measurements')}>
        Ver todas las medidas
        <ArrowRight size={14} />
      </button>
    </section>
  )
}
