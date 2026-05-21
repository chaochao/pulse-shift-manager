import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { prisma } from './prisma'

export const confirmShifts = createTool({
  id: 'confirmShifts',
  description: 'Confirm a pending shift proposal and write the assignments as Shift records to the database. Only call this after the manager has chosen an option.',
  inputSchema: z.object({
    proposalId: z.string().describe('The proposal ID returned by proposeShifts'),
  }),
  execute: async ({ proposalId }) => {

    const proposal = await prisma.shiftProposal.findUnique({ where: { id: proposalId } })
    if (!proposal) throw new Error(`Proposal ${proposalId} not found.`)
    if (proposal.status === 'confirmed') throw new Error('This proposal has already been confirmed.')
    if (proposal.status === 'rejected') throw new Error('This proposal has been rejected.')
    if (new Date(proposal.expiresAt) < new Date()) throw new Error('This proposal has expired. Please request a new recommendation.')

    const assignments = JSON.parse(proposal.assignments) as Array<{
      staffId: string
      departmentId: string
      date: string
      type: string
      hours: number
    }>

    await prisma.$transaction([
      ...assignments.map(a =>
        prisma.shift.create({
          data: {
            staffId: a.staffId,
            departmentId: a.departmentId,
            date: new Date(a.date),
            type: a.type,
            hours: a.hours,
            status: 'scheduled',
          },
        })
      ),
      prisma.shiftProposal.update({
        where: { id: proposalId },
        data: { status: 'confirmed' },
      }),
    ])

    return { ok: true, confirmedCount: assignments.length }
  },
})
