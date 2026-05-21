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
