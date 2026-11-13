# REFINE 18 — SEC-18 | Política de sessão por usuário

Data: 13/11/2026. Issue #509. Implementação inicial com duas políticas, sem liberação de privilégios.

## Modelo
- `standard` (default): inatividade de 30 minutos e limite absoluto de 12 horas; vale para todos os registros históricos após migração.
- `persistent`: autorização EXPLÍCITA por usuário, escolhida e auditada pelo administrador no cadastro. Não é concedida automaticamente pelo rótulo Produção.
- A sessão persistente somente é emitida quando `sessionPolicy=persistent`, a workstation aprovada também permite persistência, a máquina está fixada, a senha provisória já foi trocada e todas as permissões pertencem à allowlist operacional.
- ANDON completo inclui ações fora da allowlist: não habilita persistência. Ajustar funções no Avançado somente mediante escolha do administrador, jamais reduzir ACL silenciosamente.
- Sessões existentes são revogadas na edição da conta; resolução de sessão persistente reavalia política e workstation continuamente.
- Cookie HttpOnly Secure SameSite Strict com Max-Age limitado pelo navegador (400 dias), sujeito à revogação imediata; não existe promessa de armazenamento eterno quando o navegador limpa cookies.
- Backward-compatible: API aceita omissão da propriedade em clientes anteriores; ao editar, preserva política existente; novas contas usam standard.

## Mudanças
- Prisma + migração aditiva, default standard.
- `server/src/access/users.ts` valida e persiste política no mesmo caminho transacional de CRUD e auditoria.
- `server/src/access/sessions.ts` exige opt-in além da confiança da workstation.
- `src/components/settings/UsersAccessSettings.tsx` expõe escolha visível, com explicação de elegibilidade.
- `src/services/accessService.ts` e `src/i18n/messages.ts` incluem tipagem e traduções PT/EN/ZH.
- Testes unitários e integração PG de sessão persistente ajustados para opt-in.

## Aceite antes de merge ou notebook
1. Prisma generate + migration em banco isolado, rollback ensaiado; build server/frontend.
2. Testes de compatibilidade dos CRUD antigos sem campo, e migração `standard` para todas as contas.
3. Conta padrão na workstation permitida deve expirar; conta persistent elegível deve sobreviver ao limite inativo/absoluto e reinício do navegador.
4. Rejeitar persistência quando a conta tem grants privilegiados, máquina solta, workstation pendente/inativa ou Admin.
5. Desconectar remotamente, desabilitar flag da estação, alterar permissão, alterar política da conta e bloquear usuário devem revogar sessão sem bypass.
6. Validar em PT/EN/ZH, desktop/mobile e Windows PS5.1/Linux CI.
7. Apenas após testes aprovados e revisão liberar merge na main. Não tocar servidor fabril ou notebook automaticamente.

## Próximas melhorias separadas
- Política por turno com semântica explícita e teste de expiração.
- Exibição de elegibilidade por motivo e preset restrito Produção 24h, sem alterar o pacote ANDON completo.
- Estado efetivo de sessão em Workstations, incluindo vínculo conta/terminal e evento de desconexão.
