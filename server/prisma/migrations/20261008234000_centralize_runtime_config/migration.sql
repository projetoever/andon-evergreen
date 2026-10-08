ALTER TABLE "system_settings"
ADD COLUMN "filterTechniciansByCurrentShift" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "workstations"
ADD COLUMN "lockedMachineId" TEXT;

CREATE TABLE "workstation_machine_sound_preferences" (
  "workstationId" TEXT NOT NULL,
  "machineId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "workstation_machine_sound_preferences_pkey"
    PRIMARY KEY ("workstationId", "machineId"),
  CONSTRAINT "workstation_machine_sound_preferences_workstationId_fkey"
    FOREIGN KEY ("workstationId") REFERENCES "workstations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "workstation_machine_sound_preferences_machineId_fkey"
    FOREIGN KEY ("machineId") REFERENCES "machines"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "workstation_machine_sound_preferences_machineId_idx"
ON "workstation_machine_sound_preferences"("machineId");
