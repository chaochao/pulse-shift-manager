# Interview Prep — Pulse Shift Manager

---

## Vitalize — Company Context

**Mission:** Automate hospital operations, starting with labor + capacity optimization. Goal: hospital operations that are safe, autonomous, fair, and cost-optimized.

**Origin:** Started as a mental health app for clinicians. Signed two health systems, went live — but usage was low. Went on-site and heard the same thing everywhere: *"Staffing and scheduling is the bane of my existence. Fix that."* Visited 30+ health systems, saw hospitals still running critical operations on paper and spreadsheets. Landed a $240K pilot before writing a line of code; within four weeks it became a $1M deal. Grew 8× in 18 months, raised a $25M Series A.

**The problem they're solving:**
- Labor = ~60% of total hospital spend; ~10% is eliminable through optimized staffing
- Clinical leaders spend **2–3 hours every day** manually balancing cost, skills, fairness, patient volume, and acuity just to fill shifts
- Decisions are reactive and last-minute → chronic waste
- Better staffing could recapture **5–10% of patient capacity** and a **1–2% top-line revenue lift** without new staff or facilities

**Three product pillars:**

| Pillar | What it does |
|---|---|
| **AI Scheduling (unit leaders)** | Automates 70% of daily scheduling; generates optimal schedules from demand forecasts, preferences, competencies; prompt-based interface |
| **Staffing Intelligence (staffing offices)** | Enterprise-wide visibility + real-time EHR data; forecasts staffing needs by the hour (e.g. ICU demand 4h in advance); one-click execution of redeployment recommendations |
| **Workforce Analytics (roadmap)** | Proactive alerts on over/under-staffing, overtime, FTE leakage; conversational AI assistant; action-oriented — triggers recommendations directly |
| **Staff-Facing App** | Clinicians view shifts, set preferences, pick up/swap shifts, request time off, get real-time notifications; transparency into scheduling decisions |

**Traction (in an industry with 12–36 month sales cycles):**

| Date | Milestone |
|---|---|
| Dec 2023 | First health system contract closed — 0 lines of code, Figma prototype only |
| Apr 2024 | MVP launched, first hospital live — 16 weeks from idea |
| May 2024 | Pilot → $900K 3-year contract across 10 hospitals in 4 weeks |
| Aug 2024 | 4 more enterprise contracts, >$2M cARR added |
| Mar 2025 | Live across 20 hospitals; 10 launched in 6 weeks |
| Summer 2025 | 20+ hospitals live, $6.5M cARR |
| Winter 2025 | $25M Series A |

**Roadmap (where they're going):**

| Phase | Timeline | Focus |
|---|---|---|
| Staffing Infrastructure | Jan 2024 – now | OS for hospital staffing + scheduling |
| Patient Flow & Capacity | Sept 2025 – mid 2026 | Demand forecasting, bottleneck prevention, capacity maximization |
| Intelligent Labor Planning | 2026 | Workforce strategy system of record — matrices, benchmarks, financial goals |
| Traveler Ecosystem | Future | Contingent labor marketplace via agency partnerships + open APIs |
| AI-Native HR Stack | Future | Full hospital HR stack rebuilt from an AI-first perspective |

### How Pulse Shift Manager maps to Vitalize's pillars

| Vitalize capability | What I built |
|---|---|
| Prompt-based scheduling interface | Ask Pulse drawer — natural language queries, SSE streaming response |
| Proactively identifies gaps + fills them | `getCoverageGaps` → `recommendShifts` tool chain |
| Constraint-aware staff recommendations | Certifications, rest hours, consecutive days, time-off checks in `recommendShifts` |
| Human-in-the-loop approval before execution | ShiftProposalModal — before/after diff, confirm/reject, atomic DB write |
| Analytics on over/under-staffing | Analytics page — hours limit highlighting, consecutive days column, dept charts |
| Audit trail for every action | ShiftChangeLog — `source: manual/ai`, JSON diff for edits |
| Patient census overlaid with staffing | Patients page tied to same department model as shifts |

---

## Elevator Pitch (30 seconds)

Pulse Shift Manager is a hospital operations dashboard where administrators can manage staff schedules on a calendar, monitor patient census, and use an AI assistant ("Ask Pulse") to analyze coverage gaps and propose shift assignments. The key design principle: **the AI never writes to the database without explicit human approval** — every proposal goes through a review-and-confirm flow before any shift is created.

---

## The "Before" — What Hospitals Actually Use Today

Use these as your opening slide or opening story. This is what Vitalize went on-site and saw at 30+ health systems.

**Image 1 — Handwritten monthly calendar**
A September 2024 calendar with shift assignments written by hand in pen. Each cell is a day; staff names and role abbreviations are squeezed into the boxes. No visibility into gaps, no searchability, no audit trail.

**Image 2 — Pink daily staffing sheet (CH_Daily Staffing Assignment by Zone)**
A printed form for one unit on one day (Friday, Nov 8, 2023). Day shift (7am–7:30pm) and night shift (7pm–7:30am) listed separately. Staff names typed, but:
- Room assignments, zone numbers, and call-in status written by hand in the margins
- "ON CALL", "Switched", "SICK LM" annotated in pen after the fact
- New staff (Miranda Womack, Tori Jenkins, Ben Fellman) added by hand at the bottom
- This is printed, annotated, reprinted — multiple times per day

**Image 3 — White daily staffing sheet (multi-unit command center view)**
A hospital-wide view for Wednesday, Feb 28, 2024. Shows every unit (2 North through CVICU) with RN/LPN/PCA/HUC counts, census, and call-ins. Key observations:
- Call-ins tracked in a single handwritten box — no system, no history
- "Not covered" gaps listed manually under Sitters
- ED holds, Women's Services metrics, C-sections all written by hand
- A Post-it note covers part of the Deaths column

**Why this matters in your presentation:**
> *"This is what a charge nurse is working with at 6am. Three documents, all paper, all out of date the moment they're printed. Ask Pulse replaces the 2–3 hours it takes to manually reconcile this into a decision."*

---

## Demo Flow (walk pages in this order)

1. **Calendar** — month/week view, shift cards per department
2. **Analytics** — sortable table, red-highlighted staff over 40h/week, consecutive days column
3. **Staff detail** — drill into an overloaded nurse, see their shift history
4. **Ask Pulse** — ask *"Who's overloaded this week?"* then *"Fill the Friday night ICU gap"*
5. **Proposal modal** — before/after diff, confirm → calendar highlights new shifts
6. **Activity log** — audit trail shows `source: ai`, JSON diff recorded

This path tells a complete story and ends on the most impressive moment.

---

## Tech Stack

| Concern | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite |
| Routing | React Router v7 (nested routes) |
| Server state | TanStack Query v5 |
| Styling | Tailwind CSS v4, shadcn/ui |
| Charts | Recharts |
| Backend | Express.js |
| ORM | Prisma v7 (SQLite via better-sqlite3) |
| AI agents | Mastra (GPT-4o via OpenAI) |
| AI agent | Mastra `shiftAgent` (GPT-4o, stateless, tool-based) |
| Testing | Vitest |

---

## Architecture Overview

```
Browser (React)
  ├── Pages → TanStack Query hooks → GET /api/pulse/*   (REST CRUD)
  └── AskPulseDrawer → SSE stream → POST /api/shift-agent
                                        └── Mastra → GPT-4o → Tools → Prisma → SQLite
                              ShiftProposalModal → POST /api/shift-agent/confirm
```

- Two servers: Vite (port 5173) + Express API (port 3001)
- Frontend never writes the DB directly — everything goes through the API
- AI proposals are stored as `pending` rows — never auto-committed

---

## Ask Pulse Deep Dive

### One agent: `shiftAgent`

Stateless per request, GPT-4o via Mastra. No persistent memory — each request gets the full conversation history from the client so the model has context without storing anything server-side.

### Tool routing (explicit keyword → tool mapping in system prompt)

| User intent | Tool called |
|---|---|
| "gap / understaffed" | `getCoverageGaps` |
| "overloaded / burnout / too many hours" | `getOverloadedStaff` |
| "fill / recommend / cover this shift" | `recommendShifts` ← main entry point |
| "score / health / evaluate" | `scoreSchedule` |
| "time off / sick call" | `getBlockedDates` → `getOverloadedStaff` |

Why explicit routing: without it, GPT-4o picks a general tool when a specific one exists, or hallucinates a tool name.

### Proposal lifecycle (human-in-the-loop)

```
recommendShifts tool
  → constraint checks: rest hours, certifications, consecutive days, time-off
  → creates ShiftProposal row (status: pending, expires: +24h)
  → returns proposalId in the SSE stream

Client sees proposalId → shows "Review" button

User confirms → POST /api/shift-agent/confirm
  → prisma.$transaction: creates Shifts + ShiftChangeLogs, marks proposal confirmed
  → on failure: full rollback, proposal status unchanged

User rejects → POST /api/shift-agent/reject
  → marks rejected, no shifts written
```

### Scoring engine (pure TypeScript, no LLM)

```
Coverage  = filled slots ÷ required slots × 100
            (slot = one dept × day × shift-type where minimum > 0)

Individual = avg wellbeing score across all staff
             (penalizes <12h rest, >3 consecutive shifts, preference mismatch)

Overall   = Coverage × 0.60 + Individual × 0.40
```

Scoring is deterministic and fast — no LLM latency, fully testable, consistent across runs.

---

## Frontend Technical Details

### TanStack Query pattern

Every resource has a dedicated hook. After any mutation, both `['shifts']` and `['activity']` query keys are invalidated — calendar and audit log stay in sync automatically.

```ts
// Read
const { data: shifts } = useShifts(start, end)

// Mutate + auto-invalidate
const { createShift } = useShiftMutations()
createShift({ staffId, departmentId, date, type, hours })
```

### SSE streaming (not WebSockets)

`AskPulseDrawer` reads the SSE stream line by line, appending `event: delta` chunks to the last message in state. Chose SSE because communication is server-to-client only — SSE is simpler, native reconnect, no upgrade handshake.

### HighlightContext

After AI confirms shifts, new shift dates are added to a React context. `CalendarGrid` reads this context and briefly highlights newly-added cards so the manager can see where the changes landed.

### ShiftProposalModal

Before/after diff view — shows existing assignments alongside proposed ones per day/department so the manager can compare before committing.

---

## Backend & Data Model

### Audit trail

Every shift create/update/delete writes a `ShiftChangeLog` row inside the route handler:
- `source`: `"manual"` (UI) or `"ai"` (agent-confirmed)
- `action`: `add` | `edit` | `delete`
- `changes`: JSON — full record for adds/deletes, diff (before/after per field) for edits

### Date/timezone handling

Shifts come in as `YYYY-MM-DD` strings from the frontend. The API normalizes them to UTC midnight in the hospital's configured timezone using `date-fns-tz / fromZonedTime`. Queries compare dates as ISO strings — not raw UTC timestamps — to avoid DST edge cases.

### Key data relationships

```
Department ──< Staff ──< Shift
           ──< Patient

Staff ──< TimeOffRequest
      ──< ShiftSwap
      ──< SickCall

ShiftProposal    (AI-generated, pending human confirmation)
ShiftChangeLog   (audit trail for every shift mutation)
SchedulingRule   (global row: rest hours, max shifts/week, overtime ceiling)
```

---

## Production Considerations

Things to mention proactively — shows you thought beyond the demo:

| Gap | Production fix |
|---|---|
| No auth | RBAC: charge nurse / staff / admin; SAML/LDAP integration |
| SQLite, single writer | PostgreSQL + PgBouncer, date partitioning |
| Patient data unencrypted | HIPAA: encryption at rest + in transit, access audit logs, BAAs |
| No real-time multi-user | WebSocket push, optimistic locking for concurrent edits |
| Constraints checked at proposal time only | Re-validate at confirm time to catch availability changes |
| No notifications | Push/SMS for shift assignments, email for time-off approvals |
| Desktop only | Responsive/PWA for mobile (one-handed on small screens) |
| No EHR/HR sync | HL7 FHIR for Epic/Cerner census, Workday/UKG for staff rosters |

---

## Anticipated Interview Questions

### Architecture & design decisions

**"Why Mastra instead of calling OpenAI directly?"**
Tool dispatch and streaming abstraction out of the box. Mastra handles tool schema validation, the `fullStream` iterable, and abort signal wiring — removing a lot of boilerplate from the route handler.

**"Why SSE instead of WebSockets?"**
Communication is server-to-client only. SSE is simpler, natively reconnects on drop, and works over plain HTTP — no upgrade handshake needed.

**"Why is the agent stateless? No persistent memory?"**
Scheduling queries are self-contained — you ask about a department and date, get a proposal, confirm or reject. There's no meaningful "session" to persist. The client sends the conversation history on each request, so the model has context without the server storing anything.

**"Why store proposals in the DB instead of just returning recommendations?"**
Durability. If the user closes the tab after reviewing, the proposal isn't lost. Also enables the expiry logic (`+24h`) so stale proposals can't be confirmed.

---

### AI-specific

**"How do you prevent the AI from picking the wrong tool?"**
Explicit keyword-to-tool routing in the system prompt. The model is told exactly which tool to call for which intent pattern.

**"What happens if AI proposes a shift that violates a constraint?"**
`recommendShifts` runs constraint checks before calling `proposeShifts`. Known gap: constraints aren't re-validated at confirm time — a change in availability between proposal and confirm could slip through. That's a production fix item.

**"Why is the scoring engine in pure TypeScript instead of the LLM?"**
Determinism and testability. Scores need to be consistent and auditable. LLMs are non-deterministic and slow — scoring runs in microseconds without a network round trip.

**"How do you handle hallucinated staff IDs from the LLM?"**
Tools validate against the DB before writing. `proposeShifts` checks that all staff and department IDs exist. The confirm endpoint validates proposal status and expiry before writing any `Shift` rows.

---

### Frontend

**"How does TanStack Query invalidation work across the app?"**
After any shift mutation, both `['shifts']` and `['activity']` query keys are invalidated. Any subscribed component re-fetches automatically — no prop drilling or manual sync.

**"How do you stream the AI response token by token?"**
`AskPulseDrawer` reads the response body as a readable stream. Each `event: delta` chunk is appended to the last message in local React state, updating the UI incrementally.

**"How does the calendar know which shifts to highlight after AI confirms?"**
`HighlightContext` holds a set of dates. After confirm, `PulseApp` adds the new shift dates to the context. `CalendarGrid` reads the context and applies a highlight style to matching cards.

---

### Data model & backend

**"Why is `ShiftProposal.assignments` JSON and not normalized rows?"**
It's a snapshot — multiple staff/department/date combos per proposal. Normalizing into rows would require a join table and complicate the confirm transaction. JSON is simpler for a record that's read as a unit and discarded after confirm/reject.

**"How do you handle timezone-aware date storage?"**
Dates arrive as `YYYY-MM-DD` strings, normalized to UTC midnight in the hospital's configured timezone via `date-fns-tz / fromZonedTime`. Queries compare against ISO strings to avoid DST boundary bugs.

**"What does the audit log capture for edits vs. adds/deletes?"**
Adds and deletes store the full shift record. Edits store a JSON diff — only the changed fields with before/after values.

---

### System design / scaling

**"How would you move this to production?"**
SQLite → PostgreSQL + PgBouncer, auth with RBAC, HIPAA compliance for patient data (encryption at rest, access audit logs), WebSocket push for multi-nurse real-time updates, EHR integration via HL7 FHIR.

**"What breaks first under load?"**
SQLite — single writer, no connection pooling. Second: the AI endpoint has no rate limiting or queue, so concurrent requests all hit OpenAI simultaneously.

**"How would you test the AI agent layer?"**
Unit test each tool individually (they're pure DB queries with defined inputs/outputs). For agent behavior, integration tests with mocked OpenAI responses to keep tests deterministic and fast.

---

### Behavioral

**"What was the hardest bug you hit?"**
The timezone/date bug — shifts stored at 7am UTC were being excluded by midnight-UTC boundary queries, so they'd disappear on the calendar. Fixed by normalizing with `fromZonedTime` and comparing dates as ISO strings instead of UTC timestamps.

**"What would you build next with another week?"**
Re-validate constraints at confirm time (current known gap), add hard server-side enforcement of scheduling rules on every shift create/edit, and WebSocket push for real-time multi-user calendar updates.

**"Why did you pick this project?"**
Hospital scheduling is one of the clearest cases where AI assistance with human oversight is genuinely valuable — and where a bad AI decision has real human consequences. The proposal/confirm pattern is a direct response to that constraint.

---

## Quick Reference

| Question | Short answer |
|---|---|
| Why Mastra? | Tool routing + streaming abstraction out of the box |
| Why SSE not WebSockets? | Server-to-client only; simpler, native reconnect |
| Why pure-TS scoring? | Deterministic, testable, no LLM latency |
| Why proposals never auto-commit? | Human-in-the-loop is a hard requirement for hospital schedules |
| Why SQLite? | Zero ops for a demo; schema is portable to Postgres |
| Biggest known gap? | No constraint re-validation at confirm time |
