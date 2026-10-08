import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("autenticação administrativa usa credencial global no servidor", async () => {
  const [service, route, schema] = await Promise.all([
    readFile(new URL("../src/services/adminAuthService.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/src/routes/adminAuth.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/prisma/schema.prisma", import.meta.url), "utf8"),
  ]);

  assert.match(service, /\/api\/admin-auth\/login/);
  assert.match(service, /\/api\/admin-auth\/password/);
  assert.match(route, /prisma\.systemSettings/);
  assert.match(route, /adminPasswordHash/);
  assert.match(route, /hashCredential/);
  assert.match(route, /verifyCredential/);
  assert.match(schema, /adminPasswordHash\s+String\?/);
});

test("recuperação administrativa usa código separado, hash e invalidação após uso", async () => {
  const [service, route, schema, loginModal] = await Promise.all([
    readFile(new URL("../src/services/adminAuthService.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/src/routes/adminAuth.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/prisma/schema.prisma", import.meta.url), "utf8"),
    readFile(new URL("../src/components/settings/AdminLoginModal.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(service, /\/api\/admin-auth\/recovery-code/);
  assert.match(service, /\/api\/admin-auth\/recover/);
  assert.match(route, /adminRecoveryCodeHash/);
  assert.match(route, /adminRecoveryCodeIssuedAt/);
  assert.match(route, /adminRecoveryCodeHash: null/);
  assert.match(schema, /adminRecoveryCodeHash\s+String\?/);
  assert.match(loginModal, /Esqueci a senha/);
  assert.match(loginModal, /Redefinir senha/);
});

test("credencial de prioridades permanece centralizada no PostgreSQL", async () => {
  const [service, route, schema] = await Promise.all([
    readFile(new URL("../src/services/dashboardPriorityService.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/src/routes/dashboardPriority.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/prisma/schema.prisma", import.meta.url), "utf8"),
  ]);

  assert.match(service, /\/api\/dashboard-priority\/credentials/);
  assert.match(service, /\/api\/dashboard-priority\/access-status/);
  assert.match(service, /não confirmou a persistência das credenciais de prioridades/);
  assert.match(route, /prisma\.dashboardPriorityConfig\.upsert/);
  assert.match(route, /managerPasswordHash/);
  assert.match(schema, /model DashboardPriorityConfig/);
  assert.match(schema, /managerPasswordHash\s+String\?/);
});
