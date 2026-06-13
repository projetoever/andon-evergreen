-- CreateTable
CREATE TABLE "machines" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "machineStatus" TEXT NOT NULL DEFAULT 'running',
    "andonStatus" TEXT NOT NULL DEFAULT 'normal',
    "productionMode" TEXT NOT NULL DEFAULT 'production',
    "currentCallId" TEXT,
    "lastStatusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "machines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "andon_calls" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subtype" TEXT,
    "status" TEXT NOT NULL,
    "criticality" TEXT NOT NULL,
    "machineCondition" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "attendedAt" TIMESTAMP(3),
    "currentAttendanceStartedAt" TIMESTAMP(3),
    "maintenanceCompletedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "technicianName" TEXT,
    "technicianNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "technicianArea" TEXT,
    "callWaitingMinutes" INTEGER,
    "attendanceMinutes" INTEGER,
    "postMaintenanceMinutes" INTEGER,
    "totalCallMinutes" INTEGER,
    "machineStoppedMinutes" INTEGER,
    "maintenanceReturnCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdBy" TEXT,
    "productionModeAtOpen" TEXT,
    "productionModeAtAttend" TEXT,
    "productionModeAtFinish" TEXT,
    "machineStatusAtOpen" TEXT,
    "machineStatusAtAttend" TEXT,
    "machineStatusAtFinish" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "andon_calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "technician_sessions" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "technicianId" TEXT,
    "technicianName" TEXT NOT NULL,
    "technicalArea" TEXT,
    "shiftId" TEXT,
    "shiftName" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "endReason" TEXT,
    "notes" TEXT,
    "productionModeAtStart" TEXT,
    "machineStatusAtStart" TEXT,
    "productionModeAtEnd" TEXT,
    "machineStatusAtEnd" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "technician_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "technician_time_allocations" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "technicianName" TEXT NOT NULL,
    "technicianId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "totalSeconds" INTEGER,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "technician_time_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "failure_events" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "callId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "classification" TEXT,
    "source" TEXT NOT NULL,
    "productionMode" TEXT,
    "machineStatus" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "failure_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "technicians" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "technicalArea" TEXT,
    "shiftId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "technicians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "failure_classifications" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "failure_classifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kiosk_devices" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ipAddress" TEXT,
    "location" TEXT,
    "defaultMachineId" TEXT,
    "lastHeartbeat" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kiosk_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "machines_currentCallId_key" ON "machines"("currentCallId");

-- CreateIndex
CREATE INDEX "andon_calls_machineId_idx" ON "andon_calls"("machineId");

-- CreateIndex
CREATE INDEX "andon_calls_status_idx" ON "andon_calls"("status");

-- CreateIndex
CREATE INDEX "andon_calls_openedAt_idx" ON "andon_calls"("openedAt");

-- CreateIndex
CREATE INDEX "technician_sessions_callId_idx" ON "technician_sessions"("callId");

-- CreateIndex
CREATE INDEX "technician_sessions_machineId_idx" ON "technician_sessions"("machineId");

-- CreateIndex
CREATE INDEX "technician_sessions_technicianId_idx" ON "technician_sessions"("technicianId");

-- CreateIndex
CREATE INDEX "technician_time_allocations_callId_idx" ON "technician_time_allocations"("callId");

-- CreateIndex
CREATE INDEX "technician_time_allocations_technicianId_idx" ON "technician_time_allocations"("technicianId");

-- CreateIndex
CREATE INDEX "failure_events_machineId_idx" ON "failure_events"("machineId");

-- CreateIndex
CREATE INDEX "failure_events_callId_idx" ON "failure_events"("callId");

-- CreateIndex
CREATE INDEX "failure_events_startedAt_idx" ON "failure_events"("startedAt");

-- CreateIndex
CREATE INDEX "technicians_shiftId_idx" ON "technicians"("shiftId");

-- CreateIndex
CREATE UNIQUE INDEX "failure_classifications_value_key" ON "failure_classifications"("value");

-- CreateIndex
CREATE INDEX "kiosk_devices_defaultMachineId_idx" ON "kiosk_devices"("defaultMachineId");

-- AddForeignKey
ALTER TABLE "machines" ADD CONSTRAINT "machines_currentCallId_fkey" FOREIGN KEY ("currentCallId") REFERENCES "andon_calls"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "andon_calls" ADD CONSTRAINT "andon_calls_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "machines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technician_sessions" ADD CONSTRAINT "technician_sessions_callId_fkey" FOREIGN KEY ("callId") REFERENCES "andon_calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technician_sessions" ADD CONSTRAINT "technician_sessions_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "machines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technician_sessions" ADD CONSTRAINT "technician_sessions_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "technicians"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technician_sessions" ADD CONSTRAINT "technician_sessions_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technician_time_allocations" ADD CONSTRAINT "technician_time_allocations_callId_fkey" FOREIGN KEY ("callId") REFERENCES "andon_calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technician_time_allocations" ADD CONSTRAINT "technician_time_allocations_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "technicians"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_events" ADD CONSTRAINT "failure_events_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "machines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_events" ADD CONSTRAINT "failure_events_callId_fkey" FOREIGN KEY ("callId") REFERENCES "andon_calls"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technicians" ADD CONSTRAINT "technicians_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kiosk_devices" ADD CONSTRAINT "kiosk_devices_defaultMachineId_fkey" FOREIGN KEY ("defaultMachineId") REFERENCES "machines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
