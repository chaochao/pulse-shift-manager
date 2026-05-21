export interface ScoringShift {
  id: string
  staffId: string
  departmentId: string
  date: Date
  type: string
  hours: number
  status: string
}

export interface ScoringStaff {
  id: string
  name: string
  role: string
  departmentId: string
  contractHoursPerWeek: number
  preferredShift: string
  certifications: string
  maxConsecutiveShifts: number
}

export interface ScoringDepartment {
  id: string
  name: string
  minStaffDay: number
  minStaffNight: number
  maxStaffDay: number
  maxStaffNight: number
  nursePatientRatio: number
  requiredCertifications: string
}

export interface ScoringPatient {
  id: string
  departmentId: string
  status: string
}

export interface ScoringRules {
  minRestHoursBetweenShifts: number
  maxNightShiftsPerMonth: number
  maxShiftsPerWeek: number
  maxHoursPerWeek: number
  overtimeCeilingPct: number
  nightLoadBufferPct: number
  minRestAfterStretchHours: number
}

export interface StaffScoreDetail {
  staffId: string
  name: string
  score: number
  flags: string[]
}

export interface ScoreResult {
  overall: number
  coverage: number
  individual: {
    average: number
    byStaff: StaffScoreDetail[]
  }
  warnings: Array<{ rule: string; staffId: string; detail: string }>
  violations: Array<{ rule: string; staffId: string; detail: string }>
}

export interface ScoringInput {
  shifts: ScoringShift[]
  staff: ScoringStaff[]
  departments: ScoringDepartment[]
  patients: ScoringPatient[]
  rules: ScoringRules
  dateRange: { start: Date; end: Date }
}
