import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { prisma } from './prisma'
import { scoreSchedule as compute } from '../scoring'
import type { ScoringShift, ScoringStaff, ScoringDepartment, ScoringPatient, ScoringRules } from '../scoring'
import { currentWeekUTC } from './dateUtils'

export const scoreScheduleTool = createTool({
  id: 'scoreSchedule',
  description: 'Score the current week (Mon–Sun) schedule hospital-wide. Coverage = filled slots ÷ required slots × 100 for the current week. Optionally scope to a single department.',
  inputSchema: z.object({
    departmentId: z.string().optional().describe('Scope to a single department, or omit for hospital-wide'),
  }),
  execute: async ({ departmentId }) => {
    try {
    const [rulesRow, hospitalSettings] = await Promise.all([
      prisma.schedulingRule.findFirst(),
      prisma.hospitalSettings.findFirst(),
    ])
    const timezone = hospitalSettings?.timezone ?? 'America/Los_Angeles'
    const { start, end, startStr, endStr } = currentWeekUTC(timezone)

    const [shifts, staff, departments, patients] = await Promise.all([
      prisma.shift.findMany({
        where: { ...(departmentId ? { departmentId } : {}), date: { gte: start, lte: end } },
      }),
      prisma.staff.findMany({ where: departmentId ? { departmentId } : undefined }),
      prisma.department.findMany({ where: departmentId ? { id: departmentId } : undefined }),
      prisma.patient.findMany({ where: { ...(departmentId ? { departmentId } : {}), status: 'admitted' } }),
    ])

    if (!rulesRow) throw new Error('No scheduling rules found.')

    const rules: ScoringRules = {
      minRestHoursBetweenShifts: rulesRow.minRestHoursBetweenShifts,
      maxNightShiftsPerMonth: rulesRow.maxNightShiftsPerMonth,
      maxShiftsPerWeek: rulesRow.maxShiftsPerWeek,
      maxHoursPerWeek: rulesRow.maxHoursPerWeek,
      overtimeCeilingPct: rulesRow.overtimeCeilingPct,
      nightLoadBufferPct: rulesRow.nightLoadBufferPct,
      minRestAfterStretchHours: rulesRow.minRestAfterStretchHours,
    }

    const full = compute({
      shifts: shifts as ScoringShift[],
      staff: staff as ScoringStaff[],
      departments: departments as ScoringDepartment[],
      patients: patients as ScoringPatient[],
      rules,
      dateRange: { start, end },
    })

    return {
      overall: full.overall,
      coverage: full.coverage,
      individual: full.individual.average,
      warnings: full.warnings.slice(0, 5),
      violations: full.violations,
      dateRange: { start: startStr, end: endStr },
    }
    } catch (err) {
      console.error('[scoreSchedule] error:', err)
      return { error: err instanceof Error ? err.message : String(err) }
    }
  },
})
