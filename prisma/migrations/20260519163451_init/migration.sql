-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "minStaffDay" INTEGER NOT NULL DEFAULT 0,
    "minStaffEvening" INTEGER NOT NULL DEFAULT 0,
    "minStaffNight" INTEGER NOT NULL DEFAULT 0,
    "maxStaffDay" INTEGER NOT NULL DEFAULT 0,
    "maxStaffEvening" INTEGER NOT NULL DEFAULT 0,
    "maxStaffNight" INTEGER NOT NULL DEFAULT 0,
    "nursePatientRatio" REAL NOT NULL DEFAULT 4,
    "requiredCertifications" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Staff" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "employmentType" TEXT NOT NULL DEFAULT 'fullTime',
    "contractHoursPerWeek" INTEGER NOT NULL DEFAULT 36,
    "preferredShift" TEXT NOT NULL DEFAULT 'none',
    "certifications" TEXT NOT NULL DEFAULT '',
    "maxConsecutiveShifts" INTEGER NOT NULL DEFAULT 3,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Staff_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "staffId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "type" TEXT NOT NULL,
    "hours" INTEGER NOT NULL DEFAULT 12,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Shift_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Shift_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PatientCensus" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "departmentId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "shiftType" TEXT NOT NULL,
    "predictedCount" INTEGER NOT NULL DEFAULT 0,
    "actualCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PatientCensus_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TimeOffRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "staffId" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TimeOffRequest_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShiftSwap" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requesterId" TEXT NOT NULL,
    "targetId" TEXT,
    "shiftId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShiftSwap_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "Staff" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ShiftSwap_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ShiftSwap_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SickCall" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "staffId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "shiftType" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SickCall_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SchedulingRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "minRestHoursBetweenShifts" INTEGER NOT NULL DEFAULT 11,
    "maxNightShiftsPerMonth" INTEGER NOT NULL DEFAULT 8,
    "maxShiftsPerWeek" INTEGER NOT NULL DEFAULT 5,
    "maxHoursPerWeek" INTEGER NOT NULL DEFAULT 60
);

-- CreateIndex
CREATE UNIQUE INDEX "ShiftSwap_shiftId_key" ON "ShiftSwap"("shiftId");
