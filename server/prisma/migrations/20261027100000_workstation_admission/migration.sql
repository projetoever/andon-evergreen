CREATE TABLE "workstation_admissions" (
    "id" TEXT NOT NULL,
    "workstationId" TEXT NOT NULL,
    "requesterUserId" TEXT NOT NULL,
    "requestedName" TEXT,
    "requestReason" TEXT,
    "requestIpAddress" VARCHAR(45),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedByUserId" TEXT,
    "decisionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workstation_admissions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "workstation_admissions_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected'))
);

CREATE UNIQUE INDEX "workstation_admissions_workstationId_key"
ON "workstation_admissions"("workstationId");

CREATE INDEX "workstation_admissions_status_requestedAt_idx"
ON "workstation_admissions"("status", "requestedAt");

CREATE INDEX "workstation_admissions_requesterUserId_requestedAt_idx"
ON "workstation_admissions"("requesterUserId", "requestedAt");

CREATE INDEX "workstation_admissions_decidedByUserId_decidedAt_idx"
ON "workstation_admissions"("decidedByUserId", "decidedAt");

ALTER TABLE "workstation_admissions"
ADD CONSTRAINT "workstation_admissions_workstationId_fkey"
FOREIGN KEY ("workstationId") REFERENCES "workstations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "workstation_admissions"
ADD CONSTRAINT "workstation_admissions_requesterUserId_fkey"
FOREIGN KEY ("requesterUserId") REFERENCES "access_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "workstation_admissions"
ADD CONSTRAINT "workstation_admissions_decidedByUserId_fkey"
FOREIGN KEY ("decidedByUserId") REFERENCES "access_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
