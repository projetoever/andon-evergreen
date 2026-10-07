import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  formatElapsedSince,
  getLastMachineOccurrence,
} from "../src/utils/durationUtils";
import { getDashboardCardAttentionTone } from "../src/utils/statusUtils";

test("falha em produção usa halo vermelho", () => {
  assert.equal(
    getDashboardCardAttentionTone("stopped", "scheduled", "none"),
    "danger",
  );
});

test("chamado aberto em máquina rodando usa halo amarelo", () => {
  assert.equal(
    getDashboardCardAttentionTone("running", "scheduled", "open"),
    "warning",
  );
});

test("falha tem precedência visual sobre chamado aberto", () => {
  assert.equal(
    getDashboardCardAttentionTone("stopped", "scheduled", "open"),
    "danger",
  );
});

test("máquina fora de produção não recebe halo de falha, mas chamado aberto continua visível", () => {
  assert.equal(
    getDashboardCardAttentionTone("stopped", "not_scheduled", "none"),
    null,
  );
  assert.equal(
    getDashboardCardAttentionTone("stopped", "not_scheduled", "open"),
    "warning",
  );
});

test("atendimento e acompanhamento não recebem halo externo", () => {
  assert.equal(
    getDashboardCardAttentionTone("running", "scheduled", "in_progress"),
    null,
  );
  assert.equal(
    getDashboardCardAttentionTone("running", "scheduled", "post_maintenance"),
    null,
  );
});

test("halo externo pulsa sem alterar a opacidade do card", async () => {
  const [card, styles] = await Promise.all([
    readFile(new URL("../src/components/machines/MachineCard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
  ]);

  assert.match(card, /absolute -inset-1\.5/);
  assert.match(card, /animate-andon-card-halo-danger/);
  assert.match(card, /animate-andon-card-halo-warning/);
  assert.doesNotMatch(card, /isCritical && "ring-2 ring-danger animate-andon-pulse"/);

  assert.match(styles, /@keyframes andon-card-halo/);
  assert.match(styles, /box-shadow: 0 0 0 9px currentColor/);
  assert.match(styles, /1\.35s ease-in-out infinite/);
  assert.match(styles, /1\.7s ease-in-out infinite/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
});


test("card do Dashboard não exibe localização do chamado", async () => {
  const card = await readFile(
    new URL("../src/components/machines/MachineCard.tsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(card, /getEffectiveAssetLocationLabel/);
  assert.doesNotMatch(card, /Localização:/);
  assert.match(card, /callElapsedLabel/);
});


test("última ocorrência usa o evento real mais recente e exibe recência", () => {
  const machine = {
    id: "9",
    stopHistory: [
      {
        id: "stop-1",
        machineId: "9",
        callId: null,
        stoppedAt: "2026-10-04T14:00:00.000Z",
        resumedAt: "2026-10-04T14:11:00.000Z",
        durationMinutes: 11,
        source: "clp" as const,
      },
    ],
  };
  const calls = [
    {
      id: "call-1",
      machineId: "9",
      openedAt: "2026-10-04T15:00:00.000Z",
      isSystemTest: false,
    },
  ];

  const occurrence = getLastMachineOccurrence(machine, calls);

  assert.equal(occurrence?.kind, "call");
  assert.equal(occurrence?.occurredAt, "2026-10-04T15:00:00.000Z");
  assert.equal(
    formatElapsedSince(occurrence?.occurredAt, "2026-10-04T16:40:00.000Z"),
    "há 1 h 40 min",
  );
});

test("falha sem chamado também alimenta a última ocorrência", () => {
  const machine = {
    id: "9",
    stopHistory: [
      {
        id: "stop-2",
        machineId: "9",
        callId: null,
        stoppedAt: "2026-10-04T16:29:00.000Z",
        resumedAt: "2026-10-04T16:35:00.000Z",
        durationMinutes: 6,
        source: "clp" as const,
      },
    ],
  };

  const occurrence = getLastMachineOccurrence(machine, []);

  assert.equal(occurrence?.kind, "failure");
  assert.equal(
    formatElapsedSince(occurrence?.occurredAt, "2026-10-04T16:40:00.000Z"),
    "há 11 min",
  );
});

test("cards mostram recência da última ocorrência em vez da duração da última falha", async () => {
  const [card, statusPanel] = await Promise.all([
    readFile(new URL("../src/components/machines/MachineCard.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../src/components/machines/MachineCurrentStatusPanel.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.doesNotMatch(card, /Última ocorrência:\s*\{/);
  assert.match(
    card,
    /formatElapsedSince\(lastOccurrence\?\.occurredAt, undefined, "Sem ocorrência"\)/,
  );
  assert.match(card, /text-center font-black text-foreground/);
  assert.doesNotMatch(card, /Última falha:/);
  assert.match(card, /machine\.machineStatus === "running" && !currentCall/);

  assert.match(statusPanel, /Última ocorrência/);
  assert.match(statusPanel, /Tempo desde o último chamado ou falha\./);
  assert.match(statusPanel, /formatElapsedSince\(lastOccurrence\?\.occurredAt\)/);
});


test("mensagem do operador ocupa o card somente enquanto o chamado aguarda", async () => {
  const card = await readFile(
    new URL("../src/components/machines/MachineCard.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    card,
    /currentCall\?\.status === "open" \? currentCall\.operatorNote\?\.trim\(\) \|\| null : null/,
  );
  assert.match(card, /Clique para ler a informação completa do operador/);
  assert.match(card, /DialogTitle>Informação do operador/);
});


test("card evita redundância de recência enquanto existe chamado ativo", async () => {
  const card = await readFile(
    new URL("../src/components/machines/MachineCard.tsx", import.meta.url),
    "utf8",
  );

  assert.match(card, /machine\.machineStatus === "running" && !currentCall/);
  assert.match(card, /\{currentCall && \(/);
  assert.match(card, /callElapsedLabel/);
});
