# REFINE 20 — SEC-PROD20 | Programação de produção por solicitação + confirmação

Data: 13/11/2026. Solicitação: usuário do terminal pode solicitar mudar Produção Programada / Fora de Produção; abrir modal de login como desfixar tela; sem permissão mostrar notificação branca inferior direita. Política de login permanente para Produção NÃO pode permitir alterações irreversíveis sem uma pessoa autorizada.

## Diagnóstico
A tela `MachineDetailPage` chamava `updateMachineProductionMode` diretamente. Em modo central, `PATCH /api/machines/:id/production-mode` não possuía adaptador central e era rejeitado pelo middleware. O mesmo fluxo não comprovava credencial da pessoa que solicitava mudança, razão pela qual não deve ser liberado genericamente.

## Segurança e UX implementados
1. Dividido `production.schedule.request` (**terminal: solicitar**, permitido numa conta de Produção 24h sob guarda de sessão confiável) e `production.schedule.write` (**pessoa: autorizar com sua senha**, nunca permitido à sessão persistente). O checkbox operacional do ANDON usa `request`; `write` é grant independente e continua disponível no Avançado para pessoas autorizadas. Contas antigas com grant `write` podem solicitar sem migração destrutiva.
2. Clique nos dois estados consulta a sessão central para verificar permissão e máquina. Negado: toast neutro existente, definido pelo sistema em **bottom-right**, sem modal.
3. Permitido: modal central solicita login e senha de pessoa autorizada, sem trocar o usuário autenticado no terminal. O alvo e estado atual são enviados no POST exato `/api/access/machines/production-mode`.
4. API exige HTTPS + Origin + Cookie + CSRF + workstation ativa e aprovada; sessão normal do operador, escopo da máquina, permissão `production.schedule.request` (ou grant antigo `write`) e `andon.read`. Valida senha da segunda pessoa (Admin principal com escopo global OU conta Pessoa autorizada com `andon.read`, `production.schedule.write` e máquina no escopo). Checagem antiabuso por IP/login.
5. Verificação da credencial e autorização acontece antes da transação, mas dentro do bloqueio a conta e o hash são revalidados. Transação bloqueia pessoas, workstation, máquina e atualiza eventos de produção e a máquina juntamente com log de auditoria. Não cria novo token nem altera a sessão de Produção.
6. Proteção contra confirmação com informação desatualizada: `expectedProductionMode` precisa coincidir com a máquina no momento da transação (409 caso contrário); não regravar silenciosamente estado alterado por outro terminal.
7. A rota legado direta não é autorizada em modo central; fora do modo central o acesso continua exigindo o modal administrativo legado.
8. Sem mudanças em CLPs, agente GPIO, Node-RED, mecanismos de parada, classificação de falhas, SQL migrations ou scripts de rede.

## Aceite
- Para máquina selecionada 10: terminal Produção sem `production.schedule.request` → toast, nenhum modal. Ao conceder essa permissão e fixar workstation aprovada com sessão persistente → abre modal e solicita pessoa autorizada; a sessão Produção permanece logada.
- Senha inválida, usuário inativo, Kiosk, escopo incorreto, credencial sem grant ou sessão revogada → operação bloqueada e nenhuma alteração no histórico.
- Usuário de manutenção ou gestor com `production.schedule.write` e máquina em escopo pode autorizar; Admin principal com escopo total pode autorizar (não se infere esse direito só pelo texto do perfil).
- Alternar Programada ↔ Não Programada, validar criação do intervalo histórico, encerramento do anterior, revisão dos KPIs e evento de auditoria com quem solicitou e quem aprovou; sem duplicação em concorrência.
- API OFF/timeout ou 409: status não muda; erro claro no modal e possibilidade de fechar. Notificação neutra inferior direita para conta sem grant.
- CI PostgreSQL 16 `/andon_test`, backend, frontend/SSR, PT/EN/ZH e Windows 5.1; homologação posterior no notebook com backup e HTTPS confiável, jamais ativar diretamente na fábrica.

## Observação de governança
A permissão pertence à **conta da workstation**, não a um PIN de técnico. A autenticação extra de pessoa é obrigatória, inclusive quando o terminal permanece logado por 24 h ou indefinidamente.
