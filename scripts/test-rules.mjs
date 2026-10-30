/**
 * Testes das regras de calendário do DiáriaLog.
 * Rodar: node scripts/test-rules.mjs
 */
import { build } from 'esbuild'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const out = path.join(here, '.tmp-rules.mjs')

await build({
  entryPoints: [path.join(here, '../src/diarialog/compute.ts')],
  bundle: true,
  outfile: out,
  format: 'esm',
  platform: 'node',
  logLevel: 'error',
})

const {
  buildWeeks,
  statusFor,
  monthlyDemand,
  normalizeName,
  firstName,
  greetingFor,
  maskTime,
  isValidTime,
  editTimeText,
  moneyFieldText,
  moneyFieldValue,
  moneyFieldFromValue,
  insertMoneyField,
  deleteMoneyField,
  EMPTY_MONEY,
} = await import(pathToFileURL(out).href)

let failures = 0
function check(name, actual, expected) {
  const ok = String(actual) === String(expected)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` → esperado "${expected}", veio "${actual}"`}`)
}

// ---- duração / meia-noite ----
const { durationHours, weekInfoOf, paymentWindowFor, ymd } = await import(
  pathToFileURL(path.join(here, '../src/diarialog/dates.ts')).href
).then(async (m) => {
  // dates.ts é TS — compila junto
  const datesOut = path.join(here, '.tmp-dates.mjs')
  await build({
    entryPoints: [path.join(here, '../src/diarialog/dates.ts')],
    bundle: true,
    outfile: datesOut,
    format: 'esm',
    platform: 'node',
    logLevel: 'error',
  })
  return import(pathToFileURL(datesOut).href)
})

check('turno 22:00→06:00 vira 8h (meia-noite)', durationHours('22:00', '06:00'), 8)
check('turno 19:00→20:00 = 1h', durationHours('19:00', '20:00'), 1)
check('turno 08:00→17:00 = 9h', durationHours('08:00', '17:00'), 9)

// ---- semana ISO ----
const w44 = weekInfoOf('2026-10-29')
check('29/10/2026 é a semana ISO 44', w44.key, '2026-W44')
check('semana 44 começa na segunda (26/10)', ymd(w44.start), '2026-10-26')
check('semana 44 termina no domingo (01/11)', ymd(w44.end), '2026-11-01')
check('04/01/2026 é a semana ISO 1 de 2026', weekInfoOf('2026-01-04').key, '2026-W01')
check('29/12/2025 é a semana ISO 1 de 2026', weekInfoOf('2025-12-29').key, '2026-W01')
check('04/01/2027 é a semana ISO 1 de 2027', weekInfoOf('2027-01-04').key, '2027-W01')
check('31/12/2026 é a semana ISO 53', weekInfoOf('2026-12-31').key, '2026-W53')

// ---- janela de repasse (abre quarta, fecha sexta 22h) ----
const win = paymentWindowFor(w44, 2)
check('repasse abre na quarta (04/11) 00:00', `${ymd(win.start)} ${win.start.getHours()}:00`, '2026-11-04 0:00')
check('repasse fecha na sexta (06/11) 22:00', `${ymd(win.end)} ${win.end.getHours()}:00`, '2026-11-06 22:00')
const winTue = paymentWindowFor(w44, 1)
check('janela alternativa abre na terça (03/11)', ymd(winTue.start), '2026-11-03')

// ---- status automático ----
check('antes da janela → previsto', statusFor(w44, null, new Date(2026, 10, 2), 2), 'previsto')
check('dentro da janela → em trânsito', statusFor(w44, null, new Date(2026, 10, 4, 12), 2), 'aberto')
check('depois de sexta 22h → atrasado', statusFor(w44, null, new Date(2026, 10, 6, 23), 2), 'atrasado')
check('com depósito → pago', statusFor(w44, { weekKey: '2026-W44', amount: 100, paidAt: '2026-11-04' }, new Date(2026, 10, 20), 2), 'pago')

// ---- buildWeeks: label e período batem com a chave ISO ----
const state = {
  shifts: [
    { id: '1', date: '2026-10-29', store: 'Amazon', start: '22:00', end: '06:00', value: 180, createdAt: 1 },
    { id: '2', date: '2026-10-27', store: 'Shopee', start: '19:00', end: '20:00', value: 145, createdAt: 2 },
    { id: '3', date: '2026-10-20', store: 'Amazon', start: '22:00', end: '06:00', value: 180, createdAt: 3 },
  ],
  deposits: [{ weekKey: '2026-W43', amount: 180, paidAt: '2026-10-28' }],
  settings: { startDow: 2, endDow: 4 },
}

const weeks = buildWeeks(state, new Date(2026, 9, 29, 15, 0))
for (const week of weeks) {
  check(`label da ${week.key}`, week.label, `Semana ${week.key.split('-W')[1].replace(/^0/, '')}`)
}
check('período da 2026-W44', weeks.find((w) => w.key === '2026-W44').range, '26 out – 01 nov')
check('período da 2026-W43', weeks.find((w) => w.key === '2026-W43').range, '19 – 25 out')
const w43 = weeks.find((w) => w.key === '2026-W43')
check('semana 43 soma o turno de 20/10', w43.total, 180)
check('semana 43 tem depósito', w43.diff, 0)
const w44b = weeks.find((w) => w.key === '2026-W44')
check('semana 44 soma 180 + 145', w44b.total, 325)
check('semana 44 soma 8h + 1h', w44b.hours, 9)
check('semana 44 tem 2 dias trabalhados', w44b.days, 2)

// ---- contador de demandas do mês (limite 14) ----
const mk = (n, month = '2026-10') =>
  Array.from({ length: n }, (_, i) => ({
    id: `${month}-${i}`,
    date: `${month}-${String(i + 1).padStart(2, '0')}`,
    store: 'Amazon',
    start: '08:00',
    end: '16:00',
    value: 100,
    createdAt: i,
  }))

const base = { deposits: [], settings: { startDow: 2, endDow: 4, monthLimit: 14 } }
const ref = new Date(2026, 9, 29, 12, 0)

const d3 = monthlyDemand({ ...base, shifts: mk(3) }, ref)
check('contador conta os turnos do mês', d3.count, 3)
check('falta 11 quando tem 3', d3.remaining, 11)
check('progresso em % do limite', Math.round(d3.progress * 100), 21)
check('mês rotulado em pt-BR', d3.monthLabel.toLowerCase(), 'outubro de 2026')
check('frase padrão pede pra fazer dinheiro', d3.motivational.includes('Vamos lá, fazer dinheiro!!'), true)

const d12 = monthlyDemand({ ...base, shifts: mk(12) }, ref)
check('falta 2 quando tem 12', d12.remaining, 2)
check('perto do limite a frase muda', d12.motivational.includes('Falta só 2'), true)

const d14 = monthlyDemand({ ...base, shifts: mk(14) }, ref)
check('14/14 não deixa sobrar', d14.remaining, 0)
check('14/14 avisa que o limite bateu', d14.motivational.includes('Limite de 14'), true)
check('progresso trava em 100%', Math.round(d14.progress * 100), 100)

const dOutro = monthlyDemand({ ...base, shifts: [...mk(3), ...mk(2, '2026-09')] }, ref)
check('turno de outro mês não entra na conta', dOutro.count, 3)

// ---- nome do diarista (saudação do topo) ----
check('sem nome não há saudação', greetingFor(undefined), '')
check('nome em branco não há saudação', greetingFor('   '), '')
check('saudação usa o primeiro nome', greetingFor('Pedro'), 'Olá, Pedro')
check('saudação ignora o sobrenome', greetingFor('Pedro Silva'), 'Olá, Pedro')
check('saudação normaliza espaços', greetingFor('  Pedro   Silva  '), 'Olá, Pedro')
check('primeiro nome de nome completo', firstName('Pedro da Silva Junior'), 'Pedro')
check('normalizar colapsa espaços', normalizeName('  Pedro   Silva '), 'Pedro Silva')
check('normalizar apaga espaços vazios', normalizeName('    '), '')

// ---- campos digitados: horário sem relógio nativo ----
check('máscara: 2300 vira 23:00', maskTime('2300'), '23:00')
check('máscara: 2 fica 2', maskTime('2'), '2')
check('máscara: 23 fica 23', maskTime('23'), '23')
check('máscara: 235 vira 23:5', maskTime('235'), '23:5')
check('máscara: ignora letras', maskTime('ab23cd00'), '23:00')
check('máscara: corta em 4 dígitos', maskTime('230000'), '23:00')
check('23:00 é horário válido', isValidTime('23:00'), true)
check('08:00 é horário válido', isValidTime('08:00'), true)
check('24:00 não é horário válido', isValidTime('24:00'), false)
check('23:60 não é horário válido', isValidTime('23:60'), false)
check('2 não é horário válido', isValidTime('2'), false)

let hora = editTimeText('2', '2', true)
check('horário: a 1ª digitação troca o valor antigo', hora, '2')
hora = editTimeText('23', '3', false)
check('horário: 23', hora, '23')
hora = editTimeText('230', '0', false)
check('horário: 23:0', hora, '23:0')
hora = editTimeText('23:00', '0', false)
check('horário: 23:00', hora, '23:00')

// ---- campo de valor: "100" vira "100,00" ----
/** Simula a digitação no campo de valor (o navegador troca a seleção pelo que foi digitado). */
function digitarValor(campo, texto) {
  let atual = campo
  let cursor = 0
  for (const ch of texto) {
    const visivel = moneyFieldText(atual)
    const novo = visivel.slice(0, cursor) + ch + visivel.slice(cursor)
    const r = insertMoneyField(atual, novo, cursor, cursor)
    atual = r.field
    cursor = r.caret
  }
  return atual
}

const valor100 = digitarValor(EMPTY_MONEY, '100')
check('100 vira 100,00', moneyFieldText(valor100), '100,00')
check('o valor do campo é 100', moneyFieldValue(valor100), 100)
check('digitar 1 vira 1,00', moneyFieldText(digitarValor(EMPTY_MONEY, '1')), '1,00')
check('digitar 100,50 funciona', moneyFieldText(digitarValor(EMPTY_MONEY, '100,50')), '100,50')
check('o valor de 100,50', moneyFieldValue(digitarValor(EMPTY_MONEY, '100,50')), 100.5)

// cursor no fim do texto → digita os centavos
const comCentavos = insertMoneyField(valor100, '100,005', 6, 6)
check('centavos no fim viram 100,05', moneyFieldText(comCentavos.field), '100,05')
check('o valor com centavos é 100.05', moneyFieldValue(comCentavos.field), 100.05)

// apagar
const apagado = deleteMoneyField(valor100, 6, 6, true)
check('apagar no fim volta para 10,00', moneyFieldText(apagado.field), '10,00')
check('o valor depois de apagar é 10', moneyFieldValue(apagado.field), 10)
const apagadoCentavo = deleteMoneyField(comCentavos.field, 6, 6, true)
check('apagar o centavo digitado volta a 100,00', moneyFieldText(apagadoCentavo.field), '100,00')
check('apagar tudo limpa o campo', moneyFieldText(deleteMoneyField(valor100, 0, 6, true).field), '')

// campo já preenchido (edição de turno)
check('100 vira campo 100,00', moneyFieldText(moneyFieldFromValue(100)), '100,00')
check('100.05 vira campo 100,05', moneyFieldText(moneyFieldFromValue(100.05)), '100,05')
check('campo vazio não mostra nada', moneyFieldText(EMPTY_MONEY), '')

fs.rmSync(out, { force: true })
fs.rmSync(path.join(here, '.tmp-dates.mjs'), { force: true })

console.log(failures === 0 ? '\n✅ todas as regras passaram' : `\n❌ ${failures} falha(s)`)
process.exit(failures === 0 ? 0 : 1)
