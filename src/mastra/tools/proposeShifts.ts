import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { prisma } from './prisma'
import { scoreSchedule } from '../scoring'
import type { ScoringShift, ScoringStaff, ScoringDepartment, ScoringPatient, ScoringRules } from '../scoring'

const AssignmentSchema = z.object({
  staffId: z.string(),
  departmentId: z.string(),
  date: z.string().describe('ISO date string'),
  type: z.enum(['day', 'night']),
  hours: z.number().default(12),
})

export const proposeShifts = createTool({
  id: 'proposeShifts',
  description: 'Validate and store a set of proposed shift assignments. Call this TWICE — once with optimizeFor="coverage" and once with optimizeFor="staff" — to generate two options for the manager to choose from. Returns proposalId and scores. Does NOT write Shift records.',
  inputSchema: z.object({
    assignments: z.array(AssignmentSchema).describe('Proposed shift assignments'),
    optimizeFor: z.enum(['coverage', 'staff']).describe('What this proposal optimises for'),
    startDate: z.string().describe('Start of the period being scheduled'),
    endDate: z.string().describe('End of the period being scheduled'),
  }),
  execute: async ({ assignments, optimizeFor, startDate, endDate }) => {
    const start = new Date(startDate)
    const end = new Date(endDate)

    // Load context for validation
    const [existingShifts, allStaff, departments, patients, rulesRow, timeOff, sickCalls] = await Promise.all([
      prisma.shift.findMany({ where: { date: { gte: start, lte: end } } }),
      prisma.staff.findMany(),
      prisma.department.findMany(),
      prisma.patient.findMany({ where: { status: 'admitted' } }),
      prisma.schedulingRule.findFirst(),
      prisma.timeOffRequest.findMany({ where: { status: 'approved', startDate: { lte: end }, endDate: { gte: start } } }),
      prisma.sickCall.findMany({ where: { date: { gte: start, lte: end } } }),
    ])

    if (!rulesRow) throw new Error('No scheduling rules found.')

    const warnings: Array<{ rule: string; staffId: string; detail: string }> = []
    const violations: Array<{ rule: string; staffId: string; detail: string }> = []

    for (const a of assignments) {
      const staff = allStaff.find(s => s.id === a.staffId)
      const dept = departments.find(d => d.id === a.departmentId)
      if (!staff || !dept) continue

      const assignDate = new Date(a.date)

      // STRICT: time off
      const onTimeOff = timeOff.some(t =>
        t.staffId === a.staffId &&
        new Date(t.startDate) <= assignDate &&
        new Date(t.endDate) >= assignDate
      )
      if (onTimeOff) {
        violations.push({ rule: 'timeOff', staffId: a.staffId, detail: `${staff.name} has approved time off on ${assignDate.toDateString()}` })
        continue
      }

      // STRICT: sick call
      const onSickCall = sickCalls.some(sc =>
        sc.staffId === a.staffId &&
        new Date(sc.date).toDateString() === assignDate.toDateString()
      )
      if (onSickCall) {
        violations.push({ rule: 'sickCall', staffId: a.staffId, detail: `${staff.name} has a sick call on ${assignDate.toDateString()}` })
        continue
      }

      // STRICT: certification gate
      const requiredCerts = dept.requiredCertifications
        ? dept.requiredCertifications.split(',').map(c => c.trim()).filter(Boolean)
        : []
      const missingCerts = requiredCerts.filter(c => !staff.certifications.includes(c))
      if (missingCerts.length > 0) {
        violations.push({ rule: 'certifications', staffId: a.staffId, detail: `${staff.name} missing certs: ${missingCerts.join(', ')} required for ${dept.name}` })
        continue
      }

      // OVERRIDE-WITH-WARNING: rest between shifts
      type ShiftLike = { staffId: string; date: Date; type: string }
      const allStaffShifts: ShiftLike[] = [
        ...existingShifts.map(x => ({ staffId: x.staffId, date: new Date(x.date), type: x.type })),
        ...assignments.map(x => ({ staffId: x.staffId, date: new Date(x.date), type: x.type })),
      ]
        .filter(s => s.staffId === a.staffId)
        .sort((x, y) => x.date.getTime() - y.date.getTime())

      for (let i = 1; i < allStaffShifts.length; i++) {
        const gapHours = (allStaffShifts[i].date.getTime() - allStaffShifts[i - 1].date.getTime()) / 36e5
        if (gapHours < rulesRow.minRestHoursBetweenShifts && gapHours > 0) {
          warnings.push({ rule: 'minRest', staffId: a.staffId, detail: `${staff.name}: only ${Math.round(gapHours)}h rest before shift on ${assignDate.toDateString()}` })
        }
      }

      // OVERRIDE-WITH-WARNING: max night shifts per month
      const nightCount = [
        ...existingShifts.map(x => ({ staffId: x.staffId, type: x.type })),
        ...assignments.map(x => ({ staffId: x.staffId, type: x.type })),
      ].filter(s => s.staffId === a.staffId && s.type === 'night').length
      if (nightCount > rulesRow.maxNightShiftsPerMonth) {
        warnings.push({ rule: 'maxNightShifts', staffId: a.staffId, detail: `${staff.name}: ${nightCount} night shifts exceeds monthly max of ${rulesRow.maxNightShiftsPerMonth}` })
      }
    }

    // Score the proposed schedule (existing + new assignments merged)
    const proposedShifts: ScoringShift[] = [
      ...existingShifts,
      ...assignments.map(a => ({
        id: 'proposed' as string,
        staffId: a.staffId,
        departmentId: a.departmentId,
        date: new Date(a.date),
        type: a.type,
        hours: a.hours ?? 12,
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
      dateRange: { start, end },
    })

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

    const proposal = await prisma.shiftProposal.create({
      data: {
        optimizeFor,
        assignments: JSON.stringify(assignments),
        scores: JSON.stringify(scores),
        warnings: JSON.stringify([...warnings, ...scores.warnings]),
        status: 'pending',
        expiresAt,
      },
    })

    return {
      proposalId: proposal.id,
      optimizeFor,
      scores,
      warnings: [...warnings, ...scores.warnings],
      violations,
      hasViolations: violations.length > 0,
    }
  },
})
