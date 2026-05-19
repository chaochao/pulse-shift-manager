# Pulse Hospital OS UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Pulse hospital scheduling UI — a calendar-based app with month/week views, color-coded department shift cards, and full shift CRUD (create/edit/delete), on top of an Express + Prisma + SQLite backend.

**Architecture:** Custom CSS Grid calendar built with `date-fns`; shadcn/ui components for cards, dialogs, and popovers; TanStack Query for data fetching and cache invalidation; React Router for `/pulse` routes nested alongside the existing chat app at `/`.

**Tech Stack:** React 18, React Router v6, TanStack Query v5, date-fns, Prisma + SQLite, shadcn/ui, Tailwind CSS v4, Express, TypeScript

---

## File Map

**New files:**
```
prisma/
  schema.prisma
  seed.ts

src/
  pulse/
    types.ts
    PulseApp.tsx
    components/
      Sidebar.tsx
      CalendarGrid.tsx
      ShiftCard.tsx
      ShiftDialog.tsx
      AskPulseDrawer.tsx
    pages/
      CalendarPage.tsx
      AnalyticsPage.tsx
    hooks/
      useShifts.ts
      useDepartments.ts
      useStaff.ts
      useShiftMutations.ts
    lib/
      calendarUtils.ts
  web/
    ChatApp.tsx        ← extract existing App from main.tsx
  api/
    pulse.ts           ← Express router for /api/pulse/*

src/web/styles.css     ← add calendar cell styles
vitest.config.ts
src/pulse/lib/calendarUtils.test.ts
```

**Modified files:**
```
package.json           ← add deps + scripts
src/web/main.tsx       ← add BrowserRouter, QueryClientProvider, /pulse routes
src/api/server.ts      ← mount pulse router
.env / .env.example    ← add PULSE_DATABASE_URL
```

---

## Task 1: Install dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install runtime deps**

```bash
npm install react-router-dom @tanstack/react-query date-fns @prisma/client
```

Expected: packages added to `node_modules`, no errors.

- [ ] **Step 2: Install dev deps**

```bash
npm install -D prisma vitest
```

Expected: packages added.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(pulse): install react-router-dom, tanstack-query, date-fns, prisma, vitest"
```

---

## Task 2: Configure Vitest

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (add test scripts)

- [ ] **Step 1: Create vitest.config.ts**

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node'
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
})
```

- [ ] **Step 2: Add test scripts to package.json**

In `package.json`, inside `"scripts"`, add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Verify vitest works**

```bash
npm test
```

Expected output: `No test files found` (no errors — just nothing to run yet).

- [ ] **Step 4: Commit**

```bash
git add vitest.config.ts package.json
git commit -m "feat(pulse): configure vitest"
```

---

## Task 3: Prisma schema + env

**Files:**
- Create: `prisma/schema.prisma`
- Modify: `.env`, `.env.example`

- [ ] **Step 1: Add PULSE_DATABASE_URL to .env**

Append to `.env`:
```
PULSE_DATABASE_URL="file:./pulse.db"
```

Append to `.env.example`:
```
PULSE_DATABASE_URL="file:./pulse.db"
```

- [ ] **Step 2: Create prisma/schema.prisma**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("PULSE_DATABASE_URL")
}

model Department {
  id                     String          @id @default(cuid())
  name                   String
  color                  String
  minStaffDay            Int             @default(0)
  minStaffEvening        Int             @default(0)
  minStaffNight          Int             @default(0)
  maxStaffDay            Int             @default(0)
  maxStaffEvening        Int             @default(0)
  maxStaffNight          Int             @default(0)
  nursePatientRatio      Float           @default(4)
  requiredCertifications String          @default("")
  staff                  Staff[]
  shifts                 Shift[]
  patientCensus          PatientCensus[]
  createdAt              DateTime        @default(now())
}

model Staff {
  id                   String           @id @default(cuid())
  name                 String
  role                 String
  departmentId         String
  department           Department       @relation(fields: [departmentId], references: [id])
  employmentType       String           @default("fullTime")
  contractHoursPerWeek Int              @default(36)
  preferredShift       String           @default("none")
  certifications       String           @default("")
  maxConsecutiveShifts Int              @default(3)
  shifts               Shift[]
  timeOffRequests      TimeOffRequest[]
  shiftSwapsRequested  ShiftSwap[]      @relation("Requester")
  shiftSwapsTargeted   ShiftSwap[]      @relation("Target")
  sickCalls            SickCall[]
  createdAt            DateTime         @default(now())
}

model Shift {
  id           String     @id @default(cuid())
  staffId      String
  staff        Staff      @relation(fields: [staffId], references: [id])
  departmentId String
  department   Department @relation(fields: [departmentId], references: [id])
  date         DateTime
  type         String
  hours        Int        @default(12)
  status       String     @default("scheduled")
  swapRequest  ShiftSwap?
  createdAt    DateTime   @default(now())
}

model PatientCensus {
  id             String     @id @default(cuid())
  departmentId   String
  department     Department @relation(fields: [departmentId], references: [id])
  date           DateTime
  shiftType      String
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
  status    String   @default("pending")
  createdAt DateTime @default(now())
}

model ShiftSwap {
  id          String   @id @default(cuid())
  requesterId String
  requester   Staff    @relation("Requester", fields: [requesterId], references: [id])
  targetId    String?
  target      Staff?   @relation("Target", fields: [targetId], references: [id])
  shiftId     String   @unique
  shift       Shift    @relation(fields: [shiftId], references: [id])
  status      String   @default("pending")
  createdAt   DateTime @default(now())
}

model SickCall {
  id        String   @id @default(cuid())
  staffId   String
  staff     Staff    @relation(fields: [staffId], references: [id])
  date      DateTime
  shiftType String
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

- [ ] **Step 3: Run migration**

```bash
npx prisma migrate dev --name init
```

Expected: `pulse.db` created, migration applied, Prisma client generated.

- [ ] **Step 4: Verify client was generated**

```bash
ls node_modules/.prisma/client
```

Expected: `index.js` and `schema.prisma` visible.

- [ ] **Step 5: Commit**

```bash
git add prisma/ .env.example
git commit -m "feat(pulse): add prisma schema and initial migration"
```

---

## Task 4: Install shadcn components

**Files:**
- Creates files under `src/components/ui/`

- [ ] **Step 1: Add dialog, select, popover, label**

```bash
npx shadcn@latest add dialog select popover label
```

Expected: new files appear in `src/components/ui/`: `dialog.tsx`, `select.tsx`, `popover.tsx`, `label.tsx`.

- [ ] **Step 2: Commit**

```bash
git add src/components/ui/
git commit -m "feat(pulse): add shadcn dialog, select, popover, label components"
```

---

## Task 5: Types

**Files:**
- Create: `src/pulse/types.ts`

- [ ] **Step 1: Create types.ts**

```typescript
// src/pulse/types.ts
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
  date: string          // ISO string from JSON serialization
  type: ShiftType
  hours: number
  status: ShiftStatus
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pulse/types.ts
git commit -m "feat(pulse): add shared types"
```

---

## Task 6: calendarUtils + tests

**Files:**
- Create: `src/pulse/lib/calendarUtils.ts`
- Create: `src/pulse/lib/calendarUtils.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/pulse/lib/calendarUtils.test.ts
import { describe, it, expect } from 'vitest'
import {
  getMonthGrid,
  getWeekDays,
  navigateMonth,
  navigateWeek,
  formatDateKey,
  isToday,
  getQueryRange,
  groupByDateAndDept,
  groupByDateTypeDept,
  formatRoleSummary
} from '@/pulse/lib/calendarUtils'
import type { Shift } from '@/pulse/types'

describe('getMonthGrid', () => {
  it('returns 4–6 weeks of 7 days each', () => {
    const grid = getMonthGrid(new Date(2026, 4, 1)) // May 2026
    expect(grid.length).toBeGreaterThanOrEqual(4)
    expect(grid.length).toBeLessThanOrEqual(6)
    grid.forEach(week => expect(week.length).toBe(7))
  })

  it('first cell is a Sunday', () => {
    const grid = getMonthGrid(new Date(2026, 4, 1))
    expect(grid[0][0].getDay()).toBe(0)
  })

  it('last cell is a Saturday', () => {
    const grid = getMonthGrid(new Date(2026, 4, 1))
    const lastWeek = grid[grid.length - 1]
    expect(lastWeek[6].getDay()).toBe(6)
  })
})

describe('getWeekDays', () => {
  it('returns exactly 7 days', () => {
    expect(getWeekDays(new Date(2026, 4, 19)).length).toBe(7)
  })

  it('starts on Sunday', () => {
    const days = getWeekDays(new Date(2026, 4, 19)) // Tuesday May 19
    expect(days[0].getDay()).toBe(0)
  })

  it('ends on Saturday', () => {
    const days = getWeekDays(new Date(2026, 4, 19))
    expect(days[6].getDay()).toBe(6)
  })
})

describe('navigateMonth', () => {
  it('advances by one month', () => {
    expect(navigateMonth(new Date(2026, 4, 1), 'next').getMonth()).toBe(5)
  })

  it('goes back by one month', () => {
    expect(navigateMonth(new Date(2026, 4, 1), 'prev').getMonth()).toBe(3)
  })

  it('wraps year correctly', () => {
    expect(navigateMonth(new Date(2026, 0, 1), 'prev').getFullYear()).toBe(2025)
  })
})

describe('navigateWeek', () => {
  it('advances by one week', () => {
    const result = navigateWeek(new Date(2026, 4, 19), 'next')
    expect(result.getDate()).toBe(26)
  })

  it('goes back by one week', () => {
    const result = navigateWeek(new Date(2026, 4, 19), 'prev')
    expect(result.getDate()).toBe(12)
  })
})

describe('formatDateKey', () => {
  it('formats to yyyy-MM-dd', () => {
    expect(formatDateKey(new Date(2026, 4, 3))).toBe('2026-05-03')
  })
})

describe('isToday', () => {
  it('returns true for today', () => {
    expect(isToday(new Date())).toBe(true)
  })

  it('returns false for yesterday', () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    expect(isToday(yesterday)).toBe(false)
  })
})

describe('getQueryRange', () => {
  it('month range starts on a Sunday', () => {
    const { start } = getQueryRange('month', new Date(2026, 4, 1))
    expect(start.getDay()).toBe(0)
  })

  it('week range spans 7 days', () => {
    const { start, end } = getQueryRange('week', new Date(2026, 4, 19))
    const diff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    expect(diff).toBe(6)
  })
})

describe('groupByDateAndDept', () => {
  const shifts = [
    { date: '2026-05-19T00:00:00Z', departmentId: 'dept-1', staff: { role: 'RN', name: 'A', department: {} } },
    { date: '2026-05-19T00:00:00Z', departmentId: 'dept-1', staff: { role: 'MD', name: 'B', department: {} } },
    { date: '2026-05-20T00:00:00Z', departmentId: 'dept-2', staff: { role: 'RN', name: 'C', department: {} } },
  ] as unknown as Shift[]

  it('groups by date key then departmentId', () => {
    const result = groupByDateAndDept(shifts)
    expect(Object.keys(result)).toContain('2026-05-19')
    expect(result['2026-05-19']['dept-1']).toHaveLength(2)
    expect(result['2026-05-20']['dept-2']).toHaveLength(1)
  })
})

describe('groupByDateTypeDept', () => {
  const shifts = [
    { date: '2026-05-19T00:00:00Z', departmentId: 'dept-1', type: 'day', staff: { role: 'RN', name: 'A', department: {} } },
    { date: '2026-05-19T00:00:00Z', departmentId: 'dept-1', type: 'night', staff: { role: 'RN', name: 'B', department: {} } },
  ] as unknown as Shift[]

  it('groups by date → shiftType → departmentId', () => {
    const result = groupByDateTypeDept(shifts)
    expect(result['2026-05-19']['day']['dept-1']).toHaveLength(1)
    expect(result['2026-05-19']['night']['dept-1']).toHaveLength(1)
  })
})

describe('formatRoleSummary', () => {
  it('counts roles and formats as "N Role"', () => {
    const shifts = [
      { staff: { role: 'RN' } },
      { staff: { role: 'RN' } },
      { staff: { role: 'MD' } },
    ] as unknown as Shift[]
    const result = formatRoleSummary(shifts)
    expect(result).toContain('2 RN')
    expect(result).toContain('1 MD')
  })
})
```

- [ ] **Step 2: Run tests — expect all to fail**

```bash
npm test
```

Expected: all tests fail with "Cannot find module '@/pulse/lib/calendarUtils'".

- [ ] **Step 3: Implement calendarUtils.ts**

```typescript
// src/pulse/lib/calendarUtils.ts
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, addMonths, subMonths, addWeeks, subWeeks,
  format, isSameMonth, isSameDay
} from 'date-fns'
import type { Shift, ViewMode } from '@/pulse/types'

export function getMonthGrid(date: Date): Date[][] {
  const start = startOfWeek(startOfMonth(date), { weekStartsOn: 0 })
  const end = endOfWeek(endOfMonth(date), { weekStartsOn: 0 })
  const days = eachDayOfInterval({ start, end })
  const weeks: Date[][] = []
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7))
  }
  return weeks
}

export function getWeekDays(date: Date): Date[] {
  return eachDayOfInterval({
    start: startOfWeek(date, { weekStartsOn: 0 }),
    end: endOfWeek(date, { weekStartsOn: 0 })
  })
}

export function navigateMonth(date: Date, dir: 'prev' | 'next'): Date {
  return dir === 'next' ? addMonths(date, 1) : subMonths(date, 1)
}

export function navigateWeek(date: Date, dir: 'prev' | 'next'): Date {
  return dir === 'next' ? addWeeks(date, 1) : subWeeks(date, 1)
}

export function formatMonthYear(date: Date): string {
  return format(date, 'MMMM yyyy')
}

export function formatWeekRange(date: Date): string {
  const start = startOfWeek(date, { weekStartsOn: 0 })
  const end = endOfWeek(date, { weekStartsOn: 0 })
  return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`
}

export function formatDateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

export function isCurrentMonth(day: Date, current: Date): boolean {
  return isSameMonth(day, current)
}

export function isToday(day: Date): boolean {
  return isSameDay(day, new Date())
}

export function getQueryRange(viewMode: ViewMode, date: Date): { start: Date; end: Date } {
  if (viewMode === 'month') {
    return {
      start: startOfWeek(startOfMonth(date), { weekStartsOn: 0 }),
      end: endOfWeek(endOfMonth(date), { weekStartsOn: 0 })
    }
  }
  return {
    start: startOfWeek(date, { weekStartsOn: 0 }),
    end: endOfWeek(date, { weekStartsOn: 0 })
  }
}

export function groupByDateAndDept(shifts: Shift[]): Record<string, Record<string, Shift[]>> {
  return shifts.reduce((acc, shift) => {
    const key = formatDateKey(new Date(shift.date))
    if (!acc[key]) acc[key] = {}
    if (!acc[key][shift.departmentId]) acc[key][shift.departmentId] = []
    acc[key][shift.departmentId].push(shift)
    return acc
  }, {} as Record<string, Record<string, Shift[]>>)
}

export function groupByDateTypeDept(shifts: Shift[]): Record<string, Record<string, Record<string, Shift[]>>> {
  return shifts.reduce((acc, shift) => {
    const key = formatDateKey(new Date(shift.date))
    const type = shift.type
    if (!acc[key]) acc[key] = {}
    if (!acc[key][type]) acc[key][type] = {}
    if (!acc[key][type][shift.departmentId]) acc[key][type][shift.departmentId] = []
    acc[key][type][shift.departmentId].push(shift)
    return acc
  }, {} as Record<string, Record<string, Record<string, Shift[]>>>)
}

export function formatRoleSummary(shifts: Shift[]): string {
  const counts = shifts.reduce((acc, s) => {
    acc[s.staff.role] = (acc[s.staff.role] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  return Object.entries(counts)
    .map(([role, count]) => `${count} ${role}`)
    .join(', ')
}
```

- [ ] **Step 4: Run tests — expect all to pass**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/pulse/lib/ vitest.config.ts
git commit -m "feat(pulse): add calendarUtils with tests"
```

---

## Task 7: Seed data

**Files:**
- Create: `prisma/seed.ts`
- Modify: `package.json` (add prisma.seed)

- [ ] **Step 1: Create prisma/seed.ts**

```typescript
// prisma/seed.ts
import { PrismaClient } from '@prisma/client'
import { addDays, startOfDay, subDays } from 'date-fns'

const prisma = new PrismaClient()

async function main() {
  await prisma.shiftSwap.deleteMany()
  await prisma.sickCall.deleteMany()
  await prisma.timeOffRequest.deleteMany()
  await prisma.shift.deleteMany()
  await prisma.patientCensus.deleteMany()
  await prisma.staff.deleteMany()
  await prisma.department.deleteMany()
  await prisma.schedulingRule.deleteMany()

  const [icu, ed, surgery, cardiology, general] = await Promise.all([
    prisma.department.create({ data: { name: 'ICU', color: '#4f86c6', minStaffDay: 4, minStaffEvening: 4, minStaffNight: 3, maxStaffDay: 8, maxStaffEvening: 8, maxStaffNight: 6, nursePatientRatio: 2, requiredCertifications: 'ICU,ACLS' } }),
    prisma.department.create({ data: { name: 'Emergency', color: '#e05c5c', minStaffDay: 5, minStaffEvening: 5, minStaffNight: 4, maxStaffDay: 10, maxStaffEvening: 10, maxStaffNight: 8, nursePatientRatio: 4, requiredCertifications: 'ACLS,TNCC' } }),
    prisma.department.create({ data: { name: 'Surgery', color: '#56b08b', minStaffDay: 3, minStaffEvening: 2, minStaffNight: 1, maxStaffDay: 8, maxStaffEvening: 6, maxStaffNight: 4, nursePatientRatio: 3, requiredCertifications: 'OR,ACLS' } }),
    prisma.department.create({ data: { name: 'Cardiology', color: '#9b59b6', minStaffDay: 3, minStaffEvening: 3, minStaffNight: 2, maxStaffDay: 7, maxStaffEvening: 7, maxStaffNight: 5, nursePatientRatio: 3, requiredCertifications: 'ACLS' } }),
    prisma.department.create({ data: { name: 'General', color: '#f39c12', minStaffDay: 4, minStaffEvening: 4, minStaffNight: 3, maxStaffDay: 10, maxStaffEvening: 10, maxStaffNight: 8, nursePatientRatio: 5, requiredCertifications: '' } }),
  ])

  const staffRows = [
    { name: 'Alice Chen', role: 'RN', departmentId: icu.id, certifications: 'ICU,ACLS', preferredShift: 'day', contractHoursPerWeek: 36 },
    { name: 'Bob Martinez', role: 'RN', departmentId: icu.id, certifications: 'ICU,ACLS', preferredShift: 'night', contractHoursPerWeek: 36 },
    { name: 'Dr. Sarah Kim', role: 'MD', departmentId: icu.id, certifications: 'ICU,ACLS', preferredShift: 'day', contractHoursPerWeek: 48 },
    { name: 'James Wilson', role: 'RN', departmentId: ed.id, certifications: 'ACLS,TNCC', preferredShift: 'evening', contractHoursPerWeek: 36 },
    { name: 'Maria Lopez', role: 'RN', departmentId: ed.id, certifications: 'ACLS,TNCC', preferredShift: 'day', contractHoursPerWeek: 36 },
    { name: 'Dr. Kevin Park', role: 'MD', departmentId: ed.id, certifications: 'ACLS,TNCC', preferredShift: 'none', contractHoursPerWeek: 48 },
    { name: 'Linda Zhang', role: 'RN', departmentId: surgery.id, certifications: 'OR,ACLS', preferredShift: 'day', contractHoursPerWeek: 36 },
    { name: 'Tom Brown', role: 'Tech', departmentId: surgery.id, certifications: 'OR', preferredShift: 'day', contractHoursPerWeek: 40 },
    { name: 'Dr. Anna White', role: 'MD', departmentId: surgery.id, certifications: 'OR,ACLS', preferredShift: 'day', contractHoursPerWeek: 48 },
    { name: 'Rachel Green', role: 'RN', departmentId: cardiology.id, certifications: 'ACLS', preferredShift: 'evening', contractHoursPerWeek: 36 },
    { name: 'Mike Davis', role: 'LPN', departmentId: cardiology.id, certifications: 'ACLS', preferredShift: 'night', contractHoursPerWeek: 36 },
    { name: 'Susan Hall', role: 'RN', departmentId: general.id, certifications: '', preferredShift: 'day', contractHoursPerWeek: 36 },
    { name: 'Chris Evans', role: 'RN', departmentId: general.id, certifications: '', preferredShift: 'evening', contractHoursPerWeek: 36 },
    { name: 'Nurse Joy', role: 'LPN', departmentId: general.id, certifications: '', preferredShift: 'night', contractHoursPerWeek: 32 },
    { name: 'Dr. Bruce Lee', role: 'MD', departmentId: general.id, certifications: '', preferredShift: 'day', contractHoursPerWeek: 48 },
  ]

  const allStaff = await Promise.all(staffRows.map(s => prisma.staff.create({ data: s })))

  const today = startOfDay(new Date())
  const startDate = subDays(today, 10)
  const shiftTypes = ['day', 'evening', 'night'] as const
  const shiftData: Parameters<typeof prisma.shift.create>[0]['data'][] = []

  for (let d = 0; d < 21; d++) {
    const date = addDays(startDate, d)
    const dayOfWeek = date.getDay()
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

    for (const member of allStaff) {
      // ~4 shifts per week, skip some days to vary coverage
      if ((d + allStaff.indexOf(member)) % 7 < 4 || isWeekend) {
        const type = shiftTypes[d % 3]
        shiftData.push({
          staffId: member.id,
          departmentId: member.departmentId,
          date,
          type,
          hours: 12,
          status: date < today ? 'completed' : 'scheduled'
        })
      }
    }
  }

  await prisma.shift.createMany({ data: shiftData })
  await prisma.schedulingRule.create({
    data: { minRestHoursBetweenShifts: 11, maxNightShiftsPerMonth: 8, maxShiftsPerWeek: 5, maxHoursPerWeek: 60 }
  })

  console.log(`Seeded: 5 departments, ${allStaff.length} staff, ${shiftData.length} shifts`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
```

- [ ] **Step 2: Add seed script to package.json**

In `package.json`, add a `"prisma"` key at the top level (not inside `scripts`):
```json
"prisma": {
  "seed": "tsx prisma/seed.ts"
}
```

- [ ] **Step 3: Run seed**

```bash
npx prisma db seed
```

Expected output: `Seeded: 5 departments, 15 staff, N shifts`

- [ ] **Step 4: Verify data exists**

```bash
npx prisma studio
```

Open `http://localhost:5555`, confirm Department, Staff, and Shift tables have data. Then close Prisma Studio (`Ctrl+C`).

- [ ] **Step 5: Commit**

```bash
git add prisma/seed.ts package.json
git commit -m "feat(pulse): add prisma seed with departments, staff, shifts"
```

---

## Task 8: Pulse API router

**Files:**
- Create: `src/api/pulse.ts`
- Modify: `src/api/server.ts`

- [ ] **Step 1: Create src/api/pulse.ts**

```typescript
// src/api/pulse.ts
import { Router } from 'express'
import { PrismaClient } from '@prisma/client'

const router = Router()
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.PULSE_DATABASE_URL ?? 'file:./pulse.db' } }
})

router.get('/departments', async (_req, res) => {
  try {
    const departments = await prisma.department.findMany({ orderBy: { name: 'asc' } })
    res.json(departments)
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

router.get('/staff', async (req, res) => {
  try {
    const where = req.query.departmentId
      ? { departmentId: String(req.query.departmentId) }
      : undefined
    const staff = await prisma.staff.findMany({
      where,
      include: { department: true },
      orderBy: { name: 'asc' }
    })
    res.json(staff)
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

router.get('/shifts', async (req, res) => {
  try {
    const { start, end } = req.query
    if (!start || !end) { res.status(400).json({ error: 'start and end are required' }); return }
    const shifts = await prisma.shift.findMany({
      where: { date: { gte: new Date(String(start)), lte: new Date(String(end)) } },
      include: { staff: { include: { department: true } }, department: true },
      orderBy: { date: 'asc' }
    })
    res.json(shifts)
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

router.post('/shifts', async (req, res) => {
  try {
    const { staffId, departmentId, date, type, hours } = req.body
    const shift = await prisma.shift.create({
      data: { staffId, departmentId, date: new Date(date), type, hours: Number(hours) },
      include: { staff: { include: { department: true } }, department: true }
    })
    res.json(shift)
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

router.put('/shifts/:id', async (req, res) => {
  try {
    const { type, hours, status } = req.body
    const shift = await prisma.shift.update({
      where: { id: req.params.id },
      data: { type, hours: Number(hours), status },
      include: { staff: { include: { department: true } }, department: true }
    })
    res.json(shift)
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

router.delete('/shifts/:id', async (req, res) => {
  try {
    await prisma.shift.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

router.get('/rules', async (_req, res) => {
  try {
    const rules = await prisma.schedulingRule.findFirst()
    res.json(rules)
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

export default router
```

- [ ] **Step 2: Mount the router in server.ts**

In `src/api/server.ts`, add these two lines — the import after the existing imports, and the `app.use` after `app.use(express.json())`:

```typescript
import pulseRouter from './pulse'
// ...existing imports above...

// after app.use(express.json()):
app.use('/api/pulse', pulseRouter)
```

- [ ] **Step 3: Restart the dev API server and test**

```bash
npm run dev:api
```

In a new terminal:
```bash
curl http://localhost:3001/api/pulse/departments
```

Expected: JSON array of 5 departments with colors.

```bash
curl "http://localhost:3001/api/pulse/shifts?start=2026-01-01&end=2026-12-31"
```

Expected: JSON array of shifts with nested `staff` and `department` objects.

- [ ] **Step 4: Commit**

```bash
git add src/api/pulse.ts src/api/server.ts
git commit -m "feat(pulse): add pulse API router with shifts, staff, departments CRUD"
```

---

## Task 9: React Router + layout entry point

**Files:**
- Create: `src/web/ChatApp.tsx`
- Modify: `src/web/main.tsx`

- [ ] **Step 1: Create placeholder files so main.tsx imports resolve**

These are minimal stubs — they will be fully replaced in Task 10.

```typescript
// src/pulse/PulseApp.tsx
import { Outlet } from 'react-router-dom'
export function PulseApp() { return <div><Outlet /></div> }
```

```typescript
// src/pulse/pages/CalendarPage.tsx
export function CalendarPage() { return <div>Calendar</div> }
```

```typescript
// src/pulse/pages/AnalyticsPage.tsx
export function AnalyticsPage() { return <div>Analytics</div> }
```

- [ ] **Step 2: Extract App from main.tsx into ChatApp.tsx**

Create `src/web/ChatApp.tsx` — copy everything from `src/web/main.tsx` except the last two lines (`createRoot(...).render(...)`), and rename the `App` function to `ChatApp` with a named export:

```typescript
// src/web/ChatApp.tsx
import React, { FormEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SquarePen, Send, X } from "lucide-react";

const THREAD_ID_KEY = "chat_thread_id";

function getOrCreateThreadId(): string {
  const existing = localStorage.getItem(THREAD_ID_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(THREAD_ID_KEY, id);
  return id;
}

type ChatRole = "user" | "assistant";
type ChatMessage = { id: string; role: ChatRole; content: string };
type Thread = { id: string; title: string; createdAt: string };
type SseEvent = { event: string; data: unknown };

const initialMessages: ChatMessage[] = [
  { id: crypto.randomUUID(), role: "assistant", content: "Ask me anything. I will stream the answer back from a Mastra agent." }
];

function parseSseFrame(frame: string): SseEvent | null {
  const eventLine = frame.split("\n").find((line) => line.startsWith("event:"));
  const dataLine = frame.split("\n").find((line) => line.startsWith("data:"));
  if (!eventLine || !dataLine) return null;
  return { event: eventLine.replace("event:", "").trim(), data: JSON.parse(dataLine.replace("data:", "").trim()) };
}

function extractSseFrames(buffer: string) {
  const parts = buffer.split("\n\n");
  const remainder = parts.pop() ?? "";
  return { frames: parts, remainder };
}

function formatRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

function appendToMessage(messages: ChatMessage[], messageId: string, text: string) {
  return messages.map((m) => m.id === messageId ? { ...m, content: m.content + text } : m);
}

export function ChatApp() {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [threadId, setThreadId] = useState<string>(getOrCreateThreadId);
  const [threads, setThreads] = useState<Thread[]>([]);

  function fetchThreads() {
    fetch("/api/threads").then((r) => r.json()).then(({ threads: list }: { threads: Thread[] }) => setThreads(list)).catch(() => {});
  }

  function handleSelectThread(id: string) {
    if (id === threadId) return;
    localStorage.setItem(THREAD_ID_KEY, id);
    setThreadId(id);
    setMessages(initialMessages);
  }

  async function handleDeleteThread(id: string) {
    await fetch(`/api/threads/${id}`, { method: "DELETE" });
    if (id === threadId) { localStorage.removeItem(THREAD_ID_KEY); setThreadId(getOrCreateThreadId()); setMessages(initialMessages); }
    fetchThreads();
  }

  useEffect(() => { fetchThreads() }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/threads/${threadId}`).then((r) => r.json()).then(({ messages: history }: { messages: Array<{ role: ChatRole; content: string }> }) => {
      if (cancelled || history.length === 0) return;
      setMessages([...initialMessages, ...history.map((m) => ({ id: crypto.randomUUID(), role: m.role, content: m.content }))]);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [threadId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = input.trim();
    if (prompt === "" || isStreaming) return;
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content: prompt };
    const assistantMessage: ChatMessage = { id: crypto.randomUUID(), role: "assistant", content: "" };
    setMessages([...messages, userMessage, assistantMessage]);
    setInput("");
    setError(null);
    setIsStreaming(true);
    try {
      await streamChatResponse(prompt, threadId, assistantMessage.id);
    } catch (streamError) {
      setError(streamError instanceof Error ? streamError.message : "The chat stream failed.");
    } finally {
      setIsStreaming(false);
      inputRef.current?.focus();
      fetchThreads();
    }
  }

  async function streamChatResponse(message: string, threadId: string, assistantMessageId: string) {
    const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, threadId }) });
    if (!response.ok || !response.body) { const errorBody = await response.json().catch(() => null); throw new Error(errorBody?.error ?? "The chat API did not return a stream."); }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { frames, remainder } = extractSseFrames(buffer);
      buffer = remainder;
      for (const frame of frames) {
        const parsed = parseSseFrame(frame);
        if (!parsed) continue;
        if (parsed.event === "delta") { const { text } = parsed.data as { text: string }; setMessages((cur) => appendToMessage(cur, assistantMessageId, text)); }
        if (parsed.event === "error") { const { message } = parsed.data as { message: string }; throw new Error(message); }
      }
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <Button variant="default" className="w-full h-12 text-sm font-medium" disabled={isStreaming} onClick={() => { localStorage.removeItem(THREAD_ID_KEY); setThreadId(getOrCreateThreadId()); setMessages(initialMessages); fetchThreads(); }}>
            <SquarePen size={15} strokeWidth={2} />
            New Chat
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="px-2 pb-4 pt-1">
            {threads.map((thread) => (
              <button key={thread.id} type="button" className={`thread-item${thread.id === threadId ? " active" : ""}`} onClick={() => handleSelectThread(thread.id)}>
                <span className="thread-title">{thread.title}</span>
                <span className="thread-time">{formatRelativeTime(thread.createdAt)}</span>
                <span className="thread-delete" role="button" aria-label="Delete conversation" onClick={(e) => { e.stopPropagation(); handleDeleteThread(thread.id); }}>
                  <X size={14} strokeWidth={2} />
                </span>
              </button>
            ))}
          </div>
        </ScrollArea>
      </aside>
      <main className="chat-panel" aria-label="Chat conversation">
        <header className="chat-header">
          <div><h1>Mastra SSE Chat</h1><p>POST a message, stream the agent response back as SSE.</p></div>
          <span className={isStreaming ? "status live" : "status"} />
        </header>
        <ScrollArea className="flex-1 overflow-hidden">
          <div className="message-list">
            {messages.map((message) => (
              <article className={`message ${message.role}`} key={message.id} aria-label={`${message.role} message`}>
                <div className="message-role">{message.role}</div>
                <p>{message.content || "..."}</p>
              </article>
            ))}
          </div>
        </ScrollArea>
        {error && <div className="error-banner">{error}</div>}
        <form className="composer" onSubmit={handleSubmit}>
          <Textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Send a message" rows={2} disabled={isStreaming} className="min-h-[56px] max-h-40 resize-y text-base leading-relaxed" />
          <Button type="submit" disabled={isStreaming || input.trim() === ""} className="h-[56px] min-w-[88px] text-base font-medium gap-2">
            <Send size={16} strokeWidth={2} />
            Send
          </Button>
        </form>
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Replace src/web/main.tsx**

```typescript
// src/web/main.tsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ChatApp } from './ChatApp'
import { PulseApp } from '@/pulse/PulseApp'
import { CalendarPage } from '@/pulse/pages/CalendarPage'
import { AnalyticsPage } from '@/pulse/pages/AnalyticsPage'
import './styles.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } }
})

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<ChatApp />} />
          <Route path="/pulse" element={<PulseApp />}>
            <Route index element={<CalendarPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
)
```

- [ ] **Step 4: Verify app still works at /**

```bash
npm run dev
```

Open `http://localhost:5173` — the chat app should render exactly as before.

- [ ] **Step 5: Commit**

```bash
git add src/pulse/ src/web/main.tsx src/web/ChatApp.tsx
git commit -m "feat(pulse): add React Router and QueryClient, extract ChatApp component"
```

---

## Task 10: PulseApp layout + Sidebar

**Files:**
- Create: `src/pulse/PulseApp.tsx`
- Create: `src/pulse/components/Sidebar.tsx`

- [ ] **Step 1: Create Sidebar.tsx**

```typescript
// src/pulse/components/Sidebar.tsx
import { NavLink } from 'react-router-dom'
import { Calendar, BarChart2, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SidebarProps {
  onAskPulse: () => void
}

export function Sidebar({ onAskPulse }: SidebarProps) {
  const navItem = (to: string, end: boolean, icon: React.ReactNode, label: string) => (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => cn(
        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
        isActive ? 'bg-[#f2f2f2] text-[#222222]' : 'text-[#6a6a6a] hover:bg-[#f7f7f7] hover:text-[#222222]'
      )}
    >
      {icon}
      {label}
    </NavLink>
  )

  return (
    <aside className="w-60 flex-none flex flex-col border-r border-[#dddddd] bg-white">
      <div className="px-5 py-5 border-b border-[#dddddd]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#ff385c] flex items-center justify-center flex-none">
            <span className="text-white font-bold text-xs">P</span>
          </div>
          <span className="font-semibold text-[#222222]">Pulse</span>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItem('/pulse', true, <Calendar size={16} />, 'Calendar')}
        {navItem('/pulse/analytics', false, <BarChart2 size={16} />, 'Analytics')}
        <button
          onClick={onAskPulse}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-[#6a6a6a] hover:bg-[#f7f7f7] hover:text-[#222222] transition-colors"
        >
          <Sparkles size={16} />
          Ask Pulse
        </button>
      </nav>
    </aside>
  )
}
```

- [ ] **Step 2: Create PulseApp.tsx**

```typescript
// src/pulse/PulseApp.tsx
import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './components/Sidebar'
import { AskPulseDrawer } from './components/AskPulseDrawer'

export function PulseApp() {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <Sidebar onAskPulse={() => setDrawerOpen(true)} />
      <main className="flex-1 overflow-hidden relative flex flex-col">
        {drawerOpen && <AskPulseDrawer onClose={() => setDrawerOpen(false)} />}
        <Outlet />
      </main>
    </div>
  )
}
```

- [ ] **Step 3: Create AskPulseDrawer.tsx (stub so PulseApp compiles)**

```typescript
// src/pulse/components/AskPulseDrawer.tsx
export function AskPulseDrawer({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute left-0 top-0 h-full w-80 bg-white border-r border-[#dddddd] shadow-lg z-10 flex items-center justify-center">
      <button onClick={onClose} className="text-sm text-[#6a6a6a]">Close (stub)</button>
    </div>
  )
}
```

- [ ] **Step 4: Create stub pages so routing compiles**

```typescript
// src/pulse/pages/CalendarPage.tsx
export function CalendarPage() {
  return <div className="p-8 text-[#222222] font-medium">Calendar — coming soon</div>
}
```

```typescript
// src/pulse/pages/AnalyticsPage.tsx
export function AnalyticsPage() {
  return <div className="p-8 text-[#222222] font-medium">Analytics — coming soon</div>
}
```

- [ ] **Step 5: Verify /pulse renders**

Open `http://localhost:5173/pulse` — should show the sidebar with Pulse logo + nav items, and "Calendar — coming soon" in the main area. Clicking "Analytics" in the nav should update the main area.

- [ ] **Step 6: Commit**

```bash
git add src/pulse/
git commit -m "feat(pulse): add PulseApp layout with sidebar and route shell"
```

---

## Task 11: TanStack Query hooks

**Files:**
- Create: `src/pulse/hooks/useShifts.ts`
- Create: `src/pulse/hooks/useDepartments.ts`
- Create: `src/pulse/hooks/useStaff.ts`
- Create: `src/pulse/hooks/useShiftMutations.ts`

- [ ] **Step 1: Create useShifts.ts**

```typescript
// src/pulse/hooks/useShifts.ts
import { useQuery } from '@tanstack/react-query'
import type { Shift } from '@/pulse/types'

export function useShifts(start: Date, end: Date) {
  return useQuery<Shift[]>({
    queryKey: ['shifts', start.toISOString(), end.toISOString()],
    queryFn: async () => {
      const params = new URLSearchParams({
        start: start.toISOString(),
        end: end.toISOString()
      })
      const res = await fetch(`/api/pulse/shifts?${params}`)
      if (!res.ok) throw new Error('Failed to fetch shifts')
      return res.json()
    }
  })
}
```

- [ ] **Step 2: Create useDepartments.ts**

```typescript
// src/pulse/hooks/useDepartments.ts
import { useQuery } from '@tanstack/react-query'
import type { Department } from '@/pulse/types'

export function useDepartments() {
  return useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: async () => {
      const res = await fetch('/api/pulse/departments')
      if (!res.ok) throw new Error('Failed to fetch departments')
      return res.json()
    },
    staleTime: Infinity
  })
}
```

- [ ] **Step 3: Create useStaff.ts**

```typescript
// src/pulse/hooks/useStaff.ts
import { useQuery } from '@tanstack/react-query'
import type { Staff } from '@/pulse/types'

export function useStaff() {
  return useQuery<Staff[]>({
    queryKey: ['staff'],
    queryFn: async () => {
      const res = await fetch('/api/pulse/staff')
      if (!res.ok) throw new Error('Failed to fetch staff')
      return res.json()
    },
    staleTime: Infinity
  })
}
```

- [ ] **Step 4: Create useShiftMutations.ts**

```typescript
// src/pulse/hooks/useShiftMutations.ts
import { useMutation, useQueryClient } from '@tanstack/react-query'

export function useCreateShift() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: {
      staffId: string
      departmentId: string
      date: string
      type: string
      hours: number
    }) => {
      const res = await fetch('/api/pulse/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      if (!res.ok) throw new Error('Failed to create shift')
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shifts'] })
  })
}

export function useUpdateShift() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      type,
      hours,
      status
    }: {
      id: string
      type: string
      hours: number
      status: string
    }) => {
      const res = await fetch(`/api/pulse/shifts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, hours, status })
      })
      if (!res.ok) throw new Error('Failed to update shift')
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shifts'] })
  })
}

export function useDeleteShift() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/pulse/shifts/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete shift')
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shifts'] })
  })
}
```

- [ ] **Step 5: Commit**

```bash
git add src/pulse/hooks/
git commit -m "feat(pulse): add tanstack query hooks for shifts, departments, staff, mutations"
```

---

## Task 12: ShiftCard component

**Files:**
- Create: `src/pulse/components/ShiftCard.tsx`

- [ ] **Step 1: Create ShiftCard.tsx**

```typescript
// src/pulse/components/ShiftCard.tsx
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatRoleSummary } from '@/pulse/lib/calendarUtils'
import type { Department, Shift } from '@/pulse/types'

interface ShiftCardProps {
  department: Department
  shifts: Shift[]
  onCardClick: (shift: Shift, e: React.MouseEvent) => void
}

export function ShiftCard({ department, shifts, onCardClick }: ShiftCardProps) {
  const summary = formatRoleSummary(shifts)
  const bg = `${department.color}18`

  return (
    <Popover>
      <PopoverTrigger asChild>
        <div
          className="rounded-md px-2 py-1 text-xs cursor-pointer mb-1 border-l-[3px] select-none"
          style={{ backgroundColor: bg, borderColor: department.color }}
          onClick={(e) => { e.stopPropagation(); onCardClick(shifts[0], e) }}
        >
          <div className="font-semibold text-[#222222] truncate leading-tight">{department.name}</div>
          <div className="text-[#6a6a6a] truncate leading-tight mt-0.5">{summary}</div>
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-3" side="right" onClick={(e) => e.stopPropagation()}>
        <p className="text-xs font-semibold text-[#222222] mb-2">{department.name}</p>
        <div className="space-y-0.5">
          {shifts.map((shift) => (
            <div key={shift.id} className="text-xs text-[#6a6a6a]">
              {shift.staff.name}
              <span className="text-[#929292] ml-1">— {shift.staff.role}</span>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pulse/components/ShiftCard.tsx
git commit -m "feat(pulse): add ShiftCard with popover for staff details"
```

---

## Task 13: ShiftDialog (create/edit/delete)

**Files:**
- Create: `src/pulse/components/ShiftDialog.tsx`

- [ ] **Step 1: Create ShiftDialog.tsx**

```typescript
// src/pulse/components/ShiftDialog.tsx
import { useState } from 'react'
import { format } from 'date-fns'
import { AlertTriangle } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { useStaff } from '@/pulse/hooks/useStaff'
import {
  useCreateShift, useUpdateShift, useDeleteShift
} from '@/pulse/hooks/useShiftMutations'
import type { Department, Shift, ShiftType } from '@/pulse/types'

interface ShiftDialogProps {
  open: boolean
  date: Date | null
  shift: Shift | null
  departments: Department[]
  onClose: () => void
}

export function ShiftDialog({ open, date, shift, departments, onClose }: ShiftDialogProps) {
  const isEdit = shift !== null

  const [departmentId, setDepartmentId] = useState(shift?.departmentId ?? '')
  const [staffId, setStaffId] = useState(shift?.staffId ?? '')
  const [shiftType, setShiftType] = useState<ShiftType>(shift?.type ?? 'day')
  const [hours, setHours] = useState(String(shift?.hours ?? 12))

  const { data: allStaff = [] } = useStaff()
  const createShift = useCreateShift()
  const updateShift = useUpdateShift()
  const deleteShift = useDeleteShift()

  const filteredStaff = allStaff.filter((s) => s.departmentId === departmentId)
  const selectedStaff = allStaff.find((s) => s.id === staffId)
  const selectedDept = departments.find((d) => d.id === departmentId)

  const warnings: string[] = []
  if (selectedStaff && selectedDept) {
    const staffCerts = selectedStaff.certifications.split(',').filter(Boolean)
    const reqCerts = selectedDept.requiredCertifications.split(',').filter(Boolean)
    const missing = reqCerts.filter((c) => !staffCerts.includes(c))
    if (missing.length > 0) {
      warnings.push(`Missing certifications: ${missing.join(', ')}`)
    }
  }

  const isPending = createShift.isPending || updateShift.isPending || deleteShift.isPending

  async function handleSave() {
    if (!date || !departmentId || !staffId) return
    if (isEdit) {
      await updateShift.mutateAsync({ id: shift.id, type: shiftType, hours: Number(hours), status: shift.status })
    } else {
      await createShift.mutateAsync({ staffId, departmentId, date: date.toISOString(), type: shiftType, hours: Number(hours) })
    }
    onClose()
  }

  async function handleDelete() {
    if (!shift) return
    await deleteShift.mutateAsync(shift.id)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Edit Shift' : `Add Shift — ${date ? format(date, 'MMM d, yyyy') : ''}`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Department</Label>
            <Select
              value={departmentId}
              onValueChange={(v) => { setDepartmentId(v); setStaffId('') }}
              disabled={isEdit}
            >
              <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
              <SelectContent>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Staff</Label>
            <Select value={staffId} onValueChange={setStaffId} disabled={isEdit || !departmentId}>
              <SelectTrigger>
                <SelectValue placeholder={departmentId ? 'Select staff member' : 'Select department first'} />
              </SelectTrigger>
              <SelectContent>
                {filteredStaff.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name} — {s.role}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Shift Type</Label>
            <Select value={shiftType} onValueChange={(v) => setShiftType(v as ShiftType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Day (7am – 7pm)</SelectItem>
                <SelectItem value="evening">Evening (3pm – 11pm)</SelectItem>
                <SelectItem value="night">Night (7pm – 7am)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Duration</Label>
            <Select value={hours} onValueChange={setHours}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="8">8 hours</SelectItem>
                <SelectItem value="12">12 hours</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {warnings.map((w, i) => (
            <div key={i} className="flex items-center gap-2 text-amber-700 text-xs bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              <AlertTriangle size={13} className="flex-none" />
              {w}
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <div>
            {isEdit && (
              <Button variant="destructive" size="sm" onClick={handleDelete} disabled={isPending}>
                Delete
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={isPending || !departmentId || !staffId}
            >
              {isEdit ? 'Update' : 'Add Shift'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pulse/components/ShiftDialog.tsx
git commit -m "feat(pulse): add ShiftDialog with create/edit/delete and certification warnings"
```

---

## Task 14: CalendarGrid — month view

**Files:**
- Modify: `src/pulse/components/CalendarGrid.tsx` (full implementation replacing stub if any)

- [ ] **Step 1: Create CalendarGrid.tsx**

```typescript
// src/pulse/components/CalendarGrid.tsx
import { useState } from 'react'
import { format, isSameMonth } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  getMonthGrid, getWeekDays,
  navigateMonth, navigateWeek,
  formatMonthYear, formatWeekRange,
  formatDateKey, isToday,
  getQueryRange,
  groupByDateAndDept,
  groupByDateTypeDept
} from '@/pulse/lib/calendarUtils'
import { ShiftCard } from './ShiftCard'
import { ShiftDialog } from './ShiftDialog'
import { useShifts } from '@/pulse/hooks/useShifts'
import { useDepartments } from '@/pulse/hooks/useDepartments'
import type { Shift, Department, ViewMode } from '@/pulse/types'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const SHIFT_TYPES = ['day', 'evening', 'night'] as const
const SHIFT_LABELS = { day: 'Day', evening: 'Evening', night: 'Night' }

export function CalendarGrid() {
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [editingShift, setEditingShift] = useState<Shift | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const { start, end } = getQueryRange(viewMode, currentDate)
  const { data: shifts = [] } = useShifts(start, end)
  const { data: departments = [] } = useDepartments()

  const deptMap = Object.fromEntries(departments.map((d) => [d.id, d]))
  const byDateDept = groupByDateAndDept(shifts)
  const byDateTypeDept = groupByDateTypeDept(shifts)

  function openCreate(date: Date) {
    setSelectedDate(date)
    setEditingShift(null)
    setDialogOpen(true)
  }

  function openEdit(shift: Shift, e: React.MouseEvent) {
    e.stopPropagation()
    setEditingShift(shift)
    setSelectedDate(new Date(shift.date))
    setDialogOpen(true)
  }

  function navigate(dir: 'prev' | 'next') {
    setCurrentDate((d) => viewMode === 'month' ? navigateMonth(d, dir) : navigateWeek(d, dir))
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-[#dddddd] flex-none">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-[#222222]">
            {viewMode === 'month' ? formatMonthYear(currentDate) : formatWeekRange(currentDate)}
          </h1>
          <div className="flex items-center">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate('prev')}>
              <ChevronLeft size={14} />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => setCurrentDate(new Date())}>
              Today
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate('next')}>
              <ChevronRight size={14} />
            </Button>
          </div>
        </div>
        <div className="flex rounded-md border border-[#dddddd] overflow-hidden text-xs">
          <button
            onClick={() => setViewMode('month')}
            className={cn('px-3 py-1.5 font-medium transition-colors',
              viewMode === 'month' ? 'bg-[#222222] text-white' : 'text-[#6a6a6a] hover:bg-[#f7f7f7]'
            )}
          >Month</button>
          <button
            onClick={() => setViewMode('week')}
            className={cn('px-3 py-1.5 font-medium transition-colors',
              viewMode === 'week' ? 'bg-[#222222] text-white' : 'text-[#6a6a6a] hover:bg-[#f7f7f7]'
            )}
          >Week</button>
        </div>
      </div>

      {/* Day labels */}
      <div className={cn('grid border-b border-[#dddddd] flex-none', viewMode === 'week' ? 'grid-cols-[80px_repeat(7,1fr)]' : 'grid-cols-7')}>
        {viewMode === 'week' && <div className="border-r border-[#ebebeb]" />}
        {DAY_LABELS.map((d) => (
          <div key={d} className="py-2 text-center text-xs font-medium text-[#6a6a6a] uppercase tracking-wide">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar body */}
      <div className="flex-1 overflow-auto">
        {viewMode === 'month' ? (
          <MonthBody
            currentDate={currentDate}
            byDateDept={byDateDept}
            deptMap={deptMap}
            onCellClick={openCreate}
            onShiftClick={openEdit}
          />
        ) : (
          <WeekBody
            currentDate={currentDate}
            byDateTypeDept={byDateTypeDept}
            deptMap={deptMap}
            onCellClick={openCreate}
            onShiftClick={openEdit}
          />
        )}
      </div>

      <ShiftDialog
        open={dialogOpen}
        date={selectedDate}
        shift={editingShift}
        departments={departments}
        onClose={() => { setDialogOpen(false); setEditingShift(null) }}
      />
    </div>
  )
}

function MonthBody({
  currentDate, byDateDept, deptMap, onCellClick, onShiftClick
}: {
  currentDate: Date
  byDateDept: Record<string, Record<string, Shift[]>>
  deptMap: Record<string, Department>
  onCellClick: (d: Date) => void
  onShiftClick: (s: Shift, e: React.MouseEvent) => void
}) {
  const weeks = getMonthGrid(currentDate)

  return (
    <div className="grid grid-cols-7 h-full">
      {weeks.flat().map((day, i) => {
        const key = formatDateKey(day)
        const dayDepts = byDateDept[key] ?? {}
        const inMonth = isSameMonth(day, currentDate)

        return (
          <div
            key={i}
            className={cn(
              'min-h-[120px] border-b border-r border-[#ebebeb] p-2 cursor-pointer transition-colors',
              inMonth ? 'bg-white hover:bg-[#fafafa]' : 'bg-[#fafafa]',
            )}
            onClick={() => onCellClick(day)}
          >
            <div className={cn(
              'text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1',
              isToday(day) ? 'bg-[#ff385c] text-white' :
              inMonth ? 'text-[#222222]' : 'text-[#c1c1c1]'
            )}>
              {format(day, 'd')}
            </div>
            {Object.entries(dayDepts).map(([deptId, depShifts]) => {
              const dept = deptMap[deptId]
              if (!dept) return null
              return (
                <ShiftCard
                  key={deptId}
                  department={dept}
                  shifts={depShifts}
                  onCardClick={onShiftClick}
                />
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

function WeekBody({
  currentDate, byDateTypeDept, deptMap, onCellClick, onShiftClick
}: {
  currentDate: Date
  byDateTypeDept: Record<string, Record<string, Record<string, Shift[]>>>
  deptMap: Record<string, Department>
  onCellClick: (d: Date) => void
  onShiftClick: (s: Shift, e: React.MouseEvent) => void
}) {
  const days = getWeekDays(currentDate)

  return (
    <div>
      {SHIFT_TYPES.map((type) => (
        <div key={type} className="grid grid-cols-[80px_repeat(7,1fr)]">
          <div className="border-b border-r border-[#ebebeb] flex items-center justify-center">
            <span className="text-[10px] font-semibold text-[#6a6a6a] uppercase tracking-widest">
              {SHIFT_LABELS[type]}
            </span>
          </div>
          {days.map((day, i) => {
            const key = formatDateKey(day)
            const depts = byDateTypeDept[key]?.[type] ?? {}
            return (
              <div
                key={i}
                className="min-h-[100px] border-b border-r border-[#ebebeb] p-2 cursor-pointer hover:bg-[#fafafa] transition-colors"
                onClick={() => onCellClick(day)}
              >
                {Object.entries(depts).map(([deptId, depShifts]) => {
                  const dept = deptMap[deptId]
                  if (!dept) return null
                  return (
                    <ShiftCard
                      key={deptId}
                      department={dept}
                      shifts={depShifts}
                      onCardClick={onShiftClick}
                    />
                  )
                })}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pulse/components/CalendarGrid.tsx
git commit -m "feat(pulse): add CalendarGrid with month and week views"
```

---

## Task 15: CalendarPage — wire everything

**Files:**
- Modify: `src/pulse/pages/CalendarPage.tsx`

- [ ] **Step 1: Replace CalendarPage stub**

```typescript
// src/pulse/pages/CalendarPage.tsx
import { CalendarGrid } from '@/pulse/components/CalendarGrid'

export function CalendarPage() {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <CalendarGrid />
    </div>
  )
}
```

- [ ] **Step 2: Open browser and verify**

Navigate to `http://localhost:5173/pulse`.

Verify:
- Month grid renders with 7 columns
- Shift cards appear on days with data (colored by department)
- Hovering a shift card shows a popover with staff names
- Clicking a day cell opens the "Add Shift" dialog
- Selecting department filters staff list
- Submitting creates a shift; it appears on the calendar after save
- Clicking a shift card opens "Edit Shift" pre-filled
- Updating saves the change; deleting removes it
- Month/Week toggle switches views
- Prev/Next arrows navigate; Today resets to current date

- [ ] **Step 3: Commit**

```bash
git add src/pulse/pages/CalendarPage.tsx
git commit -m "feat(pulse): wire CalendarPage with CalendarGrid"
```

---

## Task 16: AskPulseDrawer — full static shell

**Files:**
- Modify: `src/pulse/components/AskPulseDrawer.tsx`

- [ ] **Step 1: Replace AskPulseDrawer stub**

```typescript
// src/pulse/components/AskPulseDrawer.tsx
import { useState } from 'react'
import { X, Sparkles, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface AskPulseDrawerProps {
  onClose: () => void
}

export function AskPulseDrawer({ onClose }: AskPulseDrawerProps) {
  const [input, setInput] = useState('')

  return (
    <div className="absolute left-0 top-0 h-full w-80 bg-white border-r border-[#dddddd] shadow-xl z-10 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#dddddd]">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-[#ff385c]" />
          <span className="font-semibold text-sm text-[#222222]">Ask Pulse</span>
        </div>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded-md text-[#6a6a6a] hover:bg-[#f2f2f2] transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-[#ff385c]/10 flex items-center justify-center">
          <Sparkles size={22} className="text-[#ff385c]" />
        </div>
        <div>
          <p className="font-semibold text-[#222222] text-sm">Good morning!</p>
          <p className="text-[#6a6a6a] text-xs mt-1 leading-relaxed">
            Ask me anything about your staffing schedule — coverage gaps, rotation fairness, or upcoming demand.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap justify-center">
          {['Plan', 'Analyze', 'Optimize'].map((label) => (
            <button
              key={label}
              className="px-3 py-1 rounded-full text-xs font-medium border border-[#dddddd] text-[#222222] hover:bg-[#f7f7f7] transition-colors"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pb-4 pt-2 border-t border-[#dddddd]">
        <div className="flex gap-2 items-end">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Pulse..."
            rows={2}
            className="resize-none text-sm flex-1"
          />
          <Button size="icon" className="h-9 w-9 flex-none" disabled={!input.trim()}>
            <Send size={14} />
          </Button>
        </div>
        <p className="text-[10px] text-[#929292] text-center mt-2">AI features available in Step 2</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser**

Click "Ask Pulse" in the sidebar. Verify:
- Drawer slides in over the calendar (does not push it)
- Close button (X) hides the drawer
- Quick-action chips render
- Input and Send button render (Send disabled when input is empty)

- [ ] **Step 3: Commit**

```bash
git add src/pulse/components/AskPulseDrawer.tsx
git commit -m "feat(pulse): add AskPulseDrawer static shell"
```

---

## Task 17: AnalyticsPage placeholder

**Files:**
- Modify: `src/pulse/pages/AnalyticsPage.tsx`

- [ ] **Step 1: Replace stub with styled placeholder**

```typescript
// src/pulse/pages/AnalyticsPage.tsx
import { BarChart2 } from 'lucide-react'

export function AnalyticsPage() {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-4 text-center px-8">
      <div className="w-14 h-14 rounded-2xl bg-[#f7f7f7] flex items-center justify-center">
        <BarChart2 size={28} className="text-[#6a6a6a]" />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-[#222222]">Analytics</h2>
        <p className="text-[#6a6a6a] text-sm mt-1">
          Staffing insights and demand forecasting — coming in a future update.
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser**

Click "Analytics" in the sidebar. Verify the centered placeholder renders.

- [ ] **Step 3: Commit**

```bash
git add src/pulse/pages/AnalyticsPage.tsx
git commit -m "feat(pulse): add AnalyticsPage placeholder"
```

---

## Task 18: Final smoke test

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

Expected: all calendarUtils tests pass.

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Manual end-to-end walkthrough**

With `npm run dev` running:

1. Open `http://localhost:5173` — chat app renders, send a message
2. Open `http://localhost:5173/pulse` — Pulse sidebar + calendar render
3. Calendar shows shift cards with department colors
4. Hover a card → popover shows staff names
5. Click empty cell → Add Shift dialog → select dept → staff filters → submit → card appears
6. Click shift card → Edit Shift pre-filled → update type → save → card reflects change
7. Edit Shift → Delete → card disappears
8. Toggle Month/Week → week view shows Day/Evening/Night rows
9. Click Ask Pulse → drawer overlays calendar → close button works
10. Click Analytics → placeholder renders

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(pulse): complete Step 1 — calendar UI with shift CRUD and Ask Pulse drawer"
```
