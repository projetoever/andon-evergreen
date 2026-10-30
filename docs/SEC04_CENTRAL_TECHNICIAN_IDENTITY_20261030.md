# SEC-04/2P — Identificação de mantenedor por PIN/RFID no login central

Data: 30/10/2026 — P0 para homologação dos 11 ajustes.

## Falha de integração encontrada
Os modais de atendimento, inclusão e encerramento individual identificam o mantenedor antes de enviar a operação final, por `POST /api/technicians/identify`. O login central bloqueava corretamente essa rota (sem ACL), mesmo que as operações posteriores de atendimento e sessão já estivessem migradas. Isso impedia o fluxo completo no notebook com PIN/RFID.

## Implementação
- Flag independente `ANDON_CENTRAL_TECHNICIAN_IDENTITY_HTTP_ENABLED=1`, sempre OFF por padrão e dependente de `ANDON_CENTRAL_ACCESS_ENABLED=1`.
- A API exige `callId` real no POST. O navegador não informa a identidade do técnico ou a máquina com autoridade; o banco resolve a máquina do chamado e o escopo do usuário central. Bloqueia chamada de outra máquina, testes e chamados finalizados.
- HTTPS/origem/cookie seguro, workstation aprovada, CSRF, `andon.read` e `calls.attend` **OU** `calls.technicians.manage`. A sessão e permissões são revalidadas sob locks usuário → estação → máquina.
- PIN/RFID identificado pelo algoritmo já existente (hash), sem resposta de hashes ou credenciais. A resposta tem somente perfil público do técnico para que os modais filtrem a área, disponibilidade e sessão.
- Identificação prévia NÃO conclui atendimento: a operação real revalida PIN/RFID e exclusividade sob seus próprios locks, inclusive a regra que bloqueia saída do último mantenedor ativo.
- Sucessos auditados com usuário central, estação, máquina, chamado, ID técnico e método, **sem registrar PIN/tag**; falha de auditoria faz rollback. Tentativas inválidas usam orçamento conservador por hash da sessão, com bloqueio temporário após 8 erros em 5 minutos. O rate limit é por processo Node, portanto implantação multi-instância exige rate limit centralizado antes de ativação industrial.
- Modo legado preservado, agora também recebe `callId` sem mudar sua semântica.
- `POST /api/technicians/identify` sai do inventário de escritas não classificadas (22→21), mas não concede acesso administrativo ao catálogo técnico.

## Validação
- HTTP: flag OFF, rota exata, módulo, permissão de manutenção, CSRF, modais.
- PostgreSQL isolado `/andon_test`: sessão revogada, chamada de outra máquina, chamada teste, payload com campos falsificados, PIN inválido, identidade válida e auditoria atômica sem secrets.
- Build backend, frontend, HTTPS, regressões e instalador Windows na CI.
- **Sem deploy/merge automático nesta primeira revisão**, sem tocar banco industrial, Máquina 37, Node-RED ou GPIO; notebook somente no pacote consolidado.
