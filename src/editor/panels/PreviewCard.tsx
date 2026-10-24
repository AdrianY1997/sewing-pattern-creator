import { useState } from 'react'
import { useCurrentBlock, useCurrentDraft } from '../store/useDraft'
import { PieceThumbnail } from './PieceThumbnail'

/** "Vista previa": the selected view of the block (Frente / Espalda), filled. */
export function PreviewCard() {
  const block = useCurrentBlock()
  const { render } = useCurrentDraft()
  const [viewId, setViewId] = useState(block.views[0]?.id)
  const view = block.views.find((v) => v.id === viewId) ?? block.views[0]

  return (
    <section className="card bottom-card preview-card" aria-label="Vista previa">
      <h2 className="card-title">Vista previa</h2>
      <div className="preview-art">
        {view && <PieceThumbnail render={render} pieceIds={[view.pieceId]} size={120} filled />}
      </div>
      <div className="preview-tabs" role="group" aria-label="Vista">
        {block.views.map((v) => (
          <button
            key={v.id}
            type="button"
            aria-pressed={v.id === view?.id}
            onClick={() => setViewId(v.id)}
          >
            {v.label}
          </button>
        ))}
      </div>
    </section>
  )
}
