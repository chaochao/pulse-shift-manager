import type { ScoringInput, StaffScoreDetail } from './types'

// Score B: Individual Staff Score (0-100 per staff member)
// Measures rest compliance, hours alignment, preferences, consecutive limits
export function scoreB(input: ScoringInput): { average: number; byStaff: StaffScoreDetail[] } {
  const { shifts, staff, rules, dateRange } = input

  const byStaff: StaffScoreDetail[] = staff.map(member => {
    const memberShifts = shifts
      .filter(s => s.staffId === member.id && s.status !== 'absent')
      .sort((a, b) => a.date.getTime() - b.date.getTime())

    const flags: string[] = []
    const scores: number[] = []

    // 1. Rest compliance: >= minRestHoursBetweenShifts between consecutive shifts
    let restScore = 100
    let restViolations = 0
    for (let i = 1; i < memberShifts.length; i++) {
      const gapHours = (memberShifts[i].date.getTime() - memberShifts[i - 1].date.getTime()) / 36e5
      if (gapHours < rules.minRestHoursBetweenShifts) {
        restViolations++
        flags.push(`Rest gap ${Math.round(gapHours)}h on ${memberShifts[i].date.toDateString()} (min ${rules.minRestHoursBetweenShifts}h)`)
      }
    }
    if (memberShifts.length > 1) {
      restScore = Math.max(0, 100 - (restViolations / (memberShifts.length - 1)) * 100)
    }
    scores.push(restScore)

    // 2. Consecutive shift compliance: <= maxConsecutiveShifts in a row
    let consecutiveScore = 100
    let maxRun = 0
    let currentRun = 1
    for (let i = 1; i < memberShifts.length; i++) {
      const dayDiff = Math.round((memberShifts[i].date.getTime() - memberShifts[i - 1].date.getTime()) / 864e5)
      if (dayDiff === 1) {
        currentRun++
        maxRun = Math.max(maxRun, currentRun)
      } else {
        currentRun = 1
      }
    }
    if (maxRun > member.maxConsecutiveShifts) {
      consecutiveScore = Math.max(0, 100 - (maxRun - member.maxConsecutiveShifts) * 20)
      flags.push(`Max ${maxRun} consecutive shifts (limit ${member.maxConsecutiveShifts})`)
    }
    scores.push(consecutiveScore)

    // 3. Hours alignment: actual hours vs contract hours per week
    const weeksInRange = Math.max(1, Math.ceil(
      (dateRange.end.getTime() - dateRange.start.getTime()) / (7 * 864e5)
    ))
    const totalHours = memberShifts.reduce((sum, s) => sum + s.hours, 0)
    const targetHours = member.contractHoursPerWeek * weeksInRange
    const hoursRatio = targetHours > 0 ? totalHours / targetHours : 1
    const hoursScore = Math.max(0, 100 - Math.abs(1 - hoursRatio) * 100)
    if (hoursRatio > 1.1) flags.push(`Over contracted hours: ${totalHours}h vs ${targetHours}h target`)
    if (hoursRatio < 0.9) flags.push(`Under contracted hours: ${totalHours}h vs ${targetHours}h target`)
    scores.push(hoursScore)

    // 4. Overtime ceiling: overtime < overtimeCeilingPct% of contract hours per week
    const overtimeCeiling = (rules.overtimeCeilingPct / 100) * member.contractHoursPerWeek * weeksInRange
    const overtime = Math.max(0, totalHours - targetHours)
    const overtimeScore = overtime <= overtimeCeiling ? 100 : Math.max(0, 100 - ((overtime - overtimeCeiling) / overtimeCeiling) * 100)
    if (overtime > overtimeCeiling) flags.push(`Overtime ${overtime}h exceeds ${Math.round(overtimeCeiling)}h ceiling`)
    scores.push(overtimeScore)

    // 5. Shift preference alignment
    let preferenceScore = 100
    if (member.preferredShift !== 'none') {
      const matching = memberShifts.filter(s => s.type === member.preferredShift).length
      preferenceScore = memberShifts.length > 0 ? (matching / memberShifts.length) * 100 : 100
      if (preferenceScore < 50) flags.push(`Only ${Math.round(preferenceScore)}% shifts match preferred "${member.preferredShift}"`)
    }
    scores.push(preferenceScore)

    // 6. Night shift monthly cap: <= nightLoadBufferPct% of maxNightShiftsPerMonth
    const nightShifts = memberShifts.filter(s => s.type === 'night').length
    const nightCap = (rules.nightLoadBufferPct / 100) * rules.maxNightShiftsPerMonth
    const nightScore = nightShifts <= nightCap ? 100 : Math.max(0, 100 - ((nightShifts - nightCap) / nightCap) * 100)
    if (nightShifts > nightCap) flags.push(`Night shifts ${nightShifts} exceeds buffer of ${nightCap}`)
    scores.push(nightScore)

    // 7. Recovery window: 2+ days off after 3 consecutive shifts
    let recoveryScore = 100
    let recoveryViolations = 0
    let recoveryChecks = 0
    let run = 1
    for (let i = 1; i < memberShifts.length; i++) {
      const dayDiff = Math.round((memberShifts[i].date.getTime() - memberShifts[i - 1].date.getTime()) / 864e5)
      if (dayDiff === 1) {
        run++
        if (run === member.maxConsecutiveShifts && i + 1 < memberShifts.length) {
          recoveryChecks++
          const nextGapHours = (memberShifts[i + 1].date.getTime() - memberShifts[i].date.getTime()) / 36e5
          if (nextGapHours < rules.minRestAfterStretchHours) {
            recoveryViolations++
            flags.push(`Less than ${rules.minRestAfterStretchHours}h recovery after stretch ending ${memberShifts[i].date.toDateString()}`)
          }
        }
      } else {
        run = 1
      }
    }
    if (recoveryChecks > 0) {
      recoveryScore = Math.max(0, 100 - (recoveryViolations / recoveryChecks) * 100)
    }
    scores.push(recoveryScore)

    const score = Math.round(average(scores))
    return { staffId: member.id, name: member.name, score, flags }
  })

  const avg = byStaff.length > 0 ? Math.round(average(byStaff.map(s => s.score))) : 100
  return { average: avg, byStaff }
}

function average(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length
}
