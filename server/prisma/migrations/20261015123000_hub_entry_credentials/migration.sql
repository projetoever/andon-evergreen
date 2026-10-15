-- Existing access remains unchanged until an administrator configures a module password.
ALTER TABLE "workstations" ADD COLUMN "allowPriorities" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "dashboard_priority_config" ADD COLUMN "passwordRequired" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "module_credentials" (
  "id" TEXT NOT NULL,
  "username" TEXT,
  "passwordHash" TEXT,
  "passwordRequired" BOOLEAN NOT NULL DEFAULT false,
  "credentialVersion" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "module_credentials_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "module_credentials_id_check" CHECK ("id" IN ('operational', 'bi'))
);
