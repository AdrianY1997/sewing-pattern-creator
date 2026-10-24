import { useMemo, useState } from 'react'
import './App.css'
import { draftWomenBodice, measureWomenBodice } from './blocks'
import { mmToCm } from './core'
import { getMeasurements, getTable, type WomenSize } from './data'
import { DraftPreview } from './editor/DraftPreview'

const TABLE = getTable('co-women-industrial')
const cm = (mm: number) => `${mmToCm(mm).toFixed(1)} cm`

export default function App() {
  const [size, setSize] = useState<WomenSize>('10')
  const [length, setLength] = useState<'hip' | 'waist'>('hip')
  const [showLabels, setShowLabels] = useState(true)
  const [showConstruction, setShowConstruction] = useState(true)

  const draft = useMemo(
    () => draftWomenBodice(getMeasurements('co-women-industrial', size), { length }),
    [size, length],
  )
  const metrics = useMemo(() => measureWomenBodice(draft), [draft])

  return (
    <div className="app">
      <header className="topbar">
        <h1>Sewing Pattern Creator</h1>
        <span className="tagline">Vista previa · Cuerpo base mujer (Fashion Patrón)</span>
      </header>
      <section className="controls" aria-label="Opciones del trazo">
        <label>
          Talla
          <select
            data-testid="size-select"
            value={size}
            onChange={(ev) => setSize(ev.target.value as WomenSize)}
          >
            {TABLE.sizes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Largo
          <select value={length} onChange={(ev) => setLength(ev.target.value as 'hip' | 'waist')}>
            <option value="hip">Hasta la cadera</option>
            <option value="waist">Hasta la cintura</option>
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={showLabels}
            onChange={(ev) => setShowLabels(ev.target.checked)}
          />
          Nombres de puntos
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={showConstruction}
            onChange={(ev) => setShowConstruction(ev.target.checked)}
          />
          Líneas de construcción
        </label>
        <dl className="metrics">
          <div>
            <dt>Sisa espalda</dt>
            <dd data-testid="armhole-back">{cm(metrics.armhole.back)}</dd>
          </div>
          <div>
            <dt>Sisa delantero</dt>
            <dd data-testid="armhole-front">{cm(metrics.armhole.front)}</dd>
          </div>
          <div>
            <dt>Pinza de busto</dt>
            <dd>{cm(metrics.darts.bust)}</dd>
          </div>
          <div>
            <dt>Pinzas de cintura (del./esp.)</dt>
            <dd>
              {cm(metrics.darts.frontWaist)} / {cm(metrics.darts.backWaist)}
            </dd>
          </div>
        </dl>
      </section>
      <main className="canvas">
        <DraftPreview draft={draft} showLabels={showLabels} showConstruction={showConstruction} />
      </main>
    </div>
  )
}
