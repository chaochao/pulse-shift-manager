# Pulse Shift Manager

A hospital staff scheduling and operations dashboard built as a demo project. Administrators can manage shifts on a calendar, monitor patient census, view staff workloads, and ask an AI assistant ("Ask Pulse") for scheduling analysis and recommendations.

**Demo scope:** Single-user, local SQLite, no auth. Production considerations are noted at the bottom.

---

## What It Does

**Calendar** — Month and week views for scheduling day/night shifts across departments. Add, edit, and delete shifts with toast notifications and inline conflict-free navigation.

**Patients** — Track admitted patients by department with expected discharge dates, days-remaining indicators, and status filters.

**Staff** — Browse all staff members, drill into individual profiles, and view their shifts in a list or month calendar view.

**Analytics** — Department-level pie charts for patients and staff, a sortable shift summary table with hours-limit highlighting (40h/week rule), and a consecutive-days column to flag overworked staff.

**Ask Pulse** — AI assistant drawer for natural language queries about staffing coverage, rotation fairness, and demand forecasting. Proposes shift assignments that a manager can review and confirm before anything is written to the database.

**Activity** — Audit log of every shift add, edit, and delete with source (manual vs. AI).

---

## Tech Stack

| Concern | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite |
| Routing | React Router v7 (nested routes) |
| Server state | TanStack Query v5 (cache + mutations) |
| Styling | Tailwind CSS v4, shadcn/ui, Base UI |
| Charts | Recharts |
| Backend | Express.js |
| ORM | Prisma v7 (SQLite via better-sqlite3) |
| AI agents | Mastra (GPT-4o via OpenAI) |
| AI memory | `@mastra/memory` + `@mastra/libsql` (LibSQL) |
| Testing | Vitest |

---

## Getting Started

```bash
npm install

# First-time database setup
npx prisma migrate deploy
npx prisma generate
npx prisma db seed

# Copy env template and add your OpenAI key
cp .env.example .env   # or create .env manually

# Start both servers (API :3001 + Vite :5173)
npm run dev
```

App runs at `http://localhost:5173`. The API server runs alongside on port 3001.

### Required environment variables

| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | Required for both AI agents |
| `PULSE_DATABASE_URL` | SQLite file path (default: `file:./pulse.db`) |

### Prisma command reference

| Command | When to use |
|---|---|
| `npx prisma migrate dev` | After editing `schema.prisma` — creates + applies a migration |
| `npx prisma migrate deploy` | After pulling changes — applies existing migrations |
| `npx prisma generate` | After any schema change or fresh `npm install` |
| `npx prisma db seed` | Repopulate demo data |
| `npx prisma studio` | GUI to browse/edit the database |
| `npm test` | Run Vitest unit tests |
| `npm run build` | TypeScript check + Vite build + Mastra build |

> **Note:** `npm install` does **not** regenerate the Prisma client in v7. Always run `prisma generate` after installing on a fresh clone. `tsx watch` (the API dev server) does not pick up `node_modules` changes — restart the server manually after any `prisma generate`.

---

## How the Pieces Connect

```
Browser
  │
  ├─ React Router (nested under /pulse)
  │     └─ Pages → TanStack Query hooks → fetch /api/pulse/*
  │
  ├─ AskPulseDrawer (chat UI)
  │     └─ SSE stream → POST /api/chat        (chat agent)
  │     └─ SSE stream → POST /api/shift-agent (shift agent)
  │                          │
  │                          └─ Mastra agent → OpenAI GPT-4o
  │                                 │
  │                                 └─ Tools → Prisma → pulse.db
  │
  └─ ShiftProposalModal
        └─ POST /api/shift-agent/confirm → writes Shift records to DB
                                         → TanStack Query invalidates 'shifts'

Express (port 3001)
  ├─ /api/pulse/*        REST CRUD — departments, staff, shifts, patients, activity
  ├─ /api/chat           SSE — chat agent streaming
  ├─ /api/shift-agent    SSE — shift agent streaming
  ├─ /api/threads/*      Mastra memory — list / get / delete threads
  └─ /api/health         Route list healthcheck

Prisma ──► pulse.db (SQLite)
```

---

## Project Structure

```
src/
  api/
    server.ts           Express entry point; /api/chat and /api/threads endpoints
    pulse.ts            REST router for all /api/pulse/* CRUD routes
    shift-agent.ts      REST router for /api/shift-agent SSE + confirm/reject

  mastra/
    agents/
      chat-agent.ts     General-purpose chat agent (conversation memory)
      shift-agent.ts    Scheduling agent with tool routing and system prompt
    tools/
      getCoverageGaps.ts    Departments below min staffing for a date range
      getOverloadedStaff.ts Staff over hour/consecutive-day limits
      getShifts.ts          Fetch shifts with staff + department
      getStaff.ts           Fetch staff with certs, preferences, contract hours
      getPatients.ts        Active patient census per department
      getSchedulingRules.ts Global rules from SchedulingRule table
      getBlockedDates.ts    Approved time-off + sick calls per staff
      scoreSchedule.ts      Calls scoring engine, returns Coverage/Individual/Overall
      recommendShifts.ts    Finds best-eligible staff for gaps (all constraint logic)
      proposeShifts.ts      Validates + stores a ShiftProposal (no DB write yet)
      confirmShifts.ts      Writes Shift records from a pending ShiftProposal
      prisma.ts             Shared Prisma client instance for all tools
    scoring/
      scoreCoverage.ts   Score A: filled slots ÷ required slots × 100
      scoreWellbeing.ts  Score B: per-staff rest/preference/consecutive load
      scoreC.ts          Score C: night/weekend equity across the team
      index.ts           Composes: Overall = Coverage×0.60 + Individual×0.40
      types.ts           Shared input/output types for the scoring engine

  pulse/
    components/
      Sidebar.tsx           Left navigation + "Ask Pulse" toggle button
      CalendarGrid.tsx      Month/week calendar with shift cards
      ShiftCard.tsx         Individual shift block on the calendar
      ShiftDialog.tsx       Add/edit shift modal
      PatientDialog.tsx     Add/edit patient modal
      AskPulseDrawer.tsx    Slide-in chat panel; handles SSE streaming
      ShiftProposalModal.tsx Before/after diff modal for confirming AI proposals
    context/
      HighlightContext.tsx  Cross-component state: highlight newly-confirmed shifts on calendar
    hooks/
      useShifts.ts          TanStack Query — fetch shifts by date range
      useShiftMutations.ts  TanStack Query — create/update/delete shifts
      useStaff.ts           TanStack Query — fetch staff
      usePatients.ts        TanStack Query — fetch patients
      useDepartments.ts     TanStack Query — fetch departments
    lib/
      calendarUtils.ts      Pure helpers: week/month grid generation, date math
      calendarUtils.test.ts Vitest unit tests for calendar utilities
    pages/
      CalendarPage.tsx      Month/week calendar view
      StaffPage.tsx         Staff list with department filter
      StaffDetailPage.tsx   Individual staff profile + shift history
      PatientsPage.tsx      Patient list with status/department filters
      AnalyticsPage.tsx     Charts + sortable overload table
      ActivityPage.tsx      Shift change log
      QAPage.tsx            Q&A / scheduling notes page
      SettingsPage.tsx      Hospital settings
    types.ts                Shared TypeScript types across the pulse feature
    PulseApp.tsx            Layout shell: Sidebar + Outlet + AskPulseDrawer + ShiftProposalModal

  web/
    main.tsx    React root, React Router setup, TanStack Query provider
    styles.css  Global styles + Tailwind imports

prisma/
  schema.prisma   Data model (source of truth)
  seed.ts         Demo seed data
  migrations/     Auto-generated SQL migration files
```

---

## Data Model

```
Department ──< Staff ──< Shift
           ──< Patient

Staff ──< TimeOffRequest
      ──< ShiftSwap
      ──< SickCall

SchedulingRule   (single global row)
HospitalSettings (single global row)
ShiftProposal    (AI-generated, pending human confirmation)
ShiftChangeLog   (audit trail for every shift add/edit/delete)
```

### Key fields

**Department** — `minStaffDay`, `minStaffNight`, `maxStaffDay`, `maxStaffNight`, `nursePatientRatio`, `requiredCertifications` (comma-separated string)

**Staff** — `employmentType` (`fullTime`|`partTime`), `contractHoursPerWeek`, `preferredShift`, `certifications` (comma-separated), `maxConsecutiveShifts`

**Shift** — `date` (DateTime, stored as UTC midnight in the hospital's local timezone), `type` (`day`|`evening`|`night`), `hours` (default 12), `status`

**SchedulingRule** — `minRestHoursBetweenShifts`, `maxNightShiftsPerMonth`, `maxShiftsPerWeek`, `maxHoursPerWeek`, `overtimeCeilingPct`, `nightLoadBufferPct`, `minRestAfterStretchHours`

**ShiftProposal** — `assignments` (JSON), `scores` (JSON), `warnings` (JSON), `status` (`pending`|`confirmed`|`rejected`), `expiresAt`

**ShiftChangeLog** — `action` (`add`|`edit`|`delete`), `source` (`manual`|`ai`), `changes` (JSON diff for edits)

---

## API Routes

### REST — `/api/pulse/*`

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/pulse/departments` | All departments |
| `GET` | `/api/pulse/staff` | All staff; `?departmentId=` to filter |
| `GET` | `/api/pulse/shifts` | Shifts in range; requires `?start=&end=` |
| `POST` | `/api/pulse/shifts` | Create shift; also writes a `ShiftChangeLog` row |
| `PUT` | `/api/pulse/shifts/:id` | Update shift; also writes a `ShiftChangeLog` diff |
| `DELETE` | `/api/pulse/shifts/:id` | Delete shift; also writes a `ShiftChangeLog` row |
| `GET` | `/api/pulse/patients` | All patients; `?departmentId=` to filter |
| `POST` | `/api/pulse/patients` | Create patient |
| `PUT` | `/api/pulse/patients/:id` | Update patient |
| `DELETE` | `/api/pulse/patients/:id` | Delete patient |
| `GET` | `/api/pulse/activity` | Shift change log, ordered newest-first |

### Streaming — SSE endpoints

Both streaming endpoints emit: `event: delta` (text chunks), `event: done`, `event: error`. Validation happens before the stream opens so bad requests return a standard JSON 400 rather than a partially-opened stream.

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/chat` | General chat agent (conversation memory per `threadId`) |
| `POST` | `/api/shift-agent` | Shift agent (scheduling queries + proposals) |
| `POST` | `/api/shift-agent/confirm` | Confirm a `ShiftProposal` → writes `Shift` records atomically |
| `POST` | `/api/shift-agent/reject` | Reject a `ShiftProposal` (no DB write) |

### Thread memory — `/api/threads/*`

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/threads` | List all chat threads (title = first user message) |
| `GET` | `/api/threads/:threadId` | Fetch messages for a thread |
| `DELETE` | `/api/threads/:threadId` | Delete a thread from Mastra memory |

---

## Frontend Architecture

### Routing

All hospital OS pages live under `/pulse` via a nested route — `PulseApp` is the layout (sidebar + drawer), and each page is an `<Outlet>`.

```
/pulse               → CalendarPage
/pulse/staff         → StaffPage
/pulse/staff/:id     → StaffDetailPage
/pulse/patients      → PatientsPage
/pulse/analytics     → AnalyticsPage
/pulse/activity      → ActivityPage
/pulse/qa            → QAPage
/pulse/settings      → SettingsPage
```

### Data fetching pattern

Each resource has a hook in `src/pulse/hooks/`. All hooks follow the same TanStack Query pattern:

```ts
// Read
const { data: staff } = useStaff()

// Mutate + invalidate
const { createShift } = useShiftMutations()
createShift({ staffId, departmentId, date, type, hours })
// → on success, invalidates ['shifts'] and ['activity'] query keys
```

Shift queries are keyed by `['shifts', start, end]`. After any mutation (or after the AI confirms a proposal), the query is invalidated to trigger a refetch.

### AskPulseDrawer and SSE

`AskPulseDrawer` opens as a side panel. It `POST`s to `/api/shift-agent`, reads the SSE stream line by line, and appends `delta` text to the last message in state. When a `done` event arrives, the stream closes. If the agent's response contains a `proposalId`, the drawer surfaces a "Review" button that opens `ShiftProposalModal`.

### ShiftProposalModal

Shows a before/after diff of current schedule vs. proposed assignments. On "Confirm", it calls `POST /api/shift-agent/confirm`, then the parent (`PulseApp`) invalidates the `shifts` query and adds the new shift dates to `HighlightContext` so the calendar briefly highlights them.

---

## AI Agent System

### Two agents

| Agent | File | Purpose |
|---|---|---|
| `chatAgent` | `src/mastra/agents/chat-agent.ts` | General Q&A with Mastra conversation memory |
| `shiftAgent` | `src/mastra/agents/shift-agent.ts` | Scheduling analysis + proposals, no persistent memory |

Both use `openai/gpt-4o` via the Mastra framework.

### Shift agent tool routing

The system prompt explicitly maps keyword patterns to tools to prevent the model from calling the wrong tool:

| User intent | Tool called |
|---|---|
| Gap, coverage, understaffed | `getCoverageGaps` |
| Overloaded, too many hours, burnout | `getOverloadedStaff` |
| Fill, recommend, cover this shift | `recommendShifts` |
| Score, health, evaluate | `scoreSchedule` |
| Time off, sick call, special notes | `getBlockedDates` → `getOverloadedStaff` |

`recommendShifts` is the high-level entry point for filling gaps — it handles constraint checking internally and calls `proposeShifts` to store the result. `proposeShifts` alone is for manually-constructed assignments.

### Scoring engine

Pure TypeScript, no LLM, in `src/mastra/scoring/`.

```
Coverage  = filled slots ÷ required slots × 100
            (a "slot" = one dept × day × shift-type with min > 0;
             "filled" = scheduled staff count ≥ minimum)

Individual = average wellbeing score across all staff
             (penalises <12h rest, >3 consecutive shifts, preference mismatches)

Overall   = Coverage × 0.60 + Individual × 0.40
```

Certifications, rest periods, and preferences do **not** affect the Coverage score.

### Proposal lifecycle

```
recommendShifts tool
    → creates ShiftProposal (status: pending, expires: +24h)
    → returns proposalId to agent

Agent streams proposalId → client shows "Review" button

User clicks Review → ShiftProposalModal
    → validates: exists, not expired, status == pending

User confirms → POST /api/shift-agent/confirm
    → prisma.$transaction: creates Shifts + ShiftChangeLogs, marks proposal confirmed
    → on failure: full rollback, proposal status unchanged

User rejects → POST /api/shift-agent/reject
    → marks proposal rejected, no shifts written
```

---

## Key Patterns & Gotchas

**Date storage** — Shifts are stored as UTC midnight in the hospital's local timezone (from `HospitalSettings.timezone`, default `America/Los_Angeles`). The `POST /api/pulse/shifts` route normalises incoming dates using `fromZonedTime` from `date-fns-tz`. Always pass dates as `YYYY-MM-DD` strings from the frontend.

**TanStack Query invalidation** — After every shift mutation, both `['shifts']` and `['activity']` are invalidated. Any new data-modifying endpoint should do the same in `useShiftMutations.ts`.

**ShiftChangeLog** — Every shift create/update/delete writes a log row inside the API route handler. The `source` field distinguishes `"manual"` (UI) from `"ai"` (agent-confirmed).

**Confirm re-validation gap** — Proposals are constraint-checked at creation time, not at confirm time. If staff availability changes between proposal and confirm (new sick call, approved time-off), the confirmed shifts may violate constraints. Re-validating at confirm time is not yet implemented.

---

## Real-World Considerations

This is a demo — authentication, multi-tenancy, and real-time sync are not implemented. Here is what would need to change for a real hospital deployment.

**Auth and access control** — No authentication exists. Production requires role-based access: charge nurses manage shifts for their unit, staff can only view their own schedule, administrators see everything. Integrates with hospital identity providers (SAML/LDAP).

**Database** — SQLite is file-based and single-writer. Production uses PostgreSQL with connection pooling (PgBouncer). Patient census and shift history grow fast — partitioning by date and department becomes necessary over 1–2 years.

**HIPAA compliance** — Patient census data is PHI. Production requires encryption at rest and in transit, audit logs for every data access, BAAs with all vendors, and data retention policies. The demo logs nothing and encrypts nothing.

**Scheduling rule enforcement** — The `SchedulingRule` model captures constraints but the demo UI does not enforce them as hard blocks. Production validates every shift creation/edit server-side and surfaces conflicts before saving.

**Real-time collaboration** — Multiple charge nurses may schedule the same unit simultaneously. Production needs optimistic locking or last-write-wins with conflict UI, and likely WebSocket push for live calendar updates.

**Timezone handling** — Hospital shifts cross midnight and span DST transitions. Production needs explicit timezone-aware storage (store the local date + hospital timezone, not a UTC timestamp).

**Notifications** — Staff expect push/SMS when shifts are assigned, swapped, or cancelled. Time-off approvals need email confirmation. The demo has no notification layer.

**Mobile** — The current layout is desktop-only. Production needs a responsive or PWA design for one-handed use on small screens.

**EHR and HR integrations** — Staff rosters come from HR systems (Workday, UKG). Patient census feeds from the EHR (Epic, Cerner). Production syncs via HL7 FHIR or vendor APIs.

**AI agent guardrails** — Production agents need audit trails for every AI recommendation, human-in-the-loop approval before any write, and clear disclosure to staff that AI assisted the schedule.
