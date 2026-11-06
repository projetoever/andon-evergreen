import assert from "node:assert/strict";
import test from "node:test";
import { ApiAndonRepository } from "../src/repositories/apiAndonRepository";
import { AndonApiError, type AndonApiClient } from "../src/api/andonApiClient";
import type { AndonCall } from "../src/types/andon";

// R10-01 isolated frontend contract: no network/database and no credentials.
// API PATCH is authoritative; the later GET is only a refresh.
const original = {
  id: "legacy-pre-update",
  machineId: "37",
  openedAt: "2026-10-20T12:00:00.000Z",
  status: "open",
  category: "maintenance",
  subtype: "mechanical",
  createdBy: "kiosk",
  origin: "kiosk",
} as AndonCall;
const other = { ...original, id: "other-call", createdBy: "new-operator" };
const confirmed = {
  ...original,
  status: "cancelled",
  finishedAt: "2026-11-05T17:00:00.000Z",
  cancelReason: "Cancelled in isolated test",
} as AndonCall;

class FakeApiClient implements AndonApiClient {
  readonly seen: string[] = [];
  patchResult: unknown = confirmed;
  patchError: Error | null = null;
  refreshError: Error | null = new Error("GET /health unavailable");
  async request<T>(): Promise<T> { throw new Error("unused request"); }
  async get<T>(path: string): Promise<T> {
    this.seen.push(`GET ${path}`);
    if (this.refreshError) throw this.refreshError;
    if (path === "/health") {
      return { status: "ok", service: "andon", timestamp: "2026-11-05T17:00:00.000Z" } as T;
    }
    if (path === "/api/machines?includeInactive=true" || path === "/api/failure-events?limit=500") return [] as T;
    if (path === "/api/andon-calls") return [confirmed] as T;
    throw new Error(`unexpected GET ${path}`);
  }
  async patch<T>(path: string, body: unknown): Promise<T> {
    this.seen.push(`PATCH ${path}`);
    assert.deepEqual((body as { reason: string }).reason, "test cancellation");
    if (this.patchError) throw this.patchError;
    return this.patchResult as T;
  }
  async post<T>(): Promise<T> { throw new Error("unused post"); }
  async delete<T>(): Promise<T> { throw new Error("unused delete"); }
}

test("R10-01: acknowledged PATCH + failed GET does not produce false cancellation error", async () => {
  const client = new FakeApiClient();
  const repository = new ApiAndonRepository(client);
  const machines = [] as Parameters<typeof repository.cancelCall>[0];
  const result = await repository.cancelCall(machines, [original, other], {
    callId: original.id, reason: "test cancellation", cancelledBy: "operador",
  });
  assert.equal(result.machines, machines, "never fabricate physical machine state");
  assert.deepEqual(result.calls.map(c => c.id), [other.id],
    "closed call must not leak as history when history.read may be missing");
  assert.deepEqual(client.seen, [
    `PATCH /api/andon-calls/${original.id}/cancel`,
    "GET /health",
  ], "no retry of a committed cancellation");
});

test("R10-01: rejected PATCH stays rejected and must not invoke refresh", async () => {
  const client = new FakeApiClient();
  client.patchError = new Error("permission_denied");
  const repository = new ApiAndonRepository(client);
  await assert.rejects(
    repository.cancelCall([], [original], {
      callId: original.id, reason: "test cancellation", cancelledBy: "operador",
    }),
    /permission_denied/,
  );
  assert.deepEqual(client.seen, [`PATCH /api/andon-calls/${original.id}/cancel`]);
});

test("R11: actionable central 403 explains insufficient permission without retrying PATCH", async () => {
  const client = new FakeApiClient();
  client.patchError = new AndonApiError("Falha ao comunicar com a API ANDON (HTTP 403).", 403, "permission_denied");
  const repository = new ApiAndonRepository(client);
  await assert.rejects(
    repository.cancelCall([], [original], {
      callId: original.id, reason: "test cancellation", cancelledBy: "operador",
    }),
    /Cancelar próprios.*Cancelar qualquer/,
  );
  assert.deepEqual(client.seen, [`PATCH /api/andon-calls/${original.id}/cancel`]);
});

test("R11: CSRF denial is reported as security failure; other errors are never transformed into success", async () => {
  for (const [code, expected] of [
    ["csrf_denied", /CSRF/],
    ["workstation_inactive", /workstation/],
    ["origin_denied", /origem HTTPS/],
    ["central_action_not_supported", /indisponível/],
  ] as const) {
    const client = new FakeApiClient();
    client.patchError = new AndonApiError("HTTP 403", 403, code);
    const repository = new ApiAndonRepository(client);
    await assert.rejects(
      repository.cancelCall([], [original], {
        callId: original.id, reason: "test cancellation", cancelledBy: "operador",
      }),
      expected,
    );
    assert.deepEqual(client.seen, [`PATCH /api/andon-calls/${original.id}/cancel`]);
  }
});

test("R10-01: incomplete PATCH response cannot be mistaken for a committed cancellation", async () => {
  for (const invalid of [null, { ...confirmed, id: "unrelated-call" }, { ...confirmed, status: "open" }]) {
    const client = new FakeApiClient();
    client.patchResult = invalid;
    const repository = new ApiAndonRepository(client);
    await assert.rejects(
      repository.cancelCall([], [original], {
        callId: original.id, reason: "test cancellation", cancelledBy: "operador",
      }),
      /Não foi possível confirmar o cancelamento/,
    );
    assert.equal(client.seen.length, 1);
  }
});

test("R10-01: successful PATCH and refresh still return authoritative snapshot", async () => {
  const client = new FakeApiClient();
  client.refreshError = null;
  const repository = new ApiAndonRepository(client);
  const result = await repository.cancelCall([], [original], {
    callId: original.id, reason: "test cancellation", cancelledBy: "operador",
  });
  assert.equal(result.calls.length, 1);
  assert.equal(result.calls[0]?.status, "cancelled");
  assert.equal(result.calls[0]?.cancelReason, confirmed.cancelReason);
  assert.equal(client.seen.filter(x => x.startsWith("PATCH")).length, 1);
  assert.ok(client.seen.includes("GET /api/andon-calls"));
});
