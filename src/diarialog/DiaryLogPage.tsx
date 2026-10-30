import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  BookOpen,
  CalendarPlus,
  Clock,
  Coins,
  FileDown,
  Gauge,
  Hourglass,
  Layers,
  LayoutList,
  Pencil,
  ShieldCheck,
  Timer,
  UserRound,
  Wallet,
} from 'lucide-react'
import { DiaryWordmark } from './DiaryLogo'
import { ShiftForm } from './components/ShiftForm'
import { ShiftList } from './components/ShiftList'
import { WeekCards } from './components/WeekCards'
import { Conference } from './components/Conference'
import { ConfirmDialog } from './components/ConfirmDialog'
import { NameDialog } from './components/NameDialog'
import {
  buildWeeks,
  depositsToCsv,
  firstName,
  greetingFor,
  monthlyDemand,
  nextPending,
  normalizeName,
  shiftsToCsv,
  totalsOf,
} from './compute'
import { clearState, demoState, emptyState, loadState, makeShift, saveState } from './storage'
import { downloadFile, googleCalendarUrl, icsFor } from './calendar'
import { money } from './dates'
import type { Deposit, DiaryState, Shift } from './types'

type Tab = 'escala' | 'semanas' | 'conferencia'

const TABS: { id: Tab; label: string; icon: typeof LayoutList }[] = [
  { id: 'escala', label: 'Escala', icon: LayoutList },
  { id: 'semanas', label: 'Semanas', icon: Layers },
  { id: 'conferencia', label: 'Conferência', icon: Wallet },
]

export function DiaryLogPage() {
  const [state, setState] = useState<DiaryState>(() => {
    const initial = loadState()
    if (initial.shifts.length || initial.deposits.length) return initial
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('demo')) return demoState()
    return initial
  })
  const [tab, setTab] = useState<Tab>('escala')
  const [editing, setEditing] = useState<Shift | null>(null)
  const [toast, setToast] = useState<{ message: string; tone: 'ok' | 'warn' } | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [nameOpen, setNameOpen] = useState(false)
  const [clock, setClock] = useState(() => new Date())
  /** Área do formulário — é pra cá que a página vai quando alguém edita um turno. */
  const formRef = useRef<HTMLDivElement>(null)

  // primeira visita: pergunta o nome uma vez e guarda no aparelho
  useEffect(() => {
    if (!normalizeName(state.name)) setNameOpen(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ao editar um turno, leva a pessoa direto pra área de edição
  useEffect(() => {
    if (!editing) return
    const alvo = formRef.current
    if (!alvo) return
    const header = document.querySelector('header.sticky')
    const folga = (header?.getBoundingClientRect().height ?? 0) + 12
    const topo = alvo.getBoundingClientRect().top + window.scrollY - folga
    window.scrollTo({ top: Math.max(0, topo), behavior: 'smooth' })
  }, [editing])

  // "viva": relógio e status de repasse se atualizam sozinhos
  useEffect(() => {
    const id = window.setInterval(() => setClock(new Date()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    saveState(state)
  }, [state])

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 5000)
    return () => window.clearTimeout(id)
  }, [toast])

  const weeks = useMemo(() => buildWeeks(state, clock), [state, clock])
  const totals = useMemo(() => totalsOf(state, weeks), [state, weeks])
  const pending = useMemo(() => nextPending(weeks), [weeks])
  const demand = useMemo(() => monthlyDemand(state, clock), [state, clock])
  const greeting = useMemo(() => greetingFor(state.name), [state.name])
  const mesesHistorico = useMemo(
    () => new Set(state.shifts.map((shift) => shift.date.slice(0, 7))).size,
    [state.shifts],
  )

  const notify = useCallback((message: string, tone: 'ok' | 'warn' = 'ok') => setToast({ message, tone }), [])

  function addShift(data: Omit<Shift, 'id' | 'createdAt'>) {
    const next: DiaryState = { ...state, shifts: [...state.shifts, makeShift(data)] }
    setState(next)
    setEditing(null)
    const updated = monthlyDemand(next, clock)
    notify(`Turno registrado! ${updated.motivational}`, updated.count > updated.limit ? 'warn' : 'ok')
  }

  function updateShift(data: Omit<Shift, 'id' | 'createdAt'>) {
    if (!editing) return
    setState((s) => ({
      ...s,
      shifts: s.shifts.map((shift) => (shift.id === editing.id ? { ...shift, ...data } : shift)),
    }))
    setEditing(null)
    notify('Turno atualizado.')
  }

  function removeShift(id: string) {
    setState((s) => ({ ...s, shifts: s.shifts.filter((shift) => shift.id !== id) }))
    notify('Turno removido.', 'warn')
  }

  function setDeposit(weekKey: string, amount: number, paidAt: string) {
    setState((s) => {
      const others = s.deposits.filter((d) => d.weekKey !== weekKey)
      const deposit: Deposit = { weekKey, amount, paidAt, note: 'Pix' }
      return { ...s, deposits: [...others, deposit] }
    })
    notify('Depósito conferido.')
  }

  function removeDeposit(weekKey: string) {
    setState((s) => ({ ...s, deposits: s.deposits.filter((d) => d.weekKey !== weekKey) }))
    notify('Conferência removida.', 'warn')
  }

  function handleImport(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as Partial<DiaryState>
        setState({
          shifts: Array.isArray(parsed.shifts) ? parsed.shifts : [],
          deposits: Array.isArray(parsed.deposits) ? parsed.deposits : [],
          settings: {
            startDow: 2,
            endDow: 4,
            monthLimit: typeof parsed.settings?.monthLimit === 'number' ? parsed.settings.monthLimit : 14,
          },
          // backup antigo (sem nome) não apaga o nome que já está salvo aqui
          name: typeof parsed.name === 'string' ? parsed.name : state.name,
        })
        notify('Backup restaurado.')
      } catch {
        notify('Arquivo inválido.', 'warn')
      }
    }
    reader.readAsText(file)
  }

  function handleClear() {
    // o nome é da pessoa, não dos dados: continua salvo depois de limpar tudo
    const keptName = state.name
    clearState()
    setState({ ...emptyState(), name: keptName })
    setConfirmClear(false)
    notify('Dados apagados.', 'warn')
  }

  function saveName(raw: string) {
    const clean = normalizeName(raw)
    setState((s) => ({ ...s, name: clean || undefined }))
    setNameOpen(false)
    if (!clean) {
      notify('Nome removido.', 'warn')
      return
    }
    notify(`Prazer, ${firstName(clean)}! Nome salvo no seu aparelho.`)
  }

  function countdown(): string {
    if (!pending) return 'sem pendência'
    const target = pending.status === 'previsto' ? pending.window.start : pending.window.end
    const ms = target.getTime() - clock.getTime()
    if (ms <= 0) return pending.status === 'previsto' ? 'janela aberta' : 'janela encerrada'
    const totalMinutes = Math.floor(ms / 60000)
    const days = Math.floor(totalMinutes / 1440)
    const hours = Math.floor((totalMinutes % 1440) / 60)
    const minutes = totalMinutes % 60
    if (days > 0) return `${days}d ${hours}h`
    if (hours > 0) return `${hours}h ${minutes}min`
    return `${minutes}min`
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="pointer-events-none fixed inset-0 aurora" />
      <div className="pointer-events-none fixed inset-0 grid-bg opacity-40" />

      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/75 backdrop-blur-xl">
        <div className="hairline" />
        <div className="shell flex items-center justify-between gap-4 py-3.5">
          <DiaryWordmark />
          <div className="flex items-center gap-2">
            <span className="pill hidden sm:inline-flex">
              <ShieldCheck size={12} className="text-lime-700" /> 100% no aparelho
            </span>
            <span className="pill hidden md:inline-flex">
              <Clock size={12} /> {clock.toLocaleTimeString('pt-BR', { timeZone: 'America/Fortaleza' })}
            </span>
            <a
              href="/guia-diarialog.pdf"
              target="_blank"
              rel="noreferrer"
              title="Guia rápido do DiáriaLog (PDF)"
              aria-label="Abrir o guia rápido em PDF"
              className="btn-ghost !px-2.5 !py-2"
            >
              <BookOpen size={15} />
              <span className="hidden sm:inline">Guia</span>
            </a>
            <a
              href="https://wesleycarvalho.vercel.app"
              target="_blank"
              rel="noreferrer"
              className="btn-ghost !px-3 !py-2 text-xs"
            >
              <ArrowLeft size={14} /> Portfólio
            </a>
          </div>
        </div>
      </header>

      <main className="relative z-10">
        <section className="shell pt-10">
          <div className="max-w-2xl">
            {greeting && (
              <button
                type="button"
                onClick={() => setNameOpen(true)}
                title="Trocar meu nome"
                className="group mb-3 inline-flex items-center gap-2 rounded-full border border-lime-200 bg-lime-50/80 px-3.5 py-1.5 font-display text-sm font-bold text-lime-700 transition hover:border-lime-300 hover:bg-lime-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-500/40"
              >
                <UserRound size={14} />
                {greeting}
                <Pencil
                  size={11}
                  className="opacity-40 transition group-hover:opacity-100"
                  aria-hidden="true"
                />
              </button>
            )}
            <span className="pill">
              <Coins size={12} className="text-lime-700" /> diarista · Amazon &amp; Shopee
            </span>
            <h1 className="mt-4 font-display text-3xl font-extrabold leading-[1.1] tracking-tight text-slate-900 sm:text-[2.6rem]">
              Cada turno vira um <span className="gradient-lime">repasse conferido</span>.
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-500 sm:text-base">
              Registre o dia, o horário de entrada e saída e o valor a receber. O DiáriaLog soma a semana
              sozinho, avisa a data do repasse e confronta o que caiu na conta com o que era esperado.
            </p>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="card-gradient rounded-2xl p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">Total previsto</p>
              <p className="mt-1 font-display text-xl font-bold text-slate-900">{money(totals.previsto)}</p>
              <p className="mt-0.5 font-mono text-[11px] text-slate-500">{totals.turnos} turno(s) registrados</p>
            </div>
            <div className="card-gradient rounded-2xl p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">A receber</p>
              <p className="mt-1 font-display text-xl font-bold gradient-lime">{money(totals.aReceber)}</p>
              <p className="mt-0.5 font-mono text-[11px] text-slate-500">
                {totals.aReceber > 0 ? 'ainda não depositado' : 'tudo em dia'}
              </p>
            </div>
            <div className="card-gradient rounded-2xl p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">Horas trabalhadas</p>
              <p className="mt-1 font-display text-xl font-bold text-slate-900">{totals.horas}h</p>
              <p className="mt-0.5 font-mono text-[11px] text-slate-500">em {totals.semanas} semana(s)</p>
            </div>
            <div className="card-gradient rounded-2xl p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">
                {pending?.status === 'previsto' ? 'Repasse abre em' : 'Repasse fecha em'}
              </p>
              <p className="mt-1 flex items-center gap-1.5 font-display text-xl font-bold text-ember-600">
                <Timer size={18} /> {countdown()}
              </p>
              <p className="mt-0.5 font-mono text-[11px] text-slate-500">
                {pending ? `${pending.label} · ${pending.range}` : 'nenhuma janela em aberto'}
              </p>
            </div>
          </div>

          <div className="card-gradient mt-3 flex flex-col gap-4 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-lime-400 via-lime-500 to-lime-600 text-white shadow-[0_12px_28px_-14px_rgba(101,163,13,.9)]">
                <span className="font-display text-lg font-extrabold leading-none">{demand.count}</span>
                <span className="mt-0.5 font-mono text-[10px] leading-none opacity-90">de {demand.limit}</span>
              </div>
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">
                  <Gauge size={11} className="mr-1 inline text-lime-700" />
                  Demandas do mês · {demand.monthLabel}
                </p>
                <p className="mt-0.5 font-display text-base font-bold text-slate-900">
                  <span className="gradient-lime">{demand.count}/{demand.limit}</span>{' '}
                  <span className="font-mono text-[11px] font-medium text-slate-500">
                    {demand.remaining > 0 ? `falta ${demand.remaining}` : 'limite do mês completo'}
                  </span>
                </p>
                <div className="mt-2 h-2 w-full max-w-xs overflow-hidden rounded-full bg-slate-200/80">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-lime-400 via-lime-500 to-lime-600 transition-all duration-500"
                    style={{ width: `${Math.round(demand.progress * 100)}%` }}
                  />
                </div>
              </div>
            </div>
            <p className="shrink-0 font-display text-sm font-bold leading-snug text-lime-700 sm:max-w-[18rem] sm:text-right">
              {demand.motivational}
            </p>
          </div>
        </section>

        <nav className="shell mt-8">
          <div className="flex w-full gap-1 rounded-2xl border border-slate-200 bg-white/70 p-1.5 backdrop-blur sm:inline-flex sm:w-auto">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`flex flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[11px] font-semibold transition sm:flex-none sm:flex-row sm:gap-2 sm:px-4 sm:text-sm ${
                  tab === id
                    ? 'bg-gradient-to-br from-white to-lime-50 text-lime-700 shadow-[0_6px_18px_-10px_rgba(101,163,13,.75)] ring-1 ring-lime-200'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>
        </nav>

        <section className="shell mt-6">
          {tab === 'escala' && (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,380px)_1fr]">
              <div ref={formRef} className="card-gradient scroll-mt-24 rounded-2xl p-5">
                <header className="mb-4 flex items-center justify-between">
                  <h2 className="font-display text-base font-bold text-slate-900">
                    {editing ? 'Editar turno' : 'Novo turno'}
                  </h2>
                  {editing && (
                    <button type="button" onClick={() => setEditing(null)} className="font-mono text-[11px] text-slate-500 hover:text-slate-800">
                      cancelar
                    </button>
                  )}
                </header>
                <ShiftForm editing={editing} onSubmit={editing ? updateShift : addShift} onCancelEdit={() => setEditing(null)} />
              </div>

              <div className="card-gradient rounded-2xl p-5">
                <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-display text-base font-bold text-slate-900">Turnos registrados</h2>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn-ghost !px-3 !py-1.5 text-xs"
                      onClick={() => {
                        if (!state.shifts.length) return notify('Nada para exportar.', 'warn')
                        downloadFile('diarialog-turnos.ics', icsFor(state.shifts), 'text/calendar;charset=utf-8')
                        notify('Arquivo .ics gerado.')
                      }}
                    >
                      <CalendarPlus size={14} /> Exportar .ics
                    </button>
                    <button
                      type="button"
                      className="btn-ghost !px-3 !py-1.5 text-xs"
                      onClick={() => {
                        downloadFile('diarialog-turnos.csv', buildCsv(state), 'text/csv;charset=utf-8')
                        notify('CSV gerado.')
                      }}
                    >
                      <FileDown size={14} /> CSV
                    </button>
                  </div>
                </header>
                <ShiftList
                  weeks={weeks.filter((w) => w.shifts.length > 0)}
                  onEdit={setEditing}
                  onDelete={removeShift}
                  onAddToCalendar={(shift) => window.open(googleCalendarUrl(shift), '_blank', 'noopener')}
                />
              </div>
            </div>
          )}

          {tab === 'semanas' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-lg font-bold text-slate-900">Semanas e janelas de repasse</h2>
                <span className="inline-flex items-center gap-2 rounded-full border border-lime-200 bg-gradient-to-r from-lime-100 to-lime-50 px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-lime-700">
                  <Hourglass size={13} /> Repasse sempre a partir de quarta-feira
                </span>
              </div>
              <WeekCards weeks={weeks} onSetDeposit={setDeposit} onRemoveDeposit={removeDeposit} />
            </div>
          )}

          {tab === 'conferencia' && (
            <Conference
              weeks={weeks}
              onExportShifts={() => {
                downloadFile('diarialog-turnos.csv', buildCsv(state), 'text/csv;charset=utf-8')
                notify('CSV de turnos gerado.')
              }}
              onExportConference={() => {
                downloadFile('diarialog-conferencia.csv', buildConferenceCsv(state), 'text/csv;charset=utf-8')
                notify('CSV de conferência gerado.')
              }}
              onImport={handleImport}
              onLoadDemo={() => {
                setState(demoState())
                notify('Exemplo carregado.')
              }}
              onClear={() => setConfirmClear(true)}
            />
          )}
        </section>
      </main>

      <footer className="relative mt-16 overflow-hidden bg-[linear-gradient(180deg,rgba(248,250,252,0)_0%,rgba(226,232,240,.85)_42%,rgba(203,213,225,1)_100%)]">
        <div className="pointer-events-none absolute inset-0 aurora opacity-70" />
        <div className="hairline opacity-80" />
        <div className="shell relative py-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-mono text-[11px] text-slate-600">
              DiáriaLog · dados guardados no seu navegador (LocalStorage) · nenhum servidor, nenhuma conta.
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <a
                href="/guia-diarialog.pdf"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 font-mono text-[11px] text-slate-700 underline-offset-4 transition hover:text-lime-700 hover:underline"
              >
                <BookOpen size={12} /> Guia rápido · PDF
              </a>
              <a
                href="https://wesleycarvalho.vercel.app"
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[11px] text-slate-700 underline-offset-4 transition hover:text-lime-700 hover:underline"
              >
                Desenvolvido por Wesley Carvalho
              </a>
            </div>
          </div>
        </div>
      </footer>

      <ConfirmDialog
        open={confirmClear}
        title="Limpar tudo?"
        message={`Ao limpar tudo, todos os turnos registrados, as conferências e o histórico de demandas dos meses anteriores também serão apagados. Deseja continuar? Essa ação não pode ser desfeita.${state.name ? ' Seu nome continua salvo.' : ''}`}
        details={`${state.shifts.length} ${state.shifts.length === 1 ? 'turno' : 'turnos'} · ${state.deposits.length} ${state.deposits.length === 1 ? 'conferência' : 'conferências'} · ${mesesHistorico} ${mesesHistorico === 1 ? 'mês' : 'meses'} de histórico`}
        onConfirm={handleClear}
        onCancel={() => setConfirmClear(false)}
      />

      <NameDialog
        open={nameOpen}
        currentName={state.name ?? ''}
        onSave={saveName}
        onClose={() => setNameOpen(false)}
      />

      {toast && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-[60] w-[min(92vw,34rem)] -translate-x-1/2">
          <div
            className={`animate-fade-up rounded-xl border px-4 py-2.5 text-center text-sm font-medium shadow-2xl backdrop-blur ${
              toast.tone === 'ok'
                ? 'border-lime/30 bg-lime/10 text-lime-700'
                : 'border-ember/30 bg-ember/10 text-ember-600'
            }`}
          >
            {toast.message}
          </div>
        </div>
      )}
    </div>
  )
}

function buildCsv(state: DiaryState): string {
  return shiftsToCsv(state)
}

function buildConferenceCsv(state: DiaryState): string {
  return depositsToCsv(state)
}
