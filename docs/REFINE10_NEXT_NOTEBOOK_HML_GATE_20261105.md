# REFINE 10 — Próxima rodada única de homologação no notebook (EV-025)

**Data:** 05/11/2026  
**Estado:** planejamento executável, não evidência de HML aprovada. **NENHUMA atualização do notebook foi executada por esta PR.**

## Guardas de entrada (antes de qualquer escrita)

1. Instalação permitida **somente** no LAB `C:\web-andon-refine8-hml\andon`, com PostgreSQL `andon_https_hml` isolado na porta `55432`. Confirmar o destino real de `DATABASE_URL` antes de executar migrations. **Proibido** usar `C:\web-andon-industrial\andon`, banco `andon_db`, servidor de fábrica, PLC, GPIO ou Node-RED.
2. Registrar SHA instalado, branch, estado das PRs e backup HML validado (manifesto + hash) ANTES de ativar flags. **Não usar `origin` do LAB para fetch/pull sem conferir a URL:** já apontou para a instalação original.
3. O pacote HML só está pronto quando for criado um **candidato integrado** contendo branches CI-verdes e suas dependências, com testes da árvore combinada. As PRs separadas **não devem ser consideradas uma única versão instalada**.
4. Para segredos, passwords, recovery e PIN: nunca gravar cookies, tokens, senhas, CSRF, hashes ou código de recuperação nos logs ou prints.

## Gates e escopo a homologar de uma vez

| Caso | Resultado esperado | Evidência |
|---|---|---|
| 1. Inicialização/identidade | Login central normal, perfis corretos, nenhuma credencial legada exigida em duplicidade | Captura sem segredo |
| 2. Recuperação Admin (#365) | Data e hora de emissão coerentes; código visível uma vez; botão **Copiar**; evento auditado sem segredo | Captura da data e evento sanitizado |
| 3. Senha fraca (#367) | `12345678` explica previsibilidade, `111111111` explica repetição, frase forte permite registro | Mensagem visual, nunca senha real |
| 4. Configuração ANDON (#366/#369) | Qualquer perfil **com** `andon.settings.open` vê todas as dez abas; perfil **sem** grant não abre | Matriz 2×2 perfis |
| 5. Delegação global | Com grant + `andon.read`, configurações gerais e paleta são editáveis com flags explícitas; Hub usuários/workstations/BI continuam protegidos | HTTP 200 e 403, audit |
| 6. Máquina (#370) | Editar **nome** e **OS obrigatória** com `andon.settings.open`; auditar antes/depois; sem grant retornar 403 | Response e audit sanitizados |
| 7. Escrita não prevista | Alteração de status físico, produção, prioridade ou ativação não é liberada pelo grant de configurações | HTTP 403, dados estáveis |
| 8. Catálogo de classificações | GET global só para delegado com scope restrito; POST/PATCH auditado quando flag específica ON | 403/200 + audit |
| 9. Workstation/Kiosk (#359–361) | Estado somente leitura 'não configurado/pendente', **sem sessão permanente ou matrícula ativa** | Aba Workstations |
| 10. Cancelamento legado (#351) | Identificar PATCH 200/403/409 e se GET posterior falha, verificar persistência antes de repetir | DevTools Network sanitizado |
| 11. Histórico legado (#352) | Leitura permitida apenas com `history.read`, sem 500; verificar GET que realmente falha | DevTools Network sanitizado |
| 12. Integridade/rollback | Preservar máquina, eventos, `currentCallId`, disponibilidade, MTTR/MTTA e auditoria; restaurar backup testado isoladamente | Comparação antes/depois |

### Flags de ativação — uma a uma, apenas no LAB

- Configurações gerais centrais: `ANDON_CENTRAL_OPERATIONAL_SETTINGS_HTTP_ENABLED=1`.
- Paleta global: `ANDON_CENTRAL_VISUAL_PALETTE_HTTP_ENABLED=1`.
- Classificações: `ANDON_CENTRAL_CLASSIFICATION_HTTP_ENABLED=1`.
- **Nova metadata de máquina, PR #370:** `ANDON_CENTRAL_MACHINE_SETTINGS_HTTP_ENABLED=1` (OFF em todas as instalações por padrão).
- Nenhuma flag acima autoriza alterar `machineStatus`, `productionMode`, `andonStatus`, `currentCallId`, controle industrial ou autenticador kiosk.

**Nunca ajustar flags produtivas ou importar credenciais reais para reproduzir um erro de laboratório.**

## Critérios para liberar o candidato de teste
- CIs verde nas PRs dependentes e novamente na árvore consolidada.
- Nenhuma migration do kiosk aplicada fora de PostgreSQL HML isolado; backup restaurável.
- Zero regressões de autorização Hub/Admin, usuário normal, escopo de máquinas e conta kiosk.
- Erros originais #351/#352 ainda exigem evidenciação direta do navegador, pois regressões de CI não reproduzem necessariamente o sintoma relatado.
- A fábrica só será atualizada após autorização **distinta** de merge e implantação.
