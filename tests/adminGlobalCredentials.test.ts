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


test("rotas públicas de configurações nunca expõem hashes administrativos", async () => {
  const [service, route] = await Promise.all([
    readFile(new URL("../server/src/services/systemSettings.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/src/routes/systemSettings.ts", import.meta.url), "utf8"),
  ]);

  assert.match(service, /PUBLIC_SYSTEM_SETTINGS_SELECT/);
  assert.doesNotMatch(service, /adminPasswordHash:\s*true/);
  assert.doesNotMatch(service, /adminRecoveryCodeHash:\s*true/);
  assert.match(route, /return getSystemSettings\(\)/);
});


test("sessão Admin usa bearer do servidor e é anexada pelo cliente API", async () => {
  const [authService, sessionStorage, apiClient, server, authorization] = await Promise.all([
    readFile(new URL("../src/services/adminAuthService.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/services/adminSessionStorage.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/api/andonApiClient.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/src/server.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/src/security/adminAuthorization.ts", import.meta.url), "utf8"),
  ]);

  assert.match(authService, /writeAdminSession/);
  assert.match(authService, /\/api\/admin-auth\/logout/);
  assert.match(sessionStorage, /expiresAt/);
  assert.match(sessionStorage, /Bearer \$\{session\.token\}/);
  assert.match(apiClient, /getAdminAuthorizationHeader/);
  assert.match(apiClient, /Authorization: adminAuthorization/);
  assert.match(server, /enforceAdminAuthorization/);
  assert.match(server, /addHook\("preHandler", enforceAdminAuthorization\)/);
  assert.match(authorization, /isAdminProtectedMutation/);
  assert.match(authorization, /Sessão administrativa necessária/);
});
