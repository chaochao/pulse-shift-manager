import type { ScoringInput } from './types'

// Coverage Score (0-100): staffing levels, certification coverage, patient ratio, fill rate
export function scoreCoverage(input: ScoringInput): number {
  const { shifts, staff, departments, patients, dateRange } = input

  const days = getDaysInRange(dateRange.start, dateRange.end)
  const scores: number[] = []

  for (const dept of departments) {
    const deptStaff = staff.filter(s => s.departmentId === dept.id)
    const requiredCerts = dept.requiredCertifications
      ? dept.requiredCertifications.split(',').map(c => c.trim()).filter(Boolean)
      : []
    const activePatients = patients.filter(p => p.departmentId === dept.id && p.status === 'admitted')

    for (const day of days) {
      for (const type of ['day', 'night'] as const) {
        const dayShifts = shifts.filter(s =>
          s.departmentId === dept.id &&
          s.type === type &&
          isSameDay(s.date, day) &&
          s.status !== 'absent'
        )

        const assignedStaff = deptStaff.filter(s => dayShifts.some(sh => sh.staffId === s.id))
        const count = assignedStaff.length
        const min = type === 'day' ? dept.minStaffDay : dept.minStaffNight
        const max = type === 'day' ? dept.maxStaffDay : dept.maxStaffNight

        // Headcount score
        let headcountScore = 100
        if (count < min) headcountScore = min === 0 ? 100 : Math.max(0, (count / min) * 100)
        else if (count > max && max > 0) headcountScore = 80

        // Certification coverage score
        let certScore = 100
        if (requiredCerts.length > 0 && count > 0) {
          const coveredCerts = requiredCerts.filter(cert =>
            assignedStaff.some(s => s.certifications.includes(cert))
          )
          certScore = (coveredCerts.length / requiredCerts.length) * 100
        }

        // Nurse-patient ratio score
        let ratioScore = 100
        if (dept.nursePatientRatio > 0 && activePatients.length > 0) {
          const required = Math.ceil(activePatients.length / dept.nursePatientRatio)
          ratioScore = count >= required ? 100 : Math.max(0, (count / required) * 100)
        }

        // Fill rate: what fraction of required minimum slots are filled (0–100)
        const fillScore = min > 0 ? Math.min(count / min, 1) * 100 : 100

        scores.push((fillScore * 0.60) + (certScore * 0.20) + (ratioScore * 0.15) + (headcountScore * 0.05))
      }
    }
  }

  return scores.length === 0 ? 100 : Math.round(average(scores))
}

function getDaysInRange(start: Date, end: Date): Date[] {
  const days: Date[] = []
  const current = new Date(start)
  while (current <= end) {
    days.push(new Date(current))
    current.setUTCDate(current.getUTCDate() + 1)
  }
  return days
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
}

function average(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length
}
