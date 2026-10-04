import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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
