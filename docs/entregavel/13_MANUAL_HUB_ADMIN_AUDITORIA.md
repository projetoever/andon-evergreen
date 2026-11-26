# MAN-HUB-001 / MAN-ADM-001 / MAN-AUD-001 — Hub, Administração e Auditoria

**Revisão:** 0.1 · Marco M1 · **Uso:** versão editorial interna pendente de homologação.  
**Público:** Admin principal, gestores delegados, TI e auditores autorizados.  
**Fontes:** `src/pages/HubPage.tsx`, `HubAdminPage.tsx`, `AndonAdminPage.tsx`, `server/src/access/policy.ts`, `server/src/routes/modules.ts`, `server/src/routes/accessAudit.ts`.

## 1. Hub: porta de entrada controlada

No Hub `/hub`, o sistema apresenta ANDON Operacional, BI, Prioridades e as entradas adicionais conforme sessão, workstation e grants. O nome exibido da função não é fonte de autorização; o backend valida capacidades de ação e escopo de máquina. A navegação entre módulos não deve encerrar chamado ou sessão técnica por si só.

Procedimento:
1. Abrir URL HTTPS homologada.
2. Verificar aviso de identificação/autorização da estação, quando aplicável.
3. Entrar com conta própria e validar apenas módulos liberados.
4. Selecionar módulo e retornar pelo atalho do Hub.
5. Ao terminar o turno ou deixar equipamento compartilhado, utilizar a política de saída do perfil configurado. Para sessão “não expira”, a revogação administrativa e a operação **Sair** continuam relevantes.

## 2. Administração: distinguir dois painéis

| Painel | Funções predominantes | Autorizações |
|---|---|---|
| Hub Admin `/hub/admin` | Contas, grants, workstations, recuperação, sessões, módulos e central de auditoria quando autorizada | Sessão administrativa, grants específicos, Admin principal |
| ANDON Admin `/andon/admin` | Máquinas, setores, grupos, motivos, classificações, técnicos, turnos, sons, cores e política operacional | `andon.settings.open` + grants/guardas de cada mutação |

**Não interpretar** acesso a ANDON Admin como permissão de gerenciar usuários do Hub, exportar auditoria ou alterar todas as máquinas.

## 3. Usuários e política de menor privilégio

1. O Admin principal autentica-se e abre gerenciamento de usuários no Hub.
2. Cria ou revisa a conta com nome público, login, política de sessão e escopo de máquina.
3. Concede apenas os grupos de permissões necessários. A política de backend declara grants por ação, não uma hierarquia automática baseada no texto “Líder” ou “Manutenção”.
4. Verifica as quatro famílias essenciais de navegação (ANDON, BI, Prioridades e Configuração ANDON), além de grants especializados de Histórico e Auditoria.
5. Guarda qualquer senha provisória somente no fluxo oficial, sem copiá-la para planilha ou screenshot.
6. Testa com usuário de laboratório que uma ação autorizada é permitida e uma ação não concedida é negada também via API.
7. Quando alguém perde acesso, revoga a autorização/sessão e confirma que não basta o menu continuar aberto.

**Cuidado:** `audit.export` não deve funcionar sem `audit.read`. `bi.read` não implica `bi.export`; `priorities.read` não implica `priorities.write`.

## 4. Workstations e identidade do terminal

O cadastro de estação registra estado ativo, pendência de aprovação, associações e heartbeat. Dispositivo com ID persistente de navegador não é identidade corporativa por si só; autenticação do usuário é independente. Outro navegador ou perfil pode registrar identidade distinta.

1. Localize a estação na administração e confirme nome/status.
2. Aprove ou bloqueie conforme política e justificativa.
3. Não desative proteção somente para contornar 401/403.
4. Para máquina com tela bloqueada, utilize desbloqueio one-shot autorizado quando existente.
5. Confira efeitos da revogação em nova chamada API, não apenas pela aparência do cabeçalho.

## 5. Cadastro operacional e seus efeitos históricos

- **Máquinas:** nome, ordem, status, produção programada e políticas por máquina exigem autorização própria.
- **Setores:** categoria, cor, ordem, ativação e botão direto. Não excluir setor para somente ocultar seu botão.
- **Grupos/motivos:** motivo e opção com natureza, responsabilidade sugerida e participação BI; snapshots preservam regras históricas de abertura.
- **Classificações:** alterar responsabilidade de falha não deve reescrever indiscriminadamente diagnóstico já gravado.
- **Técnicos:** cadastro, identificação e áreas. Um técnico pode participar de múltiplas fases com histórico; não reutilizar credenciais.
- **Cores/idiomas:** tema global e nomes cadastrados são elementos diferentes; não traduzir automaticamente nome de máquina, setor ou usuário.
- **OS/segurança operacional:** requisitos podem vir da política global e da máquina; validar no fluxo real antes de liberar.

Para mudanças críticas, preencher justificativa, confirmar o resultado persistido e confrontar com a auditoria. Em caso de 409, consultar revisão atual antes de sobrescrever.

## 6. Central de Auditoria

O ícone/entrada de auditoria no Hub está sujeito à capacidade resolvida do servidor. A trilha usa eventos persistidos em PostgreSQL e separa mutações transacionais de navegação ou clique informativo.

| Ação | Capacidade necessária | Limite conhecido |
|---|---|---|
| Abrir/filtrar log | `audit.read` | API retorna 50 registros por página |
| Exportar CSV | `audit.read` + `audit.export` | Até 20.000 eventos por exportação |
| Ver log como Admin principal | Autoridade especial do Admin central | Dependente de sessão, workstation e modo central |
| Registrar navegação/clique | Telemetria permitida de melhor esforço | Pode perder eventos se navegador/rede indisponível |

**Consulta:** `GET /api/access/audit-events`. **Exportação:** `GET /api/access/audit-events/export`. **Telemetria:** `POST /api/access/audit-events/navigation` e `.../interactions`.

### Roteiro de auditoria
1. Abrir módulo de auditoria com conta autorizada.
2. Filtrar período, ator/ação/recurso na medida permitida pela interface.
3. Localizar evento transacional de mudança e conferir resultado, contexto de máquina e antes/depois redigidos.
4. Comparar `ui.route.view`/`ui.click` somente como histórico de interação, sem concluir que o backend gravou alteração.
5. Exportar CSV se possuir permissão; ajustar filtros quando resultado exceder 20.000 e jamais aceitar truncamento silencioso.
6. Verificar se senhas, PINs, cookies, tokens e texto digitado **não** aparecem no CSV ou na consulta.
7. Guardar exportações somente em armazenamento autorizado, com política de retenção definida pela organização.

### Limites de garantia
Telemetria não captura garantidamente todos os cliques: depende de JS, sessão e conectividade. Cobertura de mutações depende da instrumentação específica de cada rota; não declarar auditoria retroativa de operações não registradas. Políticas de retenção, acesso e armazenamento precisam de aprovação antes de operação contínua.

## 7. Sessões persistentes e recuperação

Política “não expirar” depende de cookie seguro, perfil do browser e sessão central no banco; pode ser encerrada por logout, revogação, limpeza de cookie/perfil, troca de origem ou mudança de política. Não prometer imortalidade literal de sessão. Em Firefox/Chrome e após suspensão/reinício é obrigatório testar os cenários `DOC1-QA-H21` antes de aprovar o manual.

## 8. Mapa de erros administrativos

| Evento | Resposta esperada | Próxima ação |
|---|---|---|
| Sessão não autenticada | 401/fluxo de login | Entrar com credencial própria |
| Conta sem grant ou estação sem aprovação | 403 e bloqueio | Revisar grants, machineScope e workstation |
| Credencial antiga de revisão | 409 ou erro validado | Recarregar alteração e solicitar nova autorização |
| Serviço temporariamente indisponível | UI neutra + retry limitado | Diagnosticar API/network; não revogar usuário |
| Exportação acima do limite | 413, sem truncamento | Restringir período/consulta |
| Suspeita de segredo em log | Incidente de segurança | Isolar exportação e seguir procedimento de segurança |

## 9. Exercícios de administrador

**ADMIN-01:** criar usuário de leitura BI e comprovar que `bi.export` não foi concedido.  
**ADMIN-02:** usuário `audit.read` consulta mas não exporta; com ambos, exporta; sem leitura, API nega.  
**ADMIN-03:** bloquear workstation, testar URL direta ANDON e conferir revogação.  
**ADMIN-04:** ajustar um motivo em laboratório e provar que o snapshot de chamado histórico não é reescrito.  
**ADMIN-05:** simular API temporariamente fora e conferir que o erro não foi apresentado como “permissão negada”.

**Gate:** `DOC1-QA-H01/H02/H19/H20/H21/H25/H28`. **Status desses testes:** NOT_RUN neste manual.

[Autorização do código](../DOC1_AUTORIZACAO_MODULOS_20261125.md) · [PENTE 6](../PENTE6_AUDITORIA_I18N_NAVEGACAO_20261125.md) · [Roteiro QA](../DOC1_HOMOLOGACAO_GUIADA_20261125.md).

**Status editorial:** screenshots, perfis sintéticos, revisão de TI/Sec e termo ainda pendentes.
