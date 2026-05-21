import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { prisma } from './prisma'

export const getStaff = createTool({
  id: 'getStaff',
  description: 'Fetch all staff members, optionally filtered by department. Returns certifications, preferences, and contract hours.',
  inputSchema: z.object({
    departmentId: z.string().optional().describe('Filter by department ID'),
  }),
  execute: async ({ departmentId }) => {
    try {
    const staff = await prisma.staff.findMany({
      where: departmentId ? { departmentId } : undefined,
      include: { department: true },
      orderBy: { name: 'asc' },
    })
    return staff
    } catch (err) {
      console.error('[getStaff] error:', err)
      return { error: err instanceof Error ? err.message : String(err) }
    }
  },
})
