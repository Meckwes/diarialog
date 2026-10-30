import type { Deposit, DiaryState, Shift } from './types'
import {
  durationHours,
  fmtRange,
  money,
  pad2,
  paymentWindowFor,
  weekInfoOf,
  type PaymentWindow,
  type WeekInfo,
} from './dates'

export type PayStatus = 'previsto' | 'aberto' | 'pago' | 'atrasado'

export const STATUS_META: Record<PayStatus, { label: string; tone: string; hint: string }> = {
  previsto: { label: 'Previsto', tone: 'text-slate-600 bg-slate-100 border-slate-200', hint: 'Repasse ainda não abriu' },
  aberto: { label: 'Em trânsito', tone: 'text-azure-600 bg-gradient-to-r from-azure-100 to-blue-50 border-azure-200', hint: 'Janela de repasse aberta' },
  pago: { label: 'Pago', tone: 'text-lime-700 bg-gradient-to-r from-lime-200 to-lime-50 border-lime-300', hint: 'Valor conferido na conta' },
  atrasado: { label: 'Atrasado', tone: 'text-ember-600 bg-gradient-to-r from-ember-100 to-orange-50 border-ember-200', hint: 'Passou de sexta 22:00' },
}

export interface WeekSummary {
  info: WeekInfo
  key: string
  label: string
  range: string
  start: Date
  end: Date
  shifts: Shift[]
  total: number
  hours: number
  days: number
  status: PayStatus
  window: PaymentWindow
  deposit: Deposit | null
  /** depositado − previsto (null = ainda sem conferência) */
  diff: number | null
  isCurrent: boolean
  isFuture: boolean
}

export function statusFor(week: WeekInfo, deposit: Deposit | null, now: Date, startDow: 1 | 2 = 2): PayStatus {
  if (deposit) return 'pago'
  const window = paymentWindowFor(week, startDow)
  if (now.getTime() < window.start.getTime()) return 'previsto'
  if (now.getTime() <= window.end.getTime()) return 'aberto'
  return 'atrasado'
}

export function buildWeeks(state: DiaryState, now: Date = new Date()): WeekSummary[] {
  const startDow = state.settings?.startDow ?? 2
  const groups = new Map<string, Shift[]>()
  const deposits = new Map<string, Deposit>()

  for (const shift of state.shifts) {
    const key = weekInfoOf(shift.date).key
    const bucket = groups.get(key)
    if (bucket) bucket.push(shift)
    else groups.set(key, [shift])
  }
  for (const deposit of state.deposits) deposits.set(deposit.weekKey, deposit)

  const currentKey = weekInfoOf(now).key

  const weeks: WeekSummary[] = []
  for (const key of new Set([...groups.keys(), ...deposits.keys()])) {
    // a chave é a semana ISO de trabalho (ex.: 2026-W43) — reconstrói a semana a partir dela
    const [yearPart, weekPart] = key.split('-W')
    const anchor = anchorOfIsoWeek(Number(yearPart), Number(weekPart))
    const week = weekInfoOf(anchor)
    const shifts = (groups.get(key) ?? []).sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
    const deposit = deposits.get(key) ?? null
    const total = shifts.reduce((sum, s) => sum + (s.value || 0), 0)
    const hours = shifts.reduce((sum, s) => sum + durationHours(s.start, s.end), 0)

    weeks.push({
      info: week,
      key,
      label: `Semana ${week.week}`,
      range: fmtRange(week.start, week.end),
      start: week.start,
      end: week.end,
      shifts,
      total,
      hours: Math.round(hours * 10) / 10,
      days: new Set(shifts.map((s) => s.date)).size,
      status: statusFor(week, deposit, now, startDow),
      window: paymentWindowFor(week, startDow),
      deposit,
      diff: deposit ? deposit.amount - total : null,
      isCurrent: key === currentKey,
      isFuture: week.start.getTime() > now.getTime(),
    })
  }

  return weeks.sort((a, b) => b.start.getTime() - a.start.getTime())
}

/** Data (YYYY-MM-DD) que cai dentro da semana ISO informada. */
function anchorOfIsoWeek(year: number, week: number): string {
  const firstThursday = firstThursdayOfYear(year)
  const monday = new Date(firstThursday.getTime())
  monday.setDate(monday.getDate() - 3 + (week - 1) * 7)
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(
    monday.getDate(),
  ).padStart(2, '0')}`
}

function firstThursdayOfYear(year: number): Date {
  const jan4 = new Date(year, 0, 4)
  const dow = (jan4.getDay() + 6) % 7
  const thursday = new Date(jan4.getTime())
  thursday.setDate(thursday.getDate() - dow + 3)
  return thursday
}

export interface Totals {
  previsto: number
  recebido: number
  aReceber: number
  horas: number
  turnos: number
  semanas: number
}

export function totalsOf(state: DiaryState, weeks: WeekSummary[]): Totals {
  const previsto = weeks.reduce((sum, w) => sum + w.total, 0)
  const recebido = weeks.reduce((sum, w) => sum + (w.deposit?.amount ?? 0), 0)
  const aReceber = weeks.reduce((sum, w) => sum + (w.status === 'pago' ? 0 : w.total), 0)
  const horas = weeks.reduce((sum, w) => sum + w.hours, 0)
  return {
    previsto,
    recebido,
    aReceber,
    horas: Math.round(horas * 10) / 10,
    turnos: state.shifts.length,
    semanas: weeks.filter((w) => w.shifts.length > 0).length,
  }
}

/** Semana com repasse pendente: primeiro a que está em aberto/atrasada, senão a próxima prevista. */
export function nextPending(weeks: WeekSummary[]): WeekSummary | null {
  const urgent = weeks
    .filter((w) => w.status === 'aberto' || w.status === 'atrasado')
    .sort((a, b) => a.window.start.getTime() - b.window.start.getTime())
  if (urgent.length) return urgent[0]

  return (
    weeks
      .filter((w) => w.status === 'previsto' && w.shifts.length > 0)
      .sort((a, b) => a.window.start.getTime() - b.window.start.getTime())[0] ?? null
  )
}

export interface MonthlyDemand {
  /** Demandas (turnos) registradas no mês corrente. */
  count: number
  /** Limite de demandas por mês (padrão: 14). */
  limit: number
  /** Quantas demandas ainda faltam para bater o limite. */
  remaining: number
  /** "Outubro de 2026" */
  monthLabel: string
  /** 0 → 1 — proporção do limite já usada. */
  progress: number
  /** Frase curta de incentivo. */
  motivational: string
}

/** Contador de demandas do mês: X/14, quanto falta e uma frase de incentivo. */
export function monthlyDemand(state: DiaryState, now: Date = new Date()): MonthlyDemand {
  const limit = Math.max(1, state.settings?.monthLimit ?? 14)
  const prefix = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`
  const count = state.shifts.filter((shift) => shift.date.startsWith(prefix)).length
  const remaining = Math.max(0, limit - count)
  const progress = Math.min(1, count / limit)
  const monthLabel = now
    .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    .replace(/^./, (char) => char.toUpperCase())

  let motivational: string
  if (count >= limit) {
    motivational = `Limite de ${limit} demandas batido! Mês fechado em cima. 🏆`
  } else if (count === 0) {
    motivational = 'Bora começar? Vamos lá, fazer dinheiro!!'
  } else if (remaining <= 3) {
    motivational = `Falta só ${remaining}! Vamos lá, fazer dinheiro!!`
  } else {
    motivational = `Vamos lá, fazer dinheiro!! Faltam ${remaining} para fechar o mês.`
  }

  return { count, limit, remaining, monthLabel, progress, motivational }
}

/** Nome digitado, limpo: espaços colapsados e sem pontas vazias. */
export function normalizeName(raw?: string | null): string {
  if (!raw) return ''
  return raw.replace(/\s+/g, ' ').trim()
}

/** Primeiro nome para a saudação — "Pedro Silva" vira "Pedro". */
export function firstName(raw?: string | null): string {
  const full = normalizeName(raw)
  if (!full) return ''
  return full.split(' ')[0]
}

/** Saudação do topo — "Olá, Pedro". String vazia quando ainda não há nome. */
export function greetingFor(raw?: string | null): string {
  const name = firstName(raw)
  return name ? `Olá, ${name}` : ''
}

/* ------------------------------------------------------------------
 * Campos digitados: horário (sem relógio nativo) e valor (com ",00")
 * ------------------------------------------------------------------ */

/** Máscara de horário: só dígitos, com ":" automático. "2300" → "23:00". */
export function maskTime(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}:${digits.slice(2)}`
}

/** Horário completo e válido — 00:00 até 23:59. */
export function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

/** O que o usuário digitou entre a seleção antiga e o novo texto do input. */
export function insertedText(
  prev: string,
  next: string,
  selStart: number,
  selEnd: number,
): string {
  const length = Math.max(0, next.length - prev.length + (selEnd - selStart))
  return next.slice(selStart, selStart + length)
}

/**
 * Texto do campo de horário depois da edição.
 * A máscara só insere ":" no meio, então a ordem dos dígitos do input já é
 * a ordem final — com `replacedAll` (primeira digitação com o cursor no meio
 * do texto) vale só o que foi digitado.
 */
export function editTimeText(
  next: string,
  inserted = '',
  replacedAll = false,
): string {
  if (replacedAll && inserted) return maskTime(inserted)
  return maskTime(next)
}

/**
 * Estado do campo "Valor a receber".
 * A parte inteira é o que a pessoa digita; os centavos são completados
 * sozinhos ("100" vira "100,00") e ficam guardados em separado.
 */
export interface MoneyField {
  /** Dígitos da parte inteira — ex.: "100" */
  int: string
  /** Centavos (2 dígitos) — "00" enquanto o app completa sozinho */
  cents: string
  /** true quando a pessoa digitou nos centavos */
  touched: boolean
}

export const EMPTY_MONEY: MoneyField = { int: '', cents: '00', touched: false }

/** Texto exibido no campo — { int: "100" } → "100,00" · { int: "100", cents: "05" } → "100,05" */
export function moneyFieldText(field: MoneyField): string {
  if (!field.int) return ''
  return `${field.int},${field.cents}`
}

/** Número do campo — "100,05" → 100.05 */
export function moneyFieldValue(field: MoneyField): number {
  const int = Number(field.int || 0) || 0
  const cents = Number(field.cents || 0) || 0
  return int + cents / 100
}

/** Campo a partir de um número — 100.05 → { int: "100", cents: "05" } */
export function moneyFieldFromValue(value: number): MoneyField {
  const safe = Math.max(0, Math.round((Number(value) || 0) * 100))
  if (!safe) return { ...EMPTY_MONEY }
  return {
    int: String(Math.floor(safe / 100)),
    cents: String(safe % 100).padStart(2, '0'),
    touched: true,
  }
}

/**
 * Interpreta a digitação no campo de valor e devolve o novo estado + onde o
 * cursor deve ficar. O campo mostra "100,00", então:
 * - digitando na parte inteira o cursor fica antes da vírgula (para seguir digitando);
 * - digitando nos centavos o cursor vai para o fim do texto.
 */
export function insertMoneyField(
  prev: MoneyField,
  next: string,
  selStart: number,
  selEnd: number,
): { field: MoneyField; caret: number } {
  const prevText = moneyFieldText(prev)
  const inserted = insertedText(prevText, next, selStart, selEnd)
  const intLen = prev.int.length

  // digitação dentro da parte inteira
  if (selStart <= intLen) {
    const head = prev.int.slice(0, selStart)
    const tail = prev.int.slice(selEnd)
    if (inserted.includes(',')) {
      const [headDigits, tailDigits] = inserted.split(',')
      const centsDigits = tailDigits.replace(/\D/g, '')
      const field: MoneyField = {
        int: head + headDigits.replace(/\D/g, ''),
        cents: centsDigits ? centsDigits.padStart(2, '0').slice(0, 2) : '00',
        touched: true,
      }
      return { field, caret: moneyFieldText(field).length }
    }
    const field: MoneyField = {
      int: head + inserted.replace(/\D/g, '') + tail,
      cents: prev.cents,
      touched: prev.touched,
    }
    return { field, caret: field.int.length }
  }

  // digitação dentro dos centavos
  const comma = next.indexOf(',')
  const visible = comma >= 0 ? next.slice(comma + 1) : ''
  let cents = visible
  if (cents.length > 2) {
    // o dígito novo fica no slot tocado: o que sobrou é descartado do outro lado
    cents = selStart === intLen + 1 ? cents.slice(0, 2) : cents.slice(-2)
  }
  const field: MoneyField = {
    int: prev.int,
    cents: inserted ? cents.padStart(2, '0').slice(0, 2) : '00',
    touched: inserted ? true : cents.length >= 2,
  }
  return { field, caret: moneyFieldText(field).length }
}

/**
 * Apaga um trecho do campo de valor (Backspace/Delete).
 * Enquanto os centavos são o "00" automático, apagar do lado dos centavos
 * desfaz o último dígito da parte inteira — é o que a pessoa espera.
 */
export function deleteMoneyField(
  prev: MoneyField,
  selStart: number,
  selEnd: number,
  backspace: boolean,
): { field: MoneyField; caret: number } {
  let from = selStart
  let to = selEnd
  if (from === to) {
    if (backspace) {
      if (from === 0) return { field: prev, caret: 0 }
      from -= 1
    } else {
      if (to >= moneyFieldText(prev).length) return { field: prev, caret: selStart }
      to += 1
    }
  }
  const intLen = prev.int.length

  // apagar dentro dos centavos
  if (from >= intLen + 1) {
    if (!prev.touched) {
      const int = prev.int.slice(0, -1)
      const field: MoneyField = { int, cents: '00', touched: false }
      return { field, caret: int.length }
    }
    const visible = prev.cents
    const cutFrom = Math.max(0, from - intLen - 1)
    const cutTo = Math.min(visible.length, to - intLen - 1)
    const kept = visible.slice(0, cutFrom) + visible.slice(cutTo)
    const field: MoneyField = {
      int: prev.int,
      cents: kept.padEnd(2, '0').slice(0, 2),
      touched: kept.length >= 2,
    }
    return { field, caret: moneyFieldText(field).length }
  }

  // apagar dentro da parte inteira (pode atravessar a vírgula)
  const int = prev.int.slice(0, Math.min(from, intLen)) + prev.int.slice(Math.min(to, intLen))
  const field: MoneyField = { int, cents: prev.cents, touched: prev.touched }
  return { field, caret: field.int.length }
}

export function shiftsToCsv(state: DiaryState): string {
  const startDow = state.settings?.startDow ?? 2
  const header = 'data;loja;entrada;saida;horas;valor;semana;repasse_inicio;repasse_fim;observacao'
  const rows = [...state.shifts]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => {
      const w = weekInfoOf(s.date)
      const win = paymentWindowFor(w, startDow)
      return [
        s.date,
        s.store,
        s.start,
        s.end,
        String(durationHours(s.start, s.end)).replace('.', ','),
        String(s.value || 0).replace('.', ','),
        w.key,
        `${win.start.getFullYear()}-${String(win.start.getMonth() + 1).padStart(2, '0')}-${String(win.start.getDate()).padStart(2, '0')}`,
        `${win.end.getFullYear()}-${String(win.end.getMonth() + 1).padStart(2, '0')}-${String(win.end.getDate()).padStart(2, '0')} 22:00`,
        (s.note ?? '').replace(/;/g, ','),
      ].join(';')
    })
  return [header, ...rows].join('\n')
}

export function depositsToCsv(state: DiaryState): string {
  const header = 'semana;previsto;depositado;diferenca;pago_em'
  const rows = buildWeeks(state).map((w) =>
    [
      w.key,
      String(w.total).replace('.', ','),
      w.deposit ? String(w.deposit.amount).replace('.', ',') : '',
      w.diff === null ? '' : String(w.diff).replace('.', ','),
      w.deposit?.paidAt ?? '',
    ].join(';'),
  )
  return [header, ...rows].join('\n')
}

export { money }
