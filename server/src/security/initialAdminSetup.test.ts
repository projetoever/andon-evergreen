import assert from "node:assert/strict";
import test from "node:test";
import type { FastifyRequest } from "fastify";
import {
  isLocalInitialAdminRequest,
  issueInitialAdminSetupToken,
} from "./initialAdminSetup.js";

function request(ip: string, host: string, origin: string) {
  return {
    ip, id: "unit-request",
    headers: { host, origin },
    raw: { socket: { encrypted: false } },
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
