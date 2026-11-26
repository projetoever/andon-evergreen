# PENTE 5-B — Confirmação explícita na aba Máquinas e auditoria das demais abas

**Data:** 26/11/2026 · **Escopo:** Configuração ANDON / UX de persistência (sem alteração de banco, fórmulas BI, instalação industrial ou fluxos operacionais).

## Evidência e causa
Captura do painel em `/andon/admin`, aba **Máquinas**, com identificação, OS local e setores por máquina, sem botão de salvar. No código anterior:
- o nome era gravado no evento `onBlur` sem resposta de sucesso/erro no formulário;
- o switch de OS enviava PATCH imediatamente;
- os switches de visibilidade enviavam um PATCH versionado por setor imediatamente.
O usuário não tinha uma confirmação inequívoca de que concluiu as alterações.

## Novo contrato de interface
1. A máquina selecionada mantém um **rascunho local** de nome, exigência de OS individual e conjunto de setores ocultos. O painel diferencia valores alterados de dados efetivamente persistidos.
2. Barra no topo do detalhe com estado de alterações, **Descartar alterações** e **Salvar alterações**. Salvar só habilita com alterações reais, permissão efetiva de escrita e nome válido. Durante a operação controles e trocas de máquina ficam bloqueados.
3. `updateMachineCatalog` no provider passa a retornar `Promise<void>` e propagar erro para o formulário; só se informa sucesso depois de confirmação de backend.
4. O servidor aceita metadados `name` + `requireWorkOrderAtOpen` em uma solicitação, mas a visibilidade precisa permanecer **em rota CAS separada**, com `expectedSectorVisibilityRevision`. Para não relaxar a allowlist de segurança, o frontend salva sequencialmente. **Se metadados forem salvos e visibilidade falhar, o sistema comunica salvamento parcial, não sucesso completo**; há nova tentativa sem reclassificar histórico.
5. **Navegação protegida**: aviso ao trocar máquina, criar outra, mudar de aba, voltar/fechar painel, ou recarregar página com edição pendente. Nenhuma gravação silenciosa ao perder foco.
6. Em acesso central, **produção programada e ativação/inativação** continuam bloqueadas por aqui, exigindo fluxos operacionais próprios. No acesso local legado, permanecem ações imediatas independentes, sem prometer que fazem parte de Salvar.
7. A criação de nova máquina mantém o botão específico `Criar máquina`. Não altera regras de criação nem a política global de OS.
8. Traduções PT, EN e chinês tradicional para estados, confirmação e falhas.

## Auditoria cruzada das abas (leitura de código)
| Aba | Contrato de gravação identificado | Ação nesta correção |
| --- | --- | --- |
| Configurações da operação | switches de parâmetros com `updateSystemSettings` por ação e erro/sucesso; gravação imediata intencional | Preservado |
| Aparência e cores | prévia local e `Salvar globalmente` explícito | Preservado |
| Sons do ANDON | formulário de arquivo com `Salvar som`; controles de habilitação são ações diretas próprias | Preservado |
| Modo de atendimento | rascunho + `Salvar modo de atendimento` | Preservado |
| Mantenedores | formulário + `Salvar alterações` e ações de status separadas | Preservado |
| Turnos | formulário + `Salvar turno`; filtro de turno é ação direta | Preservado |
| Setores / categorias | rascunho + `Salvar setor` | Preservado |
| Grupos de chamados | rascunho + `Salvar grupo`; apresentação de opção e vínculo têm ações próprias | Preservado |
| Classificações | formulário + `Salvar classificação` | Preservado |
| Catálogos de ativos | edição de item com `Salvar` | Preservado |
| Máquinas | **faltava confirmação para edição de máquina**; coexistiam três gravações automáticas | **Corrigido** |

A ausência de um botão Salvar global em abas com switches de execução imediata não constitui falha de persistência por si só. Uma conversão dessas operações para formulário único exigiria outra mudança funcional e validação específica.

## Garantias e gates
- Nunca conceder permissão de escrita por desenhar o botão: o backend segue como autoridade de ACL, estação, sessão, Origin/CSRF e escopo.
- Alteração de setores não modifica catálogo global, vínculos de Grupos, eventos físicos, uptime/downtime ou elegibilidade BI; 409 por concorrência continua possível e deve ser exibido sem inventar salvamento.
- Regression tests: botão, dados controlados, aviso de alterações, retorno assíncrono e contrato das demais abas.
- Executar CI Windows + PostgreSQL isolado + backend/TS/frontend/UI. A integração na `main` depende de resultado aprovado e decisão de merge.
- Homologação pós-merge no notebook: alterar nome/OS/setores, salvar, recarregar, falha de rede, conflito 409, perfil sem permissão, alternar abas, criar máquina, Chrome/Firefox e PT/EN/ZH. Não atualizar servidor fabril.
