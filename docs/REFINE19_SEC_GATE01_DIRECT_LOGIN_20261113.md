# REFINE 19 — SEC-GATE-01 | Entrada direta no login (sem bloqueio visual intermediário)

Data: 13/11/2026. Evidência: captura enviada do acesso direto à máquina 10, exibindo "Acesso ao módulo restrito" com diagnóstico genérico da workstation.

## Diagnóstico
A rota `/machines/:machineId` era protegida por `WorkstationAccessGate`. Quando faltava sessão central ou a estação/conta não tinha um grant, a página rendia a mesma tela genérica e apontava indevidamente para "liberação desta workstation", mesmo quando a causa era somente ausência de login.

## Correção
- Separar a decisão pura de segurança para: checking, error, identity, denied, module-login e allowed.
- Central ON e sem sessão humana normal: montar o `HubIdentityPanel` existente num modal bloqueado (login pessoal, troca de senha e admissão de workstation) diretamente na rota original, sem criar outro endpoint/login nem exibir a página de "módulo restrito".
- Login válido + estação ativa + módulo permitido: renderizar o conteúdo da rota; dados só são buscados após o gate.
- Conta normal com estação ativa porém sem grant do módulo: redirecionar ao Hub com replace, sem modal falso de liberação de workstation.
- Estação pendente/bloqueada com conta normal: pequena mensagem contextualizada no modal, com UUID somente nesse caso e opções verificar/Hub/Admin. Nunca autenticar para aprovar estação automaticamente.
- Central OFF mantém autenticação legada por módulo e requisitos próprios, sem bypass.

## Segurança
Nenhum endpoint, ACL, política de estação, limite de sessão, PIN, máquina real, PostgreSQL, flags, CLP ou GPIO alterado. Uso exclusivo das autorizações retornadas pelo backend; não redirecionar em loop. Credencial só via HTTPS já exigido pelo `accessRequest`. Não interpretar erro de rede como permissão concedida; sem estação aprovada o módulo não monta.

## Testes e homologação
Testes SEC-GATE-01..04: login ausente, credencial de troca, estação pendente/inativa, conta sem módulo, API indisponível, senha legada e rota segura. Rodar testes `server test:ui`, build, testes de backend/PG e Windows 5.1 na CI.
No notebook: abrir link direto da máquina 10 em navegador deslogado (modal imediato); entrar como Produção autorizado; estação não aprovada deve continuar sem módulo; perfil fora do escopo retorna Hub; verificar PT/EN/ZH e responsividade 360px. Não alterar a fábrica.
