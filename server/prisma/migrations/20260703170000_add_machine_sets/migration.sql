CREATE TABLE IF NOT EXISTS "machine_sets" (
  "id" TEXT NOT NULL,
  "machineId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "displayOrder" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "machine_sets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "machine_sets_machineId_code_key" ON "machine_sets"("machineId", "code");
CREATE INDEX IF NOT EXISTS "machine_sets_machineId_idx" ON "machine_sets"("machineId");
CREATE INDEX IF NOT EXISTS "machine_sets_type_idx" ON "machine_sets"("type");

ALTER TABLE "machine_sets"
ADD CONSTRAINT "machine_sets_machineId_fkey"
FOREIGN KEY ("machineId") REFERENCES "machines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "andon_calls" ADD COLUMN IF NOT EXISTS "machineSetId" TEXT;
ALTER TABLE "andon_calls" ADD COLUMN IF NOT EXISTS "machineSetCodeSnapshot" TEXT;
ALTER TABLE "andon_calls" ADD COLUMN IF NOT EXISTS "machineSetNameSnapshot" TEXT;
ALTER TABLE "andon_calls" ADD COLUMN IF NOT EXISTS "machineSetTypeSnapshot" TEXT;

CREATE INDEX IF NOT EXISTS "andon_calls_machineSetId_idx" ON "andon_calls"("machineSetId");

ALTER TABLE "andon_calls"
ADD CONSTRAINT "andon_calls_machineSetId_fkey"
FOREIGN KEY ("machineSetId") REFERENCES "machine_sets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
