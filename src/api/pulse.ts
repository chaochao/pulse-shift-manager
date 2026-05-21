import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

const router = Router()
const url = process.env.PULSE_DATABASE_URL ?? 'file:./pulse.db'
const adapter = new PrismaBetterSqlite3({ url })
const prisma = new PrismaClient({ adapter })

router.get('/departments', async (_req, res) => {
  try {
    const departments = await prisma.department.findMany({ orderBy: { name: 'asc' } })
    res.json(departments)
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

router.get('/staff', async (req, res) => {
  try {
    const where = req.query.departmentId
      ? { departmentId: String(req.query.departmentId) }
      : undefined
    const staff = await prisma.staff.findMany({
      where,
      include: { department: true },
      orderBy: { name: 'asc' }
    })
    res.json(staff)
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

router.get('/shifts', async (req, res) => {
  try {
    const { start, end } = req.query
    if (!start || !end) { res.status(400).json({ error: 'start and end are required' }); return }
    const shifts = await prisma.shift.findMany({
      where: { date: { gte: new Date(String(start)), lte: new Date(String(end)) } },
      include: { staff: { include: { department: true } }, department: true },
      orderBy: { date: 'asc' }
    })
    res.json(shifts)
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

router.post('/shifts', async (req, res) => {
  try {
    const { staffId, departmentId, date, type, hours } = req.body
    const shift = await prisma.shift.create({
      data: { staffId, departmentId, date: new Date(date), type, hours: Number(hours) },
      include: { staff: { include: { department: true } }, department: true }
    })
    res.json(shift)
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

router.put('/shifts/:id', async (req, res) => {
  try {
    const { staffId, departmentId, type, hours, status } = req.body
    const shift = await prisma.shift.update({
      where: { id: req.params.id },
      data: { staffId, departmentId, type, hours: Number(hours), status },
      include: { staff: { include: { department: true } }, department: true }
    })
    res.json(shift)
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

router.delete('/shifts/:id', async (req, res) => {
  try {
    await prisma.shift.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

router.get('/patients', async (req, res) => {
  try {
    const where = req.query.departmentId ? { departmentId: String(req.query.departmentId) } : undefined
    const patients = await prisma.patient.findMany({
      where,
      include: { department: true },
      orderBy: { expectedDischargeAt: 'asc' }
    })
    res.json(patients)
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

router.post('/patients', async (req, res) => {
  try {
    const { name, departmentId, admittedAt, expectedDischargeAt, notes } = req.body
    const patient = await prisma.patient.create({
      data: { name, departmentId, admittedAt: new Date(admittedAt), expectedDischargeAt: new Date(expectedDischargeAt), notes: notes ?? '' },
      include: { department: true }
    })
    res.json(patient)
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

router.put('/patients/:id', async (req, res) => {
  try {
    const { name, departmentId, admittedAt, expectedDischargeAt, status, notes } = req.body
    const patient = await prisma.patient.update({
      where: { id: req.params.id },
      data: { name, departmentId, admittedAt: new Date(admittedAt), expectedDischargeAt: new Date(expectedDischargeAt), status, notes },
      include: { department: true }
    })
    res.json(patient)
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

router.delete('/patients/:id', async (req, res) => {
  try {
    await prisma.patient.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

router.put('/departments/:id', async (req, res) => {
  try {
    const { minStaffDay, minStaffNight, maxStaffDay, maxStaffNight } = req.body
    const dept = await prisma.department.update({
      where: { id: req.params.id },
      data: {
        minStaffDay: Number(minStaffDay),
        minStaffNight: Number(minStaffNight),
        maxStaffDay: Number(maxStaffDay),
        maxStaffNight: Number(maxStaffNight),
      },
    })
    res.json(dept)
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

router.get('/rules', async (_req, res) => {
  try {
    const rules = await prisma.schedulingRule.findFirst()
    res.json(rules)
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

export default router
