# Pulse Shift Manager

A hospital staff scheduling and operations dashboard built as a demo project.

## What it does

Pulse Shift Manager helps hospital administrators manage staff shifts, monitor patient census, and surface operational insights — all in one place.

**Calendar** — Month and week views for scheduling day/night shifts across departments. Add, edit, and delete shifts with toast notifications and inline conflict-free navigation.

**Patients** — Track admitted patients by department with expected discharge dates, days-remaining indicators, and status filters.

**Staff** — Browse all staff members, drill into individual profiles, and view their shifts in a list or month calendar view.

**Analytics** — Department-level pie charts for patients and staff, a sortable shift summary table with hours-limit highlighting (40h/week rule), and a consecutive-days column to flag overworked staff.

**Ask Pulse** — AI assistant drawer (Step 2, coming soon) for natural language queries about staffing coverage, rotation fairness, and demand forecasting.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite |
| Styling | Tailwind CSS v4, shadcn/ui |
| Data fetching | TanStack Query v5 |
| Routing | React Router v7 |
| Charts | Recharts |
| Backend | Node.js, Express |
| ORM | Prisma v7 |
| Database | SQLite (via better-sqlite3) |
| AI (Step 2) | Mastra agent framework |

## Getting started

```bash
npm install

# Set up the database
npx prisma migrate deploy
npx prisma generate
npx prisma db seed

# Start dev server
npm run dev
```

App runs at `http://localhost:5173`. The API server runs alongside on port 3001.

## Project structure

```
src/
  pulse/          # Hospital OS feature
    components/   # Shared UI components (CalendarGrid, ShiftDialog, etc.)
    hooks/        # TanStack Query hooks
    lib/          # Calendar utilities
    pages/        # Route-level pages
  web/            # App entry point and global styles
  api/            # Express API routes
prisma/
  schema.prisma   # Data model
  seed.ts         # Demo seed data
```

## Demo notes

This is a demo project — authentication, multi-tenancy, and real-time sync are not implemented. Scheduling rule violations show warnings only (no hard blocks). The AI assistant (Ask Pulse) is a placeholder pending Step 2 integration.
