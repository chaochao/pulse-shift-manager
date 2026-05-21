CREATE TABLE "HospitalSettings" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL DEFAULT 'Hospital',
  "timezone" TEXT NOT NULL DEFAULT 'America/Los_Angeles',
  "dayShiftStartHour" INTEGER NOT NULL DEFAULT 8,
  "nightShiftStartHour" INTEGER NOT NULL DEFAULT 20
);

ALTER TABLE "SchedulingRule" DROP COLUMN "dayShiftStartHour";
ALTER TABLE "SchedulingRule" DROP COLUMN "nightShiftStartHour";
ALTER TABLE "SchedulingRule" DROP COLUMN "timezone";
