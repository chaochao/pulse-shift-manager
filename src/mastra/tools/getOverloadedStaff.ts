import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { prisma } from './prisma'
import { startOfDayUTC, endOfDayUTC } from './dateUtils'

function longestStreak(dates: string[]): number {
  const unique = [...new Set(dates)].sort()
  if (unique.length === 0) return 0
  let max = 1, cur = 1
  for (let i = 1; i < unique.length; i++) {
    const prev = new Date(unique[i - 1]).getTime()
    const next = new Date(unique[i]).getTime()
    if (next - prev === 86_400_000) { cur++; if (cur > max) max = cur }
    else cur = 1
  }
  return max
}

export const getOverloadedStaff = createTool({
  id: 'getOverloadedStaff',
  description: 'Identify staff who are overloaded in a date range — over the pro-rated hour limit or with too many consecutive shifts. Use this for any "is staff overloaded?" query.',
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

      const [shifts, rules] = await Promise.all([
        prisma.shift.findMany({
          where: { date: { gte: start, lte: end }, status: { not: 'absent' } },
          select: {
            staffId: true,
            date: true,
            hours: true,
            staff: { select: { name: true, role: true, maxConsecutiveShifts: true } },
            department: { select: { name: true } },
          },
        }),
        prisma.schedulingRule.findFirst({
          select: { maxHoursPerWeek: true },
        }),
      ])

      const maxHoursPerWeek = rules?.maxHoursPerWeek ?? 40
      const periodDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
      const hoursLimit = Math.round((periodDays / 7) * maxHoursPerWeek)

      // Group shifts by staffId
      const byStaff = new Map<string, typeof shifts>()
      for (const s of shifts) {
        if (!byStaff.has(s.staffId)) byStaff.set(s.staffId, [])
        byStaff.get(s.staffId)!.push(s)
      }

      const overloaded: Array<{
        staffId: string
        name: string
        department: string
        role: string
        hours: number
        hoursLimit: number
        consecutiveDays: number
        maxConsecutive: number
        issues: string[]
      }> = []

      for (const [staffId, staffShifts] of byStaff) {
        const first = staffShifts[0]
        const hours = staffShifts.reduce((sum, s) => sum + s.hours, 0)
        const dates = staffShifts.map(s => s.date.toISOString().slice(0, 10))
        const streak = longestStreak(dates)
        const maxConsec = first.staff.maxConsecutiveShifts ?? 3

        const issues: string[] = []
        if (hours > hoursLimit) issues.push(`Over hour limit (+${hours - hoursLimit}h)`)
        if (streak > maxConsec) issues.push(`${streak} consecutive days (max ${maxConsec})`)

        if (issues.length > 0) {
          overloaded.push({
            staffId,
            name: first.staff.name,
            department: first.department.name,
            role: first.staff.role,
            hours,
            hoursLimit,
            consecutiveDays: streak,
            maxConsecutive: maxConsec,
            issues,
          })
        }
      }

      return {
        overloaded,
        total: overloaded.length,
        periodDays,
        hoursLimit,
      }
    } catch (err) {
      console.error('[getOverloadedStaff] error:', err)
      return { error: err instanceof Error ? err.message : String(err) }
    }
  },
})
