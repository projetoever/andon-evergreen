# PENTE 2 — Paridade visual com Histórico Global (24/11/2026)

## Contexto e governança

- Referência visual e técnica: `src/pages/GlobalCallHistoryPage.tsx` na `main@9006a2b72e8409292b3f2e9f5f839437051ff2f7`, após PR #627.
- Origem Prioridades: `src/pages/DashboardPriorityPage.tsx` nessa mesma SHA.
- Branch isolada: `pente/02-priorities-history-visual-parity-20261124`.
- Issue: #614. **Sem merge na main até autorização explícita do responsável.**
- Não houve mudança em servidor industrial, esquema/SQL, produção, BI, CLP ou Node-RED.

## Diferenças observadas (auditadas no código)

| Critério | Histórico Global | Prioridades antes | Refinamento |
|---|---|---|---|
| Frame | `max-w-[1800px]` | `max-w-5xl` (1024px) | 1800px e paddings equivalentes |
| Cabeçalho | Ícone 24px, titulo responsivo e ações `sm` | botão voltar, ícone 20px, titulo fixo | cabeçalho compacto, módulo, atualização, idiomas, links compartilhados |
| Lateral | 330–410px | 240px | sidebar 260–320px, nav sticky e mobile Sheet preservados |
| Filtros | recolhíveis, active/pending states | filtros sempre visíveis | recolhimento, contador, limpeza e indicação de aplicação imediata |
| Registros | cartões com status e contexto | linhas compactas | cartões com prioridade, ID, ativação de cadastro, programação e ação de histórico autorizada |
| Status de produção | não faz parte da listagem global | badges visualmente distintos | componente único com ícones/texto e contraste emerald/amber + dark |
| Histórico | página lista+detalhe, dados reais | prioridade audit trail | cartões de auditoria sem inventar timestamps ou identidades |

## Contratos preservados e limitações

1. `activePriorityRanks` permanece baseado nas primeiras cinco máquinas **ativas**, nunca em `productionMode`.
2. Os três filtros existentes alteram apenas a renderização. `rows` e `savedIds` continuam contendo a sequência completa, inclusive as máquinas ocultas. `reorderVisiblePriorityIds` mantém slots ocultos. O salvamento ainda envia `saveDashboardPriorityOrder(rows.map(...), savedIds)` para CAS server 409.
3. As regras de sessão/autorização para programação não foram tocadas: `production.schedule.write` sem senha repetida, `production.schedule.request` com credencial de aprovador; workstation, CSRF, escopo, auditoria e eventos ficam no backend.
4. O snapshot `GET /api/dashboard-priority/order` disponibiliza `isActive` (situação **cadastral**), `productionMode` e `productionModeChangedAt`, mas **não** status operacional ao vivo nem contagem de chamados. Não é seguro atribuir dados que não existem à UI. Em vez disso, o botão de Histórico da máquina é mostrado **somente** quando `globalHistory.available && globalHistory.allowed` e `centralAccessEnabled`. A rota `/history?machineId` continua com autorização por máquina no servidor.
5. `ModuleNavigation showModuleLinks` e `PrioritySectionNav` são reutilizados, e os badges têm componente compartilhado específico de Prioridades. Não refatorar Histórico Global só para deduplicar classes se isso gerar risco de regressão.
6. PT-BR, EN e zh-TW para todas as mensagens novas, tema claro/escuro e interações por teclado/toque.

## Homologação visual — comparação lado a lado

Depois do CI e **antes de merge**, comparar Histórico Global x Prioridades na mesma sessão e zoom de navegador, preservando tema, idioma e permissões:

- Desktop 1920×1080 e notebook 1440×900: conteúdo e cabeçalhos na mesma largura, margens, paddings e posição dos ícones; sidebar proporcional; cartões alinhados, não esticados.
- Tablet 768×1024: navegação local via botão/drawer, filtros usáveis em colunas responsivas, cards sem overflow.
- Mobile 390×844 e 360×800: header wrap sem cortes, foco visível, navegação touch/Sheet, filtros expandir/colapsar, badges textuais e botões de movimento sem horizontal scrolling.
- Tema claro/escuro: verde = programada; âmbar = fora de produção, ambos com texto + ícone e contraste.
- PT-BR/EN/zh-TW: sem textos faltantes, duplicação de controles nem overflow de legenda.
- Perfis Admin/global, somente leitura, selected, sem histórico e sem programação: ícones e ações exclusivamente autorizados.
- Reordenação de lista filtrada (duas máquinas invisíveis), desfazer, salvar, confirmação de navegação com alteração suja e conflito 409 entre duas estações.
- Usuário `production.schedule.write` altera diretamente sem senha repetida; request-only usa aprovador; nenhum fluxo de alteração de programação foi reimplementado na página.
- Botão **Histórico** aparece apenas para escopo autorizado, navega com ID correto e é novamente autorizado pela API de Histórico Global.
- Screenshots reais do notebook/runner de browser exigem execução interativa e são evidência separada dos testes estáticos de layout.

## Matriz de entrega

| Item | Código | CI | Homologação notebook |
|---|---|---|---|
| Frame 1800/header | implementado na branch | pendente | pendente |
| Sidebar, filtros colapsáveis | implementado na branch | pendente | pendente |
| Cartões, badges/ícones, acesso ao histórico | implementado na branch | pendente | pendente |
| Regressão ordem/programação/autorização | contratos preservados | pendente | pendente |
| i18n/light-dark/mobile | implementado na branch | pendente | pendente |

**Regra de decisão:** CI verde libera revisão da PR, **não** autoriza merge ou instalação em notebook/fábrica. O usuário explicitamente proibiu o merge automático.
