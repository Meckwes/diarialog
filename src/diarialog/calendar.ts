import type { Shift } from './types'
import { durationHours, money, parseYmd } from './dates'

const TZ = 'America/Fortaleza'

/** Título no mesmo estilo que o diarista usa no calendário do celular. */
export function shiftTitle(shift: Shift): string {
  return `Trabalho ${String(shift.store).toLowerCase()} · ${money(shift.value)} · ${shift.start} às ${shift.end}`
}

function stamp(date: Date, time: string): string {
  const [h, m] = time.split(':').map(Number)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(h || 0)}${pad(m || 0)}00`
}

/** Datas (início/fim) do turno, com virada de meia-noite quando aplicável. */
export function shiftDates(shift: Shift): { start: Date; end: Date } {
  const start = parseYmd(shift.date)
  const end = parseYmd(shift.date)
  const [sh, sm] = shift.start.split(':').map(Number)
  const [eh, em] = shift.end.split(':').map(Number)
  start.setHours(sh || 0, sm || 0, 0, 0)
  end.setHours(eh || 0, em || 0, 0, 0)
  if (end.getTime() <= start.getTime()) end.setDate(end.getDate() + 1)
  return { start, end }
}

export function googleCalendarUrl(shift: Shift): string {
  const { start, end } = shiftDates(shift)
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: shiftTitle(shift),
    dates: `${stamp(start, shift.start)}/${stamp(end, shift.end)}`,
    ctz: TZ,
    details:
      `Valor a receber: ${money(shift.value)}\n` +
      `Turno: ${shift.start} às ${shift.end} (${durationHours(shift.start, shift.end)}h)\n` +
      (shift.note ? `Obs: ${shift.note}\n` : '') +
      'Registrado no DiáriaLog.',
    location: shift.store,
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

function icsEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

export function icsFor(shifts: Shift[]): string {
  const now = stamp(new Date(), '00:00')
  const events = shifts
    .map((shift) => {
      const { start, end } = shiftDates(shift)
      return [
        'BEGIN:VEVENT',
        `UID:${shift.id}@diarialog`,
        `DTSTAMP:${now}`,
        `DTSTART:${stamp(start, shift.start)}`,
        `DTEND:${stamp(end, shift.end)}`,
        `SUMMARY:${icsEscape(shiftTitle(shift))}`,
        `DESCRIPTION:${icsEscape(
          `Valor a receber: ${money(shift.value)}\nTurno: ${shift.start} às ${shift.end}\n${shift.note ?? ''}`,
        )}`,
        `LOCATION:${icsEscape(shift.store)}`,
        'END:VEVENT',
      ].join('\r\n')
    })
    .join('\r\n')
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DiariaLog//Wesley Carvalho//PT-BR', 'CALSCALE:GREGORIAN', events, 'END:VCALENDAR'].join('\r\n')
}

export function downloadFile(filename: string, content: string, mime = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
