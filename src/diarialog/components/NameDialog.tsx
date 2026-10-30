import { useEffect, useState } from 'react'
import { UserRound } from 'lucide-react'

interface Props {
  open: boolean
  /** Nome já salvo (string vazia = ainda não perguntou). */
  currentName: string
  /** Grava o nome — string vazia remove o nome salvo. */
  onSave: (name: string) => void
  /** Fecha sem salvar (pular). */
  onClose: () => void
}

/**
 * Pede o nome do diarista uma única vez — depois ele fica guardado no
 * aparelho (localStorage) e a saudação "Olá, Fulano" aparece no topo.
 */
export function NameDialog({ open, currentName, onSave, onClose }: Props) {
  const [value, setValue] = useState(currentName)

  // ao abrir, o campo mostra o nome salvo (ou vazio, na primeira vez)
  useEffect(() => {
    if (open) setValue(currentName)
  }, [open, currentName])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const firstTime = currentName.trim().length === 0
  const clean = value.replace(/\s+/g, ' ').trim()
  const canSave = firstTime ? clean.length > 0 : clean !== currentName.trim()

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!canSave) return
    onSave(clean)
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/45 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="name-dialog-title"
        className="card-gradient relative w-full max-w-md animate-fade-up rounded-2xl p-6 shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-lime-100 text-lime-700">
            <UserRound size={20} />
          </span>
          <div className="min-w-0">
            <h3 id="name-dialog-title" className="font-display text-lg font-bold text-slate-900">
              {firstTime ? 'Como podemos te chamar?' : 'Seu nome'}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              {firstTime
                ? 'É só uma vez. Fica guardado no seu aparelho — junto com os turnos — e a gente te chama pelo nome aqui em cima.'
                : 'Como o DiáriaLog te chama por aqui. Troque quando quiser.'}
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="mt-5">
          <label className="label" htmlFor="dl-name">
            Seu nome
          </label>
          <input
            id="dl-name"
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={40}
            placeholder="Ex.: Pedro"
            autoComplete="given-name"
            autoFocus
          />
          <p className="mt-1.5 text-[11px] text-slate-500">
            Só o primeiro nome aparece na saudação. Nenhum dado sai do seu aparelho.
          </p>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="btn-ghost" onClick={onClose}>
              {firstTime ? 'Agora não' : 'Cancelar'}
            </button>
            <button type="submit" className="btn-primary" disabled={!canSave}>
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
