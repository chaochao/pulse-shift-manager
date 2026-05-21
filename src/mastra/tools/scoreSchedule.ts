import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { prisma } from './prisma'
import { scoreSchedule as compute } from '../scoring'
import type { ScoringShift, ScoringStaff, ScoringDepartment, ScoringPatient, ScoringRules } from '../scoring'

export const scoreScheduleTool = createTool({
  id: 'scoreSchedule',
  description: 'Score the current schedule for a date range using the three-dimensional scoring framework: Coverage (A), Individual (B), and Equity (C). Returns overall score, breakdown, and warnings.',
  inputSchema: z.object({
    departmentId: z.string().optional().describe('Scope to a single department, or omit for hospital-wide'),
    startDate: z.string().describe('Start date ISO string'),
    endDate: z.string().describe('End date ISO string'),
  }),
  execute: async ({ departmentId, startDate, endDate }) => {
    try {
    const start = new Date(startDate)
    const end = new Date(endDate)

    const [shifts, staff, departments, patients, rulesRow] = await Promise.all([
      prisma.shift.findMany({
        where: { ...(departmentId ? { departmentId } : {}), date: { gte: start, lte: end } },
      }),
      prisma.staff.findMany({ where: departmentId ? { departmentId } : undefined }),
      prisma.department.findMany({ where: departmentId ? { id: departmentId } : undefined }),
      prisma.patient.findMany({ where: { ...(departmentId ? { departmentId } : {}), status: 'admitted' } }),
      prisma.schedulingRule.findFirst(),
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
    }
    } catch (err) {
      console.error('[scoreSchedule] error:', err)
      return { error: err instanceof Error ? err.message : String(err) }
    }
  },
})
