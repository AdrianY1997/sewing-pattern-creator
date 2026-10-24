import { Shirt } from 'lucide-react'
import { BLOCKS } from '../../blocks'
import { getTable } from '../../data'
import { Field, OUT_OF_V1, Select } from '../layout/controls'
import { useEditorStore } from '../store/editorStore'
import { useCurrentBlock, useCurrentDraft } from '../store/useDraft'
import { AdvancedOptions } from './AdvancedOptions'
import { PieceThumbnail } from './PieceThumbnail'

const DIFFICULTY = ['Fácil', 'Intermedio', 'Avanzado'] as const

/** Short region name shown next to the size label ("10 (M) · Colombia"). */
const SYSTEM_REGION = { 'co-women-industrial': 'Colombia', 'es-men-easd': 'España' } as const

export function DesignTab() {
  const block = useCurrentBlock()
  const { render } = useCurrentDraft()
  const size = useEditorStore((s) => s.size)
  const options = useEditorStore((s) => s.blockOptions)
  const selected = useEditorStore((s) => s.selectedPieceId)
  const { setBlock, setSize, setBlockOption, selectPiece } = useEditorStore.getState()
  const sizes = getTable(block.system).sizes

  return (
    <div className="stack">
      <Field label="Tipo de prenda">
        <Select
          label="Tipo de prenda"
          testId="block-select"
          icon={<Shirt size={20} strokeWidth={1.5} />}
          value={block.id}
          options={BLOCKS.map((b) => ({ value: b.id, label: b.label }))}
          onChange={setBlock}
        />
      </Field>

      <Field label="Modelo">
        <div className="model-cards">
          {block.views.map((v) => (
            <button
              key={v.id}
              type="button"
              className="model-card"
              aria-pressed={selected === v.pieceId}
              onClick={() => selectPiece(selected === v.pieceId ? null : v.pieceId)}
            >
              <PieceThumbnail render={render} pieceIds={[v.pieceId]} size={64} />
              <span>{v.label}</span>
            </button>
          ))}
        </div>
      </Field>

      <Field label="Talla base">
        <Select
          label="Talla base"
          testId="size-select"
          value={size}
          options={sizes.map((s) => ({
            value: s.id,
            label: `${s.label} · ${SYSTEM_REGION[block.system]}`,
          }))}
          onChange={setSize}
        />
      </Field>

      {block.options.map((o) => (
        <Field key={o.key} label={o.label}>
          <Select
            label={o.label}
            testId={`option-${o.key}`}
            value={options[o.key] ?? o.default}
            options={o.choices}
            onChange={(v) => setBlockOption(o.key, v)}
          />
        </Field>
      ))}

      <Field label="Nivel de dificultad">
        <div className="chip-row is-placeholder" title={OUT_OF_V1}>
          {DIFFICULTY.map((d, i) => (
            <button key={d} type="button" className="pill" aria-pressed={i === 0} disabled>
              {d}
            </button>
          ))}
        </div>
      </Field>

      <AdvancedOptions />
    </div>
  )
}
