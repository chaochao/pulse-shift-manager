import type { ScoringInput } from './types'

// Equity Score (0-100): measures how fairly undesirable shifts are distributed across the team.
// Combines three fairness signals:
//   Night fairness  (40%) — std dev of night shift counts; penalises one person carrying all nights
//   Weekend fairness(35%) — std dev of Sat/Sun counts; tighter tolerance than nights
//   Overtime spread (25%) — penalises any individual carrying > 2× the team's average overtime
// Not yet wired into the overall score in index.ts — reserved for a future "fairness" dimension.
export function scoreEquity(input: ScoringInput): number {
  const { shifts, staff } = input

  if (staff.length < 2) return 100

  const activeShifts = shifts.filter(s => s.status !== 'absent')

  // Night shift distribution — std dev <= 1.5 → 100; std dev >= 4.0 → 0
  const nightCounts = staff.map(s => activeShifts.filter(sh => sh.staffId === s.id && sh.type === 'night').length)
  const nightStdDev = stdDev(nightCounts)
  const nightScore = Math.max(0, Math.min(100, 100 - ((nightStdDev - 1.5) / 2.5) * 100))

  // Weekend shift distribution — std dev <= 1.0 → 100; std dev >= 3.5 → 0
  const weekendCounts = staff.map(s =>
    activeShifts.filter(sh => {
      const day = sh.date.getDay()
      return sh.staffId === s.id && (day === 0 || day === 6)
    }).length
  )
  const weekendStdDev = stdDev(weekendCounts)
  const weekendScore = Math.max(0, Math.min(100, 100 - ((weekendStdDev - 1.0) / 2.5) * 100))

  // Overtime spread — count staff carrying > 2× team average overtime
  const totalHoursByStaff = staff.map(s => ({
    contractHoursPerWeek: s.contractHoursPerWeek,
    actual: activeShifts.filter(sh => sh.staffId === s.id).reduce((sum, sh) => sum + sh.hours, 0)
  }))
  const overtimes = totalHoursByStaff.map(s => Math.max(0, s.actual - s.contractHoursPerWeek))
  const avgOvertime = average(overtimes)
  const overtimeViolations = avgOvertime > 0
    ? overtimes.filter(o => o > avgOvertime * 2).length
    : 0
  const overtimeScore = Math.max(0, 100 - (overtimeViolations / staff.length) * 100)

  return Math.round((nightScore * 0.40) + (weekendScore * 0.35) + (overtimeScore * 0.25))
}

function stdDev(nums: number[]): number {
  if (nums.length < 2) return 0
  const avg = average(nums)
  const variance = average(nums.map(n => Math.pow(n - avg, 2)))
  return Math.sqrt(variance)
}

function average(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length
}
