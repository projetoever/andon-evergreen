# UX-07 — Transições e estados visuais dos módulos (29/10/2026)

## Objetivo
Navegação com aparência de produto entre Hub, Administração, ANDON, ANDON BI e Página de Prioridades; feedback visual confiável enquanto permissões e dados são obtidos da API. Priorizar segurança de operação em tempo real sobre animações decorativas.

## Implementação
1. **Transição de páginas:** `andon-screen-enter` aplica reveal em opacidade de 140 ms somente na entrada de uma página (sem deslocamento/layout transform, atraso artificial, overlay global ou efeito no update de máquina/chamado). `andon-panel-enter` 110 ms em mudança de aba de Admin/BI. `prefers-reduced-motion: reduce` e impressão desabilitam animação.
2. **Verificação de workstation:** gate de acesso usa skeleton neutro com `role=status` enquanto a sessão/estação está sendo validada. Não exibe visual de erro/restrição antes de obter resposta real; mantém `ModuleLoginPanel` e fluxos de recusa intactos.
3. **ANDON operacional:** `AndonProvider.initialSnapshotState` é apenas observacional: `loading/ready/error`, sem alterar a mutação do domínio, polling, sons ou contadores. Dashboard mostra 8 skeletons **somente quando não há snapshot inicial nem máquinas**; identifica falta de conexão real e lista verdadeiramente vazia separadamente. As próximas consultas continuam tentando recuperar dados. Se já há dados válidos, falhas posteriores de polling não substituem estado da máquina por skeletons.
4. **ANDON BI:** primeiro carregamento de indicadores apresenta skeletons de KPIs/visões, evitando valores inventados/zeros prematuros. Os gráficos/indicadores atuais não têm alteração matemática ou de filtros. Abas exibem transição curta.
5. **Prioridades:** skeletons de linhas, erro explícito com `Tentar novamente` e vazio real distintos. Nenhuma mudança no mecanismo de ordenação, salvamento ou credenciais.
6. **Idiomas:** novas mensagens traduzidas PT/EN/ZH tradicional.

## Critérios de regressão
`tests/uxModuleTransitions.test.ts` verifica classes, preferência de movimento reduzido, providers estáveis, gates de acesso e estados distintos. Segue a suíte normal de UI/API/PG/Windows e navegador no CI. Validação visual real no notebook somente após integração das demais melhorias, conforme pedido do responsável.

## Fora de escopo deste PR
- Alterar regras de conclusão, identidade de workstation, SQL de MTTR/MTBF, permissões centrais de escrita ou serviço industrial.
- Branding administrativo e personalização PDF (PR posterior).
- Confirmação de presença online por heartbeat (demanda telemetria verdadeira).
- Ativação operacional da autenticação central (depende SEC-04 restantes).
- Deploy, migrations, alteração do servidor Evergreen, Máquina 37 ou Node-RED/GPIO.
