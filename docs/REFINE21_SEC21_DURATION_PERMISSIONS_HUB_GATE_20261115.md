# REFINE 21 — SEC-21 P0 | Duração de sessão independente de permissões

Data: 15/11/2026. Base: `3d1834b9c0c1c6a5edca691fb309c06e9544b422` — versão liberada previamente para homologação no notebook.

## Problemas confirmados no código
1. O botão `Usar permissões de Produção 24h` substituía todas as permissões do usuário por um conjunto arbitrário. A opção de não expirar dependia de lista fixa e o backend filtrava grants no principal.
2. A política de sessão disponibilizava somente `standard` (30 minutos inativo/12 horas máximo) e `persistent`. Não havia opção explícita de 24 horas.
3. O gate de módulo ainda possuía modal genérico de negativa. A imagem de "Acesso ao módulo restrito" representa um comportamento que deve desaparecer no fluxo normal.

## Mudanças P0
- Opções para contas Pessoa: **Padrão 30m/12h**, **24h por login (sem timeout de inatividade)**, **Não expirar na estação confiável fixada**. Salvar o perfil revoga sessões anteriores de forma auditável como já ocorria.
- A duração escolhida **não modifica as permissões selecionadas**. A sessão permanente passa a carregar exatamente os grants ativos do usuário. **Não** muda a propriedade de permissões na base; API continua revalidando autorização por operação.
- A sessão sem expiração exige simultaneamente: conta pessoa não administradora principal, senha definitiva, workstation ativa/aprovada, `allowPersistentOperationalLogin`, máquina fixada, e escopo que inclua a máquina. O principal operacional continua limitado **à máquina fixada**; não expande acesso global a máquinas.
- Sessão `daily` persiste cookie seguro por 24h absolutas e ignora apenas o limite de inatividade, sem estender a validade. Não altera a sessão padrão 30m/12h nem a sem expiração, e não há nova migration (campo `sessionPolicy` já é String).
- Checagens de validade e status/remote-logout de workstations tratam `daily` como válido quando ainda está nas 24 horas. Sessões revogadas, mudança de permissões/versão, estação desativada, logout remoto, troca de senha e novo login de outra conta mantêm suas revogações.
- Negativa real ou falha de consulta em rota de módulo retorna ao Hub sem modal de bloqueio. Identificação central obrigatória continua disponível; front jamais monta conteúdo operacional quando o backend não confirmou o acesso.

## Limites importantes
- Cookies HttpOnly nunca são compartilhados entre navegadores. Um novo navegador requer sua própria identificação inicial e identidade de workstation aprovada; sem essa etapa não há como garantir sessão sem login de modo seguro.
- Para uma conta que escolheu `persistent`, mas entrou fora das condições de confiança, o servidor emite sessão padrão, nunca concede permanência sem pin/trust. Isso requer verificação de configuração no notebook.
- A duração não contorna confirmação por senha das ações sensíveis, autorização da API, escopo, CSRF nem a exigência de HTTPS. Não altera CLI, banco industrial, PLC, hardware, flags, KPI ou histórico.

## Testes
`server/src/access/sessionDurationPolicies.test.ts`, `persistentOperationalSessions.test.ts`, `persistentOperationalResolve.test.ts`, `tests/persistentSessionEligibility.test.ts`, `tests/technicianGlobalAvailability.test.ts`, `tests/directModuleGate.test.ts` e suíte CI completa.

**Homologação física ainda necessária:** logar em estação confiável, confirmar `persistentOperational=true` no contrato central, refresh/navegação/reabrir o mesmo navegador, e duas sessões independentes do mesmo login. Verificar logout remoto/revogação/estação desativada; conta diária permanece 24h absolutas, não além. CI/testes automatizados não substituem esse teste.


## Correção complementar P0 — Firefox e não expirar — 15/11/2026
**Evidência operador:** um perfil de Produção em Firefox, com a tela da máquina fixada, solicitou login novamente após permanecer ocioso. Foi identificado no código da `main 3d1834b9...` um conflito objetivo: a seleção completa do grupo ANDON inclui `calls.cancel.any`, `machines.status.write`, `diagnosis.edit` e `workstations.screen.unlock`, que não pertenciam à antiga allowlist de sessão permanente. Quando o perfil solicitava a política `persistent`, o servidor emitia um cookie **com limite de 12h e expiração por inatividade de 30 minutos** sem informar o motivo. A correção SEC-21 elimina o filtro fixo de grants e preserva todas as permissões escolhidas; ainda exige estação confiável, ativa, aprovada e máquina fixada.

### Defesa contra a recorrência
- O backend possui `persistentOperationalBlocker()` como única avaliação de pré-requisitos com motivos discretos (política, conta não elegível, senha provisória, aprovação, confiança, máquina fixada, escopo, permissões). O login registra código neutro de bloqueio na auditoria, não senha/ID de cookie/segredo, e retorna `sessionPolicy`, `persistentOperational` e `persistenceBlocker`.
- O Hub obtém do servidor o estado **real** da sessão. Mostra `Sessão sem expiração confirmada pelo servidor` ou um aviso de que a política está configurada mas o cookie emitido não é permanente. O painel de login informa o motivo exato e orienta a corrigir a configuração; o operador nunca acredita estar protegido por sessão permanente sem confirmação.
- Uma falha pontual de rede na checagem de módulos não gera automaticamente retorno ao Hub. A tela protegida assume estado neutro de indisponibilidade, sem expor dados nem solicitar login novamente, e tenta recuperar conexão a cada 5s / evento online. Revogação real continua sendo aplicada pelo servidor.
- Nenhum mecanismo restaura cookies ausentes, compartilha sessão entre browsers ou converte uma sessão padrão existente em permanente. Depois de confirmar a política e a confiança na workstation, é necessário um novo login uma única vez. Navegação privada, exclusão de cookies, mudança de endereço de origem ou identidade de workstation podem invalidar a sessão e exigem diagnóstico separado.

### Teste obrigatório de homologação no notebook
1. Confirmar **conta Pessoa ativa / login não expirar / permissão ANDON integral**, workstation aprovada/ativa com **Não expirar login operacional** ligado, máquina realmente fixada no Hub e dentro do escopo do perfil.
2. Fechar sessão anterior por logout, entrar **uma vez** no Firefox em janela normal (não privada) e verificar no Hub a mensagem **Sessão sem expiração confirmada pelo servidor**. Em `GET /api/access/session`, consultar somente `principal.persistentOperational === true` — **não copiar tokens, cookies, headers ou senha**.
3. Recarregar a página e deixar a tela fixa sem interação por mais de 30 min. Não deve solicitar login novamente. Reabrir o mesmo Firefox (sem limpar cookies); verificar sessão ainda válida. Repetir em segundo navegador com o **mesmo usuário e UUID da estação**, cada um com seu próprio login inicial (não compartilham cookies).
4. Simular falha breve de API/rede: a interface não deve pedir senha nem liberar dados enquanto não confirmar acesso; ao recuperar conexão, retornar sem novo login. Verificar logout remoto, revogação de confiança, mudança de usuário, alteração de permissões e desfixação invalidando sessões conforme os controles existentes.
5. Em estação sem confiança, login do perfil `persistent` deve informar que **a sessão sem expiração não foi ativada** e orientar o Admin. Nunca informar sucesso de permanência quando `persistentOperational === false`.

**Limites:** a CI não valida políticas de privacidade específicas do Firefox e não substitui teste físico. Nenhum trabalho foi executado no servidor industrial.
