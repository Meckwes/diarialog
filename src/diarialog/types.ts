export type StoreName = 'Amazon' | 'Shopee' | 'Fenix' | 'Outro'

export interface Shift {
  id: string
  /** Dia trabalhado — YYYY-MM-DD em hora local (nunca UTC). */
  date: string
  store: StoreName | string
  /** Entrada — HH:MM */
  start: string
  /** Saída — HH:MM (se menor que a entrada, o turno vira a meia-noite) */
  end: string
  /** Valor a receber por este turno. */
  value: number
  note?: string
  createdAt: number
}

export interface Deposit {
  /** Semana ISO de TRABALHO que este depósito quita — ex.: 2026-W43 */
  weekKey: string
  amount: number
  /** Data em que o valor caiu na conta — YYYY-MM-DD */
  paidAt: string
  note?: string
}

export interface DiarySettings {
  /** Dia em que a janela de repasse abre — fixado na quarta-feira (2). */
  startDow: 1 | 2
  /** Dia em que a janela fecha (4 = sexta, 22:00). */
  endDow: 4
  /** Limite de demandas (turnos) por mês. */
  monthLimit: number
}

export interface DiaryState {
  shifts: Shift[]
  deposits: Deposit[]
  settings: DiarySettings
  /** Nome do diarista — perguntado uma vez e guardado junto com o resto. */
  name?: string
}

/** Lojas na ordem em que aparecem no campo "Loja / cliente". */
export const STORES: StoreName[] = ['Shopee', 'Amazon', 'Fenix', 'Outro']
