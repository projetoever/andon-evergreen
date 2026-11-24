# PENTE 5 — Refinamento leve do Config ANDON (24/11/2026)

## Escopo e baseline

- Base `main`: `e7a0052aaa156ae625e51e82ad147b34260bdd79` (merge aprovado PENTE 4).
- Tela observada: painel administrativo `/andon/admin`, aba **Mantenedores**, captura fornecida a 1666 × 896.
- Solicitação: alongar a lista até a base da ficha à direita e revisar o painel visual/navegação sem modificar funcionamento.
- Branch de trabalho: `pente/05-config-andon-ux-20261124`. **Não integrar à main até validação/autorização do responsável**.

## Diagnóstico

Na aba Mantenedores, o painel esquerdo tinha altura fixa `md:h-[calc(96dvh-13rem)]`; a ficha direita variava conforme campos, seções e espaço disponível. Em larguras grandes isso deixava um vazio abaixo da lista, apesar de o formulário continuar até o rodapé. O shell administrativo possui rolagem própria; ao trocar a aba, podia preservar o scroll anterior.

## Alterações visuais de baixo risco

1. **Mantenedores:** a linha do grid é dimensionada pela ficha da direita. Um invólucro de coluna relativa permite que o painel esquerdo seja `absolute/inset-0` **somente a partir de `xl`**, preenchendo a mesma altura, sem depender de cálculo de viewport. A lista interior flexível ocupa o espaço restante com rolagem independente.
2. **Telas menores:** até `lg`, uma coluna única, com a lista limitada a `55dvh` (mínimo de leitura) e rolagem própria; evita deixar formulário estreito no split de 280px/1fr. Em telas muito altas/baixas não há corte do formulário.
3. **Acessibilidade:** região rolável com rótulo e `tabIndex=0`, foco visível; mantém filtros, contador, seleção e botão Adicionar.
4. **Navegação:** ao mudar de aba do ANDON, somente a rolagem do conteúdo volta ao topo. A capacidade é opt-in no shell compartilhado, **não ativada no Hub**.
5. **Dicas e foco:** menus do shell exibem a descrição da aba como `title` e links da barra horizontal mostram foco por teclado.
6. **Regressão:** testes estáticos atualizados em `tests/adminUxRefinementA.test.ts` e `tests/adminConsoleLayout.test.ts`.

## Varredura das abas (achados, sem mudança neste pente)

- **Mantenedores:** desigualdade de alturas identificada e tratada.
- **Configurações da operação, Aparência e cores, Modo de atendimento:** mantidas, evitando mudanças em regras e formulários estáveis.
- **Sons, Turnos, Setores/categorias, Classificações e Catálogos de ativos:** algumas listas têm `max-h-[calc(96dvh-22rem)]`, que pode criar espaços ociosos com fichas longas; **candidatas à mesma abordagem depois de homologar Mantenedores**, não alteradas nesta PR.
- **Grupos de chamados:** possui lista própria com `max-h-[min(62dvh,36rem)]`; nenhuma alteração, dado o acoplamento ao fluxo de catálogo e KPI.
- **Máquinas:** já usa grade responsiva e lista interna rolável; comportamento preservado.
- **Sidebar:** hierarquia Sistema / Operação / Cadastros / Infraestrutura e ligação para retorno mantidas. A barra horizontal em mobile continua sendo o fallback existente.

## Testes de aceite no notebook

- Em desktop 1920×1080 e 1366×768: **a borda inferior da lista esquerda coincide com o fim da ficha direita**, sem vazios e sem barra de rolagem horizontal.
- Em 1024×768, tablet/mobile 768×1024 e 390×844: ficha aparece após a lista, sem campos esmagados; lista tem rolagem própria.
- Com 0, 5 e dezenas de mantenedores: última entrada alcançável com mouse, toque e teclado; busca, filtros ativos/inativos, setor, turno e contador funcionam.
- Selecionar registro, novo cadastro, cancelar, salvar/inativar/reativar e aviso de alterações pendentes: resultados funcionais idênticos à baseline.
- Rolar ao fim em uma aba, escolher outra: exibe o início da nova aba (sem manter scroll antigo); sidebar e retorno continuam funcionais.
- Confirmar permissões/gates centrais, PIN/RFID protegidos; nenhum ajuste de API ou de regras foi feito.
- Verificar temas escuro/claro, foco e contraste, navegação em Chrome e Firefox.
- Validação técnica pelo CI e, somente depois de aprovação, merge; **nenhuma instalação automática em ambiente industrial**.

## Fora do escopo

Sem alterações em `server/`, autenticação, classificação, grupos, BI, métricas, tempo, API, banco de dados ou instalador.
