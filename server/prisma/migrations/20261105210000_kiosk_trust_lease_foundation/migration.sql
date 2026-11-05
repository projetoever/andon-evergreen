-- R10-04 / R9-05/06: additive, dormant kiosk trust lease.
-- Never stores raw credentials or modifies existing workstations/sessions.
-- Table starts empty. No HTTP route or feature flag is enabled by this migration.
CREATE TABLE "kiosk_trust_leases" (
    "id" TEXT NOT NULL,
    "workstationId" TEXT NOT NULL,
    "kioskUserId" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "approvedByUserId" TEXT,
    "approvalReason" TEXT,
    "approvedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "lastRenewedAt" TIMESTAMP(3),
    "authorizationVersion" INTEGER NOT NULL DEFAULT 1,
    "credentialVersion" INTEGER NOT NULL DEFAULT 1,
    "devicePublicKeySpki" TEXT,
    "refreshTokenHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "kiosk_trust_leases_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "kiosk_trust_status_check" CHECK ("status" IN ('pending', 'active', 'revoked')),
    CONSTRAINT "kiosk_trust_version_check" CHECK ("authorizationVersion" > 0 AND "credentialVersion" > 0),
    CONSTRAINT "kiosk_trust_approval_check" CHECK (
        "status" <> 'active' OR (
            "approvedByUserId" IS NOT NULL
            AND "approvedAt" IS NOT NULL
            AND "approvalReason" IS NOT NULL
            AND length(btrim("approvalReason")) BETWEEN 4 AND 500
            AND "devicePublicKeySpki" IS NOT NULL
            AND length("devicePublicKeySpki") BETWEEN 100 AND 8192
            AND "refreshTokenHash" IS NOT NULL
            AND "expiresAt" IS NOT NULL
            AND "expiresAt" > "approvedAt"
            AND "revokedAt" IS NULL
        )
    ),
    CONSTRAINT "kiosk_trust_revoked_check" CHECK (
        "status" <> 'revoked' OR "revokedAt" IS NOT NULL
    ),
    CONSTRAINT "kiosk_trust_pending_check" CHECK (
        "status" <> 'pending' OR (
            "approvedByUserId" IS NULL AND "approvedAt" IS NULL
            AND "revokedAt" IS NULL AND "refreshTokenHash" IS NULL
        )
    ),
    CONSTRAINT "kiosk_trust_token_hash_check" CHECK (
        "refreshTokenHash" IS NULL OR "refreshTokenHash" ~ '^[0-9a-f]{64}$'
    )
);

CREATE UNIQUE INDEX "kiosk_trust_leases_workstationId_key" ON "kiosk_trust_leases"("workstationId");
CREATE UNIQUE INDEX "kiosk_trust_leases_kioskUserId_key" ON "kiosk_trust_leases"("kioskUserId");
CREATE UNIQUE INDEX "kiosk_trust_leases_refreshTokenHash_key" ON "kiosk_trust_leases"("refreshTokenHash");
CREATE INDEX "kiosk_trust_leases_machineId_status_idx" ON "kiosk_trust_leases"("machineId", "status");
CREATE INDEX "kiosk_trust_leases_approvedByUserId_approvedAt_idx" ON "kiosk_trust_leases"("approvedByUserId", "approvedAt");
CREATE INDEX "kiosk_trust_leases_status_expiresAt_idx" ON "kiosk_trust_leases"("status", "expiresAt");

ALTER TABLE "kiosk_trust_leases" ADD CONSTRAINT "kiosk_trust_leases_workstationId_fkey"
  FOREIGN KEY ("workstationId") REFERENCES "workstations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "kiosk_trust_leases" ADD CONSTRAINT "kiosk_trust_leases_kioskUserId_fkey"
  FOREIGN KEY ("kioskUserId") REFERENCES "access_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "kiosk_trust_leases" ADD CONSTRAINT "kiosk_trust_leases_machineId_fkey"
  FOREIGN KEY ("machineId") REFERENCES "machines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "kiosk_trust_leases" ADD CONSTRAINT "kiosk_trust_leases_approvedByUserId_fkey"
  FOREIGN KEY ("approvedByUserId") REFERENCES "access_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
