# REFINE 12 — R12-02A: seleção declarada de nome (issue #345)

Data: 08/11/2026. Base: PR #385 E034 (HEAD 92debbe57d96f452cc2d72082e3fd6787294b246).
Status deste lote: SOMENTE verificador de catálogo/disponibilidade + testes unitários; não operacional, sem HTTP, sem alteração de produção.

## Contrato de identidade
- PIN e RFID são identidades verificadas por credencial.
- Nome escolhido é declaração feita por uma conta central humana autenticada. Catálogo/disponibilidade não comprovam identidade física.
- A futura auditoria deve distinguir identificação method=name, identityVerified=false, conta e sessão autora, workstation, máquina, chamado, técnico(s), horário, requestId e resultado. Nunca inventar PIN.
- Ativação futura exige flag OFF por padrão, HTTPS/Origin/CSRF, estação aprovada, sessão humana normal, andon.read e calls.attend (ou ação de adicionar), escopo de máquina e revalidação transacional.

## Implementado neste lote
- Parser de seleção com 1 a 6 nomes, validação e duplicidades negadas antes de consulta.
- Resolução de catálogo ativo por nome exato sem distinção de maiúsculas; falha fechada para ausentes e ambíguos.
- Locks de técnicos ordenados por ID; nova leitura após locks para rejeitar troca de cadastro; validação de área, chamado, status e sessões ativas, incluindo sessões legadas por nome.
- Retorno com identificationMethod=name e identityVerified=false; nenhum hash/segredo retornado.
- Testes unitários adicionados à tarefa server test:access.
- Não alterados: rotas HTTP, frontend, banco, flags de ambiente, KPI, GPIO, Node-RED e PR #385.

## PENDÊNCIAS — não marcar #345 concluída
1. HTTP discriminado estritamente da autenticação PIN/RFID; jamais aceitar name como credencial.
2. Flag dedicada OFF por padrão e configuração central compatível; frontend só após política liberada.
3. Transação operacional completa com locks usuario->estação->máquina->mantenedor, ACL revalidada, domínio de atendimento e auditoria atômica da identidade DECLARADA.
4. Teste PostgreSQL real com rollback, corridas, reativação, escopo, ausência de replay, múltiplos técnicos, PT/EN/ZH, dois browsers.
5. CI de árvore integrada e homologação manual do LAB antes de qualquer merge.

## Limites
Sem merge, instalação LAB, migração no banco original, produção ou escrita em C:\web-andon-industrial\andon / andon_db. Atualizador legado ATUALIZAR_NOTEBOOK.ps1 proibido pela issue #372.
