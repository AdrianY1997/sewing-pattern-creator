import { ListOrdered } from 'lucide-react'
import { OUT_OF_V1 } from '../layout/controls'

const STEPS = [
  'Corta las piezas en la tela siguiendo el hilo.',
  'Cose las pinzas y plánchalas.',
  'Une hombros y costados.',
] as const

/** "Instrucciones de confección": out of v1, shown as a disabled placeholder. */
export function InstructionsCard() {
  return (
    <section
      className="card bottom-card instructions-card is-placeholder"
      aria-label="Instrucciones de confección"
      aria-disabled="true"
      title={OUT_OF_V1}
    >
      <h2 className="card-title">
        <ListOrdered size={18} aria-hidden />
        Instrucciones de confección
        <span className="badge">{OUT_OF_V1}</span>
      </h2>
      <ol className="steps">
        {STEPS.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
    </section>
  )
}
