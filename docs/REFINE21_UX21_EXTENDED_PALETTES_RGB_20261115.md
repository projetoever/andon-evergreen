# REFINE 21 — UX-21 | Paletas industriais ampliadas e seletor RGB compacto

Data: 15/11/2026. Base congelada do notebook: `3d1834b9c0c1c6a5edca691fb309c06e9544b422`.

## Solicitação e implementação
A tela Aparência e cores apresentava seis paletas prontas que só mudavam contornos. A composição agora possui **10 propriedades globais**: os seis acentos legados e quatro propriedades novas independentes — `dashboardBackground`, `machineSurface`, `failureSurface`, `prioritySurface`. Seis presets existentes ganham tonalidades visivelmente distintas para o fundo do dashboard, cards não críticos, apresentação decorativa de falhas e fundo decorativo do grupo prioritário. Todos os valores são `#RRGGBB` ou acentos nominados já permitidos.

- O fundo e os cards normais usam tonalidade derivada da **matiz selecionada** e da preferência local claro/escuro. O algoritmo fixa luminosidade para manter leitura segura e utiliza a própria cor HEX escolhida como matiz de referência.
- O destaque de falha é estritamente decorativo, com faixa lateral e leve mistura do fundo. Os tokens semânticos `danger`, `warning`, cores físicas de parada, anéis de atenção e severidade permanecem protegidos.
- O grupo de prioridades mantém contorno configurável e ganha fundo próprio. Isto não muda prioridades reais, KPIs ou regras de produção.
- O modal HEX/RGB mantém a grade multicolorida arrastável por mouse, teclado e barra de brilho; exibe agora os campos `R`, `G`, `B` compactos em uma linha, com validação individual de 0 a 255.
- Presets e botões de customização menores; os dez controles ficam em grade mais compacta e a prévia das versões clara/escura foi ajustada.

## Contrato, compatibilidade e risco
O contrato JSON da paleta mantém `version:1` para evitar migrações destrutivas. Paletas históricas com cinco/seis campos são normalizadas para os quatro novos padrões **sem perda** das seis cores originais. O servidor continua rejeitando campos desconhecidos, HTML/CSS, nomes arbitrários, cores alpha e alterações nos tokens de alerta, exigindo revisão otimista, permissão na API, sessão aprovada, CSRF e auditoria para salvar globalmente. A opção de gravação segue **OFF** por default, sem nenhuma mudança de flag.

O cliente apresenta as alterações de forma global apenas quando o operador autorizado clica Salvar globalmente. No notebook, confira os seis presets, os dois temas, destaque visual de chamada com falha, card com parada crítica (sem perder alerta vermelho), grupo prioritário, preenchimento por mouse e campos numéricos. Confirme sincronização entre workstations quando funcionalidade for autorizada.

## Testes
Ajustados `tests/andonVisualPalette.test.ts`, `tests/globalVisualPalette.test.ts` e `server/src/services/andonVisualPalette.test.ts`, com validação de compatibilidade histórica, segurança do parser, tonalidades distintas, contraste mínimo de 4.5:1, variável CSS e RGB compacto. CI Linux/PostgreSQL/SSR/browser/Windows, seguido de homologação no notebook.

**Controle de versão:** branch de desenvolvimento isolada, ainda não integrada à `main`. Não há alteração em banco industrial, CLP, GPIO, Node-RED, sirenes, chamados ou indicadores.
