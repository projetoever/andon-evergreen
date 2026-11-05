# REFINE 10 / R10-04 — Kiosk confiável: contrato negativo e ameaça (Fase A)
**Data:** 05/11/2026
**Issue:** https://github.com/projetoever/andon-evergreen/issues/357
**Base consolidada:** `main` SHA `70db5ff361f04c49d3a6d9256780ec342176f62b`.
**Estado:** SOMENTE política pura + testes; sem endpoint, sem cookie, sem migration, sem alteração operacional. Feature ainda NÃO EXISTE habilitada.

## Resultado inicial e motivação
`server/src/access/kioskTrustPolicy.ts` modela uma decisão limitada a ações `andon.read` e `calls.open` de **uma** máquina explicitamente autorizada. Esta fase não instala agente, não autentica navegadores, não emite credencial e não afeta `resolveSession` humano. Serve como contrato de segurança testável, **não como mecanismo concluído de kiosk**.

## Fronteiras de confiança (ameaças, requisitos de mitigação)
1. **Identidade lógica ≠ prova física.** `Workstation.id` é UUID de navegador; não confiar em IP, MAC, hostname, user-agent, heartbeat, localStorage ou valor enviado pelo cliente como prova de equipamento fixo. A futura prova deve ser verificada pelo servidor com não-replay, rotação e vinculação ao lease aprovado.
2. **Sessão humana ≠ presença kiosk.** A sessão central humana continua com idle de 30 minutos e limite absoluto de 12 horas; heartbeat nunca renova login. O modo kiosk terá um namespace de credencial separado e limitado a funções operacionais, com expiração e renovação controlada.
3. **Admin não é kiosk.** Conta humana Admin principal não pode ser convertida em lease de kiosk. Uma conta de produção comum também não ganha privilégio persistente só porque clicou “lembrar”.
4. **Matrícula deve ter autorização forte.** Aprovação apenas por Admin principal autenticado com step-up recente (5 min), justificativa, audit e locks transacionais. Rejeições, bloqueios e revogações não podem ser contornados por login/refresh concorrente.
5. **Poder mínimo.** Conta de dispositivo kiosk deve ser distinta, ativa, escopo `selected` para UMA máquina e somente `andon.read` + `calls.open` nesta primeira fase. Sem `calls.cancel.any`, BI, Prioridades, usuários, workstations.manage, config ou operações industriais.
6. **Revalidação on request.** O backend da futura rota precisa carregar conta/lease/estação a partir do banco *após* validar credencial própria e locks. Não aceitar `deviceProofVerified` como campo da requisição, nem tomar decisão com snapshot de navegador.
7. **Fail closed com tela informativa.** No modo offline, revogado, expirado, cookie ausente ou servidor indisponível, não permitir escrita e não simular sucesso. A interface pode permanecer aberta em modo visual, com aviso e opção de autenticação humana normal.
8. **Mobile continua Web.** Agente ANDON é futuro e opcional (#350), *nunca* destinado a mobile. Browser mobile não é automaticamente um kiosk; sem capacidade de verificar elegibilidade de estação fixa com segurança, o backend deve recusar emissão de confiança. User-agent mobile é falsificável e NÃO resolve essa validação.
9. **Revogação e audit.** Sessões kiosk precisam revogação persistente, versão de autorização, invalidação concorrente e trilha auditável independente da sessão humana. Logout remoto (#358) precisa proteger toda sessão válida de Admin principal, inclusive outras workstations.
10. **Backups.** Não alterar `andon_db` nem as máquinas; schemas/aditivos e dados somente em PostgreSQL LAB isolado após aprovação de migration. Testar restauração isolada do banco original ANTES de habilitar o modo para fábrica.

## Contrato de teste Fase A
- Feature **OFF** / acesso central OFF: negado.
- Workstation inativa ou aprovação pendente, conta humana/gerente/Admin, conta kiosk inativa ou em troca de senha: negado.
- Grant extra, escopo global ou mais de uma máquina: negado.
- Lease sem aprovação Admin, de outra workstation/máquina, revogado, expiração ou autorizaçãoVersion divergente: negado.
- Prova de posse **verificada pelo servidor** ausente: negado mesmo com UUID e heartbeat.
- Opera apenas `andon.read` e `calls.open`, uma máquina; nenhum endpoint de integração industrial, controle remoto, shell ou BI.
- O módulo não é chamado em rotas na fase A, portanto nenhum cookie novo, migration, serviço, sessão persistente ou mudança de login é autorizado nesta entrega.

## Entregas seguintes em PRs diferentes — NÃO IMPLEMENTADAS AQUI
**Fase B:** modelagem de leases, matrícula, hashes/versionamento, TTL/revogação, migrações aditivas HML, negative tests, rollback.
**Fase C:** endpoints HTTPS de provisionamento, prova criptográfica verificável sem agente obrigatório e token rotativo, locks e audit, revogação; device trust não substitui workstation approval.
**Fase D:** UI Hub/Workstations e modo de operação, mensagens de offline, 2 workstations/2 browsers e testes 31min/13h.
**Fase E:** logout remoto/presença (#358), testes em clone do original, revisão final, HML e gate da fábrica.

## Pendências P0 paralelas
Issues #351 cancelamento e #352 histórico permanecem abertas até obter requisição/status/resposta HTTP do notebook e HML com dados antigos, embora PRs #355/#356 já tenham sido mergeadas após CI.

**Proibido:** merge automático desta PR, deploy, banco original `andon_db`, instalação `C:\web-andon-industrial\andon`, fábrica, CLPs, GPIO e Node-RED.


## Fase B — schema de homologação isolado (PR dependente; NÃO habilita kiosk)
- Novo modelo Prisma `KioskTrustLease`, tabela `kiosk_trust_leases` **nova e inicialmente vazia**, sem converter workstations/contas/sessões legadas. FK restritiva para workstation lógica, conta kiosk, máquina, aprovador Admin.
- Um vínculo lógico por workstation e por conta kiosk (índices únicos); status inicial `pending`, sem código, sem chave, sem segredo e sem aprovação. Não unir terminais com IP igual.
- Campos para aprovação, justificativa, validade, revogação, versão de credencial e versão de autorização, chave pública SPKI e **somente hash** do token de renovação. Chaves privadas e tokens não podem ser gravados no banco, em logs ou no localStorage.
- Banco rejeita ativação de lease sem decisão Admin, motivo, validade futura, chave pública e hash de credencial; rejeita estado revogado sem timestamp; versões não podem ser zero/negativas.
- Teste de integração executado **somente em `/andon_test`** na CI após migrations; cria conta/estação/máquina sintéticas, confirma lease `pending` sem segredo, prova rejeição de ativação incompleta e limpa seus registros. Não conecta no LAB real, `andon_db` ou fábrica.
- **Não há** emissão/validação de chave pública, fluxo WebCrypto, cookie, endpoint de matrícula, autenticação kiosk ou UI. Os campos são estrutura para a futura fase C, que exigirá criptografia bem especificada, challenge anti-replay, confirmação Admin e revisão independente. A existência da tabela não equivale a confiança ativada.
- Risco residual: uma credencial de navegador não comprova sozinha a identidade física de computador; cópia de perfil e ausência de attestation devem ser considerados no threat model. Não prometer bloqueio confiável de dispositivos móveis usando user-agent, IP, MAC ou hostname. O agente opcional #350 permanece adiado; mobile continua ANDON Web por login humano e ACL.
