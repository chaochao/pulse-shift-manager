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
    const shifts = await prisma.shift.findMany({
      where: {
        ...(departmentId ? { departmentId } : {}),
        date: { gte: new Date(startDate), lte: new Date(endDate) },
      },
      include: { staff: true, department: true },
      orderBy: { date: 'asc' },
    })
    return shifts
  },
})
