/**
 * Regras de calendário do diarista (Amazon / Shopee).
 *
 * - Semana de trabalho = semana ISO (segunda → domingo).
 * - Semana de repasse  = semana de trabalho + 1.
 * - Janela de repasse  = quarta 00:00 → sexta 22:00 da semana de repasse.
 * - Turno noturno      = saída menor que a entrada ⇒ passou da meia-noite.
 */

export const pad2 = (n: number): string => String(n).padStart(2, '0')

/** Data local em YYYY-MM-DD. NUNCA usar toISOString(): em BRT 22:00 vira o dia seguinte em UTC. */
export function ymd(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/** Converte YYYY-MM-DD em Date local à meia-noite (sem deslocamento de fuso). */
export function parseYmd(value: string): Date {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y || 1970, (m || 1) - 1, d || 1)
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date.getTime())
  copy.setDate(copy.getDate() + days)
  return copy
}

export interface WeekInfo {
  /** Chave da semana ISO — ex.: 2026-W43 */
  key: string
  year: number
  week: number
  /** Segunda-feira da semana */
  start: Date
  /** Domingo da semana */
  end: Date
}

function firstThursdayOf(year: number): Date {
  const jan4 = new Date(year, 0, 4)
  const dow = (jan4.getDay() + 6) % 7 // 0 = segunda
  return addDays(jan4, -dow + 3)
}

/** Semana ISO de uma data (segunda → domingo). */
export function weekInfo(date: Date): WeekInfo {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const dow = (d.getDay() + 6) % 7
  const monday = addDays(d, -dow)
  const thursday = addDays(d, -dow + 3)
  const isoYear = thursday.getFullYear()
  const week = 1 + Math.round((thursday.getTime() - firstThursdayOf(isoYear).getTime()) / 604800000)
  return {
    key: `${isoYear}-W${pad2(week)}`,
    year: isoYear,
    week,
    start: monday,
    end: addDays(monday, 6),
  }
}

export function weekInfoOf(value: string | Date): WeekInfo {
  return weekInfo(typeof value === 'string' ? parseYmd(value) : value)
}

export interface PaymentWindow {
  start: Date
  end: Date
}

/**
 * Janela de repasse da semana de trabalho informada:
 * quarta-feira 00:00 → sexta 22:00 da semana SEGUINTE.
 * A abertura é fixa na quarta-feira (startDow = 2).
 */
export function paymentWindowFor(week: WeekInfo, startDow: 1 | 2 = 2): PaymentWindow {
  const nextMonday = addDays(week.start, 7)
  const start = new Date(nextMonday.getFullYear(), nextMonday.getMonth(), nextMonday.getDate() + startDow, 0, 0, 0, 0)
  const end = new Date(nextMonday.getFullYear(), nextMonday.getMonth(), nextMonday.getDate() + 4, 22, 0, 0, 0)
  return { start, end }
}

/** Duração do turno em horas — treats saída < entrada como virada de meia-noite. */
export function durationHours(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return 0
  let minutes = eh * 60 + em - (sh * 60 + sm)
  if (minutes < 0) minutes += 24 * 60
  return Math.round((minutes / 60) * 100) / 100
}

export const money = (value: number): string =>
  (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function fmtDate(value: string | Date, opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit' }): string {
  const date = typeof value === 'string' ? parseYmd(value) : value
  return date.toLocaleDateString('pt-BR', opts)
}

export function fmtWeekday(date: Date): string {
  return date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
}

export const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** "26 out – 01 nov" (ou "19 – 25 out" quando o mês é o mesmo). */
export function fmtRange(start: Date, end: Date): string {
  const same = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()
  const d1 = String(start.getDate()).padStart(2, '0')
  const d2 = String(end.getDate()).padStart(2, '0')
  return same
    ? `${d1} – ${d2} ${MONTHS[start.getMonth()]}`
    : `${d1} ${MONTHS[start.getMonth()]} – ${d2} ${MONTHS[end.getMonth()]}`
}

/** "06 nov" — data curta, sem o "de". */
export function fmtDayMonth(value: string | Date): string {
  const date = typeof value === 'string' ? parseYmd(value) : value
  return `${String(date.getDate()).padStart(2, '0')} ${MONTHS[date.getMonth()]}`
}

/** Segundos desde 00:00 local — usado para ordenar e comparar horários. */
export function minutesOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}
