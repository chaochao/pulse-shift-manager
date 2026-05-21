ALTER TABLE "SchedulingRule" ADD COLUMN "dayShiftStartHour" INTEGER NOT NULL DEFAULT 8;
ALTER TABLE "SchedulingRule" ADD COLUMN "nightShiftStartHour" INTEGER NOT NULL DEFAULT 20;
ALTER TABLE "SchedulingRule" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'America/Los_Angeles';
