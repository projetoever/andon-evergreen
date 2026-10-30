# UX-13 — Intensidade do alerta por terminal (issue #291)

## Implementação em branch de PR

- O painel principal apresenta botão acessível com estados **Discreto** e **Destacado** e `aria-pressed` (PT, EN, ZH tradicional).
- **Discreto** permanece exatamente como o comportamento de fábrica (contorno pulsante vigente, sem preenchimento extra).
- **Destacado** aumenta moderadamente o halo e coloca fundo translúcido vermelho em `danger` e amarelo em `warning`, gerados pelo mesmo `getDashboardCardAttentionTone` que já calcula estado de produção e status real do chamado.
- O fundo é desenhado **atrás de todo o conteúdo** pelo pseudo-elemento `::before`, com `isolation:isolate` e `z-index:-1`; textos, ícones e controles não recebem opacidade. A animação evita estrobo e respeita `prefers-reduced-motion` (contorno estático).
- Preferência local ao navegador: `andon.dashboardAttention.v1`, default `discreet`, sincronização entre abas por `storage`; terminais distintos mantêm preferências separadas.
- O modo visual não modifica status, diagnóstico, prioridade, tempos, KPIs, sons, APIs, GPIO, Node-RED, PLC, regras de credenciais nem o tema local UX-11.
- Nenhuma dependência de persistência global UX-12. Cores críticas `danger`/`warning` permanecem sem customização global.

## Homologação antes do merge

- CI backend, frontend, regressão `dashboardCardAttention`, SSR e instalador.
- Conferir visual de vermelho/amarelo, normal, atendimento, acompanhamento, máquina não programada e múltiplos chamados simultâneos.
- Testar recarga, duas abas, dois perfis isolados e kiosk em 16:9, desktop e mobile; contraste e `prefers-reduced-motion`.
- Garantir que não há deploy na Evergreen/M37, nem alteração em banco industrial.

Documentar este botão no README geral após homologação do pacote, segundo `docs/PLANO_DOCUMENTACAO_RELEASE_ANDON_20261030.md`.
