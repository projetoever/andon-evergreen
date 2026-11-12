import assert from "node:assert/strict";
import test from "node:test";
import { buildAndonApiErrorMessage } from "../src/api/andonErrorMessages";

test("P0: stable refusal codes take priority over generic server messages", () => {
  const refusals = [
    "workstation_inactive",
    "workstation_identification_required",
    "workstation_session_mismatch",
    "permission_denied",
    "machine_scope_denied",
    "csrf_denied",
    "origin_denied",
    "central_action_not_supported",
    "hierarchical_calls_disabled",
  ];
  for (const code of refusals) {
    const result = buildAndonApiErrorMessage(403, {
      error: code,
      message: "Permissão negada.",
    });
    assert.match(result, new RegExp(code), code);
    assert.match(result, /HTTP 403/);
    assert.notEqual(result, "Permissão negada.");
  }
});

test("P0: recognized codes cannot echo untrusted diagnostic or credential strings", () => {
  const message = "token=SECRET; Cookie=private; PIN=1234";
  const result = buildAndonApiErrorMessage(403, { error: "csrf_denied", message });
  assert.match(result, /csrf_denied/);
  assert(!result.includes(message));
});

test("P0: preserve fallback behavior for unknown codes and plain legacy messages", () => {
  assert.equal(
    buildAndonApiErrorMessage(403, { error: "other_safe_code", message: "Bloqueio legado" }),
    "Bloqueio legado",
  );
  assert.match(buildAndonApiErrorMessage(403, { error: "other_safe_code" }), /other_safe_code/);
  assert.equal(buildAndonApiErrorMessage(403, null), "Falha ao comunicar com a API ANDON (HTTP 403).");
});
