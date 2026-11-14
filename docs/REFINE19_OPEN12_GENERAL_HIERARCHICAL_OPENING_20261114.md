# REFINE19 OPEN-12 — Modal geral de abertura com hierarquia (14/11/2026)

## Lacuna encontrada
A tela de máquina (MachineDetailPage) já operava com `GET /api/call-reasons/operational`, motivos pais, especialidades em popup, revisão otimista e snapshots verificados sob lock no backend. Porém `OpenCallModal` do dashboard ainda oferecia `CallTypeSelector` exclusivamente legado, mesmo quando a hierarquia podia estar habilitada.

## Implementação
- Consultar catálogo operacional autenticado somente quando o modal geral abre e conforme política de módulo central: **apenas** `hierarchical_calls_disabled` permite fallback para seletor legado. Qualquer erro 401/403, rede ou catálogo ativo vazio mantém o botão Abrir indisponível e oferece recarregar; nenhuma consulta de catálogo Admin.
- Motivos são exibidos em botões; ao clicar abre o componente já existente `CallReasonOptionsModal` (um popup por vez), selecionando especialidade. Essa seleção traz ID do motivo, ID da opção e revisões esperadas, mais categoria/subtipo legado vinculados. Os valores são enviados no **mesmo** `openCall` individual da tela geral; o servidor valida novamente contra catálogo atualizado, bloqueia SQL (reason/option/area) e cria snapshot na mesma transação do chamado. Zero bypass de ACL/CSRF/workstation/OS/KPI.
- Detectar chamado ativo para mesma máquina/setor e navegar para a máquina, sem criar duplicado. Bloquear clique duplo enquanto API processa. O formulário conserva conjunto/subconjunto, OS obrigatória global+máquina, nota opcional e condição de máquina. Uma falha de escrita não fecha o modal nem limpa entradas.
- Modo legado (sem acesso central ou flag hierárquica explicitamente desligada) permanece funcional. Não ativa flags, não migra dados, não recalcula histórico/KPIs, não cria operações em lote nem comunica equipamentos.

## Qualidade / aceite
Teste contratual `tests/generalHierarchicalCallOpening.test.ts` comparando a interface geral com a tela individual, a API operacional, o contrato transacional, anti-duplicidade e submissão única. CI Windows PowerShell5.1 + PostgreSQL/backend + frontend SSR/desktop/mobile obrigatória. Na futura homologação do notebook (sem mexer na fábrica): verificar abertura geral com flag OFF (legado); flag ON apenas se já aprovada e ativada no ambiente de teste, motivo e especialidade via popup, OS e ativos, abertura individual e snapshot visível no histórico, 403/409 e retry sem fallback indevido, navegação para chamado existente. Não ativar flag como consequência de instalar esta PR. Não declarar homologado até retorno do usuário.
