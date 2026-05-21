import { scoreA } from './scoreA'
import { scoreB } from './scoreB'
import type { ScoringInput, ScoreResult } from './types'

export type { ScoringInput, ScoreResult, ScoringShift, ScoringStaff, ScoringDepartment, ScoringPatient, ScoringRules } from './types'

export function scoreSchedule(input: ScoringInput): ScoreResult {
  const coverage = scoreA(input)
  const individual = scoreB(input)

  const overall = Math.round(coverage * 0.60 + individual.average * 0.40)

  const warnings = individual.byStaff.flatMap(s =>
    s.flags.map(detail => ({ rule: 'soft', staffId: s.staffId, detail: `${s.name}: ${detail}` }))
  )

  return {
    overall,
    coverage,
    individual,
    warnings,
    violations: []
  }
}
