import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { addDays, startOfDay, subDays } from 'date-fns'
import 'dotenv/config'

const url = process.env.PULSE_DATABASE_URL ?? 'file:./pulse.db'
const adapter = new PrismaBetterSqlite3({ url })
const prisma = new PrismaClient({ adapter })

async function main() {
  await prisma.shiftSwap.deleteMany()
  await prisma.sickCall.deleteMany()
  await prisma.timeOffRequest.deleteMany()
  await prisma.shift.deleteMany()
  await prisma.patient.deleteMany()
  await prisma.staff.deleteMany()
  await prisma.department.deleteMany()
  await prisma.schedulingRule.deleteMany()

  const [icu, ed, surgery, cardiology, general] = await Promise.all([
    prisma.department.create({ data: { name: 'ICU', color: '#4f86c6', minStaffDay: 4, minStaffEvening: 4, minStaffNight: 3, maxStaffDay: 8, maxStaffEvening: 8, maxStaffNight: 6, nursePatientRatio: 2, requiredCertifications: 'ICU,ACLS' } }),
    prisma.department.create({ data: { name: 'Emergency', color: '#e05c5c', minStaffDay: 5, minStaffEvening: 5, minStaffNight: 4, maxStaffDay: 10, maxStaffEvening: 10, maxStaffNight: 8, nursePatientRatio: 4, requiredCertifications: 'ACLS,TNCC' } }),
    prisma.department.create({ data: { name: 'Surgery', color: '#56b08b', minStaffDay: 3, minStaffEvening: 2, minStaffNight: 1, maxStaffDay: 8, maxStaffEvening: 6, maxStaffNight: 4, nursePatientRatio: 3, requiredCertifications: 'OR,ACLS' } }),
    prisma.department.create({ data: { name: 'Cardiology', color: '#9b59b6', minStaffDay: 3, minStaffEvening: 3, minStaffNight: 2, maxStaffDay: 7, maxStaffEvening: 7, maxStaffNight: 5, nursePatientRatio: 3, requiredCertifications: 'ACLS' } }),
    prisma.department.create({ data: { name: 'General', color: '#f39c12', minStaffDay: 4, minStaffEvening: 4, minStaffNight: 3, maxStaffDay: 10, maxStaffEvening: 10, maxStaffNight: 8, nursePatientRatio: 5, requiredCertifications: '' } }),
  ])

  const staffRows = [
    { name: 'Alice Chen', role: 'RN', departmentId: icu.id, certifications: 'ICU,ACLS', preferredShift: 'day', contractHoursPerWeek: 36 },
    { name: 'Bob Martinez', role: 'RN', departmentId: icu.id, certifications: 'ICU,ACLS', preferredShift: 'night', contractHoursPerWeek: 36 },
    { name: 'Dr. Sarah Kim', role: 'MD', departmentId: icu.id, certifications: 'ICU,ACLS', preferredShift: 'day', contractHoursPerWeek: 48 },
    { name: 'James Wilson', role: 'RN', departmentId: ed.id, certifications: 'ACLS,TNCC', preferredShift: 'night', contractHoursPerWeek: 36 },
    { name: 'Maria Lopez', role: 'RN', departmentId: ed.id, certifications: 'ACLS,TNCC', preferredShift: 'day', contractHoursPerWeek: 36 },
    { name: 'Dr. Kevin Park', role: 'MD', departmentId: ed.id, certifications: 'ACLS,TNCC', preferredShift: 'none', contractHoursPerWeek: 48 },
    { name: 'Linda Zhang', role: 'RN', departmentId: surgery.id, certifications: 'OR,ACLS', preferredShift: 'day', contractHoursPerWeek: 36 },
    { name: 'Tom Brown', role: 'Tech', departmentId: surgery.id, certifications: 'OR', preferredShift: 'day', contractHoursPerWeek: 40 },
    { name: 'Dr. Anna White', role: 'MD', departmentId: surgery.id, certifications: 'OR,ACLS', preferredShift: 'day', contractHoursPerWeek: 48 },
    { name: 'Rachel Green', role: 'RN', departmentId: cardiology.id, certifications: 'ACLS', preferredShift: 'night', contractHoursPerWeek: 36 },
    { name: 'Mike Davis', role: 'LPN', departmentId: cardiology.id, certifications: 'ACLS', preferredShift: 'night', contractHoursPerWeek: 36 },
    { name: 'Susan Hall', role: 'RN', departmentId: general.id, certifications: '', preferredShift: 'day', contractHoursPerWeek: 36 },
    { name: 'Chris Evans', role: 'RN', departmentId: general.id, certifications: '', preferredShift: 'night', contractHoursPerWeek: 36 },
    { name: 'Nurse Joy', role: 'LPN', departmentId: general.id, certifications: '', preferredShift: 'night', contractHoursPerWeek: 32 },
    { name: 'Dr. Bruce Lee', role: 'MD', departmentId: general.id, certifications: '', preferredShift: 'day', contractHoursPerWeek: 48 },
  ]

  const allStaff = await Promise.all(staffRows.map(s => prisma.staff.create({ data: s })))

  const today = startOfDay(new Date())
  const startDate = subDays(today, 10)
  const shiftTypes = ['day', 'night'] as const
  const shiftData: Parameters<typeof prisma.shift.create>[0]['data'][] = []

  for (let d = 0; d < 21; d++) {
    const date = addDays(startDate, d)
    const dayOfWeek = date.getDay()
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

    for (const member of allStaff) {
      if ((d + allStaff.indexOf(member)) % 7 < 4 || isWeekend) {
        const type = shiftTypes[d % 2]
        shiftData.push({
          staffId: member.id,
          departmentId: member.departmentId,
          date,
          type,
          hours: 12,
          status: date < today ? 'completed' : 'scheduled'
        })
      }
    }
  }

  await prisma.shift.createMany({ data: shiftData })
  await prisma.schedulingRule.create({
    data: { minRestHoursBetweenShifts: 11, maxNightShiftsPerMonth: 8, maxShiftsPerWeek: 5, maxHoursPerWeek: 60 }
  })

  const patientRows = [
    { name: 'James Hooper',    departmentId: icu.id,       admittedAt: subDays(today, 5),  expectedDischargeAt: addDays(today, 2) },
    { name: 'Linda Park',      departmentId: icu.id,       admittedAt: subDays(today, 3),  expectedDischargeAt: addDays(today, 5) },
    { name: 'Robert Nguyen',   departmentId: icu.id,       admittedAt: subDays(today, 1),  expectedDischargeAt: addDays(today, 7) },
    { name: 'Maria Gonzalez',  departmentId: ed.id,        admittedAt: subDays(today, 2),  expectedDischargeAt: addDays(today, 1) },
    { name: 'Tom Fletcher',    departmentId: ed.id,        admittedAt: today,              expectedDischargeAt: addDays(today, 3) },
    { name: 'Sara Kim',        departmentId: ed.id,        admittedAt: subDays(today, 1),  expectedDischargeAt: subDays(today, 0), status: 'discharged' },
    { name: 'David Chen',      departmentId: surgery.id,   admittedAt: subDays(today, 4),  expectedDischargeAt: addDays(today, 1) },
    { name: 'Emily Watson',    departmentId: surgery.id,   admittedAt: subDays(today, 2),  expectedDischargeAt: addDays(today, 4) },
    { name: 'Frank Miller',    departmentId: cardiology.id, admittedAt: subDays(today, 6), expectedDischargeAt: addDays(today, 2) },
    { name: 'Grace Lee',       departmentId: cardiology.id, admittedAt: subDays(today, 3), expectedDischargeAt: addDays(today, 6) },
    { name: 'Henry Adams',     departmentId: cardiology.id, admittedAt: subDays(today, 1), expectedDischargeAt: addDays(today, 8) },
    { name: 'Isabella Moore',  departmentId: general.id,   admittedAt: subDays(today, 7),  expectedDischargeAt: addDays(today, 0), status: 'discharged' },
    { name: 'Jack Thompson',   departmentId: general.id,   admittedAt: subDays(today, 2),  expectedDischargeAt: addDays(today, 3) },
    { name: 'Karen White',     departmentId: general.id,   admittedAt: subDays(today, 1),  expectedDischargeAt: addDays(today, 5) },
  ]

  await prisma.patient.createMany({
    data: patientRows.map(p => ({ ...p, status: p.status ?? 'admitted' }))
  })

  console.log(`Seeded: 5 departments, ${allStaff.length} staff, ${shiftData.length} shifts, ${patientRows.length} patients`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
