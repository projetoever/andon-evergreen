# REFINE 21 — P0 não homologada: Firefox perdeu autenticação de Produção

## Evidência e fronteiras
Operador observou login solicitado novamente após fechar o Firefox no perfil Produção com política "Não expirar". Esta evidência **reprova P0** mas não determina se o servidor expediu sessão temporizada, cookie desapareceu ou sessão foi revogada. Base da investigação: main f9812600324ca4201f167982c1da8731217ed51c. Issue #570, PR #571 (somente branch até CI verde + liberação).

## Invariantes observados no código
- Emissão realmente permanente: conta Pessoa não Admin, senha definitiva, política `persistent`, alguma permissão, workstation ativa/aprovada com `allowPersistentOperationalLogin=true`. A máquina fixada **não** é necessária.
- A API registra `AccessSession.persistentOperational=true`; quando presente, o servidor não aplica 30min ocioso ou 12h absoluto. Cookie `__Host-andon-access` é `HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=34560000`. Renovação apenas quando o cookie é enviado e validado.
- Frontend exige mesmo esquema HTTPS e host para UI/API. Uma porta diferente no mesmo hostname não muda o escopo do cookie; trocar entre IP, localhost, DNS ou perfil Firefox muda o escopo do armazenamento.
- Cookie ausente é dado perdido no cliente. **NUNCA** reconstruir autenticação de senha só por `workstationId` (UUID editável), IP, cabeçalho, localStorage ou afirmação da UI. A integridade exige segredo HttpOnly ou dispositivo com prova criptográfica e autorização revogável.

## Falhas de código confirmadas e tratadas por #571
1. PUT `/api/access/users/:id` incrementava authorizationVersion e revogava sessões mesmo sem alterações, inclusive apenas DisplayName. Agora edições estritamente descritivas preservam as sessões, mudanças de login/estado/perfil/escopo/permissões ainda revogam.
2. `/api/modules/access` transformava exceção imprevista de PostgreSQL em `principal:null` e abria falso login. Agora só negações `AccessError` viram anônimo; indisponibilidade da API é erro recuperável com retry, sem autenticação fictícia.
3. Falta de diagnóstico: `GET /api/access/session` passa a retornar `sessionDiagnostic` (somente código; sem segredo, cookie, UUID, login ou IP), em caso de sessão ausente/rejeitada. UI exibe mensagem compacta quando identifica histórico visual de sessão permanente, mantendo a política real do servidor.
4. CI passa a executar Firefox real em perfil normal para verificar que cookie Secure/HttpOnly sobrevive a fechar e reabrir processo. Isso **não** inspeciona a configuração de privacidade do Firefox no notebook físico.

## Diagnóstico em campo (SEM enviar segredos)
1. Atualizar somente depois de CI/merge P0, conferir SHA; em Firefox normal e na MESMA URL HTTPS usada todos os dias, conferir no Hub a frase: "Sessão sem expiração confirmada pelo servidor". Se ausente, não iniciar o teste de espera: a sessão já nasceu temporizada.
2. Em Firefox abrir F12 > Armazenamento > Cookies, escolher hostname da API. Verificar apenas **presença**, atributos `Secure`, `HttpOnly`, data futura e nome `__Host-andon-access`; **nunca enviar valor, captura de cabeçalho Cookie, senha, Authorization ou exportar dados do site**.
3. Fechar todas as janelas do Firefox sem limpar dados; abrir o MESMO perfil e host; verificar se o nome do cookie continua presente. Se ausente, verificar `about:preferences#privacy`: excluir cookies ao fechar, limpar histórico ao fechar (incluindo cookies/dados de sites), modo de navegação privada, extensões/antivírus que limpam dados e políticas em `about:policies`. `about:profiles` ajuda verificar o mesmo perfil.
4. Conferir no Hub somente o `sessionDiagnostic`: `cookie_missing` → navegador não enviou cookie; `workstation_identity_changed` → origem/perfil/UUID diferente; `session_revoked` → logout/admin/revogação; `account_security_changed` → conta editada/segurança; `session_expired` → token era temporizado; `persistent_trust_removed` → confiança/política retirada; `cookie_unrecognized` → token sem correspondência no servidor; `workstation_blocked` → estação bloqueada. Compartilhar **só o código**.
5. Testar 2 fechamentos/reaberturas, >30min sem interação, reboot Windows e revogação Admin. Não remover arquivos do perfil, alterar timestamps da produção ou operar instalações reais para diagnosticar.

## Alternativas avaliadas
- **A (padrão):** corrigir regras da API, manter HttpOnly, padronizar Firefox normal com perfil dedicado e retenção de cookies. Preserva revogação imediata e menor superfície de ataque. Recomendado como primeira solução.
- **B (gerenciamento industrial):** aplicar política explícita de Firefox via TI/GPO/policies.json: `Cookies.Allow` para o origin HTTPS, `SanitizeOnShutdown.Cookies=false`/configuração de limpeza que preserve dados, desabilitar privado para o perfil kiosk. Avaliar impacto e formalizar aprovação da TI antes de mudar qualquer estação. Referência Mozilla Policy Templates: https://mozilla.github.io/policy-templates/
- **C (para limpeza obrigatória de cookies):** agente Windows assinado ou certificado de dispositivo com **prova de posse** (mTLS, desafio criptográfico via serviço local), credencial protegida no armazenamento do sistema operacional, enrollment Admin auditado, escopo restrito e revogação imediata no servidor; recupera autenticação somente em workstation aprovada. Requer arquitetura, threat model, provisionamento, desinstalação/rollback e aceite expresso. Não implementar fallback por UUID/IP/localStorage de token.
- **D (não recomendada):** guardar token de login em localStorage, senha no browser, cookie sem Secure ou auto-login por IP; aumenta risco de roubo de sessão e não oferece autenticação física confiável.

## Exit criteria
P0 só encerra se `persistentOperational=true` desde o login, cookie e workstation identity sobrevivem a dois fechamentos Firefox e ao reboot no mesmo perfil HTTPS, a conta não recebe logout após edição cosmética/sem efeito, falha temporária de banco recupera sem tela de login, e revogação Admin/logout de usuário funcionam. CI verde NÃO equivale a aceite físico.
