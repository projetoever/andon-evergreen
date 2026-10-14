-- Additive: existing workstations retain their access; Hub activation is explicit.
ALTER TABLE "workstations"
  ADD COLUMN "allowOperational" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "allowBi" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "system_settings"
  ADD COLUMN "hubEnabled" BOOLEAN NOT NULL DEFAULT false;
