# REFINE 9.1 — Pacote de implementação e controle de aceite

Data: 05/11/2026. Branch: `refine9-1/hub-overlay-overview-20261105`, baseada exclusivamente no HEAD da PR #343 `c54d4c5ac30d2c2a63829e835324450f9973cbc2`.
**SEM MERGE / SEM DEPLOY. LAB HML APENAS.**

## Regras de status

- **Código** = alteração na branch, não é homologação.
- **CI** = testes automatizados. Verde não implica aprovação visual.
- **HML** = teste real no notebook pelo usuário; pendente até receber evidências.
- **Fábrica** = aprovação separada após clone do banco oficial, backups, restauração, janela e rollback.

## Inventário REFINE 9.1

| ID | Proposta | Estado na branch | Teste / gate de aceite |
| --- | --- | --- | --- |
| R9.1-01 | Login central exibido em modal obrigatório com overlay escuro, 3 módulos ainda visíveis/bloqueados atrás. Click fora/ESC não devem fechar o modal nem conceder permissão | Implementado no frontend para HML, teste manual pendente | Testar login, senha provisória, workstation pendente, nome de conta, mobile/TV, foco/tab, PT/EN/ZH; API continua autoridade |
| R9.1-02 | Remover a aba "Configurações gerais do Hub" e manter somente Visão Geral, Usuários e Acessos, Workstations, Integrações API. Link antigo `?section=hub` abre Visão Geral | Implementado no frontend para HML, teste manual pendente | Quatro abas, nenhuma perda de conteúdo, sem acesso indevido |
| R9.1-03 | Restituir atendimento por nome quando configurado, independentemente do login central, preservando auditoria e integridade do chamado | **Não implementado** — requer protocolo backend específico | Exigir design/testes transacionais + autorização server-side, seleção de técnico ativo/área/turno, escopo de máquina e unicidade, registrar sessão que solicitou e método `name` como *declaração não verificada*, sem tratá-la como credencial forte. Validar chamados simultâneos, múltiplos técnicos, tentativa de falsificação, duas estações e reversão. Sem habilitar apenas removendo `if (centralAttendance)` |
| R9.1-04 | Comparar configuração antiga e nova; reposicionar dados da empresa/unidade ausentes | Empresa e unidade movidas para Visão Geral central via componente existente com ACL backend já implementada; inventário integral ainda pendente | Testar GET/PATCH no HML, política de Admin principal, bloqueio de Gerente e nome aparecendo no Hub/BI; mapear paridade do servidor original em modo somente leitura |
| R9-05...R9-08 | confiança, kiosk contínuo, logout remoto revogável, heartbeat/workstations | Não implementado nesta PR; pacote independente após REFINE 9.1 | CI/backend e HML separados, segurança fail-closed |

## Investigação e princípio de R9.1-03

O código atual distingue corretamente a conta humana da credencial **verificada** de um técnico; em `src/utils/attendanceModePolicy.ts` ele substitui `name` por `pin` quando central ON. `AttendanceModeSettingsTab.tsx` bloqueia salvar nome, `TechnicianIdentificationModal.tsx` retorna cedo em `handleNameSubmit`, e `server/src/access/centralOperationalSettings.ts` rejeita `name` no patch do backend. Essas salvaguardas não devem ser removidas isoladamente.

O requisito operacional é legítimo: **permitir escolha de nome no modo operacional configurado**. Isso não equivale a provar criptograficamente a identidade da pessoa selecionada. A próxima PR deve introduzir uma política central explícita, restrita a workstation aprovada, usuário/sessão operacional autorizado e máquinas/área permitidas, com log de autoria da seleção e estado de verificação declarativo; não deve atribuir falsamente autenticação por PIN. Fazer auditoria e invariantes antes de ativar. Não reaproveitar senha Admin ou bypass de ACL. PIN/RF continuam independentes.

## Mapeamento preliminar das configurações

| Área | Legado/operacional | Central HML nesta branch | Situação |
| --- | --- | --- | --- |
| Identificação empresa/unidade | `HubClientIdentitySettings` em `HubAdminOverview`; campos `clientName/clientUnit` | Adicionados à `CentralOverview` com editor existente; gravação central exige operação habilitada e Admin principal | Código implementado / HML pendente |
| Estado central/workstation | Aba "Configurações gerais do Hub" duplicava leitura | Integrado à Visão Geral, removida aba redundante | Código implementado / HML pendente |
| Versão SHA | `HubBuildVersionCard` | Mantido na Visão Geral central | Preservado |
| Segurança / usuários / workstations | Hub, sessão central e permissões | Mantidos nas abas atuais, backend autoritativo | Preservar; testes de perfis pendentes |
| Integrações Node-RED/GPIO | Serviço técnico com credenciais dedicadas | Aba Integrações API mantida; não conecta equipamentos no HML | Preservado |
| Sons, aparência, categorias, turnos, máquinas, técnicos e regras | Painel Configurações ANDON operacional | Permanecem no painel ANDON; não mover ao Hub | Preservar; mapeamento integral por comparação ainda pendente |
| Modo atendimento por nome | Permitido no legado | Central requer PIN/RF | Bloqueador R9.1-03 |
| Acesso kiosk de Produção confiável | Experiência contínua desejada | Ainda sem trust/revogação | R9-05...R9-08 |

## Ambiente e proibições

LAB: `C:\web-andon-refine8-hml\andon`, frontend `https://localhost:8080/hub`, API `https://localhost:3001`, Docker `andon-https-hml-postgres`, banco `andon_https_hml` 127.0.0.1:55432. Backup restaurado/testado no LAB em 05/11/2026; SHA256 `E773A0ECFFE7AF938131284452ACBF1DD720ACCB3F5C002EFC5221CE2CFA6D83`. Revalidar antes de migration.

NUNCA alterar original `C:\web-andon-industrial\andon`, `andon_db`, servidor fábrica, M37, GPIO, PLC ou Node-RED sem autorização separada. Sem commits de credenciais, tokens, dumps ou logs sensíveis. Não `npm audit fix --force` indiscriminadamente.

## Documentação cruzada

Drive planilha mestre: https://docs.google.com/spreadsheets/d/1Jh0AqVL0YsNzGhss1xyM-XnfV5MGDbzH/edit

Diário Drive: https://docs.google.com/document/d/14ctodyrT2xsVgEf3IKPBqJ8FV_cJl5KDhTVJjHS3ZCE/edit

PR #343 (base técnica): https://github.com/projetoever/andon-evergreen/pull/343

**Regra:** somente usuário homologa visualmente. Não marcar R9.1-01/02/04 como HOMOLOGADO antes de seu aceite.
