-- Add configurable paper work-order capture without changing legacy calls.
ALTER TABLE "andon_calls" ADD COLUMN "workOrderNumber" TEXT;
ALTER TABLE "system_settings" ADD COLUMN "requireWorkOrderAtOpen" BOOLEAN NOT NULL DEFAULT false;
