import { getTable, measurementLabel, type ComplementaryRow, type MeasurementRow } from '../../data'
import { useEditorStore } from '../store/editorStore'
import { formatCm } from './format'

type Row = MeasurementRow | ComplementaryRow

const isDerived = (r: Row): boolean => 'derived' in r && r.derived

function RowGroup({ title, rows, index }: { title: string; rows: readonly Row[]; index: number }) {
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

  return (
    <div className="stack">
      <div>
        <h2 className="card-title">{table.name}</h2>
        <p className="muted small">Talla {sizeLabel} · valores en cm · solo lectura</p>
      </div>
      <table className="measure-table" data-testid="measurements-table">
        <RowGroup title="Tabla original" rows={table.rows} index={index} />
        {table.complementary.length > 0 && (
          <RowGroup title="Complementarias" rows={table.complementary} index={index} />
        )}
      </table>
      <p className="muted small">{table.source}</p>
    </div>
  )
}
