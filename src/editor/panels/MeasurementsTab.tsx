import { TriangleAlert } from 'lucide-react'
import {
  findGradingIrregularities,
  getTable,
  measurementLabel,
  type ComplementaryRow,
  type GradingIrregularity,
  type MeasurementRow,
  type SizeDef,
} from '../../data'
import './grading.css'
import { useEditorStore } from '../store/editorStore'
import { formatCm } from './format'

type Row = MeasurementRow | ComplementaryRow

const isDerived = (r: Row): boolean => 'derived' in r && r.derived

const signed = (v: number) => `${v > 0 ? '+' : ''}${Number(v.toFixed(2))}`

/** "Irregularidad de escalado: 48→50 +4 (lo habitual es +2)" */
const irregularityText = (irr: GradingIrregularity, sizes: readonly SizeDef[]): string => {
  const label = (id: string) => sizes.find((z) => z.id === id)?.label ?? id
  const steps = irr.steps
    .map((s) => `${label(s.from)} → ${label(s.to)}: ${signed(s.increment)} cm`)
    .join('; ')
  return `Irregularidad de escalado (lo habitual es ${signed(irr.expectedIncrement)} cm por talla): ${steps}. Se respeta el valor original.`
}

function RowGroup({
  title,
  rows,
  index,
  irregular,
  sizes,
}: {
  title: string
  rows: readonly Row[]
  index: number
  irregular: ReadonlyMap<string, GradingIrregularity>
  sizes: readonly SizeDef[]
}) {
  return (
    <tbody>
      <tr>
        <th colSpan={2} scope="colgroup" className="mt-group">
          {title}
        </th>
      </tr>
      {rows.map((r) => (
        <tr key={r.key} data-key={r.key}>
          <th scope="row">
            {measurementLabel(r)}
            {isDerived(r) && (
              <span className="badge" title={'method' in r ? r.method : undefined}>
                derivado
              </span>
            )}
            {irregular.has(r.key) && (
              <span
                className="grading-warning"
                data-testid="grading-irregularity"
                role="img"
                aria-label={irregularityText(irregular.get(r.key)!, sizes)}
                title={irregularityText(irregular.get(r.key)!, sizes)}
              >
                <TriangleAlert size={12} aria-hidden />
              </span>
            )}
          </th>
          <td>{formatCm(r.valuesCm[index])}</td>
        </tr>
      ))}
    </tbody>
  )
}

/** Read-only measurement table of the current system and size (values in cm, as published). */
export function MeasurementsTab() {
  const system = useEditorStore((s) => s.system)
  const size = useEditorStore((s) => s.size)
  const table = getTable(system)
  const index = table.sizes.findIndex((s) => s.id === size)
  const sizeLabel = table.sizes[index]?.label ?? size
  const irregular = new Map<string, GradingIrregularity>(
    findGradingIrregularities(table).map((i) => [i.key, i]),
  )

  return (
    <div className="stack">
      <div>
        <h2 className="card-title">{table.name}</h2>
        <p className="muted small">Talla {sizeLabel} · valores en cm · solo lectura</p>
      </div>
      <table className="measure-table" data-testid="measurements-table">
        <RowGroup
          title="Tabla original"
          rows={table.rows}
          index={index}
          irregular={irregular}
          sizes={table.sizes}
        />
        {table.complementary.length > 0 && (
          <RowGroup
            title="Complementarias"
            rows={table.complementary}
            index={index}
            irregular={irregular}
            sizes={table.sizes}
          />
        )}
      </table>
      {irregular.size > 0 && (
        <p className="muted small grading-note">
          <TriangleAlert size={12} aria-hidden /> Irregularidad de escalado: el salto entre tallas
          no es constante. Pasa el cursor por el aviso para ver dónde.
        </p>
      )}
      <p className="muted small">{table.source}</p>
    </div>
  )
}
