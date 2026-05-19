export type ShiftType = 'day' | 'evening' | 'night'
export type ShiftStatus = 'scheduled' | 'completed' | 'absent' | 'swapped'
export type ViewMode = 'month' | 'week'

export interface Department {
  id: string
  name: string
  color: string
  minStaffDay: number
  minStaffEvening: number
  minStaffNight: number
  maxStaffDay: number
  maxStaffEvening: number
  maxStaffNight: number
  nursePatientRatio: number
  requiredCertifications: string
}

export interface Staff {
  id: string
  name: string
  role: string
  departmentId: string
  department: Department
  employmentType: string
  contractHoursPerWeek: number
  preferredShift: string
  certifications: string
  maxConsecutiveShifts: number
}

export interface Shift {
  id: string
  staffId: string
  staff: Staff
  departmentId: string
  department: Department
  date: string
  type: ShiftType
  hours: number
  status: ShiftStatus
}
