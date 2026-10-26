-- CreateTable
CREATE TABLE "access_users" (
    "id" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "roleLabel" TEXT NOT NULL,
    "accountType" TEXT NOT NULL DEFAULT 'person',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isPrimaryAdmin" BOOLEAN NOT NULL DEFAULT false,
    "machineScope" TEXT NOT NULL DEFAULT 'selected',
    "passwordHash" TEXT NOT NULL,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "temporaryExpiresAt" TIMESTAMP(3),
    "temporaryConsumedAt" TIMESTAMP(3),
    "authorizationVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "access_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_permissions" (
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,

    CONSTRAINT "access_permissions_pkey" PRIMARY KEY ("userId","key")
);

-- CreateTable
CREATE TABLE "access_machines" (
    "userId" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,

    CONSTRAINT "access_machines_pkey" PRIMARY KEY ("userId","machineId")
);

-- CreateTable
CREATE TABLE "access_sessions" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workstationId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "authorizationVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastInteractionAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "access_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorType" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorLogin" TEXT,
    "actorName" TEXT,
    "actorRole" TEXT,
    "workstationId" TEXT,
    "sessionId" TEXT,
    "ipAddress" VARCHAR(45),
    "requestId" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "machineId" TEXT,
    "result" TEXT NOT NULL,
    "reason" TEXT,
    "before" JSONB,
    "after" JSONB,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "access_users_login_key" ON "access_users"("login");

-- CreateIndex
CREATE INDEX "access_machines_machineId_idx" ON "access_machines"("machineId");

-- CreateIndex
CREATE UNIQUE INDEX "access_sessions_tokenHash_key" ON "access_sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "access_sessions_userId_revokedAt_idx" ON "access_sessions"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "access_sessions_workstationId_revokedAt_idx" ON "access_sessions"("workstationId", "revokedAt");

-- CreateIndex
CREATE INDEX "access_sessions_expiresAt_idx" ON "access_sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "audit_events_occurredAt_id_idx" ON "audit_events"("occurredAt", "id");

-- CreateIndex
CREATE INDEX "audit_events_actorUserId_occurredAt_idx" ON "audit_events"("actorUserId", "occurredAt");

-- CreateIndex
CREATE INDEX "audit_events_resourceType_resourceId_occurredAt_idx" ON "audit_events"("resourceType", "resourceId", "occurredAt");

-- CreateIndex
CREATE INDEX "audit_events_machineId_occurredAt_idx" ON "audit_events"("machineId", "occurredAt");

-- AddForeignKey
ALTER TABLE "access_permissions" ADD CONSTRAINT "access_permissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "access_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_machines" ADD CONSTRAINT "access_machines_userId_fkey" FOREIGN KEY ("userId") REFERENCES "access_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_machines" ADD CONSTRAINT "access_machines_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "machines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_sessions" ADD CONSTRAINT "access_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "access_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_sessions" ADD CONSTRAINT "access_sessions_workstationId_fkey" FOREIGN KEY ("workstationId") REFERENCES "workstations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Product invariants, including writes made outside the application.
ALTER TABLE "access_users" ADD CONSTRAINT "access_user_login_normalized"
  CHECK ("login" = lower(btrim("login")) AND length("login") BETWEEN 3 AND 120);
ALTER TABLE "access_users" ADD CONSTRAINT "access_user_account_type"
  CHECK ("accountType" IN ('person', 'kiosk'));
ALTER TABLE "access_users" ADD CONSTRAINT "access_user_machine_scope"
  CHECK ("machineScope" IN ('all', 'selected'));
ALTER TABLE "access_users" ADD CONSTRAINT "access_user_version_positive"
  CHECK ("authorizationVersion" > 0);
ALTER TABLE "access_users" ADD CONSTRAINT "access_primary_admin_person"
  CHECK (NOT "isPrimaryAdmin" OR ("accountType" = 'person' AND "active"));
CREATE UNIQUE INDEX "access_single_primary_admin" ON "access_users" ("isPrimaryAdmin") WHERE "isPrimaryAdmin";
ALTER TABLE "access_sessions" ADD CONSTRAINT "access_session_purpose"
  CHECK ("purpose" IN ('normal', 'password_change'));
ALTER TABLE "access_sessions" ADD CONSTRAINT "access_session_chronology"
  CHECK ("expiresAt" > "createdAt" AND "lastInteractionAt" >= "createdAt");
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_result"
  CHECK ("result" IN ('success', 'denied', 'failure'));

-- Append-only through ordinary SQL. A database owner can disable this trigger;
-- external protected copies remain necessary for protection against that actor.
CREATE FUNCTION andon_reject_audit_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Audit events are append-only';
END;
$$;
CREATE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE OR TRUNCATE
  ON "audit_events" FOR EACH STATEMENT EXECUTE FUNCTION andon_reject_audit_change();
