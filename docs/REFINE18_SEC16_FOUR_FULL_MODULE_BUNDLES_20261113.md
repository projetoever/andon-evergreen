# REFINE 18 — SEC-16 | Quatro permissões essenciais com todas as ações

Data: 13/11/2026 • Issue #503 • Prioridade P0.

## Pedido do responsável
Um clique em **ANDON / BI / Prioridades / Config. ANDON** concede o conjunto completo correspondente. O Admin pode clicar **Avançado — restringir funções** e retirar individualmente ações, inclusive abrir, atender, concluir, finalizar, cancelar, editar diagnóstico e **desfixar tela com senha**. O papel Produção/Manutenção/Líder/Gerente é **descritivo**; não pode filtrar silenciosamente ações de um módulo que o Admin marcou.

## Mudanças implementadas
- `src/services/accessRolePresets.ts`: `simpleModuleGrants` deixa de filtrar por perfil e habilita todas as permissões efetivamente oferecidas pelo catálogo da API. ANDON inclui explicitamente `workstations.screen.unlock` (permissão do usuário, não bypass da verificação de credenciais), `calls.open`, `calls.attend`, `calls.finishMaintenance`, `calls.finish`, `calls.followUp`, `calls.returnToMaintenance`, cancelamentos, estado da máquina, agenda e diagnóstico. BI inclui leitura, exportação, reclassificação e política de indicadores; Prioridades inclui leitura/escrita; Config. ANDON concede acesso ao painel e gestão de catálogos.
- Ações de contas/usuários, `workstations.manage`, auditoria e Config Hub **não** são selecionadas por nenhum dos quatro grupos e continuam disponíveis só como escolha independente avançada.
- `reconcileSimpleModuleRole` agora **preserva exatamente** as escolhas existentes durante mudança do rótulo do perfil: trocar Produção por Gerente não pode remover ou criar grants sem clique em grupo/avançado.
- O resumo mostra ON somente quando **todas** as subpermissões suportadas estão marcadas. Se o Admin retirar uma ação em Avançado, status vira **Parcial** e as alterações são preservadas ao voltar ao resumo, recarregar conta ou mudar perfil. Marcar o grupo novamente é um ato explícito que repõe **todas** as ações dele; desmarcar revoga somente a família daquele módulo. Config ANDON mantém o `andon.read` mínimo quando necessário.
- Editor Avançado exibe ações separadas por quatro grupos e bloco distinto de Segurança e Administração. Nenhuma criação implícita de usuário, sessão ou token.
- Traduções PT/EN/ZH e regressões em `tests/accessRolePresets.test.ts`.

## Segurança operacional e sessão persistente
Todos esses grants são **autorização de usuário**, não acesso incondicional: a API ainda exige HTTPS, sessão, workstation aprovada, escopo por máquina, permissões, CSRF, flags e trilha de auditoria. **Desfixar tela** exige verificação adicional de senha, mesmo quando marcada. **Selecionar todas as ações ANDON em uma conta Produção a torna INELEGÍVEL ao login operacional persistente**, que exige lista restrita de permissões, estação aprovada e máquina fixada; configurar exceções em Avançado para produção 24/7.

## Compatibilidade
Dados antigos não são modificados ao abrir a edição. A mudança só vale quando o Admin seleciona/desmarca um dos quatro módulos e **salva o cadastro**. Não alterar implicitamente usuários existentes, servidor industrial, banco original, CLP, GPIO, Node-RED, flags ou ACL.

## Aceite
CI Windows PowerShell 5.1 + Linux/PostgreSQL/segurança/API/frontend SSR/desktop/mobile. Validar no notebook após merge com conta nova Produção e perfil Gerente: marcar ANDON, ver todas as subpermissões no Avançado, retirar `calls.finish`, confirmar resumo Parcial e persistência, variar perfil sem reintrodução, validar tela fixa com senha, configurar caso de Produção 24/7 com subset permitido, confirmar ausência de administração do Hub.
