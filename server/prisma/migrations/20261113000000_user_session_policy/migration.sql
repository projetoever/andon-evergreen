-- SEC-18: every existing account remains on the standard 30min/12h policy.
-- Explicit Admin opt-in is required to enable durable operational sessions.
ALTER TABLE "access_users" ADD COLUMN "sessionPolicy" TEXT NOT NULL DEFAULT 'standard';
