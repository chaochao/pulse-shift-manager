import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { prisma } from './prisma'

export const getPatients = createTool({
  id: 'getPatients',
  description: 'Fetch active patient census per department. Used to calculate nurse-patient ratios for staffing recommendations.',
  inputSchema: z.object({
    departmentId: z.string().optional().describe('Filter by department ID'),
  }),
  execute: async ({ departmentId }) => {
    const patients = await prisma.patient.findMany({
      where: {
        ...(departmentId ? { departmentId } : {}),
        status: 'admitted',
      },
      include: { department: true },
    })
    return patients
  },
})
