-- CreateTable
CREATE TABLE "ShiftProposal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "optimizeFor" TEXT NOT NULL,
    "assignments" TEXT NOT NULL,
    "scores" TEXT NOT NULL,
    "warnings" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SchedulingRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "minRestHoursBetweenShifts" INTEGER NOT NULL DEFAULT 12,
    "maxNightShiftsPerMonth" INTEGER NOT NULL DEFAULT 8,
    "maxShiftsPerWeek" INTEGER NOT NULL DEFAULT 5,
    "maxHoursPerWeek" INTEGER NOT NULL DEFAULT 60,
    "overtimeCeilingPct" INTEGER NOT NULL DEFAULT 10,
    "nightLoadBufferPct" INTEGER NOT NULL DEFAULT 80,
    "minRestAfterStretchHours" INTEGER NOT NULL DEFAULT 48
);
INSERT INTO "new_SchedulingRule" ("id", "maxHoursPerWeek", "maxNightShiftsPerMonth", "maxShiftsPerWeek", "minRestHoursBetweenShifts") SELECT "id", "maxHoursPerWeek", "maxNightShiftsPerMonth", "maxShiftsPerWeek", "minRestHoursBetweenShifts" FROM "SchedulingRule";
DROP TABLE "SchedulingRule";
ALTER TABLE "new_SchedulingRule" RENAME TO "SchedulingRule";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
