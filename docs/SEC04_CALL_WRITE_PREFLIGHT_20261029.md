# SEC-04/2A.1 — Preflight de abertura e início do atendimento (28/10/2026)

Roadmap: #232. Continuação da matriz #245, SEM ativar operações centrais.

## Entrega
- Nova função `preflightCentralCallWrite` em `server/src/access/centralCallWritePreflight.ts`, para três ações **e somente elas**: abertura individual, abertura simultânea de setores e início de atendimento.
- Confere sessão da pessoa (`purpose=normal`), identidade da estação vinculada, liberação da estação e do módulo ANDON, `andon.read`, permissão específica (`calls.open` / `calls.attend`) e escopo de máquina.
- Abertura usa um `machineId` não coercivo no corpo; não aceita marcação humana `isSystemTest`, origem de instalador nem atribuição arbitrária de `createdBy`.
- No atendimento, máquina vem **do registro de chamado no banco**, por resolvedor fornecido pelo servidor; nunca do `machineId` do corpo. Não consultar o banco antes de validar identidade/permissão. Chamado inexistente ou fora do escopo resulta em 404.
- A abertura em lote aceita vários setores numa mesma máquina: correção de `machines_from_body` para `machine_from_body` no catálogo de planejamento.
- Testes isolados com autorizações positivas/negativas, estações bloqueadas, máquinas estrangeiras, identidades divergentes, campos reservados, chamadas inexistentes, troca de métodos e ações fora da lista.

## Limites — preservação industrial
**NÃO foi ligado aos handlers nem ao middleware de produção.** `enforceWorkstationAccess` continua rejeitando todas as mutações no modo central, inclusive estas três ações. O helper não é API, não constitui liberação operacional. Os testes de `centralWriteInventory` continuam exigindo a trava de mutação.

Para habilitar no futuro, será necessário executar a verificação novamente **dentro da transação após lock da máquina/chamado**, validar estado atual, sessão técnica, PIN e integridade; registrar auditoria de servidor em conjunto com a mutação e garantir que fluxos Node-RED/GPIO e contas de serviço não sejam afetados. A conclusão e o acompanhamento não estão autorizados neste pacote.

Sem deploy, migrations, certificados, dados reais, alteração nos timings do ciclo de manutenção ou ativação de `ANDON_CENTRAL_ACCESS_ENABLED`.
