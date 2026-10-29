-- Additive customer identity for the Hub and executive BI reports.
-- Existing installations keep their operational settings and get safe defaults.
ALTER TABLE "system_settings"
  ADD COLUMN "clientName" VARCHAR(100) NOT NULL DEFAULT 'Evergreen',
  ADD COLUMN "clientUnit" VARCHAR(100) NOT NULL DEFAULT '';
