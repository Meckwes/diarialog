import type { DiaryState, Deposit, Shift } from './types'
import { addDays, ymd } from './dates'

const KEY = 'diarialog.v2'

export const emptyState = (): DiaryState => ({
  shifts: [],
  deposits: [],
  settings: { startDow: 2, endDow: 4, monthLimit: 14 },
})

export function loadState(): DiaryState {
  if (typeof window === 'undefined') return emptyState()
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return emptyState()
    const parsed = JSON.parse(raw) as Partial<DiaryState>
    return {
      shifts: Array.isArray(parsed.shifts) ? parsed.shifts : [],
      deposits: Array.isArray(parsed.deposits) ? parsed.deposits : [],
      settings: {
        startDow: 2,
        endDow: 4,
        monthLimit: typeof parsed.settings?.monthLimit === 'number' ? parsed.settings.monthLimit : 14,
      },
    }
  } catch {
    return emptyState()
  }
}

export function saveState(state: DiaryState): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* modo privado / cota cheia — o app continua funcionando em memória */
  }
}

export function clearState(): void {
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

export const uid = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export function makeShift(partial: Omit<Shift, 'id' | 'createdAt'>): Shift {
  return { ...partial, id: uid(), createdAt: Date.now() }
}

export function makeDeposit(weekKey: string, amount: number, paidAt: string, note?: string): Deposit {
  return { weekKey, amount, paidAt, note }
}

/** Dados de exemplo — escale Amazon (CD noturno) e Shopee. */
export function demoState(base = new Date()): DiaryState {
  const d = (offset: number) => ymd(addDays(base, offset))
  const shifts: Shift[] = [
    makeShift({ date: d(-14), store: 'Amazon', start: '22:00', end: '06:00', value: 180, note: 'CD noturno' }),
    makeShift({ date: d(-11), store: 'Shopee', start: '14:00', end: '22:00', value: 160 }),
    makeShift({ date: d(-9), store: 'Amazon', start: '22:00', end: '06:00', value: 180, note: 'CD noturno' }),
    makeShift({ date: d(-7), store: 'Amazon', start: '22:00', end: '06:00', value: 180, note: 'CD noturno' }),
    makeShift({ date: d(-4), store: 'Shopee', start: '14:00', end: '22:00', value: 160 }),
    makeShift({ date: d(-2), store: 'Amazon', start: '22:00', end: '06:00', value: 180, note: 'CD noturno' }),
    makeShift({ date: d(0), store: 'Shopee', start: '19:00', end: '20:00', value: 145 }),
    makeShift({ date: d(1), store: 'Amazon', start: '22:00', end: '06:00', value: 180, note: 'CD noturno' }),
  ]

  const deposits: Deposit[] = [
    { weekKey: weekKeyFor(d(-14)), amount: 340, paidAt: d(-6), note: 'Pix' },
    { weekKey: weekKeyFor(d(-9)), amount: 500, paidAt: d(-2), note: 'Pix — faltou R$ 20' },
  ]

  return { shifts, deposits, settings: { startDow: 2, endDow: 4, monthLimit: 14 } }
}

function weekKeyFor(date: string): string {
  const [y, m, dd] = date.split('-').map(Number)
  const d = new Date(y, m - 1, dd)
  const dow = (d.getDay() + 6) % 7
  const thursday = addDays(d, -dow + 3)
  const isoYear = thursday.getFullYear()
  const jan4 = new Date(isoYear, 0, 4)
  const jan4Dow = (jan4.getDay() + 6) % 7
  const firstThursday = addDays(jan4, -jan4Dow + 3)
  const week = 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / 604800000)
  return `${isoYear}-W${String(week).padStart(2, '0')}`
}
