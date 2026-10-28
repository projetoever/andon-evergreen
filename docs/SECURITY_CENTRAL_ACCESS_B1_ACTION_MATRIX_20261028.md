# SEC-03 / B1 — Matriz inicial de rotas e ações para acesso central

Data: 28/10/2026

## Objetivo

Preparar a ativação controlada da identidade única no ANDON Web Industrial.
Este PR **não ativa** autorização operacional central e não modifica os hooks
de segurança existentes. Ele cria uma matriz de classificação, revisável e
testada, que servirá como entrada para uma implementação posterior.

## Estrutura

Arquivo: `server/src/access/centralActionRegistry.ts`.

Para cada rota coberta são explicitados:
- método HTTP e caminho correspondente;
- permissão necessária no catálogo existente;
- módulo do ecossistema;
- origem/escopo dos recursos que devem ser validados no banco: máquina na rota,
  máquina no corpo, chamado existente, múltiplas máquinas, coleções ou agregações;
- pendências de regras de domínio (como cancelar chamado próprio vs. qualquer).

Rotas não catalogadas retornam `null`, sem autorização implícita.
A identificação de módulo não concede uma permissão de escrita.
A classificação por si só não substitui validação no backend.

## Principais pontos de risco a resolver antes de aplicar

1. **Chamados**: abrir exige verificar machineId do corpo; atendimento, manutenção,
   edição de falha e conclusão exigem resolver máquina e estado do chamado no banco.
2. **Cancelamento**: `calls.cancel.own` e `calls.cancel.any` precisam de uma regra
   de propriedade do chamado e de auditoria; por isso o catálogo retorna permissão
   `null` e aponta a pendência, não libera a ação.
3. **Chamados em lote**: todas as máquinas precisam estar no escopo do usuário.
4. **BI**: filtrar por máquina **antes** de calcular contagens, médias e KPIs,
   incluindo filtros disponíveis e drilldowns, sem vazamento por totais.
5. **Prioridades**: consulta e alteração são permissões diferentes; gravação em
   lote exige validar a lista de máquinas e rastrear o autor.
6. **Workstations**: autorização por usuário, módulo e estação é cumulativa.
7. **Serviços industriais**: Node-RED usará identidade técnica separada;
   mapeamentos 7–12 e GPIO permanecem intocados.

## Não incluído

- Nenhuma modificação de `ANDON_CENTRAL_ACCESS_ENABLED` (permanece desligado).
- Nenhuma rota de produção muda seu comportamento com este catálogo.
- Nenhuma migração, alteração de banco, seed, deploy, firewall ou certificado.
- Nenhum login único ativado para usuários humanos nesta fase.
- As demais rotas do sistema exigem inventário e revisão antes da habilitação.
- Não altera Máquina 37, mini PC, Node-RED, GPIO ou Evergreen.

## Critério para avançar à Fase B2

- Mapeamento validado contra as rotas reais e atualizado quando necessário.
- Funções de autorização implementadas no backend com recursos resolvidos no
  banco, escopo da máquina e auditoria por usuário.
- Testes positivos/negativos com usuários de perfis distintos e máquinas
  dentro/fora do escopo.
- Integridade de chamados simultâneos, sessão exclusiva e responsabilidade
  por atendimento preservadas.
- Homologação industrial e rollback planejados antes de qualquer ativação central.

## Próximo pacote

SEC-03/B2: implementar validação de escopo e recursos para um subconjunto de
rotas de consulta, preservando negação explícita para todo o restante. B3 tratará
as mutações e regras de propriedade com auditoria. Ativação geral apenas após
validação operacional e comunicação Node-RED/mini PC.
