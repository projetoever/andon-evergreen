import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeFailureDescription } from "../src/utils/failureDescriptionUtils";

test("oculta IDs internos da transferência de impacto sem perder a descrição operacional", () => {
  const description = [
    "Falha registrada na abertura do ANDON",
    "Continuidade da falha: Impacto transferido aos chamados cmsusv2lp000orr1wzdmi8ww8 após finalização do chamado cmsusv9f2000srr1wc6ofznhk",
  ].join("\n");

  const sanitized = sanitizeFailureDescription(description);

  assert.match(sanitized, /Falha registrada na abertura do ANDON/);
  assert.match(sanitized, /Máquina permaneceu parada/);
  assert.doesNotMatch(sanitized, /cmsusv2lp000orr1wzdmi8ww8/);
  assert.doesNotMatch(sanitized, /cmsusv9f2000srr1wc6ofznhk/);
});

test("preserva descrições escritas pelo operador", () => {
  const description = "Troca do contator e reaperto dos terminais.";
  assert.equal(sanitizeFailureDescription(description), description);
});

test("também normaliza o texto de transferência usado por versões anteriores", () => {
  const description =
    "Continuidade da falha: Responsabilidade transferida ao chamado cmoldtarget123456789 após finalização do chamado cmoldsource123456789";

  const sanitized = sanitizeFailureDescription(description);

  assert.match(sanitized, /Máquina permaneceu parada/);
  assert.doesNotMatch(sanitized, /cmoldtarget|cmoldsource/);
});
