import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createInitialMachines } from "../src/data/initialMachines";
import {
  attendAndonCall,
  normalizeAndonCall,
  openAndonCall,
} from "../src/services/andonService";

test("mensagem do operador é opcional e persiste no chamado", () => {
  const machine = createInitialMachines()[0];
  const opened = openAndonCall([machine], [], {
    machineId: machine.id,
    category: "maintenance",
    subtype: "electrical",
    machineCondition: "running",
    operatorNote: "  Ruído intermitente próximo ao motor  ",
  });

  assert.equal(opened.call.operatorNote, "Ruído intermitente próximo ao motor");

  const attended = attendAndonCall(opened.machines, opened.calls, {
    callId: opened.call.id,
    technicians: [
      {
        id: "tech-operator-note",
        name: "Técnico Teste",
        technicalArea: "electrical",
        technicalAreas: ["electrical"],
      },
    ],
  });
  const call = attended.calls.find((item) => item.id === opened.call.id);
  assert.equal(call?.operatorNote, "Ruído intermitente próximo ao motor");
  assert.equal(call?.status, "in_progress");
});

test("chamado legado sem mensagem normaliza operatorNote como nulo", () => {
  const machine = createInitialMachines()[0];
  const opened = openAndonCall([machine], [], {
    machineId: machine.id,
    category: "maintenance",
    subtype: "electrical",
    machineCondition: "running",
  });

  const legacy = { ...opened.call } as typeof opened.call & {
    operatorNote?: string | null;
  };
  delete legacy.operatorNote;

  assert.equal(normalizeAndonCall(legacy).operatorNote, null);
});

test("abertura rápida e geral oferecem mensagem opcional limitada", async () => {
  const [quick, general] = await Promise.all([
    readFile(
      new URL("../src/components/calls/QuickOpenCallModal.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/components/calls/OpenCallModal.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  for (const source of [quick, general]) {
    assert.match(source, /Informação para o mantenedor/);
    assert.match(source, /\(opcional\)/);
    assert.match(source, /maxLength=\{500\}/);
    assert.match(source, /operatorNote\.trim\(\) \|\| undefined/);
  }
});

test("card exibe resumo apenas antes do atendimento e abre mensagem completa", async () => {
  const card = await readFile(
    new URL("../src/components/machines/MachineCard.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    card,
    /currentCall\?\.status === "open" \? currentCall\.operatorNote\?\.trim\(\) \|\| null : null/,
  );
  assert.match(card, /operatorNoteSummary/);
  assert.match(card, /Info: \{operatorNoteSummary\}/);
  assert.match(card, /setOperatorNoteOpen\(true\)/);
  assert.match(card, /Informação do operador/);
});

test("histórico preserva a informação completa da abertura", async () => {
  const history = await readFile(
    new URL("../src/pages/MachineCallHistoryPage.tsx", import.meta.url),
    "utf8",
  );

  assert.match(history, /call\.operatorNote/);
  assert.match(history, /Informação do operador na abertura/);
});

test("servidor limita informação do operador a 500 caracteres e batch também persiste", async () => {
  const route = await readFile(
    new URL("../server/src/routes/andonCalls.ts", import.meta.url),
    "utf8",
  );

  assert.match(route, /MAX_OPERATOR_NOTE_LENGTH = 500/);
  assert.match(route, /operatorNote: isSystemTest \? null : \(operatorNote \?\? null\)/);
  assert.match(route, /operatorNote: operatorNote \?\? null/);
});
