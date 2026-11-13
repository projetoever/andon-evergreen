# REFINE 19 — CALL-19A | Subcategorias operacionais e modal de seleção

Data: 13/11/2026. Escopo: corrigir UX e comunicação do fluxo existente sem desbloquear feature flags nem alterar o ciclo dos chamados.

## Diagnóstico
- O sistema **já tem** modelo de motivos/subcategorias, API administrativa, endpoint operacional com lista autorizada e modal pai → especialidade em `MachineDetailPage`.
- A seleção envia IDs e revisões ao endpoint de abertura; o servidor confirma autorização e políticas na transação.
- Na tela de máquina, quando uma subcategoria já possui chamado ativo no mesmo `legacySubtype`, escolher a opção seleciona o chamado em vez de abrir duplicado.
- A descrição da aba Config > Motivos e subcategorias estava desatualizada: dizia que o catálogo ainda não altera os botões operacionais, embora a abertura hierárquica já esteja disponível sob liberação independente.

## Implementação
- Modal indica **Chamado já aberto** para especialidades cujo setor já possui chamado ativo na máquina.
- A ação passa de **Continuar** para **Selecionar chamado existente** quando o item selecionado está ativo; continua chamando `onSelect` e o pai seleciona o chamado, nunca faz nova abertura.
- Botões com nome acessível e informação de estado; responsividade do modal aprimorada com larguras `vw` e alturas `dvh` válidas, mantendo seleção por teclado/touch.
- Texto do cadastro esclarece que os motivos alimentam os botões somente quando fluxo hierárquico está habilitado e que editar apresentação não promove classificação/KPI.
- Traduções PT/EN/ZH e teste de regressão.
- Sem alterar API/schema/ACL/flag, sem ativar ou desativar recurso na fábrica.

## Critérios de aceite
1. Ao clicar categoria, abre modal correto. Especialidades disponíveis agrupadas e texto sem corte no desktop e smartphone.
2. Uma especialidade livre oferece **Continuar** → OS e condição da máquina, preservando IDs e revisões.
3. Uma especialidade com chamado aberto oferece **Selecionar chamado existente** e foca o chamado anterior, sem POST duplicado.
4. Sem opções ativas: aviso e nenhuma ação de abertura.
5. Modal não cria chamado antes do preenchimento de condições, e perda de API não faz fallback inseguro ao modo legado.
6. CI Windows/Linux/PG/frontend e teste visual posterior no notebook oficial, com flag habilitada somente quando autorizada.
