# SEC-04 — Homologação consolidada dos 11 cenários no notebook

**Data:** 30/10/2026. **Atualizado após UX-12/3 (PR #304).** **Ambiente permitido:** notebook Windows 10/11, banco Docker local fictício, `https://localhost:8443` e API `https://localhost:3443`. Este roteiro não é autorização para implantação no servidor industrial nem para alterar a Máquina 37.

## Condições obrigatórias antes do teste

1. Confirmar que o notebook **não** é o Windows Server/estação industrial da Evergreen, nem usa os serviços/watchdog, Docker, banco ou credenciais reais. Fazer checkout da versão/commit homologados, registrar `git rev-parse HEAD`, `node --version` (Node 22), `npm --version`, Docker e versão do PowerShell. Escolher portas do perfil isolado sem conflitos.
2. Não importar `.env`, backup, banco, certificados privados, senhas, dados de produção ou configurações de GPIO/Node-RED. Os testes usam somente dados fictícios. Não apontar o frontend para API externa e não aceitar alertas TLS.
3. Rodar `homologation/https/Test-AndonHttpsHomologation.ps1` para sintaxe, isolamento e allowlist. Rodar os testes da CI (backend, frontend, PostgreSQL isolado, Windows). Se qualquer verificação falhar, **bloquear a homologação**.
4. Iniciar por padrão com `.\homologation\https\Start-AndonHttpsHomologation.ps1` e conferir que login central está ON, **as 15 guardas de escrita OFF** e todas as escritas não migradas continuam negadas; encerrar com `Stop-AndonHttpsHomologation.ps1`.
5. Só no notebook isolado, reiniciar com `.\homologation\https\Start-AndonHttpsHomologation.ps1 -EnableCentralOperationalWrites`. O script usa PostgreSQL Docker `andon_https_hml` com localhost exclusivo e ativa as 15 guardas específicas de escrita. A flag **não substitui** login, permissões, aprovação da estação ou CSRF. Eventos físicos e sirene global permanecem bloqueados.

## 11 cenários com evidências

| # | Cenário | Aceite esperado | Evidência |
|---|---|---|---|
| 01 | HTTPS, inicialização e Hub | Certificado local confiável; navegador abre `/hub`; não usa HTTP inseguro, servidor ou banco industrial; exibir commit/versão do Hub | print + health + commit |
| 02 | Cadastro do Admin principal | Criar **uma única** conta central com senha de **8 a 128** caracteres e login escolhido; não reutilizar senha legada; a senha antiga continua separada e **não autentica no login central** | print sem senhas + teste de novo login |
| 03 | Usuários, perfis, primeiro acesso | Cadastrar gestor/líder/manutenção/produção com permissões e máquinas limitadas; senha provisória obriga troca; acessos não concedidos mostram bloqueio; revogação encerra acesso | matrizes papel×rota |
| 04 | Workstations e módulos | Cadastrar duas workstations e aprovar apenas uma; rejeitar acesso da não aprovada; exibir IP/identidade quando disponível; alterar permissões de ANDON/BI/Prioridades e validar URL direta | capturas dos dois navegadores |
| 05 | Hub ↔ ANDON ↔ BI ↔ Prioridades | Menu Admin central abre `/hub/admin?section=andon` **sem senha legada**; usuário não-Admin não acessa; central OFF preserva login anterior; verificar responsividade PT/EN/ZH | prints desktop/kiosk e 403 |
| 06 | Abertura e identificação técnica | Abrir chamado real fictício; exigir OS quando configurada; PIN/RFID identifica técnico com escopo de máquina; seleção apenas por nome não atende em central; não há fraude por identidade enviada pelo navegador | IDs de chamados de teste |
| 07 | Múltiplos técnicos e proteção 1→0 | Atendimento com dois técnicos, saída individual 2→1 autorizada; **saída 1→0 bloqueada** com motivo visível enquanto chamado ativo; assistência simultânea respeita locks | prints + histórico de auditoria |
| 08 | Acompanhamento e retorno | Entrada em acompanhamento, impossibilidade de manter outro atendimento conflitante, retorno à manutenção e tempos individuais consistentes | linha do tempo |
| 09 | Conclusão e workstation de origem | Encerra manutenção e chamado somente conforme regras; configuração global de finalizar na própria workstation aplicada; acesso por outra estação negado quando regra ativa | antes/depois + bloqueio |
| 10 | Histórico, cancelamento e BI | Corrigir descrição histórica com PIN/auditoria; reclassificar responsabilidade/eligibilidade **somente** com `analytics.reclassify`; cancelamento auditado, chamados teste fora dos KPIs; verificar MTTR/MTTA/MTBF/downtime com dados fictícios | audit event + série BI |
| 11 | Preferências locais, prioridades e segurança | Fixar/desfixar a própria tela, som por máquina local e prioridade somente com escopo; outra estação não altera; sirene global, eventos físicos de parada e credenciais legadas permanecem **negados** em login central | duas sessões isoladas + 403 |

**Regra de não aprovação:** um resultado 200 por permissão indevida, usuário/estação errada, dados inválidos de BI, login central que aceite senha legada, sessão revogada ainda funcional, 1→0 autorizado ou campo crítico de sirene alterado reprova todo o pacote.

## Fluxo de execução e recuperação

- Começar com dados seed **starter** ou fixtures fictícias, nunca dados da produção. A identificação por PIN/RFID exige mantenedores fictícios previamente cadastrados no banco de teste ou scripts isolados; o cadastro geral de mantenedores ainda não está migrado para central.
- Registrar para cada caso: data/hora, navegador, workstation UUID, papel, máquina fictícia, cenário, resultado e link do log. **Nunca** registrar senhas, hashes, PIN ou RFID em evidências.
- Testar navegador diferente como outra workstation, mas não afirmar que UUID identifica hardware de modo infalsificável.
- Após os cenários, parar com `.\homologation\https\Stop-AndonHttpsHomologation.ps1`. Reiniciar **sem** a opção de escrita e provar fail-closed novamente. **Não** executar `-RemoveData` como limpeza automática; essa opção descarta dados do teste e exige decisão deliberada.
- Caso haja falha: parar os processos; preservar `.andon-homologation` para diagnóstico sem compartilhar segredos; revisar logs sanitizados; não levar alterações parciais ao servidor. Restaurar a versão anterior do Git no notebook somente depois de conservar os resultados dos testes.

## Separação de ambientes

| Ambiente | Central | Escritas centrais | Operação física | Situação |
|---|---|---|---|---|
| Notebook, launcher padrão | ON | OFF | Proibida | Teste de segurança inicial |
| Notebook, `-EnableCentralOperationalWrites` | ON | 15 guardas ON, sob ACL individual | Proibida | Teste funcional controlado |
| Servidor Evergreen/Máquina 37 | Sem mudança por este roteiro | Sem mudança | Intocada | Rollout futuro e autorização específica |

## Evoluções visuais complementares — integradas no código, pendentes de homologação física

- **UX-11 (#288):** tema claro/escuro local por navegador, escuro como padrão industrial.
- **UX-13 (#291):** modo Discreto/Destacado local por terminal. Testar estados vermelho/amarelo, máquina não programada, status de acompanhamento, múltiplos chamados, redução de movimento e ausência de sons novos.
- **UX-12 (#289):** paleta global no PostgreSQL, cinco acentos não críticos, prévia claro/escuro, rota independente de escrita protegida e auditada. No ambiente industrial a flag segue OFF; os componentes não críticos reconsultam a versão a cada 30 segundos.
- Na execução padrão do launcher e também em `-EnableCentralOperationalWrites` sem o segundo switch, `ANDON_CENTRAL_VISUAL_PALETTE_HTTP_ENABLED=0` é **forçado pelo processo filho**. Verificar que o botão de salvamento aparece desativado.
- **Somente notebook isolado:** reiniciar com `.\\homologation\\https\\Start-AndonHttpsHomologation.ps1 -EnableCentralOperationalWrites -EnableGlobalPaletteWrites` para testar o gravador. A segunda opção não é permitida isoladamente nem em portas produtivas.
- Em duas workstations distintas, aplicar paleta com Admin principal e verificar sincronização em até 30 segundos, preservando temas e intensidades independentes; testar falha 409 por revisão concorrente, sessões revogadas, workstation pendente, permissões e CSRF; restaurar o preset mediante confirmação.
- Registrar evidências sem senhas, PINs, tokens, certificados privados ou endereços sensíveis. O modo destacado é exclusivamente visual e não autoriza PLC, sirene ou evento físico.

**Não confundir:** merge e CI aprovados no GitHub não significam homologação no notebook, e homologação no notebook não significa autorização de deploy industrial.

**Aprovação final:** CI validada **não substitui** homologação manual no notebook e esta **não substitui** autorização de deploy industrial. Registrar aceite/pendências no roadmap #232 antes de considerar rollout.
