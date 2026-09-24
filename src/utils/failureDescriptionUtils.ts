const PUBLIC_HANDOFF_DESCRIPTION =
  "Continuidade da falha: Máquina permaneceu parada; impacto transferido para outro chamado ativo.";

const LEGACY_HANDOFF_PATTERNS = [
  /Continuidade da falha:\s*Impacto transferido aos chamados\s+[^\r\n]+\s+após finalização do chamado\s+[^\r\n]+/gi,
  /Continuidade da falha:\s*Responsabilidade transferida ao chamado\s+[^\r\n]+\s+após finalização do chamado\s+[^\r\n]+/gi,
];

/**
 * Remove identificadores internos que versões anteriores gravavam em observações operacionais.
 * A informação de continuidade é preservada em linguagem adequada para o histórico da máquina.
 */
export function sanitizeFailureDescription(description?: string | null) {
  if (!description) return "";

  return LEGACY_HANDOFF_PATTERNS.reduce(
    (sanitized, pattern) => sanitized.replace(pattern, PUBLIC_HANDOFF_DESCRIPTION),
    description,
  );
}

const AUTOMATIC_DESCRIPTION_LINES = [
  /^Falha registrada na abertura do ANDON$/i,
  /^Falha encerrada automaticamente\b/i,
  /^Continuidade da falha:/i,
  /^Retomada:/i,
  /^Conclusão da manutenção:/i,
  /^Retorno à manutenção:/i,
];

export function extractFailureDescriptionForFinish(description?: string | null) {
  return sanitizeFailureDescription(description)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.length > 0 && !AUTOMATIC_DESCRIPTION_LINES.some((pattern) => pattern.test(line)),
    )
    .join("\n")
    .trim();
}
