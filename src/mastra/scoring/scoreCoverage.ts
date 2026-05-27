import type { ScoringInput } from './types'

// Coverage Score (0-100): what fraction of required minimum slots are filled in the period.
//
// For every department × day × shift-type (day/night) that has a minimum > 0,
// a "slot" is created. A slot is filled when the number of non-absent scheduled
// shifts meets or exceeds the department minimum for that type.
//
//   score = filled_slots / total_slots × 100
//
// If no department has any minimum configured the score is 100 (nothing required).
// Extra staff beyond the minimum do not raise the score above 100.
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

