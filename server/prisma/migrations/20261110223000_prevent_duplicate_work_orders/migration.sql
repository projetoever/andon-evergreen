-- Optional global protection against reusing operator-entered OS numbers.
-- Existing calls remain unchanged; policy defaults OFF until Admin enables it.
ALTER TABLE "system_settings"
  ADD COLUMN "preventDuplicateWorkOrderNumbers" BOOLEAN NOT NULL DEFAULT FALSE;
