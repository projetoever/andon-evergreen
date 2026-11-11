-- R15: opt-in trusted operational workstation (OFF by default).
-- Only non-admin, least-privilege accounts can obtain persistent sessions.
-- Revocation and workstation binding remain enforced for every request.
ALTER TABLE "workstations" ADD COLUMN "allowPersistentOperationalLogin" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "access_sessions" ADD COLUMN "persistentOperational" BOOLEAN NOT NULL DEFAULT FALSE;
