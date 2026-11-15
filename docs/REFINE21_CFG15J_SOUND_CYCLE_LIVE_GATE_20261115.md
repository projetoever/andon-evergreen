# REFINE 21 — CFG-15J | Alarme do Dashboard: revalidação de autorização sem perder edição

Data: 15/11/2026. Base congelada para homologação: `3d1834b9c0c1c6a5edca691fb309c06e9544b422`. Referências: #477 (11 abas), #480.

## Lacuna identificada
Na aba **Sons**, o editor do ciclo automático de alarme consultava `centralOperationalSettingsWriteEnabled` somente ao carregar. Se o administrador alterasse a disponibilidade do recurso em outra sessão, a interface poderia manter os campos habilitados e somente descobrir a negativa no PATCH (403). Além disso, `access === null` era tratado como modo legado para habilitação dos botões.

## Correção isolada
- Ao carregar e ao retornar o foco/receber `SYSTEM_SETTINGS_CHANGED_EVENT`, reconsultar a flag pela API GET `/api/system-settings`; o evento de browser é apenas sinal para consultar, nunca fonte de permissão.
- Durante GET ou erro, o editor do **ciclo global de alarme** fica bloqueado em acesso central; em estado de acesso Hub não confirmado, a tela também falha fechada.
- Descartar respostas antigas após eventos rápidos ou desmontagem de componente, com `requestVersion` e `mounted`.
- Revalidação modifica exclusivamente `centralWritable`: não sobrescreve os quatro campos em edição (fase ativa, duração ativa, fase silenciosa, duração silenciosa).
- O carregamento manual pelo botão Tentar novamente mantém o comportamento existente. O PATCH continua validado na API: sessão, permissão, workstation, CSRF, auditoria e as regras de domínio não mudaram.
- O editor não controla arquivos de áudio locais, GPIO, Node-RED ou sirenes externas.

## Validação e operação
Testes de regressão em `tests/dashboardSoundMuteTimer.test.ts`: listeners, respostas obsoletas, falha fechada, preservação de rascunho e separação das mutações. CI do repositório deverá incluir backend/frontend/SSR/PG/Windows/browser.

**Importante:** esta alteração fica apenas na branch / PR durante a homologação da versão `3d1834b9...` pelo operador no notebook. Não integrar à `main` antes do encerramento dessa atualização; nenhuma mudança industrial, migração ou flag operacional executada.

Critérios de homologação posterior: abrir Sons, ajustar 2 durações sem salvar, alternar foco, alterar flag em outra sessão, perder conexão, recuperar conexão, conferir o bloqueio durante a verificação sem apagar valores digitados; a mutação continua protegida no servidor.
