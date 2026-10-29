import { useEffect } from 'react'
import { TriangleAlert } from 'lucide-react'

interface Props {
  open: boolean
  title: string
  message: string
  /** Detalhe quantitativo (ex.: "14 turno(s) · 3 mês(es) de histórico"). */
  details?: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Aviso de confirmação no estilo do app (o `window.confirm` nativo não tem
 * botão SIM/NÃO nem combina com o tema).
 */
export function ConfirmDialog({
  open,
  title,
  message,
  details,
  confirmLabel = 'SIM, limpar tudo',
  cancelLabel = 'NÃO, cancelar',
  onConfirm,
  onCancel,
}: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/45 backdrop-blur-sm" onClick={onCancel} />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="card-gradient relative w-full max-w-md animate-fade-up rounded-2xl p-6 shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
            <TriangleAlert size={20} />
          </span>
          <div className="min-w-0">
            <h3 id="confirm-dialog-title" className="font-display text-lg font-bold text-slate-900">
              {title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{message}</p>
            {details && (
              <p className="mt-3 rounded-xl border border-red-100 bg-red-50/70 px-3 py-2 font-mono text-[11px] text-red-700">
                {details}
              </p>
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn-ghost" onClick={onCancel} autoFocus>
            {cancelLabel}
          </button>
          <button
            type="button"
            className="btn bg-gradient-to-br from-red-500 to-red-600 text-white shadow-[0_12px_28px_-14px_rgba(220,38,38,.9)] hover:from-red-600 hover:to-red-700"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
