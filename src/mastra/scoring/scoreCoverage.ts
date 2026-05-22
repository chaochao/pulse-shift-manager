import type { ScoringInput } from './types'

// Coverage Score (0-100): what fraction of required minimum slots are filled in the period
export function scoreCoverage(input: ScoringInput): number {
  const { shifts, departments, dateRange } = input

  const days = getDaysInRange(dateRange.start, dateRange.end)
  let total = 0
  let filled = 0

  for (const dept of departments) {
    for (const day of days) {
      for (const type of ['day', 'night'] as const) {
        const min = type === 'day' ? dept.minStaffDay : dept.minStaffNight
        if (min === 0) continue

        const count = shifts.filter(s =>
          s.departmentId === dept.id &&
          s.type === type &&
          isSameDay(s.date, day) &&
          s.status !== 'absent'
        ).length

        total++
        if (count >= min) filled++
      }
    }
  }

  return total === 0 ? 100 : Math.round((filled / total) * 100)
}

function getDaysInRange(start: Date, end: Date): Date[] {
  const days: Date[] = []
  const current = new Date(start)
  while (current <= end) {
    days.push(new Date(current))
    current.setUTCDate(current.getUTCDate() + 1)
  }
  return days
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
}

