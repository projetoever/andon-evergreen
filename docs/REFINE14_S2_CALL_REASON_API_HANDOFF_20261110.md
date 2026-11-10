# REFINE 14 / S2 — API de motivos e subcategorias (integração na main)

## Escopo desta etapa

A fundação S1 de `call_reasons` e `call_reason_options` já existe na main. Esta etapa porta e atualiza a API S2, preservando a distinção **motivo pai** (Manutenção, Setup, Apoio) → **especialidade** (Mecânica, Elétrica, Afiação). Não muda abertura de chamados, histórico nem BI.

A API `GET/POST/PATCH /api/call-reasons` e `/api/call-reasons/:reasonId/options` é **inativa por padrão**, dependendo da variável adicional `ANDON_CENTRAL_CALL_REASONS_HTTP_ENABLED=1` e do acesso central existente. Ninguém deve ativar essa flag na fábrica antes de autorização e aceite de homologação.

## Segurança e invariantes

- Apenas sessão central pessoal do **Admin principal**, workstation aprovada/ativa, módulo ANDON permitido, escopo de máquinas completo e permissões `catalog.reasons.manage` **e** `analytics.policy.manage`; a verificação do privilégio de política também ocorre dentro da transação.
- Exige HTTPS e origem canônica exata, token da sessão e CSRF para escrita; sem HTTP legado, credencial de serviço ou bypass de Admin.
- Validação por allowlist de campos, políticas KPI coerentes e versões/revisões contra sobrescrita concorrente; inserções/atualizações e auditoria atômicas, com lock global de catálogo.
- Manutenção corretiva pode ser elegível segundo política explícita. Setup/Apoio não se tornam falhas corretivas por usar especialidade Mecânica/Elétrica.
- Nenhuma alteração automatizada em `andon_calls`, tempos de parada, contadores, histórico ou KPI.

## Testes e liberação

A CI valida TypeScript, flags OFF, bloqueio de rota, Admin/CSRF/escopo, concorrência, integridade de KPI, rollback e PostgreSQL em `andon_test`. Mesmo após merge, **as funcionalidades só estarão acessíveis quando houver habilitação intencional da flag no laboratório**. Não usar menu de atualização no servidor industrial para ativar esta flag.

## Itens restantes após S2

1. **S3-A:** interface no Hub para configurar motivos pai, opções técnicas e prévia de política KPI; testes de perfil/idiomas/UX.
2. **S3-B:** botões hierárquicos no painel de abertura, registro de snapshot da escolha, regras de OS/concorrência e histórico auditável.
3. **S4:** consultas e classificações do ANDON BI por natureza e responsabilidade, paridade MTTR/MTBF/MTTA, disponibilidade e downtime físico.
4. **Homologação operacional:** máquina 37 e demais máquinas piloto, confiança de workstations, Admin/Gerente/Manutenção/Produção, API e erro, histórico, cancelamento, agentes físicos e atualização restaurável.
5. **Fábrica:** atualizar somente após aceites do notebook original, backup validado, plano reversível e janela de manutenção.
