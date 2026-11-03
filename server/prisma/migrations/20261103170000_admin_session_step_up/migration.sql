-- Additive, nullable: existing sessions preserve createdAt-based recent authentication until reverified.
-- This timestamp must not change createdAt, expiresAt or lastInteractionAt.
ALTER TABLE "access_sessions" ADD COLUMN "lastAuthenticatedAt" TIMESTAMP(3);
