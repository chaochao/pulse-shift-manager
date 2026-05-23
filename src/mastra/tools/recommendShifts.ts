import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { prisma } from './prisma'
import { scoreSchedule } from '../scoring'
import type { ScoringShift, ScoringStaff, ScoringDepartment, ScoringPatient, ScoringRules } from '../scoring'
import { startOfDayUTC, endOfDayUTC, toLocalDateStr, currentWeekUTC } from './dateUtils'

export const recommendShifts = createTool({
  id: 'recommendShifts',
  description: 'Automatically find the best eligible staff for coverage gaps in a department and date range. Handles all constraint checking internally — certifications, time off, sick calls, rest periods. Stores a proposal and returns a proposalId for manager review. Use this for ANY "fill the gap" or "recommend staff" request.',
  inputSchema: z.object({
    departmentName: z.string().describe('Department name, e.g. "ICU", "Emergency"'),
    startDate: z.string().describe('ISO date string for start of period'),
    endDate: z.string().describe('ISO date string for end of period'),
  }),
  execute: async ({ departmentName, startDate, endDate }) => {
    try {
    const [rulesRow, hospitalSettings] = await Promise.all([
      prisma.schedulingRule.findFirst(),
      prisma.hospitalSettings.findFirst(),
    ])
    if (!rulesRow) throw new Error('No scheduling rules found.')

    const timezone = hospitalSettings?.timezone ?? 'America/Los_Angeles'
    const start = startOfDayUTC(startDate, timezone)
    const end = endOfDayUTC(endDate, timezone)

    const [departments, allStaff, existingShifts, allHistoricShifts, timeOff, sickCalls, patients] = await Promise.all([
      prisma.department.findMany(),
      prisma.staff.findMany(),
      prisma.shift.findMany({ where: { date: { gte: start, lte: end }, status: { not: 'absent' } } }),
      prisma.shift.findMany({ orderBy: { date: 'asc' } }),
      prisma.timeOffRequest.findMany({ where: { status: 'approved', startDate: { lte: end }, endDate: { gte: start } } }),
      prisma.sickCall.findMany({ where: { date: { gte: start, lte: end } } }),
      prisma.patient.findMany({ where: { status: 'admitted' } }),
    ])

    const dept = departments.find(d => d.name.toLowerCase() === departmentName.toLowerCase())
    if (!dept) {
      return { error: `Department "${departmentName}" not found. Available: ${departments.map(d => d.name).join(', ')}` }
    }

    const requiredCerts = dept.requiredCertifications
      ? dept.requiredCertifications.split(',').map((c: string) => c.trim()).filter(Boolean)
      : []

    const assignments: Array<{ staffId: string; departmentId: string; date: string; type: 'day' | 'night'; hours: number }> = []
    const unfillable: Array<{ date: string; type: string; reason: string }> = []

    const { start: weekStart, end: weekEnd, startStr: weekStartStr, endStr: weekEndStr } = currentWeekUTC(timezone)

    // Track who's been assigned per calendar day to prevent double-booking
    const assignedOnDay = new Map<string, Set<string>>()

    const current = new Date(start)
    while (current <= end) {
      const dayKey = toLocalDateStr(current, timezone)

      for (const shiftType of ['day', 'night'] as const) {
        const required = shiftType === 'day' ? dept.minStaffDay : dept.minStaffNight
        if (required === 0) continue

        const alreadyScheduled = existingShifts.filter(s =>
          s.departmentId === dept.id &&
          toLocalDateStr(new Date(s.date), timezone) === dayKey &&
          s.type === shiftType
        ).length

        const slotsNeeded = required - alreadyScheduled
        if (slotsNeeded <= 0) continue

        // Staff already picked for this exact slot (dept+date+type) in this run
        const pickedForSlot = new Set(
          assignments
            .filter(a => a.date.startsWith(dayKey) && a.type === shiftType && a.departmentId === dept.id)
            .map(a => a.staffId)
        )

        for (let slot = 0; slot < slotsNeeded; slot++) {
          const eligible = allStaff.filter(staff => {
            if (pickedForSlot.has(staff.id)) return false

            // Cert check
            if (requiredCerts.length > 0) {
              const missing = requiredCerts.filter((c: string) => !staff.certifications.includes(c))
              if (missing.length > 0) return false
            }

            // Time off
            if (timeOff.some(t =>
              t.staffId === staff.id &&
              new Date(t.startDate) <= current &&
              new Date(t.endDate) >= current
            )) return false

            // Sick call
            if (sickCalls.some(sc =>
              sc.staffId === staff.id &&
              toLocalDateStr(new Date(sc.date), timezone) === dayKey
            )) return false

            // Already working this day (existing shift or already assigned in this run)
            if (
              existingShifts.some(s => s.staffId === staff.id && toLocalDateStr(new Date(s.date), timezone) === dayKey) ||
              assignedOnDay.get(dayKey)?.has(staff.id)
            ) return false

            return true
          })

          if (eligible.length === 0) {
            // Diagnose why no staff are eligible
            const certified = allStaff.filter(s =>
              requiredCerts.length === 0 || requiredCerts.every((c: string) => s.certifications.includes(c))
            )
            const onTimeOff = certified.filter(s => timeOff.some(t =>
              t.staffId === s.id && new Date(t.startDate) <= current && new Date(t.endDate) >= current
            ))
            const alreadyWorking = certified.filter(s =>
              existingShifts.some(e => e.staffId === s.id && toLocalDateStr(new Date(e.date), timezone) === dayKey)
            )
            let reason = 'No eligible staff available'
            if (certified.length === 0) reason = `No staff hold required certifications (${requiredCerts.join(', ')})`
            else if (alreadyWorking.length === certified.length) reason = `All ${certified.length} certified staff (${certified.map(s => s.name).join(', ')}) already have a shift on this day`
            else if (onTimeOff.length > 0) reason = `Certified staff on time off: ${onTimeOff.map(s => s.name).join(', ')}`
            unfillable.push({ date: dayKey, type: shiftType, reason })
            continue
          }

          // Score each candidate: rest (40pts) + hours headroom (40pts) + preference (20pts)
          const scored = eligible.map(staff => {
            const staffShifts = [
              ...allHistoricShifts.filter(s => s.staffId === staff.id),
              ...assignments.filter(a => a.staffId === staff.id).map(a => ({ date: new Date(a.date) })),
            ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

            const lastShiftDate = staffShifts[0] ? new Date(staffShifts[0].date) : null
            const restHours = lastShiftDate
              ? (current.getTime() - lastShiftDate.getTime()) / 36e5
              : 999

            const scheduledHours = [
              ...allHistoricShifts.filter(s => s.staffId === staff.id && new Date(s.date) >= weekStart && new Date(s.date) <= weekEnd),
              ...assignments.filter(a => a.staffId === staff.id && new Date(a.date) >= weekStart && new Date(a.date) <= weekEnd),
            ].reduce((sum, s) => sum + (('hours' in s ? (s as { hours: number }).hours : null) ?? 12), 0)
            const hoursHeadroom = Math.max(0, (staff.contractHoursPerWeek ?? 36) - scheduledHours)

            const prefScore = staff.preferredShift === shiftType ? 20 : 0
            const restScore = Math.min(restHours, 72) / 72 * 40
            const hoursScore = Math.min(hoursHeadroom, 20) / 20 * 40

            return { staff, score: restScore + hoursScore + prefScore, restHours }
          })

          scored.sort((a, b) => b.score - a.score)
          const pick = scored[0]

          assignments.push({
            staffId: pick.staff.id,
            departmentId: dept.id,
            date: startOfDayUTC(dayKey, timezone).toISOString(),
            type: shiftType,
            hours: 12,
          })

          pickedForSlot.add(pick.staff.id)
          if (!assignedOnDay.has(dayKey)) assignedOnDay.set(dayKey, new Set())
          assignedOnDay.get(dayKey)!.add(pick.staff.id)
        }
      }

      current.setUTCDate(current.getUTCDate() + 1)
    }

    if (assignments.length === 0) {
      const reason = unfillable.length > 0
        ? unfillable.map(u => `${u.date} ${u.type}: ${u.reason}`).join('; ')
        : `No coverage gaps found for ${departmentName} in this period`
      return { error: reason }
    }

    // Score the current week (Mon–Sun), including proposed assignments that fall within it
    const weekExisting = allHistoricShifts.filter(s =>
      new Date(s.date) >= weekStart && new Date(s.date) <= weekEnd && s.status !== 'absent'
    )
    const weekProposed = assignments.filter(a => new Date(a.date) >= weekStart && new Date(a.date) <= weekEnd)
    const proposedShifts: ScoringShift[] = [
      ...weekExisting,
      ...weekProposed.map(a => ({
        id: 'proposed' as string,
        staffId: a.staffId,
        departmentId: a.departmentId,
        date: new Date(a.date),
        type: a.type,
        hours: a.hours,
        status: 'scheduled',
      })),
    ]

    const rules: ScoringRules = {
      minRestHoursBetweenShifts: rulesRow.minRestHoursBetweenShifts,
      maxNightShiftsPerMonth: rulesRow.maxNightShiftsPerMonth,
      maxShiftsPerWeek: rulesRow.maxShiftsPerWeek,
      maxHoursPerWeek: rulesRow.maxHoursPerWeek,
      overtimeCeilingPct: rulesRow.overtimeCeilingPct,
      nightLoadBufferPct: rulesRow.nightLoadBufferPct,
      minRestAfterStretchHours: rulesRow.minRestAfterStretchHours,
    }

    const scores = scoreSchedule({
      shifts: proposedShifts,
      staff: allStaff as ScoringStaff[],
      departments: departments as ScoringDepartment[],
      patients: patients as ScoringPatient[],
      rules,
      dateRange: { start: weekStart, end: weekEnd },
    })

    const proposal = await prisma.shiftProposal.create({
      data: {
        optimizeFor: 'coverage',
        assignments: JSON.stringify(assignments),
        scores: JSON.stringify({ ...scores, dateRange: { start: weekStartStr, end: weekEndStr } }),
        warnings: JSON.stringify(scores.warnings.slice(0, 10)),
        status: 'pending',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    })

    const staffMap = new Map(allStaff.map(s => [s.id, s.name]))
    const assignmentSummary = assignments.map(a => {
      const date = new Date(a.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      return `${date} ${a.type}: ${staffMap.get(a.staffId) ?? a.staffId}`
    })

    return {
      proposalId: proposal.id,
      departmentName,
      totalAssignments: assignments.length,
      unfillableSlots: unfillable.length,
      scores: { overall: scores.overall, coverage: scores.coverage, individual: scores.individual.average },
      assignments: assignmentSummary,
      warnings: scores.warnings.slice(0, 3).map(w => w.detail),
    }
    } catch (err) {
      console.error('[recommendShifts] error:', err)
      return { error: err instanceof Error ? err.message : String(err) }
    }
  },
})
