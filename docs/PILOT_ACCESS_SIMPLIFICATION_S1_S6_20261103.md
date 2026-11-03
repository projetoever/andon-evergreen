# ANDON Evergreen — acesso simplificado para piloto industrial

**Aprovado pelo responsável em 03/11/2026.** Implementação incremental; `main`/CI não significam implantação na fábrica. Máquina 37, Node-RED, mini PC/GPIO, PostgreSQL e serviços industriais continuam inalterados.

## Objetivo e limites imediatos

Um único login humano no Hub; Admin com controle exclusivo das contas; Gerente com acesso operacional amplo mas sem administração de identidades; Manutenção com atendimento/BI; Produção com ANDON. As verificações da API por permissão, escopo e workstation permanecem obrigatórias. As opções avançadas devem ser reveladas somente por escolha explícita de Admin.

Esta primeira entrega **não ativa o modo central na fábrica**, não migra nem elimina credenciais antigas, não amplia as rotas de escrita e não concede novos privilégios automaticamente a usuários já cadastrados. Ela oferece seleção inicial de perfis no cadastro central e conserva edições históricas.

### Estado atual comprovado pelo código

- `server/src/access/sessions.ts`: sessão humana normal 12 h no máximo, **30 min de inatividade**, estendida somente por `POST /api/access/interaction` após gesto humano real; o frontend limita as chamadas a uma por minuto. A atualização periódica dos módulos não deve renovar sessão. Operações críticas passam por `assertRecentAdmin`, hoje com exigência de reautenticação após **5 min** desde o login.
- `server/src/security/adminAuthorization.ts`: login e sessões de Admin legadas separados (8 h). `server/src/routes/adminAuth.ts` ainda autentica a senha global antiga para rotas administrativas e recuperação. A instalação nova prepara primeiramente a senha global; `/api/access/initialize` usa a senha legada para criar a conta central. A coexistência é real, não apenas cosmética.
- `server/src/security/workstationAccess.ts`: no modo central, escritas só passam por adaptadores com autorização explícita; o restante deve falhar fechado. **Jamais substituir por um bypass genérico de Admin ou aceitar perfil textual como autorização.**
- `src/services/accessRolePresets.ts`: listas de permissões propostas explicitamente; `server/src/access/users.ts` persiste e audita as permissões reais, com controle de versão e sessão principal validada.

## Entregas e gates de segurança

### S1 — Login e ciclo de sessão (pendente de implementação funcional)

1. Criar inventário testável de todas as rotas que exigem `admin-auth` ou senha de módulo, inclusive configuração, catálogos e Prioridades; classificar leituras/escritas e validar guardas no modo central.
2. Adaptar cada operação necessária ao backend central sob HTTPS, origem, cookie HttpOnly, CSRF, workstation aprovada, ACL por ação, audit e transação/rollback. **Nenhuma equivalência global entre token legado e sessão central.**
3. Executar migração assistida por instalação com comprovação da senha antiga e reautenticação central, backup/rollback, revogação de sessões legadas e teste de que a senha antiga foi recusada. Após provar cobertura da API, retirar o hash/uso da senha legada do caminho cotidiano. Para instalação nova, criar Admin principal em bootstrap local confiável, sem `123456` ou duas credenciais visíveis.
4. Ajustar interface de reautenticação para ações críticas sem derrubar a sessão normal, e comprovar 30 min de inatividade, 12 h de validade absoluta, interação real, perda de rede, várias workstations, logout/revogação. Não reintroduzir **30 segundos** como timeout por engano.
5. Manter rollback que não reabilite senha fraca; homologar com dados fictícios no notebook, sem trocar as credenciais reais durante o desenvolvimento.

### S2A — Cadastro simples (primeiro pacote efetivamente codificado)

- Perfis simples **Produção**, **Manutenção** e **Gestor/Gerente**; o Admin principal é uma conta especial, criada pelo bootstrap, nunca uma opção de cadastro comum.
- Novo cadastro começa com Produção e permissões mínimas, selecionando máquinas explicitamente. Selecionar outro perfil em modo simples aplica somente as permissões aprovadas no catálogo do servidor; o servidor permanece autoritativo.
- O modo avançado retém o editor granular e a conta `Líder` legada, mas não é aberto por padrão para novos colaboradores. Se uma conta tiver concessões personalizadas, é editada em modo avançado sem alterações invisíveis.
- A volta para modo simples **exige ação explícita** porque substitui as permissões personalizadas. Nomes dos perfis nunca concedem privilégios no backend.
- **Não inclui ainda** liberação gerencial das configurações Hub, perfis customizados persistidos, migração de senhas, nem edição das permissões do servidor fora da atual política. São entregas seguintes, com testes dedicados.

### S2B — Permissões do Gerente e navegação (próximo PR)

- Separar `hub.settings.read/write`, `workstations.read/manage` e `users.manage` com gates separados e auditáveis. Acesso de Gerente a ajustes operacionais sem aba Usuários/segredos, tanto em UI quanto nas rotas; nunca apenas esconder um link.
- Uma sessão por pessoa, workstation aprovada, acesso em diversas workstations sem duplicação de usuário. Os módulos devem exigir sessão central, não senhas redundantes.

### S3 — Remover senhas dos módulos (próximos PRs)

Inventário e migração de ANDON/BI/Prioridades com teste negativo de acesso por URL direto, versão e credencial legadas. A aba `Módulos e senhas` é removida somente após comprovar que nenhuma rota ou cliente industrial depende dela.

### S4 — Integrações não humanas (bloqueio obrigatório antes da fábrica)

Identidades de serviço separadas para Node-RED M37 e mini PC GPIO. `docs/INDUSTRIAL_SERVICE_IDENTITY.md` já cobre `machines.read`, `calls.read`, `sound.read`, credencial cliente com rotação e token de 8 h. **Não se conhece ainda a compatibilidade completa do cliente real**, que não está neste repo. Inventariar exatamente os payloads 7–12, estado de sirene, falhas/reconexões e quais operações fazem escritas; ampliar escopos individualmente somente se autorizado. Preservar o modo industrial atual até testes físicos.

### S5 — Workstations e presença (próximos PRs)

Presença observada com heartbeat curto (hipótese de 15 s, degradar após 45 s) distinta de sessão humana e do `lastSeenAt` histórico de 15 min. UI identifica usuário válido, estação, IP, módulo, versão, revogação, e arquivamento lógico. Não arquivar máquina com atendimentos, kiosk/estação vinculada ou cliente industrial em uso; reter logs e UUID. Não associar workstation automaticamente por IP.

### S5/1 — Presença online comprovada por heartbeat (implementação aditiva)

- `workstations.lastHeartbeatAt` é opcional e **não é preenchido artificialmente** a partir do `lastSeenAt` antigo; equipamentos legados sem heartbeat aparecem como presença desconhecida.
- `POST /api/access/heartbeat` exige HTTPS/origem autorizada, CSRF da sessão central, workstation ativa/aprovada e conta pessoal com sessão normal válida. A escrita condicional é serializada com a identidade do usuário e atualiza **apenas** `lastHeartbeatAt`; não atualiza `lastInteractionAt`, não renova as 12 horas nem a confirmação Admin.
- O navegador em modo central, quando visível e autenticado, envia batimentos a cada 15 segundos. Ao ficar oculto, perder a rede, expirar sessão ou revogar conta, para de reportar; **online** exige heartbeat com até 45 segundos, sessão central válida e workstation aprovada. Não inferir presença por IP, nome da estação ou último login.
- Lista de workstations e resumo Admin apresentam online / offline / desconhecido, último heartbeat e usuário central válido em campos distintos; textos localizados PT/EN/ZH-TW.
- Como todo heartbeat é uma observação, não é criado evento de auditoria a cada 15 s. O histórico de login e as ações administrativas continuam auditados nos endpoints próprios.
- **Pendente**: S5/2 arquivamento lógico seguro, presença de clientes industriais não humanos, homologação multi-terminais e testes de perda de rede/retorno no notebook. A migração SQL deste PR **não** foi aplicada na fábrica.

### S6 — Entrega industrial

CI Windows, backend/PG, Playwright, matriz de ACLs e fontes PT/EN/ZH; homologação notebook e dois terminais; validação dos indicadores BI, HTTPS e contratos Node-RED/GPIO; backup e rollback; autorização expressa para implantação. **Nenhum merge é um deploy.**

## Critérios de aceite do S2A

1. Novo usuário Produção: três permissões propostas conforme catálogo (`andon.read`, `calls.open`, `calls.cancel.own`), sem gestão de pessoas, BI ou workstation.
2. Gerente e Manutenção: conjunto próprio de permissões, sem `users.create`, sem gerência de serviços. O Gerente recebe apenas leitura de workstations neste primeiro pacote; gerência terá ACL específica em S2B.
3. Editar usuário com grant adicional ou perfil Líder: modo avançado, grants preservados. Trocar para modo simples requer ato explícito e não é possível em kiosk inativo sem antes revisar a conta.
4. Testes de traduções PT/EN/ZH, responsividade, bloqueio ao salvar usuário com dados inválidos; testes da API continuam verificando permissões reais e aprovações de workstation.

**Nota de operação:** não executar `ANDON_CENTRAL_ACCESS_ENABLED=1` no servidor da Evergreen para provar este pacote. Configurar somente no notebook isolado e com rollback preparado.
