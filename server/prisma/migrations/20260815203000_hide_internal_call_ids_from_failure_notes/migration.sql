-- Observações de versões anteriores incluíam IDs técnicos de chamados no texto exibido
-- ao operador. Mantém a informação operacional e remove somente as frases geradas
-- automaticamente pela aplicação.
UPDATE "failure_events"
SET "notes" = regexp_replace(
  "notes",
  'Continuidade da falha: Impacto transferido aos chamados [^\r\n]+ após finalização do chamado [^\r\n]+',
  'Continuidade da falha: Máquina permaneceu parada; impacto transferido para outro chamado ativo.',
  'g'
)
WHERE "notes" LIKE '%Continuidade da falha: Impacto transferido aos chamados %';

UPDATE "failure_events"
SET "notes" = regexp_replace(
  "notes",
  'Continuidade da falha: Responsabilidade transferida ao chamado [^\r\n]+ após finalização do chamado [^\r\n]+',
  'Continuidade da falha: Máquina permaneceu parada; impacto transferido para outro chamado ativo.',
  'g'
)
WHERE "notes" LIKE '%Continuidade da falha: Responsabilidade transferida ao chamado %';
