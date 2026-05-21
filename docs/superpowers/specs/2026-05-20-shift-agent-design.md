# Pulse Shift Agent — Design Spec

**Date:** 2026-05-20
**Status:** Approved

---

## Overview

Build an AI shift recommendation agent ("Pulse Agent") inside the existing Ask Pulse chat drawer. The agent recommends optimal shift assignments, scores existing and proposed schedules across three dimensions, and explains its reasoning. All proposals require human confirmation before writing to the database.

---

## Architecture

```
AskPulseDrawer (UI)
       │
       │  SSE stream
       ▼
POST /api/shift-agent          (new Express endpoint)
POST /api/shift-agent/confirm  (confirm a proposal)
       │
       ▼
  shiftAgent  (Mastra Agent — Claude)
       │
       ├── tool: getShifts(dept?, dateRange)
       ├── tool: getStaff(dept?)
       ├── tool: getPatients(dept?)
       ├── tool: getSchedulingRules()
       ├── tool: getBlockedDates(dateRange)
       ├── tool: scoreSchedule(dept?, dateRange)  ──► scoringEngine (pure TS)
       ├── tool: proposeShifts(assignments[])      ──► stores ShiftProposal, no DB write
       └── tool: confirmShifts(proposalId)         ──► writes Shift records to DB
```

- `shiftAgent` is a new Mastra agent alongside the existing `chatAgent` — it does not replace it.
- `scoringEngine` is pure TypeScript — no LLM involved in score calculation.
- `proposeShifts` creates a `ShiftProposal` row (pending); `confirmShifts` reads it and writes `Shift` records.
- Every agent response includes: recommendation, Score A/B/C + overall, warnings, and plain-language reasoning.

---

## Constraint Tiers

| Tier | Rules | Behaviour |
|------|-------|-----------|
| **Strict** (never break) | Certification gate, approved time off, sick call | Agent blocks and explains |
| **Override-with-warning** | Min rest, consecutive shifts, max nights, headcount min/max | Allowed in urgent situations; agent attaches warning to proposal |
| **Soft** (optimise for) | Preferences, equity, target hours, recovery window | Reflected in scores only |

---

## Quantified Rules

### Hard Constraints (override-with-warning unless marked strict)

| Rule | Value | Source |
|------|-------|--------|
| Min rest between shifts | ≥ 12 hrs | `SchedulingRule.minRestHoursBetweenShifts` |
| Max consecutive shifts | ≤ 3 | `Staff.maxConsecutiveShifts` |
| Max consecutive night shifts | ≤ 3 | `SchedulingRule` |
| Max night shifts/month | ≤ 8 | `SchedulingRule.maxNightShiftsPerMonth` |
| Max shifts/week | ≤ 5 | `SchedulingRule.maxShiftsPerWeek` |
| Max hours/week | ≤ 60 | `SchedulingRule.maxHoursPerWeek` |
| Certification gate *(strict)* | Staff must hold all `dept.requiredCertifications` | `Staff.certifications` |
| Min headcount per shift | ≥ `dept.minStaff[Day\|Night]` | `Department` |
| Max headcount per shift | ≤ `dept.maxStaff[Day\|Night]` | `Department` |
| No shift on approved time off *(strict)* | `TimeOffRequest.status = approved` | `TimeOffRequest` |
| No shift on sick call *(strict)* | `SickCall` record exists | `SickCall` |

### Manager-Adjustable Thresholds (new fields on `SchedulingRule`)

| Field | Default | Meaning |
|-------|---------|---------|
| `overtimeCeilingPct` | 10 | Max overtime as % of `contractHoursPerWeek` per week |
| `nightLoadBufferPct` | 80 | Max % of monthly night cap to assign (e.g. ≤ 6.4/month) |
| `minRestAfterStretchHours` | 48 | Min hours off after 3 consecutive shifts |

### Soft Constraints (scoring only)

- Target weekly shifts: `contractHoursPerWeek / 12` per staff
- Honour `staff.preferredShift` — penalise deviations, don't block
- Nurse-patient ratio: `assignedStaff ≥ ceil(activePatients / dept.nursePatientRatio)`
- Night staffing uplift: night carries ~50% more patients than day
- High-acuity rotation: ICU/ED nights spread across ≥ 2 staff per week

### Fairness Constraints (scoring only)

- Night shift std dev ≤ 1.5 over a rolling 28-day window
- Weekend shift std dev ≤ 1.0 over a rolling 28-day window
- No single staff member carries > 2× team average overtime hours

---

## Scoring Engine

Pure TypeScript module — no LLM, deterministic, fully testable.

```
src/mastra/scoring/
  ├── scoreA.ts   — Coverage: staffing levels, cert coverage, patient ratio, fill rate
  ├── scoreB.ts   — Individual: rest compliance, hours alignment, preferences, consecutive limits
  ├── scoreC.ts   — Equity: night/weekend distribution fairness, variance across team
  └── index.ts    — composes A/B/C → overall score, returns breakdown + flags
```

### Score Weights (hardcoded)

| Score | Weight | Measures |
|-------|--------|---------|
| A — Coverage | 40% | Patient safety, staffing adequacy |
| B — Individual (mean) | 25% | Per-staff workload and wellbeing |
| C — Equity | 35% | Fairness of distribution across team |

**Overall = 0.40 × A + 0.25 × mean(B) + 0.35 × C**

### Output Shape

```ts
{
  overall: number,          // 0–100
  coverage: number,         // Score A
  individual: {
    average: number,        // mean Score B
    byStaff: [{ staffId, name, score, flags: string[] }]
  },
  equity: number,           // Score C
  warnings: [{ rule, staffId, detail }],   // broken override-with-warning rules
  violations: []            // broken strict rules (should never reach proposal)
}
```

---

## Database Changes

### 1. Add fields to `SchedulingRule`

```prisma
model SchedulingRule {
  // existing fields unchanged...
  overtimeCeilingPct       Int @default(10)
  nightLoadBufferPct       Int @default(80)
  minRestAfterStretchHours Int @default(48)
}
```

### 2. New `ShiftProposal` model

```prisma
model ShiftProposal {
  id           String   @id @default(cuid())
  optimizeFor  String   // "coverage" | "staff"
  assignments  Json     // [{ staffId, departmentId, date, type, hours }]
  scores       Json     // Score A/B/C snapshot at proposal time
  warnings     Json     // overridden rules
  status       String   @default("pending") // pending | confirmed | rejected
  expiresAt    DateTime // set to createdAt + 24 hours on creation
  createdAt    DateTime @default(now())
}
```

---

## Agent Tools

| Tool | Input | Output |
|------|-------|--------|
| `getShifts` | `dept?`, `dateRange` | Shifts with staff + department |
| `getStaff` | `dept?` | Staff with certifications, preferences, contract hours |
| `getPatients` | `dept?` | Active patient census per department |
| `getSchedulingRules` | — | Global rules from `SchedulingRule` |
| `getBlockedDates` | `dateRange` | Approved time off + sick calls per staff |
| `scoreSchedule` | `dept?`, `dateRange` | Score A/B/C + warnings from scoring engine |
| `proposeShifts` | `assignments[]`, `optimizeFor: 'coverage' \| 'staff'` | Validates, creates `ShiftProposal`, returns `proposalId` + scores |
| `confirmShifts` | `proposalId` | Writes `Shift` records, marks proposal confirmed |

`proposeShifts` is called **twice** per recommendation — once with `optimizeFor: 'coverage'` (maximises Score A) and once with `optimizeFor: 'staff'` (maximises Score B + C). Both proposals are returned together so the manager can choose.

Constraint checking runs inside `proposeShifts`:
- Strict violations → block, explain
- Override-with-warning violations → allow, attach warning to proposal
- Soft violations → reflected in scores only

---

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/shift-agent` | Stream agent response (SSE, same pattern as `/api/chat`) |
| `POST` | `/api/shift-agent/confirm` | Confirm a pending proposal `{ proposalId }` |
| `POST` | `/api/shift-agent/reject` | Reject a pending proposal `{ proposalId }` |

---

## UI Flow

### Ask Pulse Drawer — On Open

Three suggestion chips appear before the first message:
1. "Any coverage gaps this week?"
2. "Is any staff overloaded?"
3. "Any special notes for this period?"

Chips disappear once the user sends or clicks a suggestion.

"Any special notes for this period?" covers: approved time-off requests, active sick calls, and staff with upcoming scheduling conflicts (e.g. nearing night-shift monthly cap).

### After Agent Proposes Shifts

Agent message includes:
- Plain-language explanation of the trade-off between both options
- **Two proposals** side by side in the chat:
  - **Option 1 — Coverage Priority**: optimised for Score A (hospital safety)
  - **Option 2 — Staff Priority**: optimised for Score B + C (fairness/wellbeing)
- Each option shows: assigned staff, Score A / B / C / Overall, and any warnings
- **"Review Option 1"** and **"Review Option 2"** buttons inline in the chat bubble

Example:
```
Option 1 — Better for Coverage  (Overall: 88)
  → Alice Chen | Coverage: 94 | Individual: 79 | Equity: 81
  ⚠ Alice is nearing night load buffer (75% of monthly cap)

Option 2 — Better for Staff     (Overall: 84)
  → Bob Martinez | Coverage: 82 | Individual: 91 | Equity: 88
  Coverage is adequate but slightly lower.

[Review Option 1]  [Review Option 2]
```

### Review & Confirm Modal

Opens when user clicks "Review Option 1" or "Review Option 2":
- Side-by-side diff: current schedule vs proposed changes
  - Green = new assignment
  - Red = removed assignment
  - Yellow = modified assignment
- Warning badges on rule overrides
- Score comparison: current schedule score vs proposed score
- **Confirm** / **Cancel** buttons at bottom
- On Confirm → `POST /api/shift-agent/confirm` → writes Shift records

### Read-Only Queries (gap check, overload check, notes)

No proposal generated — agent responds with analysis, scores for the current schedule, and recommendations in plain language. No Confirm/Reject buttons shown.

---

## File Structure

```
src/mastra/
  ├── agents/
  │   ├── chat-agent.ts        (existing)
  │   └── shift-agent.ts       (new)
  ├── tools/
  │   ├── getShifts.ts
  │   ├── getStaff.ts
  │   ├── getPatients.ts
  │   ├── getSchedulingRules.ts
  │   ├── getBlockedDates.ts
  │   ├── scoreSchedule.ts
  │   ├── proposeShifts.ts
  │   └── confirmShifts.ts
  ├── scoring/
  │   ├── scoreA.ts
  │   ├── scoreB.ts
  │   ├── scoreC.ts
  │   └── index.ts
  └── index.ts                 (register shiftAgent alongside chatAgent)

src/api/
  └── shift-agent.ts           (new Express router for /api/shift-agent)

src/pulse/components/
  ├── AskPulseDrawer.tsx       (add suggestion chips + Review modal trigger)
  └── ShiftProposalModal.tsx   (new — before/after diff modal)
```

---

## Test Plan

### Step 2 — Scoring Engine (unit tests)
- `scoreA`: correct score when headcount is at min, at max, below min, cert missing, patient ratio exceeded
- `scoreB`: penalties applied for <12hr rest, >3 consecutive shifts, over contract hours, wrong shift preference, overtime ceiling exceeded
- `scoreC`: equity score drops when std dev of night/weekend distribution is high; perfect score when evenly distributed
- Edge cases: empty shift list, single-staff department, all staff on approved time off

### Step 3 — Agent Tools (integration tests against test DB)
- `getBlockedDates`: returns correct blocked staff for a date with both time off and sick call
- `proposeShifts` with `optimizeFor: 'coverage'`: creates `ShiftProposal`, assigns cert-qualified staff, blocks on strict violations, attaches warning on override
- `proposeShifts` with `optimizeFor: 'staff'`: creates second `ShiftProposal` with different assignment, higher Score B+C
- `confirmShifts`: writes correct `Shift` records, marks proposal confirmed, rejects expired proposals, rejects already-confirmed proposals

### Step 4 — Shift Agent (tool call tests)
- Gap query → agent calls `getShifts` + `scoreSchedule` + `proposeShifts` twice → returns two options
- Overload query → agent calls `getStaff` + `scoreSchedule` → no proposal generated, read-only response
- Special notes query → agent calls `getBlockedDates` + `scoreSchedule` → summarises time off, sick calls, staff near night cap
- Full week request → agent calls tools in correct order, returns two options covering all gaps

### Step 5 — API (integration tests)
- `POST /api/shift-agent`: streams valid SSE events (`delta`, `done`), handles client abort gracefully
- `POST /api/shift-agent/confirm`: writes `Shift` records, returns `ok: true`, rejects expired proposals with 400, rejects already-confirmed with 400
- `POST /api/shift-agent/reject`: marks proposal rejected, no `Shift` records written

### Step 6–8 — UI (manual)
- Suggestion chips appear on drawer open, disappear after first message is sent
- Two-option proposal card renders with correct scores, staff names, and warnings
- "Review Option 1" opens modal showing correct before/after diff with colour coding
- Confirm writes shift, closes modal, chat updates with confirmation message
- Reject dismisses modal with no DB write
- Expired proposal: Confirm returns error, chat shows "This proposal has expired"

---

## Out of Scope (this iteration)

- Automatic schedule generation without human review
- Push notifications for urgent coverage gaps
- Multi-site / cross-department staff sharing
- Historical score trend charts
