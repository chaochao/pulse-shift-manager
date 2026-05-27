import { describe, it, expect } from 'vitest'
import { scoreCoverage } from './scoreCoverage'
import { scoreWellbeing } from './scoreWellbeing'
import { scoreSchedule } from './index'
import type { ScoringInput, ScoringShift, ScoringStaff, ScoringDepartment, ScoringRules } from './types'

// ─── Shared fixtures ─────────────────────────────────────────────────────────

const MAY_25 = new Date('2026-05-25T00:00:00Z')
const MAY_26 = new Date('2026-05-26T00:00:00Z')
const MAY_27 = new Date('2026-05-27T00:00:00Z')

const defaultRules: ScoringRules = {
  minRestHoursBetweenShifts: 12,
  maxNightShiftsPerMonth: 8,
  maxShiftsPerWeek: 5,
  maxHoursPerWeek: 40,
  overtimeCeilingPct: 110,
  nightLoadBufferPct: 80,
  minRestAfterStretchHours: 48,
}

const dept: ScoringDepartment = {
  id: 'icu',
  name: 'ICU',
  minStaffDay: 2,
  minStaffNight: 1,
  maxStaffDay: 4,
  maxStaffNight: 3,
  nursePatientRatio: 2,
  requiredCertifications: 'ACLS',
}

function makeShift(overrides: Partial<ScoringShift> & { date: Date }): ScoringShift {
  return {
    id: Math.random().toString(36).slice(2),
    staffId: 'staff-1',
    departmentId: 'icu',
    type: 'day',
    hours: 12,
    status: 'scheduled',
    ...overrides,
  }
}

function makeStaff(overrides: Partial<ScoringStaff> = {}): ScoringStaff {
  return {
    id: 'staff-1',
    name: 'Alice Chen',
    role: 'RN',
    departmentId: 'icu',
    contractHoursPerWeek: 40,
    preferredShift: 'day',
    certifications: 'ACLS',
    maxConsecutiveShifts: 3,
    ...overrides,
  }
}

function makeInput(overrides: Partial<ScoringInput> = {}): ScoringInput {
  return {
    shifts: [],
    staff: [makeStaff()],
    departments: [dept],
    patients: [],
    rules: defaultRules,
    dateRange: { start: MAY_25, end: MAY_25 },
    ...overrides,
  }
}

// ─── scoreCoverage ────────────────────────────────────────────────────────────

describe('scoreCoverage', () => {
  it('returns 100 when no department has a minimum > 0', () => {
    const noDept = { ...dept, minStaffDay: 0, minStaffNight: 0 }
    expect(scoreCoverage(makeInput({ departments: [noDept] }))).toBe(100)
  })

  it('returns 0 when no shifts are scheduled', () => {
    expect(scoreCoverage(makeInput({ shifts: [] }))).toBe(0)
  })

  it('returns 100 when all slots are filled', () => {
    // dept needs 2 day + 1 night on May 25 = 3 slots
    const shifts = [
      makeShift({ staffId: 'a', date: MAY_25, type: 'day' }),
      makeShift({ staffId: 'b', date: MAY_25, type: 'day' }),
      makeShift({ staffId: 'c', date: MAY_25, type: 'night' }),
    ]
    expect(scoreCoverage(makeInput({ shifts }))).toBe(100)
  })

  it('returns 50 when half the slots are filled', () => {
    // 3 slots total: fill day (1 of 2 slots — slot not filled) + night (1 of 1 slot — filled) = 1/2...
    // Actually: day slot needs 2 staff. 1 day shift = slot NOT filled. Night slot needs 1 = filled. 1/2 = 50.
    const shifts = [
      makeShift({ staffId: 'a', date: MAY_25, type: 'day' }),   // 1 < min 2 → not filled
      makeShift({ staffId: 'b', date: MAY_25, type: 'night' }), // 1 >= min 1 → filled
    ]
    expect(scoreCoverage(makeInput({ shifts }))).toBe(50)
  })

  it('ignores absent shifts', () => {
    const shifts = [
      makeShift({ staffId: 'a', date: MAY_25, type: 'day', status: 'absent' }),
      makeShift({ staffId: 'b', date: MAY_25, type: 'day', status: 'absent' }),
      makeShift({ staffId: 'c', date: MAY_25, type: 'night' }),
    ]
    // day slot: 0 scheduled (both absent) < 2 → not filled; night: 1 >= 1 → filled → 1/2 = 50
    expect(scoreCoverage(makeInput({ shifts }))).toBe(50)
  })

  it('scores across multiple days', () => {
    // 2 days × (1 day slot + 1 night slot) = 4 slots
    // Fill all 4
    const shifts = [
      makeShift({ staffId: 'a', date: MAY_25, type: 'day' }),
      makeShift({ staffId: 'b', date: MAY_25, type: 'day' }),
      makeShift({ staffId: 'c', date: MAY_25, type: 'night' }),
      makeShift({ staffId: 'a', date: MAY_26, type: 'day' }),
      makeShift({ staffId: 'b', date: MAY_26, type: 'day' }),
      makeShift({ staffId: 'c', date: MAY_26, type: 'night' }),
    ]
    expect(scoreCoverage(makeInput({ shifts, dateRange: { start: MAY_25, end: MAY_26 } }))).toBe(100)
  })

  it('extra staff above minimum does not increase score above 100', () => {
    const shifts = [
      makeShift({ staffId: 'a', date: MAY_25, type: 'day' }),
      makeShift({ staffId: 'b', date: MAY_25, type: 'day' }),
      makeShift({ staffId: 'c', date: MAY_25, type: 'day' }), // extra — min is 2
      makeShift({ staffId: 'd', date: MAY_25, type: 'night' }),
    ]
    expect(scoreCoverage(makeInput({ shifts }))).toBe(100)
  })
})

// ─── scoreWellbeing ───────────────────────────────────────────────────────────

describe('scoreWellbeing', () => {
  it('returns 100 for a staff member with no shifts', () => {
    const result = scoreWellbeing(makeInput({ shifts: [] }))
    expect(result.average).toBe(100)
    expect(result.byStaff[0].flags).toHaveLength(0)
  })

  it('returns 100 for a well-spaced schedule', () => {
    // Mon, Wed, Fri — all day shifts, all preferred, well spaced
    const shifts = [
      makeShift({ date: new Date('2026-05-25T08:00:00Z'), type: 'day' }), // Mon 8am
      makeShift({ date: new Date('2026-05-27T08:00:00Z'), type: 'day' }), // Wed 8am
      makeShift({ date: new Date('2026-05-29T08:00:00Z'), type: 'day' }), // Fri 8am
    ]
    const result = scoreWellbeing(makeInput({ shifts }))
    expect(result.average).toBe(100)
    expect(result.byStaff[0].flags).toHaveLength(0)
  })

  it('flags and penalises rest gap < 12h between consecutive shifts', () => {
    const shifts = [
      makeShift({ date: new Date('2026-05-25T08:00:00Z'), type: 'day' }),  // 8am
      makeShift({ date: new Date('2026-05-25T16:00:00Z'), type: 'day' }),  // 4pm — only 8h gap
    ]
    const result = scoreWellbeing(makeInput({ shifts }))
    expect(result.byStaff[0].flags.some(f => f.includes('Rest gap'))).toBe(true)
    expect(result.average).toBeLessThan(100)
  })

  it('flags and penalises consecutive shifts over limit', () => {
    // maxConsecutiveShifts = 3; schedule 4 consecutive days
    const shifts = [
      makeShift({ date: new Date('2026-05-25T00:00:00Z') }),
      makeShift({ date: new Date('2026-05-26T00:00:00Z') }),
      makeShift({ date: new Date('2026-05-27T00:00:00Z') }),
      makeShift({ date: new Date('2026-05-28T00:00:00Z') }),
    ]
    const result = scoreWellbeing(makeInput({ shifts }))
    expect(result.byStaff[0].flags.some(f => f.includes('consecutive'))).toBe(true)
    expect(result.average).toBeLessThan(100)
  })

  it('flags preference mismatch when < 50% of shifts match preferred type', () => {
    // preferredShift = 'day'; schedule 1 day + 2 nights = 33% match
    const staff = makeStaff({ preferredShift: 'day' })
    const shifts = [
      makeShift({ date: MAY_25, type: 'day' }),
      makeShift({ date: MAY_26, type: 'night' }),
      makeShift({ date: MAY_27, type: 'night' }),
    ]
    const result = scoreWellbeing(makeInput({ staff: [staff], shifts }))
    expect(result.byStaff[0].flags.some(f => f.includes('Prefers day'))).toBe(true)
  })

  it('does not flag preference when preferredShift is none', () => {
    const staff = makeStaff({ preferredShift: 'none' })
    const shifts = [
      makeShift({ date: MAY_25, type: 'night' }),
      makeShift({ date: MAY_26, type: 'night' }),
      makeShift({ date: MAY_27, type: 'night' }),
    ]
    const result = scoreWellbeing(makeInput({ staff: [staff], shifts }))
    expect(result.byStaff[0].flags.some(f => f.includes('Prefers'))).toBe(false)
  })

  it('flags night shift cap exceeded', () => {
    // nightLoadBufferPct=80, maxNightShiftsPerMonth=8 → cap = 6.4
    // Schedule 7 night shifts
    const shifts = Array.from({ length: 7 }, (_, i) =>
      makeShift({ date: new Date(`2026-05-${String(i + 1).padStart(2, '0')}T00:00:00Z`), type: 'night' })
    )
    const result = scoreWellbeing(makeInput({ shifts }))
    expect(result.byStaff[0].flags.some(f => f.includes('Night shifts'))).toBe(true)
  })

  it('averages scores across multiple staff', () => {
    const staff1 = makeStaff({ id: 'staff-1', name: 'Alice' })
    const staff2 = makeStaff({ id: 'staff-2', name: 'Bob', preferredShift: 'night' })
    // Bob gets all day shifts → preference mismatch
    const shifts = [
      makeShift({ staffId: 'staff-1', date: MAY_25, type: 'day' }),
      makeShift({ staffId: 'staff-2', date: MAY_25, type: 'day' }),
      makeShift({ staffId: 'staff-2', date: MAY_26, type: 'day' }),
      makeShift({ staffId: 'staff-2', date: MAY_27, type: 'day' }),
    ]
    const result = scoreWellbeing(makeInput({ staff: [staff1, staff2], shifts }))
    expect(result.byStaff).toHaveLength(2)
    const alice = result.byStaff.find(s => s.name === 'Alice')!
    const bob = result.byStaff.find(s => s.name === 'Bob')!
    expect(alice.score).toBe(100)
    expect(bob.score).toBeLessThan(100)
    expect(result.average).toBeLessThan(100)
    expect(result.average).toBeGreaterThan(bob.score)
  })
})

// ─── scoreSchedule (overall composition) ─────────────────────────────────────

describe('scoreSchedule', () => {
  it('overall = coverage × 0.60 + individual × 0.40', () => {
    // Force coverage = 100, individual = 100 → overall = 100
    const shifts = [
      makeShift({ staffId: 'a', date: MAY_25, type: 'day' }),
      makeShift({ staffId: 'b', date: MAY_25, type: 'day' }),
      makeShift({ staffId: 'c', date: MAY_25, type: 'night' }),
    ]
    const result = scoreSchedule(makeInput({ shifts }))
    expect(result.coverage).toBe(100)
    expect(result.individual.average).toBe(100)
    expect(result.overall).toBe(100)
  })

  it('overall is weighted correctly when coverage and individual differ', () => {
    // 0 shifts → coverage = 0; individual = 100 (no shifts = no violations)
    const result = scoreSchedule(makeInput({ shifts: [] }))
    expect(result.coverage).toBe(0)
    expect(result.individual.average).toBe(100)
    expect(result.overall).toBe(Math.round(0 * 0.60 + 100 * 0.40)) // 40
  })

  it('exposes warnings from wellbeing flags', () => {
    const staff = makeStaff({ preferredShift: 'night' })
    const shifts = [
      makeShift({ date: MAY_25, type: 'day' }),
      makeShift({ date: MAY_26, type: 'day' }),
      makeShift({ date: MAY_27, type: 'day' }),
    ]
    const result = scoreSchedule(makeInput({ staff: [staff], shifts }))
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.warnings[0].detail).toContain('Alice Chen')
  })

  it('returns no warnings for a clean schedule', () => {
    const shifts = [
      makeShift({ date: new Date('2026-05-25T08:00:00Z'), type: 'day' }),
      makeShift({ date: new Date('2026-05-27T08:00:00Z'), type: 'day' }),
    ]
    const result = scoreSchedule(makeInput({ shifts }))
    expect(result.warnings).toHaveLength(0)
  })
})
