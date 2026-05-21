import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { prisma } from './prisma'

export const getBlockedDates = createTool({
  id: 'getBlockedDates',
  description: 'Fetch all dates where staff are unavailable due to approved time-off requests or sick calls. Use this before proposing any shift assignment.',
  inputSchema: z.object({
    startDate: z.string().describe('Start date ISO string'),
    endDate: z.string().describe('End date ISO string'),
  }),
  execute: async ({ startDate, endDate }) => {
    const start = new Date(startDate)
    const end = new Date(endDate)

    const [timeOffRequests, sickCalls] = await Promise.all([
      prisma.timeOffRequest.findMany({
        where: {
          status: 'approved',
          startDate: { lte: end },
          endDate: { gte: start },
        },
        include: { staff: true },
      }),
      prisma.sickCall.findMany({
        where: { date: { gte: start, lte: end } },
        include: { staff: true },
      }),
    ])

    return { timeOffRequests, sickCalls }
  },
})
