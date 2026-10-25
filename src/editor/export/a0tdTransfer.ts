/**
 * The a0-to-domestic transfer lives here, not in the Exportar dialog: closing the dialog must not
 * leave the importer tab waiting. It ends with the ack, an error, or the fallback download, and
 * a toast says how.
 */
import { create } from 'zustand'
import { sendToA0td, type A0tdFile, type A0tdStatus, type SendOptions } from '../../export'
import { pushNotice } from '../store/notices'

export const useA0tdTransfer = create<{ status: A0tdStatus | null }>(() => ({ status: null }))

let stop: (() => void) | null = null

const isFinal = (s: A0tdStatus) => s.state !== 'waiting' && s.state !== 'sent'

const reportFinal = (s: A0tdStatus): void => {
  switch (s.state) {
    case 'ok':
      pushNotice('ok', 'a0-to-domestic recibió el patrón. Continúa en su pestaña.')
      break
    case 'error':
      pushNotice('error', s.message)
      break
    case 'fallback':
      pushNotice(
        'warn',
        `${
          s.reason === 'timeout'
            ? 'a0-to-domestic no respondió a tiempo'
            : s.reason === 'blocked'
              ? 'El navegador bloqueó la ventana emergente'
              : 'La dirección de a0-to-domestic no es válida'
        }: se descargó el PDF. Cárgalo en ${s.url}`,
        12000,
      )
      break
  }
}

/** Forget a finished transfer's status (a reopened dialog starts clean). */
export const clearFinishedTransfer = (): void => {
  const s = useA0tdTransfer.getState().status
  if (s && isFinal(s)) useA0tdTransfer.setState({ status: null })
}

/** Must be called synchronously from the click (window.open). Replaces a running transfer. */
export function startA0tdTransfer(
  opts: Omit<SendOptions, 'onStatus'> & { readonly file: Promise<A0tdFile> },
): void {
  stop?.()
  useA0tdTransfer.setState({ status: null })
  stop = sendToA0td({
    ...opts,
    onStatus: (s) => {
      useA0tdTransfer.setState({ status: s })
      if (isFinal(s)) {
        stop = null
        reportFinal(s)
      }
    },
  })
}
