# UX-12/3 — Aplicação da paleta global e controle administrativo

**Pacote dependente dos PRs #302 (migração/leitura) e #303 (escrita auditável). Sem deploy industrial.**

## Interface administrativa

- A tela `Aparência e cores` continua em modo de prévia no **Admin legado**. Ela não salva nem simula alteração global.
- Somente a seção `Configurações do ANDON` da **Administração central do Hub** apresenta `Salvar globalmente`, `Restaurar padrão global` e `Recarregar paleta`.
- As ações globais só ficam habilitadas quando a API informa `andonVisualPaletteWriteEnabled=true`, uma indicação de que as flags de acesso central e da paleta estão ativas. Essa indicação **não substitui** a autorização da requisição, que continua no servidor.
- O botão de gravação envia o preset validado com `expectedRevision` e cabeçalho CSRF ao endpoint exclusivo; a API valida sessão principal, workstation, HTTPS, Origin, whitelist, auditoria, bloqueio de gravação concorrente e rollback.
- Se outro Admin salvar, o erro HTTP 409 bloqueia nova tentativa até `Recarregar paleta` para evitar sobregravação silenciosa.
- Restaurar padrão requer uma **segunda ação confirmatória** específica para toda a empresa, usando exatamente o preset versionado. A restauração também é auditada e respeita a revisão.

## Distribuição para as workstations

- `GlobalVisualPaletteProvider` no root lê `GET /api/system-settings` protegido por autorização já existente.
- Reconsulta a cada **30 segundos**, ao focar a janela ou ao salvar nesta mesma sessão. Pode haver até 30 segundos de defasagem; não se afirma sincronização instantânea.
- A aplicação em CSS usa somente nomes permitidos de paleta, com conversão em valores HEX constantes e previamente homologados para os temas claro e escuro. Nenhum HEX arbitrário pode entrar pelo banco.
- Cinco tokens não críticos: card padrão, card selecionado, setor selecionado, acento de ação operacional neutra e foco. A fase atual aplica a cor global nos cards **sem alerta**, no contorno de seleção do setor, no contorno interno de seleção e no acento de atender; outras aplicações exigem revisão visual antes de ampliar.
- Estão **proibidas** alterações globais a `--danger`, `--warning`, severidade, halo de parada, status, badge, som, GPIO/PLC/Node-RED e KPIs.
- O tema claro/escuro UX-11 e o modo Discreto/Destacado UX-13 permanecem locais. O acento global é traduzido para a luminância de cada tema individual sem alterar a opção local.

## Homologação obrigatória

- Executar build, `test:ui`, testes PostgreSQL de corrida e rollback, CI Windows, HTTPS e browser em ambiente isolado.
- Validar dois terminais simultâneos (preferências locais diferentes) e propagação em até 30 segundos, contraste claro/escuro, alerta danger/warning, seleção de setor e giro de modo de atendimento.
- Conferir `aria-pressed`, foco e `prefers-reduced-motion`; tamanho de botão e layout kiosk 16:9/mobile.
- Validar operação com flag OFF: prévia funciona, porém Salvar globalmente permanece indisponível.
- Backup, migração, rollback e autorização separados são exigidos para qualquer deploy. **Servidor Evergreen, Máquina 37, Postgres industrial, Node-RED, GPIO e CLP não sofreram alterações.**

## Release

Atualização de README, documentação técnica/comercial e manuais será mandatória ao fechamento do pacote integral conforme `docs/PLANO_DOCUMENTACAO_RELEASE_ANDON_20261030.md`.
