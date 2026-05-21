import { scoreA } from './scoreA'
import { scoreB } from './scoreB'
import { scoreC } from './scoreC'
import type { ScoringInput, ScoreResult } from './types'

export type { ScoringInput, ScoreResult, ScoringShift, ScoringStaff, ScoringDepartment, ScoringPatient, ScoringRules } from './types'

export function scoreSchedule(input: ScoringInput): ScoreResult {
  const coverage = scoreA(input)
  const individual = scoreB(input)
  const equity = scoreC(input)

  const overall = Math.round(
    coverage * 0.40 +
    individual.average * 0.25 +
    equity * 0.35
  )

  const warnings = individual.byStaff.flatMap(s =>
    s.flags.map(detail => ({ rule: 'soft', staffId: s.staffId, detail: `${s.name}: ${detail}` }))
  )

  return {
    overall,
    coverage,
    individual,
    equity,
    warnings,
    violations: []
  }
}
