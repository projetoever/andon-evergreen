# REFINE22 / HIST-14 — Acesso autorizado ao histórico na tela fixada
Data: 15/11/2026. Base: main `05e46767faf982d0bebf242738d389622d906fe4`.

## Falha objetiva
A tela fixada já mostra o botão **Histórico**, mas `RootContent` em `src/routes/__root.tsx` força qualquer rota fora de `/machines/{id}`, /hub, BI e Prioridades a retornar imediatamente à página da máquina. A regra indevidamente inclui `/machines/{id}/call-history`, `/machines/{id}/failure-history` e `/history`.

## Ajuste
- A UI recebe do servidor `canReadMachineHistory`, derivado da sessão atual, da workstation ativa/aprovada, `andon.read`, `history.read` e escopo da máquina fixada. Este valor é APENAS uma indicação para mostrar botões e navegação — **nunca autoriza API**.
- A tela fixada libera exclusivamente histórico de chamados/falhas **da mesma máquina fixada** quando autorizado; não libera dashboard geral, edição de estação ou máquinas diferentes.
- O Histórico Global `/history` permanece acessível somente se `globalHistory.available===true` e `allowed===true`, além da permissão anterior. Consultas SQL mantêm escopo da máquina na API e todas as ações de exportação continuam auditadas. O filtro de máquina enviado pela URL não amplia escopo.
- O botão de histórico da máquina só aparece se a condição de leitura estiver confirmada. O botão de desfixar continua exigindo as credenciais e auditoria vigentes. No modo legado explicitamente confirmado, o histórico da máquina mantém o comportamento anterior.
- `canOpenPinnedMachineHistory` é uma função pura, com testes para tela fixada, mesmo ID, máquina diferente, ausência de sessão, flag Global OFF, falta de autorização, modo legado confirmado e links diretos.
- Não altera banco/migrations, ACL, feature flags, chamada, KPI, sensores, Node-RED ou produção.

## Critérios de homologação
1. Workstation confiável fixada na máquina M37, perfil com `andon.read` + `history.read`. Clique no botão Histórico da própria máquina. A página deve abrir sem retornar imediatamente à operação.
2. Em histórico individual, botão Voltar deve retornar à máquina fixada sem desfazer a fixação.
3. Sem a permissão, não exibir o botão; URL manual deve voltar à página fixada. Em outra máquina, URL manual não pode trocar a máquina.
4. Histórico Global só quando módulo disponível e permitido; ele deve exibir somente máquinas no escopo autorizado pelo servidor.
5. Continuar verificando sessão persistente após período de inatividade e impossibilidade de desfixar sem credenciais.
6. CI completa (Windows PS 5.1, Linux PG, backend, frontend/SSR, browser) e revisão da compilação TypeScript.
