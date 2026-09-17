import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { normalizeCancellationReason } from "../src/utils/cancellationUtils";

test("bloqueia justificativa vazia e normaliza texto válido", () => {
  assert.equal(normalizeCancellationReason(""), null);
  assert.equal(normalizeCancellationReason("   \n  "), null);
  assert.equal(
    normalizeCancellationReason("  Chamado aberto para a máquina errada.  "),
    "Chamado aberto para a máquina errada.",
  );
});

test("modal exige justificativa e envia apenas o valor normalizado", async () => {
  const modal = await readFile(
    new URL("../src/components/calls/CancelCallModal.tsx", import.meta.url),
    "utf8",
  );

  assert.match(modal, /Justificativa do cancelamento/);
  assert.match(modal, /disabled=\{!normalizedReason \|\| isSubmitting\}/);
  assert.match(modal, /await onConfirm\(normalizedReason\)/);
  assert.match(modal, /<Textarea/);
});

test("persiste cancelReason no banco e no repositório local", async () => {
  const [schema, migration, route, localRepository] = await Promise.all([
    readFile(new URL("../server/prisma/schema.prisma", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../server/prisma/migrations/20260917090000_add_cancel_reason_to_andon_calls/migration.sql",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../server/src/routes/andonCalls.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/repositories/localAndonRepository.ts", import.meta.url), "utf8"),
  ]);

  assert.match(schema, /cancelReason\s+String\?/);
  assert.match(migration, /ADD COLUMN "cancelReason" TEXT/);
  assert.match(route, /cancelReason: reason/);
  assert.match(localRepository, /cancelReason: params\.reason\?\.trim\(\) \|\| null/);
});

test("backend valida a justificativa antes de consultar ou alterar o chamado", async () => {
  const route = await readFile(
    new URL("../server/src/routes/andonCalls.ts", import.meta.url),
    "utf8",
  );
  const cancelRoute = route.slice(
    route.indexOf('"/api/andon-calls/:id/cancel"'),
    route.indexOf('"/api/andon-calls/:id/technicians"'),
  );

  const validationPosition = cancelRoute.indexOf(
    'badRequest(reply, "Justificativa do cancelamento é obrigatória.")',
  );
  const lookupPosition = cancelRoute.indexOf("prisma.andonCall.findUnique");
  const transactionPosition = cancelRoute.indexOf("prisma.$transaction");

  assert.ok(validationPosition >= 0);
  assert.ok(validationPosition < lookupPosition);
  assert.ok(validationPosition < transactionPosition);
});

test("health check do installer continua enviando justificativa válida", async () => {
  const installer = await readFile(
    new URL("../installer/AndonInstaller.Common.ps1", import.meta.url),
    "utf8",
  );

  assert.match(installer, /reason = "Teste automatico do instalador"/);
});

test("histórico exibe a justificativa somente quando ela existe", async () => {
  const history = await readFile(
    new URL("../src/pages/MachineCallHistoryPage.tsx", import.meta.url),
    "utf8",
  );

  assert.match(history, /call\.status === "cancelled" && call\.cancelReason/);
  assert.match(history, /\{call\.cancelReason\}/);
});

test("telas enviam o texto informado sem alterar atender ou finalizar", async () => {
  const [activeCalls, machineDetail] = await Promise.all([
    readFile(new URL("../src/pages/ActiveCallsPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/MachineDetailPage.tsx", import.meta.url), "utf8"),
  ]);

  for (const source of [activeCalls, machineDetail]) {
    assert.match(source, /<CancelCallModal/);
    assert.match(source, /reason,/);
    assert.match(source, /attendCall/);
    assert.match(source, /FinishCallModal/);
  }
});
