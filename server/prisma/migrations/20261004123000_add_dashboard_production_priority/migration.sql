ALTER TABLE "system_settings"
ADD COLUMN "dashboardMachineOrderMode" TEXT NOT NULL DEFAULT 'default';

ALTER TABLE "machines"
ADD COLUMN "priorityOrder" INTEGER;

CREATE TABLE "dashboard_priority_config" (
  "id" TEXT NOT NULL DEFAULT 'global',
  "managerUsername" TEXT,
  "managerPasswordHash" TEXT,
  "lastOrderUpdatedAt" TIMESTAMP(3),
  "lastOrderUpdatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "dashboard_priority_config_pkey" PRIMARY KEY ("id")
);
