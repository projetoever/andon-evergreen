# UX-11 — Tema claro/escuro individual por dispositivo

**Escopo:** issue #288; pacote isolado após integração da segurança de primeira instalação (#297). **Sem deploy industrial e sem alteração de máquina, banco, API, PLC, GPIO ou Node-RED.**

## Implementação inicial

- O tema escuro industrial existente é o **padrão de fábrica e de atualização**. O HTML renderiza `class="dark"` no SSR e a paleta `:root` conserva todos os tokens prévios.
- Um usuário pode escolher o modo claro no botão que acompanha o seletor de idiomas, presente nas telas do Hub, ANDON, BI e Prioridades. O botão oferece rótulo PT/EN/ZH-TW, `aria-pressed` e foco por teclado.
- A opção é salva em `localStorage["andon.theme.v1"]` e aplicada à raiz do documento depois da hidratação; o evento `storage` sincroniza abas da mesma origem/perfil. Não há propagação para outras workstations, outros perfis de navegador ou configurações globais no PostgreSQL.
- Quando o armazenamento está indisponível ou contém valor inesperado, volta ao modo escuro. Não há auto-deteção de tema do sistema que altere inadvertidamente a TV da fábrica.
- A paleta clara só altera cores estruturais e seus tokens semânticos de contraste, preservando a significação de perigo/vermelho, atenção/amarelo, confirmação/verde e informação/azul. O seletor não modifica estado operacional, áudio, prioridades ou indicadores.
- Nenhuma senha, login, workstation UUID, PIN ou token é armazenado com a preferência visual.

## Aceite e limites

1. Confirmar CI `test:ui`, build SSR e screenshots de desktop, kiosk e mobile antes de merge.
2. Exercitar tema em Hub/ANDON/BI/Prioridades, menus e modais, gráficos, tooltip, histórico, teclado virtual, alertas e impressão/PDF; validar contraste e acessibilidade AA.
3. Validar dois perfis/browser contexts isolados e atualização de página; o padrão antigo deve continuar escuro.
4. Certificar que os alertas de parada não perdem cor/texto nem deixam de pulsar conforme a regra já existente e `prefers-reduced-motion`.
5. **Fora do escopo:** UX-12 (#289), paleta global com restauração; UX-13 (#291), intensidade Discreto/Destacado dos cards. Não misturar persistências.

**Status:** implementação submetida para CI; a aprovação manual visual e o merge exigem validação própria. Este documento registra a funcionalidade para atualização posterior do README e dos manuais, sem afirmar homologação industrial.
