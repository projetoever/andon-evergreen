ALTER TABLE "workstations" ADD COLUMN "lastIpAddress" VARCHAR(45);

CREATE TABLE "failure_diagnosis_audit" (
  "id" TEXT NOT NULL,
  "callId" TEXT,
  "failureEventId" TEXT,
  "machineId" TEXT NOT NULL,
  "technicianId" TEXT NOT NULL,
  "technicianName" TEXT NOT NULL,
  "workstationId" TEXT,
  "ipAddress" VARCHAR(45),
  "previousClassification" TEXT,
  "newClassification" TEXT,
  "previousDescription" TEXT,
  "newDescription" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "failure_diagnosis_audit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "failure_diagnosis_audit_callId_createdAt_idx" ON "failure_diagnosis_audit"("callId", "createdAt");
CREATE INDEX "failure_diagnosis_audit_failureEventId_createdAt_idx" ON "failure_diagnosis_audit"("failureEventId", "createdAt");
CREATE INDEX "failure_diagnosis_audit_machineId_createdAt_idx" ON "failure_diagnosis_audit"("machineId", "createdAt");
