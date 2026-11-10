import assert from "node:assert/strict";
import test from "node:test";
import { AccessError } from "./policy.js";
import { runCentralCallReasonWrite } from "./centralCallReasonsWrite.js";

test("R6/S2: adapter refuses legacy mode and unrecognized resources before any DB transaction", () => {
  const a = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  const b = process.env.ANDON_CENTRAL_CALL_REASONS_HTTP_ENABLED;
  const db = { $transaction: () => { throw Error("DB should never be queried"); } } as never;
  try {
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "0";
    process.env.ANDON_CENTRAL_CALL_REASONS_HTTP_ENABLED = "1";
    assert.throws(() => runCentralCallReasonWrite(db, {
      token: "a".repeat(64), workstationId: "station",
      operation: "reason.create", body: {},
    }), (e: unknown) => e instanceof AccessError && e.code === "central_action_not_supported");
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
    assert.throws(() => runCentralCallReasonWrite(db, {
      token: "a".repeat(64), workstationId: "station",
      operation: "option.update", reasonId: "../../etc", optionId: "area",
      body: { expectedRevision: 1, active: true },
    }), (e: unknown) => e instanceof AccessError && e.code === "invalid_action_resource");
    assert.throws(() => runCentralCallReasonWrite(db, {
      token: "a".repeat(64), workstationId: "station",
      operation: "reason.create", optionId: "injected",
      body: {},
    }), (e: unknown) => e instanceof AccessError && e.code === "invalid_action_resource");
  } finally {
    if (a === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = a;
    if (b === undefined) delete process.env.ANDON_CENTRAL_CALL_REASONS_HTTP_ENABLED;
    else process.env.ANDON_CENTRAL_CALL_REASONS_HTTP_ENABLED = b;
  }
});
