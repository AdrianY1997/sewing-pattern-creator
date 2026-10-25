import { X } from 'lucide-react'
import { dismissNotice, useNotices } from '../store/notices'

/** Toasts and warnings of the editor (store/notices.ts). */
export function Notices() {
  const notices = useNotices((s) => s.notices)
  if (notices.length === 0) return null
  return (
    <div className="notices" role="status" aria-live="polite" data-testid="notices">
      {notices.map((n) => (
        <div key={n.id} className={`notice is-${n.kind}`} data-kind={n.kind}>
          <span>{n.text}</span>
          <button
            type="button"
            className="icon-btn"
            aria-label="Cerrar aviso"
            onClick={() => dismissNotice(n.id)}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
