import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { prisma } from './prisma'

export const getCoverageGaps = createTool({
  id: 'getCoverageGaps',
  description: 'Check staffing coverage gaps for a date range. For each department and shift type, compares scheduled headcount to the minimum required. Use this for gap analysis queries.',
  inputSchema: z.object({
    startDate: z.string().describe('Start date ISO string'),
    endDate: z.string().describe('End date ISO string'),
  }),
  execute: async ({ startDate, endDate }) => {
    const start = new Date(startDate)
    const end = new Date(endDate)

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
      const dateStr = current.toISOString().split('T')[0]

      for (const dept of departments) {
        for (const shiftType of ['day', 'night'] as const) {
          const required = shiftType === 'day' ? dept.minStaffDay : dept.minStaffNight
          if (required === 0) continue

          const scheduled = shifts.filter(s =>
            s.departmentId === dept.id &&
            new Date(s.date).toDateString() === current.toDateString() &&
            s.type === shiftType
          ).length

          if (scheduled < required) {
            gaps.push({ department: dept.name, date: dateStr, shift: shiftType, scheduled, required, gap: required - scheduled })
            affectedDepts.add(dept.name)
          }
        }
      }

      current.setDate(current.getDate() + 1)
    }

    const msPerDay = 24 * 60 * 60 * 1000
    const daysChecked = Math.round((end.getTime() - start.getTime()) / msPerDay) + 1

    return {
      gaps,
      summary: {
        totalGaps: gaps.length,
        daysChecked,
        departmentsAffected: Array.from(affectedDepts),
      },
    }
  },
})
