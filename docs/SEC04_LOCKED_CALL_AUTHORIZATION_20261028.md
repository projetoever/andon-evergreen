# SEC-04/2A.2 — Revalidação sob lock para início de atendimento

Data: 28/10/2026. Roadmap #232, após PR #246.

## Objetivo e implementação

Nova função isolada `authorizeCentralAttendanceAfterLock` em `server/src/access/centralCallTransactionalGuard.ts`. Chamada **dentro** de uma transação interativa Prisma já iniciada pelo servidor, ela:

1. Exige identidade, sessão, vínculo de workstation, módulo, permissão `calls.attend` e escopo de máquina **antes** de consultar um chamado.
2. Resolve a máquina pelo registro real do chamado; outros equipamentos retornam 404.
3. Adquire o `lockMachineFlow(tx, machineId)` **existente**, preservando a ordem e o identificador do advisory lock utilizado nas transições atuais.
4. Relê o chamado após o lock e recusa máquina alterada, situação diferente de `open` e registros `isSystemTest`.
5. Valida máquina ativa antes de devolver apenas o contexto de leitura para a futura transição.

Testes isolados verificam ordem `read -> advisory lock -> re-read`, mudança concorrente de estado ou máquina, permissões negadas sem consultas, máquina estrangeira, chamada ausente, teste do sistema e máquina inativa.

## Limitações intencionais

- **Nenhuma rota invoca a função ainda.** O modo central continua negando absolutamente toda operação de escrita por usuários humanos.
- O retorno não executa atendimento nem concede autorização final. A integração futura deverá revalidar sessão/permissões atuais sob a mesma transação, executar verificações de técnico/PIN e regras de exclusividade/concorrência já existentes, e registrar auditoria durável antes do commit; nenhuma dessas etapas é presumida pronta.
- Não reutilizar como bypass do `assertMaintenanceCompletionWorkstation`; conclusão, acompanhamento, cancelamento e edição de diagnóstico permanecem fora deste pacote.
- Não criar novo advisory lock nem mudar Node-RED, GPIO, Máquina 37, banco ou serviço produtivo.
- A validação industrial será efetuada separadamente, com aprovação e rollback.

Sem ativação `ANDON_CENTRAL_ACCESS_ENABLED`, deploy ou migrations.
