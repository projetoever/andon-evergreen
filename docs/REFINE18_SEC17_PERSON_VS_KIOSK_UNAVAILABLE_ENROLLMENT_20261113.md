# REFINE 18 — SEC-17 | Pessoa x Kiosk no cadastro do Hub

Data: 13/11/2026 • Issue #504 • Segurança UX, P0.

## Situação verificada
A conta `prod` foi criada como **Kiosk** usando a seleção disponível no Avançado. O usuário não conseguia ativar a conta ou redefinir sua senha. São restrições intencionais do backend:
- `server/src/access/users.ts`: `validateUser` rejeita Kiosk com `active: true`; o tipo de conta é imutável após criação, preservando auditoria.
- `server/src/access/sessions.ts`: login por usuário e senha só é emitido para `accountType === "person"`.
- `server/src/routes/access.ts`: o reset de senha só existe para `accountType === "person"`.
- `server/src/access/kioskTrustPolicy.ts`: política de Kiosk é **contrato dormente**, sem endpoint de provisionamento seguro/credencial criptográfica ainda.

## Correção da experiência, sem alterar segurança
- Tipo de conta fica visível no cadastro comum (não oculto apenas no Avançado). O tipo **Pessoa — acesso com senha** continua padrão e selecionável.
- `Kiosk — provisionamento indisponível` aparece **desabilitado para novos cadastros**, impedindo criar sem querer uma conta inativa sem possibilidade de login.
- Ao editar um registro Kiosk já existente, o tipo é imutável e o formulário explica explicitamente que ele não recebe senha, não pode ser ativado/convertido e não pode fazer login humano.
- Para recuperar o login desejado (`prod`), o Admin pode **renomear** o antigo registro inativo e salvar, depois criar um novo usuário **Pessoa** com login `prod`, escopo de máquinas e permissões necessárias. A intervenção no registro é manual, auditada e não é executada por esta PR.
- Na lista, Kiosk deixa de aparecer com a mensagem enganosa `Troca de senha pendente` e exibe `Kiosk sem login por senha`.
- O reset de senha de pessoa, primeiro acesso e funções de sessão não mudam. Kiosk não é habilitado no servidor, não há geração de tokens, cookies, flags, nem bypass por workstation ID/IP.
- Traduções PT/EN/ZH e teste de regressão em `tests/accessRolePresets.test.ts`.

## Produção em Kiosk físico — próxima fase (não implementada nesta PR)
A operação contínua já possui um caminho separado: **conta Pessoa de Produção + máquina fixa + workstation aprovada + política de login persistente com allowlist estreita**. Selecionar a opção ANDON completa, com status/diagnóstico/cancelamentos/desfixar, torna a conta **inelegível** à sessão persistente segundo `TRUSTED_OPERATIONAL_GRANTS`; retirar ações incompatíveis no Avançado.

Uma identidade Kiosk real só poderá ser ativada após projeto específico de provisionamento com **prova criptográfica do dispositivo, aprovação do Admin, lease vinculada a uma máquina/workstation, revogação e auditoria**. Não improvisar credencial por IP/UUID ou ativar flag manualmente.

## Aceite
CI Windows PS5.1 e Linux/PostgreSQL/API/SSR/browser desktop/mobile; homologação do cadastro de pessoa e visualização de Kiosk antigo no notebook. Nenhuma mudança de banco, registros de produção, privilégios, flags, Node-RED, GPIO, PLC ou licença comercial.
