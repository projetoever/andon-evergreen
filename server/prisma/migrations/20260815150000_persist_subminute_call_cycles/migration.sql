-- Preserve sub-minute attendance and follow-up cycles instead of rounding them to zero.
ALTER TABLE "andon_calls"
  ALTER COLUMN "attendanceMinutes" TYPE DOUBLE PRECISION
    USING "attendanceMinutes"::DOUBLE PRECISION,
  ALTER COLUMN "postMaintenanceMinutes" TYPE DOUBLE PRECISION
    USING "postMaintenanceMinutes"::DOUBLE PRECISION;
