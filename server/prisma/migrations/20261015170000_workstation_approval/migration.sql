ALTER TABLE "system_settings" ADD COLUMN "requireWorkstationApproval" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "workstations" ADD COLUMN "pendingApproval" BOOLEAN NOT NULL DEFAULT false;
