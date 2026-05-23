import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { prisma } from './prisma'
import { startOfDayUTC, endOfDayUTC, toLocalDateStr } from './dateUtils'

export const getCoverageGaps = createTool({
  id: 'getCoverageGaps',
  description: 'Check staffing coverage gaps for a date range. For each department and shift type, compares scheduled headcount to the minimum required. Use this for gap analysis queries.',
  inputSchema: z.object({
    startDate: z.string().describe('Start date ISO string'),
    endDate: z.string().describe('End date ISO string'),
  }),
  execute: async ({ startDate, endDate }) => {
    try {
    const hospitalSettings = await prisma.hospitalSettings.findFirst()
    const timezone = hospitalSettings?.timezone ?? 'America/Los_Angeles'

    const start = startOfDayUTC(startDate, timezone)
    const end = endOfDayUTC(endDate, timezone)

    const [shifts, departments] = await Promise.all([
      prisma.shift.findMany({
        where: { date: { gte: start, lte: end }, status: { not: 'absent' } },
      }),
      prisma.department.findMany(),
    ])

    const gaps: Array<{
      department: string
      date: string
      shift: string
      scheduled: number
      required: number
      gap: number
    }> = []

    const affectedDepts = new Set<string>()
    const current = new Date(start)

    while (current <= end) {
      const localDateStr = toLocalDateStr(current, timezone)

      for (const dept of departments) {
        for (const shiftType of ['day', 'night'] as const) {
          const required = shiftType === 'day' ? dept.minStaffDay : dept.minStaffNight
          if (required === 0) continue

          const scheduled = shifts.filter(s =>
            s.departmentId === dept.id &&
            toLocalDateStr(new Date(s.date), timezone) === localDateStr &&
            s.type === shiftType
          ).length

          if (scheduled < required) {
            gaps.push({ department: dept.name, date: localDateStr, shift: shiftType, scheduled, required, gap: required - scheduled })
            affectedDepts.add(dept.name)
          }
        }
      }

      current.setUTCDate(current.getUTCDate() + 1)
    }

    const msPerDay = 24 * 60 * 60 * 1000
    const daysChecked = Math.floor((end.getTime() - start.getTime()) / msPerDay) + 1

    return {
      gaps,
      summary: {
        totalGaps: gaps.length,
        daysChecked,
        departmentsAffected: Array.from(affectedDepts),
      },
    }
    } catch (err) {
      console.error('[getCoverageGaps] error:', err)
      return { error: err instanceof Error ? err.message : String(err) }
    }
  },
})
