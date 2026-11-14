import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("OPEN-12: general modal enforces the same fail-closed catalog policy as machine screen", async () => {
  const [general, machine, client] = await Promise.all([
    read("../src/components/calls/OpenCallModal.tsx"),
    read("../src/pages/MachineDetailPage.tsx"),
    read("../src/services/callReasonsCatalogService.ts"),
  ]);
  for (const source of [general, machine]) {
    assert.match(source, /getOperationalCallReasons\(\)/);
    assert.match(source, /instanceof AndonApiError && error\.code === "hierarchical_calls_disabled"/);
    assert.match(source, /"legacy"\s*:\s*"unavailable"/);
  }
  assert.match(general, /if \(!access\.centralAccessEnabled\)/);
  assert.match(general, /setReasonCatalogStatus\(reasons\.length > 0 \? "ready" : "unavailable"\)/);
  assert.match(general, /reasonCatalogStatus === "legacy" \? \(/);
  assert.match(general, /reasonCatalogStatus === "unavailable" \? \(/);
  assert.match(general, /onClick=\{\(\) => setReasonReload\(n => n \+ 1\)\}/);
  assert.doesNotMatch(general, /getCallReasonsCatalog\(\)/, "no privileged admin list in operator modal");
  assert.match(client, /"\/api\/call-reasons\/operational"/);
});

test("OPEN-12: generic opening selects reason then modal option, never sends a legacy-only payload when hierarchy is required", async () => {
  const [general, quick, reason, route] = await Promise.all([
    read("../src/components/calls/OpenCallModal.tsx"),
    read("../src/components/calls/QuickOpenCallModal.tsx"),
    read("../server/src/services/callReasonOpening.ts"),
    read("../server/src/routes/andonCalls.ts"),
  ]);
  for (const key of ["reasonId", "optionId", "expectedReasonRevision", "expectedOptionRevision"]) {
    assert.match(general, new RegExp(key + ": hierarchicalChoice\\." + key));
    assert.match(quick, new RegExp(key + ": hierarchicalChoice\\." + key));
  }
  assert.match(general, /<CallReasonOptionsModal/);
  assert.match(general, /open=\{open && selectedReasonId !== null\}/);
  assert.match(general, /reasonCatalogStatus === "ready" && hierarchicalChoice/);
  assert.match(general, /hierarchicalChoice\.subtype === subtype/);
  assert.match(general, /await openCall\(\{/);
  assert.doesNotMatch(general, /await openCalls\(/);
  assert.match(reason, /call_reason_revision_conflict/);
  assert.match(reason, /FOR SHARE/);
  assert.match(route, /resolveOpeningReasonInTransaction\(/);
  assert.match(general, /canSubmitWorkOrderGate/);
  assert.match(general, /resolveWorkOrderRequirement/);
  assert.match(general, /operatorNote\.trim\(\) \|\| undefined/);
});

test("OPEN-12: duplicate active sector navigates to existing machine and double-click is prevented", async () => {
  const general = await read("../src/components/calls/OpenCallModal.tsx");
  assert.match(general, /call\.machineId === machineId/);
  assert.match(general, /call\.subtype === option\.legacySubtype/);
  assert.match(general, /\["open", "in_progress", "post_maintenance"\]\.includes\(call\.status\)/);
  assert.match(general, /if \(existing\) \{/);
  assert.match(general, /void navigate\(\{ to: "\/machines\/\$machineId", params: \{ machineId \} \}\)/);
  assert.match(general, /if \(!machineId \|\| !subtype \|\| !canConfirm \|\| isSubmitting \|\| openingInFlightRef\.current\) return/);
  assert.match(general, /openingInFlightRef\.current = true/);
  assert.match(general, /openingInFlightRef\.current = false/);
  assert.match(general, /setIsSubmitting\(true\)/);
  assert.match(general, /setIsSubmitting\(false\)/);
  assert.match(general, /disabled=\{!canConfirm \|\| isLoadingMachineSets \|\| isSubmitting\}/);
});

test("OPEN-12: general-opening explanations are translated in PT/EN/ZH", async () => {
  const messages = JSON.parse(await read("../src/i18n/baseMessages.json")) as string[][];
  const expected = [
    "Carregando motivos e subcategorias disponíveis...",
    "Não foi possível consultar os motivos e subcategorias autorizados. A abertura permanece bloqueada.",
    "Motivo do chamado",
    "Especialidade selecionada",
    "Não foi possível validar a especialidade selecionada.",
    "Tentar novamente",
  ];
  for (const key of expected) {
    const value = messages.find(row => row[0] === key);
    assert(value && value.length === 3 && value.every(item => item.trim().length > 0), key);
  }
});
