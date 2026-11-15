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
