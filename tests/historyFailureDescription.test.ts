import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getCallSupplementalNotes } from "../src/utils/callFailureDetailsUtils";

test("oculta notes idêntico à descrição estruturada", () => {
  assert.equal(getCallSupplementalNotes("Falha no motor", "Falha no motor"), null);
});

test("considera espaços nas extremidades ao detectar duplicidade", () => {
  assert.equal(getCallSupplementalNotes("  Falha no motor  ", "Falha no motor"), null);
});

test("remove somente o bloco duplicado e preserva observações operacionais", () => {
  assert.equal(
    getCallSupplementalNotes(
      [
        "Falha no motor",
        "Retorno à manutenção: voltou a falhar",
        "Finalização: máquina liberada",
      ].join("\n"),
      "Falha no motor",
    ),
    ["Retorno à manutenção: voltou a falhar", "Finalização: máquina liberada"].join("\n"),
  );
});

test("preserva notes diferente sem remover substring semelhante", () => {
  assert.equal(
    getCallSupplementalNotes("Técnico encontrou Falha no motor auxiliar", "Falha no motor"),
    "Técnico encontrou Falha no motor auxiliar",
  );
});

test("preserva notes legado quando não há descrição estruturada", () => {
  assert.equal(getCallSupplementalNotes("Correia rompida", null), "Correia rompida");
});

test("notes ausente não cria observação suplementar", () => {
  assert.equal(getCallSupplementalNotes(null, "Falha no motor"), null);
});

test("histórico mantém diagnóstico, auditorias e compatibilidade legada", async () => {
  const history = await readFile(
    new URL("../src/pages/MachineCallHistoryPage.tsx", import.meta.url),
    "utf8",
  );

  assert.match(history, /getCallSupplementalNotes\(/);
  assert.match(history, /!callFailureDetails\.description &&/);
  assert.match(history, /Classificação da falha/);
  assert.match(history, /Descrição da falha/);
  assert.match(history, /Observações do chamado/);
  assert.match(history, /Justificativa do cancelamento/);
  assert.match(history, /Justificativa da correção/);
});

test("falhas órfãs mantêm apresentação e edição próprias", async () => {
  const history = await readFile(
    new URL("../src/pages/MachineCallHistoryPage.tsx", import.meta.url),
    "utf8",
  );

  assert.match(history, /function FailureEventCard\(/);
  assert.match(history, /event\.failureDescription \|\| "Sem descrição"/);
  assert.match(
    history,
    /orphanFailureEvents\.map\(\(event\) => renderFailureEvent\(event, true\)\)/,
  );
  assert.match(history, /updateMachineStopEventDescription\(/);
});
