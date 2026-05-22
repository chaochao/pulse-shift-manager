import { Router } from 'express'
import { z } from 'zod'
import { shiftAgent } from '../mastra/agents/shift-agent'
import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

const router = Router()
const url = process.env.PULSE_DATABASE_URL ?? 'file:./pulse.db'
const adapter = new PrismaBetterSqlite3({ url })
const prisma = new PrismaClient({ adapter })

const chatSchema = z.object({
  message: z.string().min(1),
  threadId: z.string().uuid(),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).optional(),
})

const confirmSchema = z.object({
  proposalId: z.string().min(1),
})


router.post('/', async (req, res: import('express').Response) => {
  const abortController = new AbortController()
  let streamStarted = false

  res.on('close', () => {
    if (streamStarted) abortController.abort()
  })

  try {
    const { message, threadId, history } = chatSchema.parse(req.body)

    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is missing.')
    }

    res.status(200)
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()
    streamStarted = true

    const now = new Date()
    const todayISO = now.toISOString().slice(0, 10)

    // Week = Monday to Sunday
    const dow = now.getDay() // 0=Sun, 1=Mon, ..., 6=Sat
    const daysFromMon = (dow + 6) % 7
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - daysFromMon)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 6)
    const weekStartISO = weekStart.toISOString().slice(0, 10)
    const weekEndISO = weekEnd.toISOString().slice(0, 10)

    const nextWeekStart = new Date(weekStart)
    nextWeekStart.setDate(weekStart.getDate() + 7)
    const nextWeekEnd = new Date(weekEnd)
    nextWeekEnd.setDate(weekEnd.getDate() + 7)
    const nextWeekStartISO = nextWeekStart.toISOString().slice(0, 10)
    const nextWeekEndISO = nextWeekEnd.toISOString().slice(0, 10)

    const dateContext = `[System context: Today is ${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} (${todayISO}). Weeks run Monday–Sunday. This week = ${weekStartISO} to ${weekEndISO}. Next week = ${nextWeekStartISO} to ${nextWeekEndISO}. Always use these exact ISO dates when calling tools for relative periods like "this week" or "next week".]`

    const historyMessages = (history ?? []).map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

    const stream = await shiftAgent.stream(
      [...historyMessages, { role: 'user', content: `${dateContext}\n\n${message}` }],
      {
        memory: { thread: threadId, resource: 'shift-manager', options: { lastMessages: 20 } },
        abortSignal: abortController.signal,
      }
    )

    for await (const chunk of stream.fullStream) {
      if (chunk.type === 'text-delta') {
        res.write(`event: delta\ndata: ${JSON.stringify({ text: chunk.payload.text })}\n\n`)
      } else if (chunk.type === 'tool-call') {
        console.log(`[shift-agent] tool-call: ${chunk.payload.toolName}`, JSON.stringify(chunk.payload.args).slice(0, 200))
        res.write(`event: tool-call\ndata: ${JSON.stringify({
          toolName: chunk.payload.toolName,
          args: chunk.payload.args,
        })}\n\n`)
      } else if (chunk.type === 'tool-result') {
        const result = chunk.payload.result
        const resultStr = JSON.stringify(result)
        const isError = result && typeof result === 'object' && 'error' in result
        if (isError) {
          console.error(`[shift-agent] tool-error: ${chunk.payload.toolName}`, result)
        } else {
          console.log(`[shift-agent] tool-result: ${chunk.payload.toolName} (${resultStr.length} chars)`)
        }
        res.write(`event: tool-result\ndata: ${JSON.stringify({
          toolName: chunk.payload.toolName,
          result,
        })}\n\n`)
      } else if (chunk.type === 'error') {
        console.error(`[shift-agent] stream error:`, chunk.payload)
      }
    }

    res.write(`event: done\ndata: {}\n\n`)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error(`[shift-agent] fatal error (streamStarted=${streamStarted}):`, err)
    if (streamStarted) {
      res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`)
    } else {
      res.status(400).json({ error: message })
      return
    }
  } finally {
    res.end()
  }
})

router.get('/proposal/:id', async (req, res: import('express').Response) => {
  try {
    const proposal = await prisma.shiftProposal.findUnique({ where: { id: req.params.id } })
    if (!proposal) return void res.status(404).json({ error: 'Proposal not found.' })
    res.json({
      ...proposal,
      assignments: JSON.parse(proposal.assignments),
      scores: JSON.parse(proposal.scores),
      warnings: JSON.parse(proposal.warnings),
    })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
})

router.post('/confirm', async (req, res: import('express').Response) => {
  try {
    const { proposalId } = confirmSchema.parse(req.body)

    const proposal = await prisma.shiftProposal.findUnique({ where: { id: proposalId } })
    if (!proposal) return void res.status(404).json({ error: 'Proposal not found.' })
    if (proposal.status === 'confirmed') return void res.status(400).json({ error: 'Already confirmed.' })
    if (proposal.status === 'rejected') return void res.status(400).json({ error: 'Proposal was rejected.' })
    if (new Date(proposal.expiresAt) < new Date()) return void res.status(400).json({ error: 'Proposal has expired.' })

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
            hours: a.hours ?? 12,
            status: 'scheduled',
          },
        })
      ),
      prisma.shiftProposal.update({
        where: { id: proposalId },
        data: { status: 'confirmed' },
      }),
    ])

    res.json({ ok: true, confirmedCount: assignments.length })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
})

router.post('/reject', async (req, res: import('express').Response) => {
  try {
    const { proposalId } = confirmSchema.parse(req.body)

    const proposal = await prisma.shiftProposal.findUnique({ where: { id: proposalId } })
    if (!proposal) return void res.status(404).json({ error: 'Proposal not found.' })
    if (proposal.status !== 'pending') return void res.status(400).json({ error: `Proposal is already ${proposal.status}.` })

    await prisma.shiftProposal.update({
      where: { id: proposalId },
      data: { status: 'rejected' },
    })

    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
})

export default router
