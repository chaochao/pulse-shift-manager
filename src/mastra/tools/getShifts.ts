import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { prisma } from './prisma'

export const getShifts = createTool({
  id: 'getShifts',
  description: 'Fetch shifts for a date range, optionally filtered by department. Returns shifts with staff and department details.',
  inputSchema: z.object({
    departmentId: z.string().optional().describe('Filter by department ID'),
    startDate: z.string().describe('Start date ISO string'),
    endDate: z.string().describe('End date ISO string'),
  }),
  execute: async ({ departmentId, startDate, endDate }) => {
    try {
    const shifts = await prisma.shift.findMany({
      where: {
        ...(departmentId ? { departmentId } : {}),
        date: { gte: new Date(startDate), lte: new Date(endDate) },
      },
      select: {
        id: true,
        date: true,
        type: true,
        hours: true,
        status: true,
        staffId: true,
        departmentId: true,
        staff: { select: { name: true, role: true } },
        department: { select: { name: true } },
      },
      orderBy: { date: 'asc' },
    })
    return shifts
    } catch (err) {
      console.error('[getShifts] error:', err)
      return { error: err instanceof Error ? err.message : String(err) }
    }
  },
})
