// Scoring engine entry point.
//
// scoreSchedule composes two independent scores into a single overall health number:
//
//   Coverage  (scoreCoverage)  — are the required minimum slots filled?
//             filled slots ÷ required slots × 100, across every dept × day × shift-type
//             that has a minimum > 0. Extra staff above the minimum don't help the score.
//
//   Individual (scoreWellbeing) — how healthy is each staff member's schedule?
//             Average of 5 per-person sub-scores: rest gaps, consecutive days,
//             preference match, night cap, and recovery window after a stretch.
//
//   Overall = Coverage × 0.60 + Individual × 0.40
//
// scoreEquity (scoreEquity.ts) measures night/weekend fairness but is not yet
// wired into the overall score — reserved for a future fairness dimension.

import { scoreCoverage } from './scoreCoverage'
import { scoreWellbeing } from './scoreWellbeing'
import type { ScoringInput, ScoreResult } from './types'

export type { ScoringInput, ScoreResult, ScoringShift, ScoringStaff, ScoringDepartment, ScoringPatient, ScoringRules } from './types'

export function scoreSchedule(input: ScoringInput): ScoreResult {
  const coverage = scoreCoverage(input)
  const individual = scoreWellbeing(input)

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
