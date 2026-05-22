import { fromZonedTime, toZonedTime, format } from 'date-fns-tz'

/** Convert a local date + hour in the hospital's timezone to a UTC Date */
export function shiftStartUTC(dateStr: string, hour: number, timezone: string): Date {
  const date = dateStr.slice(0, 10)
  return fromZonedTime(`${date}T${String(hour).padStart(2, '0')}:00:00`, timezone)
}

/** Get the start of a day (00:00:00) in the hospital's timezone, as UTC */
export function startOfDayUTC(dateStr: string, timezone: string): Date {
  const date = dateStr.slice(0, 10)
  return fromZonedTime(`${date}T00:00:00`, timezone)
}

/** Get the end of a day (23:59:59) in the hospital's timezone, as UTC */
export function endOfDayUTC(dateStr: string, timezone: string): Date {
  const date = dateStr.slice(0, 10)
  return fromZonedTime(`${date}T23:59:59`, timezone)
}

/** Format a UTC Date as a local date string (YYYY-MM-DD) in the hospital's timezone */
export function toLocalDateStr(date: Date, timezone: string): string {
  return format(toZonedTime(date, timezone), 'yyyy-MM-dd', { timeZone: timezone })
}

/** Format a UTC Date as a human-readable string in the hospital's timezone */
export function formatLocalDate(date: Date, timezone: string, fmt = 'EEE, MMM d'): string {
  return format(toZonedTime(date, timezone), fmt, { timeZone: timezone })
}

/** Return UTC start/end boundaries for the current Mon–Sun week in the hospital's timezone */
export function currentWeekUTC(timezone: string): { start: Date; end: Date; startStr: string; endStr: string } {
  const todayStr = format(toZonedTime(new Date(), timezone), 'yyyy-MM-dd', { timeZone: timezone })
  const [y, m, d] = todayStr.split('-').map(Number)
  const local = new Date(y, m - 1, d)
  const daysFromMon = (local.getDay() + 6) % 7
  const mon = new Date(local); mon.setDate(d - daysFromMon)
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
  const pad = (n: number) => String(n).padStart(2, '0')
  const startStr = `${mon.getFullYear()}-${pad(mon.getMonth() + 1)}-${pad(mon.getDate())}`
  const endStr = `${sun.getFullYear()}-${pad(sun.getMonth() + 1)}-${pad(sun.getDate())}`
  return { start: startOfDayUTC(startStr, timezone), end: endOfDayUTC(endStr, timezone), startStr, endStr }
}
