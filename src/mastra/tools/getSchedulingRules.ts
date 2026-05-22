import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { prisma } from './prisma'

export const getSchedulingRules = createTool({
  id: 'getSchedulingRules',
  description: 'Fetch the global scheduling rules including rest requirements, shift limits, and manager-configured thresholds.',
  inputSchema: z.object({}),
  execute: async () => {
    try {
    const rules = await prisma.schedulingRule.findFirst({
      select: {
        minRestHoursBetweenShifts: true,
        maxNightShiftsPerMonth: true,
        maxShiftsPerWeek: true,
        maxHoursPerWeek: true,
        minRestAfterStretchHours: true,
      }
    })
    if (!rules) throw new Error('No scheduling rules found. Run the seed script first.')
    return rules
    } catch (err) {
      console.error('[getSchedulingRules] error:', err)
      return { error: err instanceof Error ? err.message : String(err) }
    }
  },
})
