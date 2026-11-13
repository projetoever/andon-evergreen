# REFINE 20 — P0 | Disponibilidade global de mantenedores consistente por navegador/perfil

Data: 13/11/2026. Evidências recebidas: Chrome (Admin) na máquina 10 mostra mantenedores ocupados nas máquinas 15 e 32; Firefox (Produção) na mesma máquina 10 os exibe como disponíveis. Terceira imagem: painel "Verificação de elegibilidade" da política de sessão persistente, solicitado remover.

## Causa identificada no código
O modal de início/adicionar atendimento construía `buildTechnicianActiveAssignmentMap(calls, machines, call.id)` a partir de `useAndon().calls`. Entretanto, o GET `/api/andon-calls` central usa `scopedMachineReadIds` e `callMachineReadWhere`; portanto Admin com escopo amplo recebe chamados que Produção restrita não recebe. A **ausência de chamado no snapshot do usuário não prova disponibilidade do mantenedor**. O backend já proíbe atendimento simultâneo em outra máquina dentro da transação, mas a UI permitia selecionar e tentar.

## Correção P0
- `GET /api/technicians/availability?callId=...` exclusivo ao login central, com HTTPS, Origin, cookie/session, workstation aprovada, módulo ANDON, permissão `calls.attend` ou `calls.technicians.manage`, validação da máquina de origem e chamada de manutenção ativa. Retorna APENAS IDs de técnicos ocupados globalmente e carimbo `checkedAt`; NÃO revela outras máquinas/chamados/OS ou histórico fora do escopo.
- Lê sessões reais `technicianSession` no PostgreSQL com `endedAt=null`, excluindo a chamada atual; cruza `technicianId` e nome normalizado para históricos sem ID. Não usa localStorage, cache do navegador, escopo de máquinas ou turno para inferir ocupação.
- O modal com login central verifica ao abrir, a cada 4s e ao voltar ao foco. Se a consulta falha: **bloquear seleção por nome** com alerta e botão de nova tentativa. Uma seleção que fica ocupada é retirada; submit revalida, e o POST original mantém locks/transação/409/sem duplicidade. O modo legado fora do login central mantém a regra local existente.
- O rótulo para Produção diz apenas `Em outro atendimento` (sem expor nome da máquina); Admin também usa o mesmo status global.
- Falhas da API, sessão revogada, escopo não autorizado ou estação pendente bloqueiam leitura.
- Integração PostgreSQL em /andon_test com **Admin e Produção em workstations separadas**; técnico ativo em máquinas externas ao escopo; sessão legada sem ID; finalização libera status; tentativa de leitura de chamado estrangeiro 404; usuário sem grants 403; sessão sem cookie 401; Origin indevido e logout revogam.

## Simplificação do cadastro de sessão
- Remove caixa e lista `Verificação de elegibilidade da conta`.
- Mantém seleção `Padrão` vs `Produção — não expirar` e uma ação opcional compacta, explícita `Usar permissões de Produção 24h`, indicando que substitui grants e exigindo revisão antes de salvar.
- Não muda restrições/allowlist, expiração, policies, aprovação de workstation, revogação e checks de sessão do backend. Um perfil com grants incompatíveis ainda não ganha sessão persistente.

## Aceite no notebook
1. Conferir mantenedores ocupados no Chrome/Admin e Firefox/Produção em máquina 10: ambos devem mostrar os mesmos como indisponíveis. Fazer logout/novo login e repetir; testar manutenção em máquina 15/32.
2. Terminar atendimento na outra máquina e conferir atualização automática de seleção até 4s (adicional tempo de rede).
3. Simular API offline/401/403 no perfil de Produção: **não** mostrar mantenedores como disponíveis nem permitir confirmação por nome.
4. Testar PIN/RFID sob suas autorizações, chamada existente, acompanhamento e concorrência entre navegadores.
5. Em cadastro Pessoa/Produção, trocar para login persistente, ver ausência do painel de elegibilidade e revisar preset opcional, mantendo logout administrativo.
6. CI completa Windows PowerShell 5.1 + Linux/PostgreSQL + SSR/frontend + integridade do servidor; somente então integrar main e atualizar notebook via instalador oficial com backup. **Não instalar ou alterar dados em fábrica nesta fase.**
