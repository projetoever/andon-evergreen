import assert from "node:assert/strict";
import test from "node:test";
import { INDUSTRIAL_SERVICE_SCOPES, readIndustrialServiceBearer } from "./industrialServices.js";

test("service credentials use a dedicated bearer namespace", () => {
  const token = `andon-service-v1.${"a".repeat(43)}`;
  assert.equal(readIndustrialServiceBearer(`Bearer ${token}`), token);
  assert.equal(readIndustrialServiceBearer("Bearer andon-service-v1.short"), "");
  assert.equal(readIndustrialServiceBearer(`Bearer ${"a".repeat(64)}`), null);
  assert.equal(readIndustrialServiceBearer(undefined), null);
});

test("initial industrial scopes are read-only and explicit", () => {
  assert.deepEqual(INDUSTRIAL_SERVICE_SCOPES, ["machines.read", "calls.read", "sound.read"]);
  assert.equal(
    INDUSTRIAL_SERVICE_SCOPES.some((scope) => scope.includes("write")),
    false,
  );
  assert.equal(
    INDUSTRIAL_SERVICE_SCOPES.some((scope) => scope.includes("admin")),
    false,
  );
});
