import assert from "node:assert/strict";
import test from "node:test";
import type { FastifyRequest } from "fastify";
import { isBlockedBeforeAdminSetup } from "./initialAdminSetupGuard.js";
import {
  isLocalInitialAdminRequest,
  issueInitialAdminSetupToken,
} from "./initialAdminSetup.js";

function request(ip: string, host: string, origin: string) {
  return {
    ip, id: "unit-request",
    headers: { host, origin },
    raw: { socket: { encrypted: false, remoteAddress: ip } },
  } as unknown as FastifyRequest;
}

test("fresh install setup token is issued only to same-machine localhost browsers", () => {
  const saved = process.env.CORS_ORIGINS;
  try {
    process.env.CORS_ORIGINS = "http://192.0.2.40:8080,http://localhost:8080";
    const local = request("127.0.0.1", "localhost:3001", "http://localhost:8080");
    assert.equal(isLocalInitialAdminRequest(local), true);
    assert.match(issueInitialAdminSetupToken(local) ?? "", /^[a-f0-9]{64}$/);
    for (const bad of [
      request("192.0.2.55", "localhost:3001", "http://localhost:8080"),
      request("127.0.0.1", "192.0.2.40:3001", "http://localhost:8080"),
      request("127.0.0.1", "localhost:3001", "http://evil.test:8080"),
      request("127.0.0.1", "localhost:3001", "http://192.0.2.40:8080"),
      request("127.0.0.1", "localhost:3001", "http://localhost:9999"),
    ]) {
      assert.equal(isLocalInitialAdminRequest(bad), false);
      assert.equal(issueInitialAdminSetupToken(bad), null);
    }
  } finally {
    if (saved === undefined) delete process.env.CORS_ORIGINS;
    else process.env.CORS_ORIGINS = saved;
  }
});

test("fresh install blocks reads, writes, login, recovery and direct API access by default", () => {
  for (const [method, path] of [
    ["GET", "/api/machines"],
    ["HEAD", "/api/machines"],
    ["GET", "/api/andon-calls"],
    ["GET", "/api/analytics/overview"],
    ["GET", "/api/modules/access"],
    ["GET", "/api/workstations"],
    ["GET", "/api/access/session"],
    ["GET", "/api/admin-auth/workstation-attendance-diagnostic"],
    ["POST", "/api/admin-auth/login"],
    ["POST", "/api/admin-auth/recover"],
    ["POST", "/api/andon-calls"],
    ["PATCH", "/api/system-settings"],
    ["POST", "/api/access/initialize"],
    ["POST", "/api/workstations/register"],
    ["POST", "/api/technicians/identify"],
    ["PUT", "/api/modules/settings"],
    ["DELETE", "/api/machines/1"],
  ]) {
    assert.equal(isBlockedBeforeAdminSetup(method, path), true, `${method} ${path}`);
  }
});

test("fresh install permits only its bootstrap endpoints, CORS preflight and health", () => {
  for (const [method, path] of [
    ["GET", "/api/admin-auth/status"],
    ["POST", "/api/admin-auth/initialize"],
    ["OPTIONS", "/api/andon-calls"],
    ["GET", "/health"],
    ["GET", "/health/ready"],
    ["GET", "/health/db"],
  ]) {
    assert.equal(isBlockedBeforeAdminSetup(method, path), false, `${method} ${path}`);
  }
  for (const [method, path] of [
    ["POST", "/api/admin-auth/status"],
    ["GET", "/api/admin-auth/initialize"],
    ["HEAD", "/api/admin-auth/status"],
    ["POST", "/api/admin-auth/initialize/"],
    ["GET", "/api/admin-auth/status/"],
  ]) {
    assert.equal(isBlockedBeforeAdminSetup(method, path), true, `${method} ${path}`);
  }
});
