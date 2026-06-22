-- CreateTable
CREATE TABLE "machine_production_events" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "productionMode" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "machine_production_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "machine_production_events_machineId_idx" ON "machine_production_events"("machineId");

-- CreateIndex
CREATE INDEX "machine_production_events_startedAt_idx" ON "machine_production_events"("startedAt");

-- AddForeignKey
ALTER TABLE "machine_production_events" ADD CONSTRAINT "machine_production_events_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "machines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
