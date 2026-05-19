# Pulse — Hospital AI Operating System: UI Design Spec

**Date:** 2026-05-19  
**Scope:** Step 1 — UI shell, Calendar view, shift CRUD, constraint-aware data model, Ask Pulse drawer shell, Analytics placeholder  
**Stack:** React + TanStack Query + shadcn/ui + React Router + Express + Prisma + SQLite

---

## 1. Product Overview

Pulse is an AI-powered operating system for hospitals that helps schedulers make fair, optimized staffing decisions. Healthcare scheduling is constraint-heavy — skill matching, legal/labor rules, patient census ratios, and daily shift swaps all affect whether a schedule is valid. Step 1 builds the UI shell, calendar view, and basic shift CRUD with constraint-aware data. Step 2 wires the Ask Pulse AI agent as a constraint solver.

---

## 2. Core Business Constraints

These constraints must be modeled in the data layer in Step 1 so Ask Pulse can reason over them in Step 2.

1. **Skill matching** — Not all staff can work all departments. ICU, OR, ER, Pediatrics each require specific certifications. The "Add Shift" dialog filters staff by department certification.
2. **Legal / compliance** — Max hours/week, minimum rest between shifts, nurse-patient ratio laws (e.g. California ICU = 1:2, ER = 1:4). Violations surface as warnings on the calendar.
3. **Patient demand** — Census varies by season, day, and department. Required staff = `ceil(predictedCensus / nursePatientRatio)`. Understaffed shifts are visually flagged.
4. **Shift swapping / sick calls** — Staff swap shifts, request PTO, or call in sick daily. Sick calls create open coverage gaps on the calendar.

---

## 3. App Structure

### Shell Layout
- **Left sidebar** (fixed, ~240px): Pulse logo/wordmark, nav items — Calendar, Analytics, Ask Pulse toggle
- **Main area** (fluid right): renders the active page
- **Ask Pulse drawer**: slides in from the left over the main content when toggled; has a close (X) button

### Routing (React Router)
| Path | Page |
|---|---|
| `/pulse` | Calendar (default) |
| `/pulse/analytics` | Analytics placeholder |

Ask Pulse is not a route — it is a `boolean` state at the layout level.

### Entry Point
`src/web/main.tsx` gets React Router added. The existing chat app remains at `/`. Pulse routes live under `/pulse`.

---

## 4. Calendar Page

### Views
- **Month view** (default): 7-column grid, one cell per day
- **Week view**: 7-column grid with Day / Evening / Night rows per day column
- Toggle in page header; prev/next arrows + "Today" button

### Month View Cell
- Day number top-right
- One card per department with shifts that day
- Card: **"ICU — 4 RNs, 2 MDs"** (department name + role count)
- Card background: soft tint of department color; left border = full department color
- Hover: shadcn `Popover` with individual staff names grouped by role
- Red dot / warning badge if day is understaffed (census ÷ ratio > assigned staff count)
- Click empty cell → "Add Shift" dialog (date pre-filled)
- Click existing shift card → "Edit / Delete Shift" dialog

### Week View Cell
Three rows per day column: **Day**, **Evening**, **Night**.  
Each row shows department cards in the same format as month view.

### Implementation
- Custom CSS Grid + `date-fns` (no calendar library)
- shadcn `Card`, `Badge`, `Popover`, `Dialog` for shift cards, hover, and forms
- TanStack Query: `useShifts(start, end)` keyed by `['shifts', startDate, endDate]`

---

## 5. Shift CRUD

### Add Shift Dialog
Triggered by clicking an empty calendar cell.

Fields:
- **Staff** — searchable select, filtered by department certification
- **Department** — select (pre-filled if clicked from a department card)
- **Date** — date picker (pre-filled from cell)
- **Shift type** — Day | Evening | Night
- **Hours** — 8 | 12

On submit: POST `/api/pulse/shifts` → invalidate `['shifts']` cache → calendar refreshes.

No constraint validation in Step 1 — clean CRUD only. Constraint checking is Step 2.

### Edit Shift Dialog
Triggered by clicking an existing shift card. Same fields as Add, pre-filled. Includes a **Delete** button (destructive, with confirmation).

On update: PUT `/api/pulse/shifts/:id` → invalidate cache.  
On delete: DELETE `/api/pulse/shifts/:id` → invalidate cache.

---

## 6. Analytics Page

Placeholder — page shell with heading "Analytics" and a "Coming soon" state. Nav link works.

---

## 7. Ask Pulse Drawer

Slide-in panel triggered by the "Ask Pulse" nav item. Overlays main content (does not push it).

### Contents (Step 1 — static shell)
- Close (X) button top-right
- Pulse logo mark + greeting: "Good morning, [name]!"
- Subtitle: "Ask me anything about your staffing schedule."
- Chat input (shadcn `Textarea` + send button)
- Quick-action chips: **Plan**, **Analyze**, **Optimize**

AI wiring (Mastra + SSE) happens in Step 2. In Step 2 the agent receives full context: shift assignments, department minimums, patient census, staff rotation history, and scheduling rules — enabling constraint-aware suggestions.

---

## 8. Data Model (Prisma + SQLite)

Separate from Mastra's `storage.db` (chat memory). Pulse data lives in `pulse.db`.

```prisma
model Department {
  id                     String   @id @default(cuid())
  name                   String
  color                  String                        // hex e.g. "#4f86c6"
  minStaffDay            Int      @default(0)
  minStaffEvening        Int      @default(0)
  minStaffNight          Int      @default(0)
  maxStaffDay            Int      @default(0)
  maxStaffEvening        Int      @default(0)
  maxStaffNight          Int      @default(0)
  nursePatientRatio      Float    @default(4)          // e.g. 2 = 1 nurse per 2 patients
  requiredCertifications String   @default("")         // comma-separated
  staff                  Staff[]
  patientCensus          PatientCensus[]
  createdAt              DateTime @default(now())
}

model Staff {
  id                    String           @id @default(cuid())
  name                  String
  role                  String                         // RN | LPN | MD | Tech | Pharmacy
  departmentId          String
  department            Department       @relation(fields: [departmentId], references: [id])
  employmentType        String           @default("fullTime") // fullTime | partTime | prn
  contractHoursPerWeek  Int              @default(36)
  preferredShift        String           @default("none")    // day | evening | night | none
  certifications        String           @default("")        // comma-separated
  maxConsecutiveShifts  Int              @default(3)
  shifts                Shift[]
  timeOffRequests       TimeOffRequest[]
  shiftSwapsRequested   ShiftSwap[]      @relation("Requester")
  shiftSwapsTargeted    ShiftSwap[]      @relation("Target")
  sickCalls             SickCall[]
  createdAt             DateTime         @default(now())
}

model Shift {
  id          String     @id @default(cuid())
  staffId     String
  staff       Staff      @relation(fields: [staffId], references: [id])
  departmentId String
  date        DateTime
  type        String                                   // day | evening | night
  hours       Int        @default(12)                 // 8 or 12
  status      String     @default("scheduled")        // scheduled | completed | absent | swapped
  swapRequest ShiftSwap?
  createdAt   DateTime   @default(now())
}

model PatientCensus {
  id             String     @id @default(cuid())
  departmentId   String
  department     Department @relation(fields: [departmentId], references: [id])
  date           DateTime
  shiftType      String                               // day | evening | night
  predictedCount Int        @default(0)
  actualCount    Int        @default(0)
  createdAt      DateTime   @default(now())
}

model TimeOffRequest {
  id        String   @id @default(cuid())
  staffId   String
  staff     Staff    @relation(fields: [staffId], references: [id])
  startDate DateTime
  endDate   DateTime
  reason    String   @default("")
  status    String   @default("pending")              // pending | approved | denied
  createdAt DateTime @default(now())
}

model ShiftSwap {
  id          String   @id @default(cuid())
  requesterId String
  requester   Staff    @relation("Requester", fields: [requesterId], references: [id])
  targetId    String?                                 // null = open swap
  target      Staff?   @relation("Target", fields: [targetId], references: [id])
  shiftId     String   @unique
  shift       Shift    @relation(fields: [shiftId], references: [id])
  status      String   @default("pending")            // pending | approved | denied
  createdAt   DateTime @default(now())
}

model SickCall {
  id        String   @id @default(cuid())
  staffId   String
  staff     Staff    @relation(fields: [staffId], references: [id])
  date      DateTime
  shiftType String                                    // day | evening | night
  createdAt DateTime @default(now())
}

model SchedulingRule {
  id                        String @id @default(cuid())
  minRestHoursBetweenShifts Int    @default(11)
  maxNightShiftsPerMonth    Int    @default(8)
  maxShiftsPerWeek          Int    @default(5)
  maxHoursPerWeek           Int    @default(60)
}
```

---

## 9. API Endpoints (Express)

| Method | Path | Description |
|---|---|---|
| GET | `/api/pulse/shifts` | `?start=&end=` — shifts in range, joined to staff + department |
| POST | `/api/pulse/shifts` | Create a shift |
| PUT | `/api/pulse/shifts/:id` | Update a shift |
| DELETE | `/api/pulse/shifts/:id` | Delete a shift |
| GET | `/api/pulse/departments` | All departments |
| GET | `/api/pulse/staff` | All staff (optionally `?departmentId=`) |
| GET | `/api/pulse/rules` | Global scheduling rules |
| GET | `/api/pulse/census` | `?departmentId=&start=&end=` — patient census for date range |

---

## 10. TanStack Query

- `QueryClient` at Pulse app root
- `useShifts(start, end)` — `['shifts', start, end]`
- `useDepartments()` — `['departments']`, long cache
- `useStaff(departmentId?)` — `['staff', departmentId]`
- Mutations: `useCreateShift`, `useUpdateShift`, `useDeleteShift` — all invalidate `['shifts']`

---

## 11. File Structure

```
src/
  pulse/
    components/
      CalendarGrid.tsx        — month/week grid
      ShiftCard.tsx           — department card + hover popover
      ShiftDialog.tsx         — add/edit/delete dialog
      WeekRow.tsx             — day/evening/night rows
      AskPulseDrawer.tsx      — slide-in AI chat shell
      Sidebar.tsx             — Pulse nav sidebar
    pages/
      CalendarPage.tsx
      AnalyticsPage.tsx
    hooks/
      useShifts.ts
      useDepartments.ts
      useStaff.ts
    lib/
      calendarUtils.ts        — date-fns helpers
  api/
    pulse.ts                  — Express router /api/pulse/*

prisma/
  schema.prisma
  seed.ts
```

---

## 12. Seed Data

- 5 departments: ICU (blue), ED (red), Surgery (green), Cardiology (purple), General (orange)
- Each department has `nursePatientRatio`, min/max staff per shift, `requiredCertifications`
- 15 staff members across departments with varied roles, certifications, employment types
- 3 weeks of shifts covering all shift types and departments
- Patient census data for those 3 weeks
- One `SchedulingRule` row with sensible defaults

---

## 13. Out of Scope for Step 1

- Ask Pulse AI wiring (Step 2 — Mastra agent with constraint-aware context)
- Shift swap / PTO approval workflows (data model ready, UI deferred)
- Analytics charts (placeholder page only)
- Authentication
- Mobile responsiveness
- Constraint validation / violation warnings (Step 2)
- Legal/compliance rule enforcement (SchedulingRule model exists in schema but is not used in Step 1)
