ALTER TABLE "system_settings"
ADD COLUMN "restrictMaintenanceCompletionToAttendanceWorkstation" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "technician_sessions"
ADD COLUMN "workstationId" TEXT;

CREATE INDEX "technician_sessions_workstationId_idx"
ON "technician_sessions"("workstationId");

ALTER TABLE "technician_sessions"
ADD CONSTRAINT "technician_sessions_workstationId_fkey"
FOREIGN KEY ("workstationId") REFERENCES "workstations"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
