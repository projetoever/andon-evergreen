# SEC-03/B2.2 — Consultas de chamados e histórico por máquinas autorizadas

Data: 28/10/2026
Base: B2.1 (PR #223; branch ainda não integrada à main).

## Objetivo

Complementar o acesso restrito por máquina nas consultas do ANDON, sem interferir
nos atendimentos, na origem dos chamados ou na segurança industrial.

## Fluxo autorizado

- Usuário com **Todas as máquinas** continua a visualizar os chamados de
  todo o escopo autorizado, com permissões de módulo verificadas no servidor.
- Usuário com **Máquinas selecionadas** visualiza somente os chamados e o
  histórico das máquinas explicitamente concedidas a ele no cadastro.
- O filtro é aplicado dentro da consulta PostgreSQL **antes** do LIMIT,
  da ordenação e da inclusão de dados relacionados.
- `machineId` fornecido pelo navegador **não sobrescreve** o escopo autorizado:
  a combinação é uma interseção lógica (AND).
- Escopo restrito vazio retorna coleção vazia; não se converte em
  permissão para todas as máquinas.
- O histórico exige ainda a permissão explícita `history.read`, inclusive
  para usuários que tenham `andon.read` e acesso a todas as máquinas.
- APIs de edição, atendimento, cancelamento e finalização continuam bloqueadas
  para sessão central.
- BI, Prioridades, outros relatórios e demais leituras restritas permanecem
  negados até filtros adequados. Sem esconder chamados ou alarmes do fluxo
  operacional legado.

## Rotas

- `GET /api/andon-calls`
- `GET /api/andon-calls/history`

São as únicas novas rotas liberadas para usuários de máquina restrita nesta etapa.
A admissão mantém HTTPS, origem, sessão pessoal e workstation autorizada.

## Testes

- Filtragem de máquina na SQL em ambos os endpoints com parâmetros conflitantes.
- Escopo vazio, escopo global, preservação de datas, status e limite.
- Histórico bloqueado sem `history.read`, inclusive para usuário global.
- Rota desconhecida e BI com escopo selecionado continuam sem acesso.
- CI Windows, build, banco de testes, integrações e UI.

## Implantação

**Não ativar `ANDON_CENTRAL_ACCESS_ENABLED` na Evergreen.**
Ainda faltam autorização de operações, auditoria de ações, proteção dos KPIs
agregados e homologação do Node-RED no mini PC.
O modo legado do ANDON permanece inalterado.

## Dependência

Este PR é deliberadamente *encadeado* à implementação B2.1 (#223).
Para executar o CI, sua base foi temporariamente configurada como `main`,
conforme os gatilhos do workflow existentes. Até B2.1 ser integrado, o diff
contra `main` também exibirá as alterações de B2.1. Não integrar B2.2
antes de B2.1; após o merge de B2.1, revisar novamente o diff, as verificações
de segurança e o CI de B2.2.
