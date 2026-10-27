CREATE TABLE "industrial_service_identities" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "scopes" TEXT[] NOT NULL,
    "secretHash" TEXT NOT NULL,
    "secretVersion" INTEGER NOT NULL DEFAULT 1,
    "secretExpiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "industrial_service_identities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "industrial_service_sessions" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "secretVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "industrial_service_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "industrial_service_identities_name_key"
ON "industrial_service_identities"("name");

CREATE INDEX "industrial_service_identities_active_secretExpiresAt_idx"
ON "industrial_service_identities"("active", "secretExpiresAt");

CREATE UNIQUE INDEX "industrial_service_sessions_tokenHash_key"
ON "industrial_service_sessions"("tokenHash");

CREATE INDEX "industrial_service_sessions_serviceId_revokedAt_idx"
ON "industrial_service_sessions"("serviceId", "revokedAt");

CREATE INDEX "industrial_service_sessions_expiresAt_idx"
ON "industrial_service_sessions"("expiresAt");

ALTER TABLE "industrial_service_sessions"
ADD CONSTRAINT "industrial_service_sessions_serviceId_fkey"
FOREIGN KEY ("serviceId") REFERENCES "industrial_service_identities"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
