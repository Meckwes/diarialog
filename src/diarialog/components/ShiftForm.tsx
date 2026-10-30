import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { CalendarDays, CalendarPlus, Clock, Coins, FileDown, Sparkles } from 'lucide-react'
import type { Shift, StoreName } from '../types'
import { STORES } from '../types'
import { durationHours, money, ymd } from '../dates'
import { shiftTitle } from '../calendar'
import {
  EMPTY_MONEY,
  EMPTY_TIME,
  deleteMoneyField,
  deleteTimeField,
  insertMoneyField,
  insertTimeField,
  insertedText,
  isValidTime,
  moneyFieldFromValue,
  moneyFieldText,
  moneyFieldValue,
  timeFieldFromText,
  timeFieldText,
  type MoneyField,
  type TimeField,
} from '../compute'

interface Props {
  editing: Shift | null
  onSubmit: (data: Omit<Shift, 'id' | 'createdAt'>) => void
  onCancelEdit: () => void
}

/** Horários padrão do formulário: 08:00 na entrada, 16:00 na saída. */
const DEFAULT_START: TimeField = { hours: '08', tens: '', units: '' }
const DEFAULT_END: TimeField = { hours: '16', tens: '', units: '' }

const emptyForm = (): Omit<Shift, 'id' | 'createdAt'> => ({
  date: ymd(new Date()),
  store: 'Shopee' as StoreName,
  start: '08:00',
  end: '16:00',
  value: 0,
  note: '',
})

/**
 * Abre o calendário nativo ao clicar no campo de data.
 * `showPicker()` só roda em gesto do usuário (por isso fica no onClick);
 * em navegador sem suporte, o campo apenas recebe foco.
 */
function openCalendar(event: { currentTarget: HTMLInputElement }) {
  const input = event.currentTarget as HTMLInputElement & { showPicker?: () => void }
  try {
    input.showPicker?.()
  } catch {
    input.focus()
  }
}

export function ShiftForm({ editing, onSubmit, onCancelEdit }: Props) {
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  /** Campos de horário — o app completa os minutos sozinho ("08" → "08:00"). */
  const [timeStart, setTimeStart] = useState<TimeField>(DEFAULT_START)
  const [timeEnd, setTimeEnd] = useState<TimeField>(DEFAULT_END)
  /** Campo de valor — o app completa os centavos sozinho ("100" → "100,00"). */
  const [moneyField, setMoneyField] = useState<MoneyField>(EMPTY_MONEY)
  /** Seleção do texto antes da edição — precisa para saber o que foi digitado. */
  const selRef = useRef({ start: 0, end: 0 })
  /** Campos que a pessoa ainda não digitou — o 1º que ela digitar troca o valor antigo. */
  const typedRef = useRef({ start: false, end: false, value: false })
  /** Onde o cursor deve ficar depois da edição. */
  const caretRef = useRef<number | null>(null)
  const caretTargetRef = useRef<HTMLInputElement | null>(null)
  const moneyInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      const { id: _id, createdAt: _createdAt, ...rest } = editing
      setForm({ ...rest, note: rest.note ?? '' })
      setTimeStart(timeFieldFromText(rest.start))
      setTimeEnd(timeFieldFromText(rest.end))
      setMoneyField(moneyFieldFromValue(rest.value ?? 0))
      typedRef.current = { start: false, end: false, value: false }
      setError('')
    }
  }, [editing])

  const hours = useMemo(() => durationHours(form.start, form.end), [form.start, form.end])
  const overnight = form.end <= form.start
  const preview = useMemo(() => shiftTitle({ ...form, id: 'preview', createdAt: 0 }), [form])

  /** Depois que o React pinta o novo texto, o cursor volta para onde deve ficar. */
  useLayoutEffect(() => {
    const el = caretTargetRef.current
    const pos = caretRef.current
    if (!el || pos === null) return
    caretRef.current = null
    const max = el.value.length
    const at = Math.max(0, Math.min(pos, max))
    el.setSelectionRange(at, at)
  })

  /** Guarda a seleção antes da digitação (tecla ou toque). */
  function captureSelection(event: { currentTarget: HTMLInputElement }) {
    const el = event.currentTarget
    selRef.current = { start: el.selectionStart ?? 0, end: el.selectionEnd ?? 0 }
  }

  function handleTimeChange(
    field: 'start' | 'end',
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const { start, end } = selRef.current
    const prev = field === 'start' ? timeStart : timeEnd
    const inserted = insertedText(timeFieldText(prev), event.target.value, start, end)
    // 1ª digitação no campo → o horário inteiro é reescrito ("08" → "08:00")
    const replacedAll = !typedRef.current[field]
    typedRef.current[field] = true
    const result = replacedAll
      ? insertTimeField(EMPTY_TIME, inserted, 0, 0)
      : insertTimeField(prev, event.target.value, start, end)
    applyTime(field, result, event.currentTarget)
  }

  /** Apagar é tratado aqui: os minutos automáticos não existem no texto. */
  function handleTimeKeyDown(
    field: 'start' | 'end',
    event: React.KeyboardEvent<HTMLInputElement>,
  ) {
    const el = event.currentTarget
    const start = el.selectionStart ?? 0
    const end = el.selectionEnd ?? 0
    selRef.current = { start, end }
    if (event.key !== 'Backspace' && event.key !== 'Delete') return
    event.preventDefault()
    const prev = field === 'start' ? timeStart : timeEnd
    applyTime(field, deleteTimeField(prev, start, end, event.key === 'Backspace'), el)
  }

  function applyTime(
    field: 'start' | 'end',
    result: { field: TimeField; caret: number },
    el: HTMLInputElement,
  ) {
    if (field === 'start') setTimeStart(result.field)
    else setTimeEnd(result.field)
    setForm((f) => ({ ...f, [field]: timeFieldText(result.field) }))
    caretTargetRef.current = el
    caretRef.current = result.caret
  }

  function handleMoneyChange(event: React.ChangeEvent<HTMLInputElement>) {
    const { start, end } = selRef.current
    let result
    if (!typedRef.current.value) {
      // 1ª digitação no campo → o valor inteiro é reescrito ("100" → "100,00")
      const inserted = insertedText(moneyFieldText(moneyField), event.target.value, start, end)
      result = insertMoneyField(EMPTY_MONEY, inserted, 0, 0)
    } else {
      result = insertMoneyField(moneyField, event.target.value, start, end)
    }
    typedRef.current.value = true
    applyMoney(result)
  }

  /** Apagar é tratado aqui: os centavos automáticos não existem no texto. */
  function handleMoneyKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    const el = event.currentTarget
    const start = el.selectionStart ?? 0
    const end = el.selectionEnd ?? 0
    selRef.current = { start, end }
    if (event.key !== 'Backspace' && event.key !== 'Delete') return
    event.preventDefault()
    applyMoney(deleteMoneyField(moneyField, start, end, event.key === 'Backspace'))
  }

  function applyMoney(result: { field: MoneyField; caret: number }) {
    setMoneyField(result.field)
    setForm((f) => ({ ...f, value: moneyFieldValue(result.field) }))
    caretTargetRef.current = moneyInputRef.current
    caretRef.current = result.caret
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!form.date) return setError('Escolha o dia trabalhado.')
    if (!isValidTime(form.start) || !isValidTime(form.end)) {
      return setError('Informe entrada e saída no formato HH:MM (ex.: 23:00).')
    }
    if (!(form.value > 0)) return setError('Informe o valor a receber (maior que zero).')
    onSubmit({ ...form, value: Number(form.value), note: form.note?.trim() })
    setForm(emptyForm())
    setTimeStart(DEFAULT_START)
    setTimeEnd(DEFAULT_END)
    setMoneyField(EMPTY_MONEY)
    typedRef.current = { start: false, end: false, value: false }
    setError('')
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="label" htmlFor="dl-date">
            Dia trabalhado
          </label>
          <input
            id="dl-date"
            type="date"
            value={form.date}
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            onClick={openCalendar}
            className="w-full"
          />
          <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
            <CalendarDays size={11} /> Clique no campo para abrir o calendário.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="dl-store">
            Loja / cliente
          </label>
          <select
            id="dl-store"
            value={form.store}
            onChange={(e) => setForm((f) => ({ ...f, store: e.target.value }))}
            className="w-full"
          >
            {STORES.map((store) => (
              <option key={store} value={store}>
                {store}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="dl-value">
            Valor a receber
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs text-slate-500">
              R$
            </span>
            <input
              id="dl-value"
              ref={moneyInputRef}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={moneyFieldText(moneyField)}
              placeholder="0,00"
              onChange={handleMoneyChange}
              onKeyDown={handleMoneyKeyDown}
              onMouseUp={captureSelection}
              className="w-full pl-9"
            />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="dl-start">
            Entrada
          </label>
          <input
            id="dl-start"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={timeFieldText(timeStart)}
            onChange={(e) => handleTimeChange('start', e)}
            onKeyDown={(e) => handleTimeKeyDown('start', e)}
            onMouseUp={captureSelection}
            className="w-full"
          />
        </div>

        <div>
          <label className="label" htmlFor="dl-end">
            Saída
          </label>
          <input
            id="dl-end"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={timeFieldText(timeEnd)}
            onChange={(e) => handleTimeChange('end', e)}
            onKeyDown={(e) => handleTimeKeyDown('end', e)}
            onMouseUp={captureSelection}
            className="w-full"
          />
        </div>

        <p className="col-span-2 -mt-1 flex items-center gap-1 text-[11px] text-slate-500">
          <Clock size={11} /> Digite só números: 08 vira 08:00. No valor, 100 vira 100,00.
        </p>

        <div className="col-span-2">
          <label className="label" htmlFor="dl-note">
            Observação (opcional)
          </label>
          <input
            id="dl-note"
            type="text"
            value={form.note ?? ''}
            placeholder="ex.: CD noturno, avaliação da semana..."
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            className="w-full"
          />
        </div>
      </div>

      <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-br from-lime-50/70 via-white to-white p-3">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-lime-400 via-azure-400 to-transparent" />
        <p className="mb-1 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">
          <CalendarPlus size={12} /> como fica no seu calendário
        </p>
        <p className="text-sm font-medium text-slate-800">{preview}</p>
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
          <Clock size={12} />
          {hours}h de turno {overnight && <span className="text-ember-600">· vira a meia-noite</span>}
          {!overnight && hours === 0 && <span className="text-ember-600">· revise os horários</span>}
        </p>
      </div>

      {error && (
        <p className="rounded-lg border border-ember/30 bg-ember/10 px-3 py-2 text-xs text-ember-600">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="btn-primary">
          <Sparkles size={15} />
          {editing ? 'Salvar alterações' : 'Registrar turno'}
        </button>
        {editing && (
          <button type="button" className="btn-ghost" onClick={onCancelEdit}>
            Cancelar
          </button>
        )}
        <span className="ml-auto flex items-center gap-1.5 font-mono text-[11px] text-slate-500">
          <Coins size={12} className="text-lime-700" />
          {money(form.value || 0)}
        </span>
      </div>

      <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
        <FileDown size={12} /> Depois de salvar, dá pra mandar o turno direto pro Google Agenda.
      </p>
    </form>
  )
}
